import { Inject, Injectable } from "@nestjs/common";
import {
  AnniversaryLeapDayRule,
  AnniversaryRepeat,
  AnniversaryType,
  MemoryStatus,
  Prisma,
  ReactionTargetType,
  ScheduledEventStatus,
} from "@prisma/client";
import { Temporal } from "@js-temporal/polyfill";
import { Clock } from "../common/clock/clock";
import {
  resourceNotFound,
  stateConflict,
  validationFailed,
} from "../common/http/api-exception";
import {
  anniversaryReminderInstant,
  instantToPlainDate,
  nextAnniversaryOccurrence,
  plainDateStartInstant,
} from "../common/time/calendar";
import { PrismaService } from "../database/prisma.service";
import type { IdentityRole } from "../identity/identity.constants";
import {
  IdentityService,
  type IdentityResponse,
} from "../identity/identity.service";
import { readableMediaAssetWhere } from "../media/media-access";
import { memoryCardSelect } from "../memories/memories.service";
import {
  type MemoryCardRecord,
  type ReactionRecord,
  toMemoryCardSummary,
} from "../memories/memory.presentation";
import {
  cancelScheduledEvent,
  createPrivateNotification,
  enqueueOutboxEvent,
  upsertScheduledEvent,
} from "../shared-events/persistent-event";
import {
  anniversaryPlanSelect,
  anniversaryReminderSelect,
  anniversarySelect,
  creator,
  type AnniversaryDetail,
  type AnniversaryOccurrence,
  type AnniversaryPlanRecord,
  type AnniversaryRecord,
  type AnniversaryReminderRecord,
  type AnniversaryReminderView,
  type AnniversarySummary,
  toPlanSummary,
  toReminderView,
  visibleBackground,
} from "./anniversary.presentation";
import type {
  CreateAnniversaryDto,
  CreateAnniversaryReminderDto,
  UpdateAnniversaryDto,
} from "./dto/anniversary.dto";

type AnniversaryDatabase = Pick<
  Prisma.TransactionClient,
  | "anniversary"
  | "anniversaryReminder"
  | "coupleMember"
  | "mediaAsset"
  | "notification"
  | "outboxEvent"
  | "scheduledEvent"
>;

type ReminderSchedule = {
  occurrence: Temporal.PlainDate;
  runAt: Date;
};

const ACTIVE_EVENT_STATUSES = [
  ScheduledEventStatus.PENDING,
  ScheduledEventStatus.RETRYING,
  ScheduledEventStatus.RUNNING,
] as const;

export function anniversaryReminderEventKey(
  anniversaryId: string,
  reminderId: string,
  occurrenceLocalDate: string,
): string {
  return `anniversary:${anniversaryId}:reminder:${reminderId}:${occurrenceLocalDate}`;
}

function databaseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function databaseDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseLocalDate(value: string, field = "date"): Temporal.PlainDate {
  try {
    const date = Temporal.PlainDate.from(value);
    if (date.toString() !== value || date.year < 1900 || date.year > 2200) {
      throw new RangeError("date outside supported range");
    }
    return date;
  } catch {
    throw validationFailed(
      `${field} must be a valid ISO 8601 local date from 1900 through 2200`,
    );
  }
}

function instantDate(value: Temporal.Instant): Date {
  return new Date(value.epochMilliseconds);
}

function partner(actor: IdentityResponse) {
  const result = actor.couple.members.find(
    (member) => member.id !== actor.user.id,
  );
  if (!result) throw resourceNotFound();
  return result;
}

function reminderIdFromPayload(value: Prisma.JsonValue): string | null {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    return null;
  }
  const reminderId = (value as Prisma.JsonObject).reminderId;
  return typeof reminderId === "string" ? reminderId : null;
}

function occurrenceForYear(
  date: Temporal.PlainDate,
  repeat: AnniversaryRepeat,
  leapDayRule: AnniversaryLeapDayRule,
  year: number,
): Temporal.PlainDate | null {
  if (repeat === AnniversaryRepeat.NONE) {
    return date.year === year ? date : null;
  }
  const occurrence = nextAnniversaryOccurrence(
    date,
    repeat,
    leapDayRule,
    Temporal.PlainDate.from({ year, month: 1, day: 1 }),
  );
  return occurrence?.year === year ? occurrence : null;
}

function nextReminderSchedule(
  anniversary: {
    date: Date;
    repeat: AnniversaryRepeat;
    leapDayRule: AnniversaryLeapDayRule;
  },
  reminder: { daysBefore: number; minuteOfDay: number },
  timeZone: string,
  now: Date,
  options: {
    fromDate?: Temporal.PlainDate;
    allowCurrentCatchUp: boolean;
  },
): ReminderSchedule | null {
  const original = Temporal.PlainDate.from(
    databaseDateString(anniversary.date),
  );
  const today = instantToPlainDate(now, timeZone);
  let occurrence = nextAnniversaryOccurrence(
    original,
    anniversary.repeat,
    anniversary.leapDayRule,
    options.fromDate ?? today,
  );
  const searchLimit = Math.ceil(reminder.daysBefore / 365) + 5;

  for (
    let attempt = 0;
    occurrence !== null && attempt < searchLimit;
    attempt += 1
  ) {
    const ideal = instantDate(
      anniversaryReminderInstant(
        occurrence,
        reminder.daysBefore,
        reminder.minuteOfDay,
        timeZone,
      ),
    );
    if (ideal > now) return { occurrence, runAt: ideal };
    if (
      options.allowCurrentCatchUp &&
      Temporal.PlainDate.compare(occurrence, today) >= 0
    ) {
      return { occurrence, runAt: now };
    }
    if (anniversary.repeat === AnniversaryRepeat.NONE) return null;
    occurrence = nextAnniversaryOccurrence(
      original,
      anniversary.repeat,
      anniversary.leapDayRule,
      occurrence.add({ days: 1 }),
    );
  }
  return null;
}

@Injectable()
export class AnniversariesService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(IdentityService)
    private readonly identities: IdentityService,
    @Inject(Clock)
    private readonly clock: Clock,
  ) {}

  async list(role: IdentityRole): Promise<AnniversarySummary[]> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    const records = await this.prisma.anniversary.findMany({
      where: { coupleId: actor.couple.id, deletedAt: null },
      orderBy: [{ date: "asc" }, { id: "asc" }],
      select: anniversarySelect,
    });
    const reminderRuns = await this.activeReminderRuns(actor.couple.id);
    return records
      .map((record) => this.toSummary(record, actor, now, reminderRuns))
      .sort((left, right) => {
        if (left.nextOccurrenceLocalDate === null) {
          return right.nextOccurrenceLocalDate === null
            ? left.title.localeCompare(right.title) ||
                left.id.localeCompare(right.id)
            : 1;
        }
        if (right.nextOccurrenceLocalDate === null) return -1;
        return (
          left.nextOccurrenceLocalDate.localeCompare(
            right.nextOccurrenceLocalDate,
          ) ||
          left.title.localeCompare(right.title) ||
          left.id.localeCompare(right.id)
        );
      });
  }

  async create(
    role: IdentityRole,
    dto: CreateAnniversaryDto,
  ): Promise<AnniversarySummary> {
    const actor = await this.identities.current(role);
    const recipient = partner(actor);
    const now = this.clock.now();
    parseLocalDate(dto.date);

    const record = await this.serializable(async (transaction) => {
      await this.assertBackgroundMedia(
        transaction,
        actor.couple.id,
        actor.user.id,
        dto.backgroundMediaId,
      );
      const created = await transaction.anniversary.create({
        data: {
          coupleId: actor.couple.id,
          title: dto.title,
          type: dto.type ?? AnniversaryType.CUSTOM,
          date: databaseDate(dto.date),
          repeat: dto.repeat ?? AnniversaryRepeat.YEARLY,
          leapDayRule: dto.leapDayRule ?? AnniversaryLeapDayRule.FEBRUARY_28,
          backgroundMediaId: dto.backgroundMediaId ?? null,
          createdById: actor.user.id,
        },
        select: anniversarySelect,
      });
      await createPrivateNotification(transaction, {
        coupleId: actor.couple.id,
        recipientId: recipient.id,
        type: "ANNIVERSARY_CREATED",
        dedupeKey: `anniversary:${created.id}:created:${recipient.id}`,
        resourceType: "ANNIVERSARY",
        resourceId: created.id,
      });
      await enqueueOutboxEvent(transaction, {
        coupleId: actor.couple.id,
        dedupeKey: `anniversary:${created.id}:created:v${created.version}`,
        aggregateType: "ANNIVERSARY",
        aggregateId: created.id,
        eventType: "anniversary.created",
        actorId: actor.user.id,
        recipientId: recipient.id,
        version: created.version,
        occurredAt: now,
      });
      return created;
    });

    const reminderRuns = await this.activeReminderRuns(actor.couple.id);
    return this.toSummary(record, actor, now, reminderRuns);
  }

  async get(
    role: IdentityRole,
    anniversaryId: string,
  ): Promise<AnniversaryDetail> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    const record = await this.findAnniversary(
      this.prisma,
      actor.couple.id,
      anniversaryId,
    );
    const [plans, memories, reminderRuns] = await Promise.all([
      this.plans(anniversaryId, actor.couple.id),
      this.memories(anniversaryId, actor),
      this.activeReminderRuns(actor.couple.id),
    ]);
    const reactions = await this.reactions(
      actor.couple.id,
      memories.map((memory) => memory.id),
    );
    return {
      ...this.toSummary(record, actor, now, reminderRuns),
      plans: plans.map((plan) => toPlanSummary(plan, actor.couple)),
      memories: memories.map((memory) =>
        toMemoryCardSummary(
          memory as MemoryCardRecord,
          actor.user.id,
          reactions.get(memory.id) ?? [],
        ),
      ),
    };
  }

  async update(
    role: IdentityRole,
    anniversaryId: string,
    dto: UpdateAnniversaryDto,
  ): Promise<AnniversarySummary> {
    const actor = await this.identities.current(role);
    const recipient = partner(actor);
    const now = this.clock.now();
    const fields = Object.keys(dto).filter((field) => field !== "version");
    if (fields.length === 0) {
      throw validationFailed("At least one anniversary field must be updated");
    }
    if (dto.date !== undefined) parseLocalDate(dto.date);

    const updated = await this.serializable(async (transaction) => {
      const existing = await this.findAnniversary(
        transaction,
        actor.couple.id,
        anniversaryId,
      );
      if (existing.version !== dto.version) {
        throw stateConflict({ currentVersion: existing.version });
      }
      await this.assertBackgroundMedia(
        transaction,
        actor.couple.id,
        actor.user.id,
        dto.backgroundMediaId,
      );
      const changed = await transaction.anniversary.updateMany({
        where: {
          id: anniversaryId,
          coupleId: actor.couple.id,
          deletedAt: null,
          version: dto.version,
        },
        data: {
          ...(dto.title === undefined ? {} : { title: dto.title }),
          ...(dto.type === undefined ? {} : { type: dto.type }),
          ...(dto.date === undefined ? {} : { date: databaseDate(dto.date) }),
          ...(dto.repeat === undefined ? {} : { repeat: dto.repeat }),
          ...(dto.leapDayRule === undefined
            ? {}
            : { leapDayRule: dto.leapDayRule }),
          ...(dto.backgroundMediaId === undefined
            ? {}
            : { backgroundMediaId: dto.backgroundMediaId }),
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw stateConflict();
      const record = await this.findAnniversary(
        transaction,
        actor.couple.id,
        anniversaryId,
      );
      for (const reminder of record.reminders) {
        await this.syncReminderSchedule(
          transaction,
          record,
          reminder,
          actor.couple.timezone,
          now,
        );
      }
      await createPrivateNotification(transaction, {
        coupleId: actor.couple.id,
        recipientId: recipient.id,
        type: "ANNIVERSARY_UPDATED",
        dedupeKey: `anniversary:${record.id}:updated:v${record.version}:${recipient.id}`,
        resourceType: "ANNIVERSARY",
        resourceId: record.id,
      });
      await enqueueOutboxEvent(transaction, {
        coupleId: actor.couple.id,
        dedupeKey: `anniversary:${record.id}:updated:v${record.version}`,
        aggregateType: "ANNIVERSARY",
        aggregateId: record.id,
        eventType: "anniversary.updated",
        actorId: actor.user.id,
        recipientId: recipient.id,
        version: record.version,
        occurredAt: now,
      });
      return record;
    });

    const reminderRuns = await this.activeReminderRuns(actor.couple.id);
    return this.toSummary(updated, actor, now, reminderRuns);
  }

  async remove(
    role: IdentityRole,
    anniversaryId: string,
    version: number,
  ): Promise<void> {
    const actor = await this.identities.current(role);
    const recipient = partner(actor);
    const now = this.clock.now();
    await this.serializable(async (transaction) => {
      const existing = await this.findAnniversary(
        transaction,
        actor.couple.id,
        anniversaryId,
      );
      if (existing.version !== version) {
        throw stateConflict({ currentVersion: existing.version });
      }
      const changed = await transaction.anniversary.updateMany({
        where: {
          id: anniversaryId,
          coupleId: actor.couple.id,
          deletedAt: null,
          version,
        },
        data: { deletedAt: now, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw stateConflict();
      for (const reminder of existing.reminders) {
        await this.cancelReminderEvents(transaction, reminder.id);
      }
      await createPrivateNotification(transaction, {
        coupleId: actor.couple.id,
        recipientId: recipient.id,
        type: "ANNIVERSARY_DELETED",
        dedupeKey: `anniversary:${anniversaryId}:deleted:${recipient.id}`,
        resourceType: "ANNIVERSARY",
        resourceId: anniversaryId,
      });
      await enqueueOutboxEvent(transaction, {
        coupleId: actor.couple.id,
        dedupeKey: `anniversary:${anniversaryId}:deleted:v${version + 1}`,
        aggregateType: "ANNIVERSARY",
        aggregateId: anniversaryId,
        eventType: "anniversary.deleted",
        actorId: actor.user.id,
        recipientId: recipient.id,
        version: version + 1,
        occurredAt: now,
      });
    });
  }

  async createReminder(
    role: IdentityRole,
    anniversaryId: string,
    dto: CreateAnniversaryReminderDto,
  ): Promise<AnniversaryReminderView> {
    const actor = await this.identities.current(role);
    const recipient = partner(actor);
    const now = this.clock.now();
    const minuteOfDay = dto.minuteOfDay ?? 540;
    const enabled = dto.enabled ?? true;

    const result = await this.serializable(async (transaction) => {
      const anniversary = await this.findAnniversary(
        transaction,
        actor.couple.id,
        anniversaryId,
      );
      const reminder = await transaction.anniversaryReminder.upsert({
        where: {
          anniversaryId_daysBefore_minuteOfDay: {
            anniversaryId,
            daysBefore: dto.daysBefore,
            minuteOfDay,
          },
        },
        create: {
          coupleId: actor.couple.id,
          anniversaryId,
          daysBefore: dto.daysBefore,
          minuteOfDay,
          enabled,
        },
        update: { enabled },
        select: anniversaryReminderSelect,
      });
      const runAt = await this.syncReminderSchedule(
        transaction,
        anniversary,
        reminder,
        actor.couple.timezone,
        now,
      );
      await createPrivateNotification(transaction, {
        coupleId: actor.couple.id,
        recipientId: recipient.id,
        type: "ANNIVERSARY_REMINDER_CONFIGURED",
        dedupeKey: `anniversary:${anniversaryId}:reminder:${reminder.id}:configured:u${reminder.updatedAt.valueOf()}:${recipient.id}`,
        resourceType: "ANNIVERSARY",
        resourceId: anniversaryId,
      });
      await enqueueOutboxEvent(transaction, {
        coupleId: actor.couple.id,
        dedupeKey: `anniversary:${anniversaryId}:reminder:${reminder.id}:configured:u${reminder.updatedAt.valueOf()}`,
        aggregateType: "ANNIVERSARY",
        aggregateId: anniversaryId,
        eventType: "anniversary.reminder.configured",
        actorId: actor.user.id,
        recipientId: recipient.id,
        version: anniversary.version,
        occurredAt: now,
      });
      return { reminder, runAt };
    });
    return toReminderView(result.reminder, result.runAt);
  }

  async removeReminder(
    role: IdentityRole,
    anniversaryId: string,
    reminderId: string,
  ): Promise<void> {
    const actor = await this.identities.current(role);
    const recipient = partner(actor);
    const now = this.clock.now();
    await this.serializable(async (transaction) => {
      const reminder = await transaction.anniversaryReminder.findFirst({
        where: {
          id: reminderId,
          anniversaryId,
          coupleId: actor.couple.id,
          anniversary: { deletedAt: null },
        },
        select: { id: true, anniversary: { select: { version: true } } },
      });
      if (!reminder) throw resourceNotFound();
      const deleted = await transaction.anniversaryReminder.deleteMany({
        where: { id: reminderId, anniversaryId, coupleId: actor.couple.id },
      });
      if (deleted.count !== 1) throw stateConflict();
      await this.cancelReminderEvents(transaction, reminderId);
      await createPrivateNotification(transaction, {
        coupleId: actor.couple.id,
        recipientId: recipient.id,
        type: "ANNIVERSARY_REMINDER_REMOVED",
        dedupeKey: `anniversary:${anniversaryId}:reminder:${reminderId}:removed:${recipient.id}`,
        resourceType: "ANNIVERSARY",
        resourceId: anniversaryId,
      });
      await enqueueOutboxEvent(transaction, {
        coupleId: actor.couple.id,
        dedupeKey: `anniversary:${anniversaryId}:reminder:${reminderId}:removed`,
        aggregateType: "ANNIVERSARY",
        aggregateId: anniversaryId,
        eventType: "anniversary.reminder.removed",
        actorId: actor.user.id,
        recipientId: recipient.id,
        version: reminder.anniversary.version,
        occurredAt: now,
      });
    });
  }

  async occurrences(
    role: IdentityRole,
    anniversaryId: string,
  ): Promise<AnniversaryOccurrence[]> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    const today = instantToPlainDate(now, actor.couple.timezone);
    const record = await this.findAnniversary(
      this.prisma,
      actor.couple.id,
      anniversaryId,
    );
    const [plans, memories] = await Promise.all([
      this.plans(anniversaryId, actor.couple.id),
      this.memories(anniversaryId, actor),
    ]);
    const reactions = await this.reactions(
      actor.couple.id,
      memories.map((memory) => memory.id),
    );
    const date = Temporal.PlainDate.from(databaseDateString(record.date));
    const dates = new Set<string>([date.toString()]);
    const next = nextAnniversaryOccurrence(
      date,
      record.repeat,
      record.leapDayRule,
      today,
    );
    if (next !== null) dates.add(next.toString());

    const memoriesByOccurrence = new Map<string, MemoryCardRecord[]>();
    for (const memory of memories as MemoryCardRecord[]) {
      const localDate = instantToPlainDate(
        memory.happenedAt,
        actor.couple.timezone,
      );
      const occurrence = occurrenceForYear(
        date,
        record.repeat,
        record.leapDayRule,
        localDate.year,
      );
      if (occurrence === null) continue;
      const key = occurrence.toString();
      dates.add(key);
      const group = memoriesByOccurrence.get(key) ?? [];
      group.push(memory);
      memoriesByOccurrence.set(key, group);
    }

    const plansByOccurrence = new Map<string, AnniversaryPlanRecord[]>();
    for (const plan of plans) {
      if (plan.anniversaryOccurrenceDate === null) continue;
      const key = databaseDateString(plan.anniversaryOccurrenceDate);
      dates.add(key);
      const group = plansByOccurrence.get(key) ?? [];
      group.push(plan);
      plansByOccurrence.set(key, group);
    }

    return [...dates]
      .sort((left, right) => right.localeCompare(left))
      .map((localDate) => {
        const occurrence = Temporal.PlainDate.from(localDate);
        const occurrenceMemories = memoriesByOccurrence.get(localDate) ?? [];
        const occurrencePlans = plansByOccurrence.get(localDate) ?? [];
        return {
          localDate,
          occursAt: instantDate(
            plainDateStartInstant(occurrence, actor.couple.timezone),
          ).toISOString(),
          daysUntil: today.until(occurrence, { largestUnit: "day" }).days,
          memories: occurrenceMemories.map((memory) =>
            toMemoryCardSummary(
              memory,
              actor.user.id,
              reactions.get(memory.id) ?? [],
            ),
          ),
          plan:
            occurrencePlans.length === 0
              ? null
              : toPlanSummary(occurrencePlans[0]!, actor.couple),
        };
      });
  }

  /** Rebuilds all active anniversary reminder jobs after a timezone change. */
  async rescheduleForCouple(
    coupleId: string,
    timeZone: string,
    now: Date = this.clock.now(),
  ): Promise<void> {
    await this.serializable((transaction) =>
      this.rescheduleForCoupleInTransaction(
        transaction,
        coupleId,
        timeZone,
        now,
      ),
    );
  }

  /** Transaction-aware variant for Couple updates that must commit atomically. */
  async rescheduleForCoupleInTransaction(
    transaction: Prisma.TransactionClient,
    coupleId: string,
    timeZone: string,
    now: Date = this.clock.now(),
  ): Promise<void> {
    const anniversaries = await transaction.anniversary.findMany({
      where: { coupleId, deletedAt: null },
      orderBy: { id: "asc" },
      select: {
        id: true,
        coupleId: true,
        date: true,
        repeat: true,
        leapDayRule: true,
        reminders: {
          orderBy: { id: "asc" },
          select: anniversaryReminderSelect,
        },
      },
    });
    for (const anniversary of anniversaries) {
      for (const reminder of anniversary.reminders) {
        await this.syncReminderSchedule(
          transaction,
          anniversary,
          reminder,
          timeZone,
          now,
        );
      }
    }
  }

  /** Called by the durable worker after it claims ANNIVERSARY_REMINDER. */
  async deliverReminder(
    reminderId: string,
    occurrenceLocalDate: string,
  ): Promise<void> {
    const occurrence = parseLocalDate(
      occurrenceLocalDate,
      "occurrenceLocalDate",
    );
    const now = this.clock.now();
    await this.serializable(async (transaction) => {
      const reminder = await transaction.anniversaryReminder.findFirst({
        where: {
          id: reminderId,
          enabled: true,
          anniversary: { deletedAt: null },
        },
        select: {
          id: true,
          coupleId: true,
          daysBefore: true,
          minuteOfDay: true,
          enabled: true,
          updatedAt: true,
          anniversary: {
            select: {
              id: true,
              date: true,
              repeat: true,
              leapDayRule: true,
              deletedAt: true,
              couple: { select: { timezone: true } },
            },
          },
        },
      });
      if (!reminder) return;

      const anniversaryDate = Temporal.PlainDate.from(
        databaseDateString(reminder.anniversary.date),
      );
      const expected = occurrenceForYear(
        anniversaryDate,
        reminder.anniversary.repeat,
        reminder.anniversary.leapDayRule,
        occurrence.year,
      );
      const today = instantToPlainDate(
        now,
        reminder.anniversary.couple.timezone,
      );
      if (expected === null || !expected.equals(occurrence)) {
        await this.syncReminderSchedule(
          transaction,
          { ...reminder.anniversary, coupleId: reminder.coupleId },
          reminder,
          reminder.anniversary.couple.timezone,
          now,
        );
        return;
      }
      if (Temporal.PlainDate.compare(occurrence, today) < 0) {
        await this.scheduleAfterOccurrence(
          transaction,
          reminder.anniversary,
          reminder,
          reminder.anniversary.couple.timezone,
          now,
          occurrence,
        );
        return;
      }

      const idealRunAt = instantDate(
        anniversaryReminderInstant(
          occurrence,
          reminder.daysBefore,
          reminder.minuteOfDay,
          reminder.anniversary.couple.timezone,
        ),
      );
      if (idealRunAt > now) {
        throw new Error("ANNIVERSARY_REMINDER was claimed before runAt");
      }

      const members = await transaction.coupleMember.findMany({
        where: { coupleId: reminder.coupleId, status: "ACTIVE" },
        orderBy: { slot: "asc" },
        select: { userId: true },
      });
      for (const member of members) {
        await createPrivateNotification(transaction, {
          coupleId: reminder.coupleId,
          recipientId: member.userId,
          type: "ANNIVERSARY_REMINDER",
          dedupeKey: `${anniversaryReminderEventKey(
            reminder.anniversary.id,
            reminder.id,
            occurrenceLocalDate,
          )}:recipient:${member.userId}`,
          resourceType: "ANNIVERSARY",
          resourceId: reminder.anniversary.id,
        });
      }
      await enqueueOutboxEvent(transaction, {
        coupleId: reminder.coupleId,
        dedupeKey: `${anniversaryReminderEventKey(
          reminder.anniversary.id,
          reminder.id,
          occurrenceLocalDate,
        )}:due`,
        aggregateType: "ANNIVERSARY",
        aggregateId: reminder.anniversary.id,
        eventType: "anniversary.reminder.due",
        occurredAt: now,
      });
      await this.scheduleAfterOccurrence(
        transaction,
        reminder.anniversary,
        reminder,
        reminder.anniversary.couple.timezone,
        now,
        occurrence,
      );
    });
  }

  private toSummary(
    record: AnniversaryRecord,
    actor: IdentityResponse,
    now: Date,
    reminderRuns: Map<string, Date>,
  ): AnniversarySummary {
    const date = Temporal.PlainDate.from(databaseDateString(record.date));
    const today = instantToPlainDate(now, actor.couple.timezone);
    const occurrence = nextAnniversaryOccurrence(
      date,
      record.repeat,
      record.leapDayRule,
      today,
    );
    return {
      id: record.id,
      version: record.version,
      title: record.title,
      type: record.type,
      date: date.toString(),
      repeat: record.repeat,
      leapDayRule: record.leapDayRule,
      nextOccurrenceLocalDate: occurrence?.toString() ?? null,
      nextOccurrenceAt:
        occurrence === null
          ? null
          : instantDate(
              plainDateStartInstant(occurrence, actor.couple.timezone),
            ).toISOString(),
      daysUntil:
        occurrence === null
          ? null
          : today.until(occurrence, { largestUnit: "day" }).days,
      backgroundMedia: visibleBackground(record.backgroundMedia),
      reminders: record.reminders.map((reminder) =>
        toReminderView(reminder, reminderRuns.get(reminder.id) ?? null),
      ),
      sourceNoteId: record.sourceNoteId,
      createdBy: creator(actor.couple, record.createdById),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private async plans(
    anniversaryId: string,
    coupleId: string,
  ): Promise<AnniversaryPlanRecord[]> {
    return this.prisma.plan.findMany({
      where: { anniversaryId, coupleId, deletedAt: null },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      select: anniversaryPlanSelect,
    });
  }

  private async memories(
    anniversaryId: string,
    actor: IdentityResponse,
  ): Promise<MemoryCardRecord[]> {
    return this.prisma.memory.findMany({
      where: {
        sourceAnniversaryId: anniversaryId,
        coupleId: actor.couple.id,
        deletedAt: null,
        OR: [
          { status: MemoryStatus.PUBLISHED },
          { status: MemoryStatus.DRAFT, createdById: actor.user.id },
        ],
      },
      orderBy: [{ happenedAt: "desc" }, { id: "desc" }],
      select: memoryCardSelect,
    }) as Promise<MemoryCardRecord[]>;
  }

  private async reactions(
    coupleId: string,
    memoryIds: string[],
  ): Promise<Map<string, ReactionRecord[]>> {
    if (memoryIds.length === 0) return new Map();
    const reactions = await this.prisma.reaction.findMany({
      where: {
        coupleId,
        targetType: ReactionTargetType.MEMORY,
        targetId: { in: memoryIds },
      },
      select: { targetId: true, authorId: true, emoji: true },
    });
    const grouped = new Map<string, ReactionRecord[]>();
    for (const reaction of reactions) {
      const group = grouped.get(reaction.targetId) ?? [];
      group.push(reaction);
      grouped.set(reaction.targetId, group);
    }
    return grouped;
  }

  private async activeReminderRuns(
    coupleId: string,
  ): Promise<Map<string, Date>> {
    const events = await this.prisma.scheduledEvent.findMany({
      where: {
        coupleId,
        type: "ANNIVERSARY_REMINDER",
        status: { in: [...ACTIVE_EVENT_STATUSES] },
      },
      orderBy: [{ runAt: "asc" }, { id: "asc" }],
      select: { payload: true, runAt: true },
    });
    const result = new Map<string, Date>();
    for (const event of events) {
      const reminderId = reminderIdFromPayload(event.payload);
      if (reminderId !== null && !result.has(reminderId)) {
        result.set(reminderId, event.runAt);
      }
    }
    return result;
  }

  private async findAnniversary(
    database: Pick<Prisma.TransactionClient, "anniversary">,
    coupleId: string,
    anniversaryId: string,
  ): Promise<AnniversaryRecord> {
    const record = await database.anniversary.findFirst({
      where: { id: anniversaryId, coupleId, deletedAt: null },
      select: anniversarySelect,
    });
    if (!record) throw resourceNotFound();
    return record;
  }

  private async assertBackgroundMedia(
    database: Pick<Prisma.TransactionClient, "mediaAsset">,
    coupleId: string,
    userId: string,
    mediaId: string | null | undefined,
  ): Promise<void> {
    if (mediaId === undefined || mediaId === null) return;
    const media = await database.mediaAsset.findFirst({
      where: {
        id: mediaId,
        ...readableMediaAssetWhere(coupleId, userId),
      },
      select: { id: true },
    });
    if (!media) throw resourceNotFound();
  }

  private async syncReminderSchedule(
    database: AnniversaryDatabase,
    anniversary: {
      id: string;
      coupleId: string;
      date: Date;
      repeat: AnniversaryRepeat;
      leapDayRule: AnniversaryLeapDayRule;
    },
    reminder: AnniversaryReminderRecord,
    timeZone: string,
    now: Date,
  ): Promise<Date | null> {
    const events = await database.scheduledEvent.findMany({
      where: {
        coupleId: anniversary.coupleId,
        type: "ANNIVERSARY_REMINDER",
        payload: { path: ["reminderId"], equals: reminder.id },
      },
      select: { dedupeKey: true, status: true, runAt: true },
    });
    let schedule = reminder.enabled
      ? nextReminderSchedule(anniversary, reminder, timeZone, now, {
          allowCurrentCatchUp: true,
        })
      : null;
    if (schedule !== null) {
      const currentKey = anniversaryReminderEventKey(
        anniversary.id,
        reminder.id,
        schedule.occurrence.toString(),
      );
      if (
        events.some(
          (event) =>
            event.dedupeKey === currentKey &&
            event.status === ScheduledEventStatus.COMPLETED,
        )
      ) {
        schedule = nextReminderSchedule(anniversary, reminder, timeZone, now, {
          fromDate: schedule.occurrence.add({ days: 1 }),
          allowCurrentCatchUp: false,
        });
      }
    }
    const desiredKey =
      schedule === null
        ? null
        : anniversaryReminderEventKey(
            anniversary.id,
            reminder.id,
            schedule.occurrence.toString(),
          );
    for (const event of events) {
      if (
        event.dedupeKey !== null &&
        event.dedupeKey !== desiredKey &&
        ACTIVE_EVENT_STATUSES.includes(
          event.status as (typeof ACTIVE_EVENT_STATUSES)[number],
        )
      ) {
        await cancelScheduledEvent(database, event.dedupeKey, [
          ScheduledEventStatus.PENDING,
          ScheduledEventStatus.RETRYING,
          ScheduledEventStatus.RUNNING,
        ]);
      }
    }
    if (schedule === null || desiredKey === null) return null;
    const existingDesired = events.find(
      (event) => event.dedupeKey === desiredKey,
    );
    if (
      existingDesired !== undefined &&
      ACTIVE_EVENT_STATUSES.includes(
        existingDesired.status as (typeof ACTIVE_EVENT_STATUSES)[number],
      ) &&
      existingDesired.runAt.valueOf() === schedule.runAt.valueOf()
    ) {
      return schedule.runAt;
    }
    await upsertScheduledEvent(database, {
      coupleId: anniversary.coupleId,
      dedupeKey: desiredKey,
      type: "ANNIVERSARY_REMINDER",
      payload: {
        anniversaryId: anniversary.id,
        reminderId: reminder.id,
        occurrenceLocalDate: schedule.occurrence.toString(),
      },
      runAt: schedule.runAt,
    });
    return schedule.runAt;
  }

  private async scheduleAfterOccurrence(
    database: AnniversaryDatabase,
    anniversary: {
      id: string;
      coupleId?: string;
      date: Date;
      repeat: AnniversaryRepeat;
      leapDayRule: AnniversaryLeapDayRule;
    },
    reminder: {
      id: string;
      coupleId: string;
      daysBefore: number;
      minuteOfDay: number;
    },
    timeZone: string,
    now: Date,
    occurrence: Temporal.PlainDate,
  ): Promise<void> {
    const schedule = nextReminderSchedule(
      anniversary,
      reminder,
      timeZone,
      now,
      {
        fromDate: occurrence.add({ days: 1 }),
        allowCurrentCatchUp: false,
      },
    );
    if (schedule === null) return;
    await upsertScheduledEvent(database, {
      coupleId: reminder.coupleId,
      dedupeKey: anniversaryReminderEventKey(
        anniversary.id,
        reminder.id,
        schedule.occurrence.toString(),
      ),
      type: "ANNIVERSARY_REMINDER",
      payload: {
        anniversaryId: anniversary.id,
        reminderId: reminder.id,
        occurrenceLocalDate: schedule.occurrence.toString(),
      },
      runAt: schedule.runAt,
    });
  }

  private async cancelReminderEvents(
    database: AnniversaryDatabase,
    reminderId: string,
  ): Promise<void> {
    const events = await database.scheduledEvent.findMany({
      where: {
        type: "ANNIVERSARY_REMINDER",
        status: { in: [...ACTIVE_EVENT_STATUSES] },
        payload: { path: ["reminderId"], equals: reminderId },
      },
      select: { dedupeKey: true },
    });
    for (const event of events) {
      if (event.dedupeKey !== null) {
        await cancelScheduledEvent(database, event.dedupeKey, [
          ScheduledEventStatus.PENDING,
          ScheduledEventStatus.RETRYING,
          ScheduledEventStatus.RUNNING,
        ]);
      }
    }
  }

  private async serializable<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === "P2034" || error.code === "P2002")
        ) {
          if (attempt < 3 && error.code === "P2034") continue;
          throw stateConflict();
        }
        throw error;
      }
    }
    throw stateConflict();
  }
}
