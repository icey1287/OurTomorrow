import { Inject, Injectable } from "@nestjs/common";
import {
  PlanStatus,
  Prisma,
  RecycleBinResourceType,
  WishStatus,
  type ScheduledEventStatus,
} from "@prisma/client";
import { scheduleWishCompletionCapsules } from "../capsules/capsules.service";
import { Clock } from "../common/clock/clock";
import {
  resourceNotFound,
  stateConflict,
  validationFailed,
} from "../common/http/api-exception";
import { PrismaService } from "../database/prisma.service";
import type { IdentityRole } from "../identity/identity.constants";
import {
  IdentityService,
  type IdentityResponse,
} from "../identity/identity.service";
import {
  cancelScheduledEvent,
  createPrivateNotification,
  enqueueOutboxEvent,
  upsertScheduledEvent,
} from "../shared-events/persistent-event";
import { completeLinkedPlaces } from "../places/place-lifecycle";
import {
  createRecycleBinItem,
  nullableInstant,
} from "../recycle-bin/recycle-bin.persistence";
import type {
  CreatePlanDto,
  ListPlansQueryDto,
  PlanActionDto,
  UpdatePlanDto,
} from "./dto/plan.dto";
import {
  planSelect,
  toPlanSummary,
  type PlanRecord,
  type PlanSummary,
} from "./plan.presentation";

const REMINDER_KEY = (planId: string): string => `plan:${planId}:reminder`;
const REMINDER_CANCELLABLE_STATUSES = [
  "PENDING",
  "RETRYING",
  "RUNNING",
] satisfies ScheduledEventStatus[];

type PlanDatabase = Pick<
  Prisma.TransactionClient,
  | "anniversary"
  | "coupleMember"
  | "notification"
  | "outboxEvent"
  | "place"
  | "plan"
  | "recycleBinItem"
  | "scheduledEvent"
  | "wish"
  | "wishUpdate"
>;

type PlanReferences = {
  wishId?: string | null;
  anniversaryId?: string | null;
  placeId?: string | null;
};

type PlanTiming = {
  startsAt: Date | null;
  endsAt: Date | null;
  reminderAt: Date | null;
};

type Transition = {
  action: "scheduled" | "started" | "completed" | "cancelled";
  from: PlanStatus[];
  to: PlanStatus;
};

const TRANSITIONS = {
  schedule: {
    action: "scheduled",
    from: [PlanStatus.DRAFT],
    to: PlanStatus.SCHEDULED,
  },
  start: {
    action: "started",
    from: [PlanStatus.SCHEDULED],
    to: PlanStatus.IN_PROGRESS,
  },
  complete: {
    action: "completed",
    from: [PlanStatus.IN_PROGRESS],
    to: PlanStatus.COMPLETED,
  },
  cancel: {
    action: "cancelled",
    from: [PlanStatus.DRAFT, PlanStatus.SCHEDULED, PlanStatus.IN_PROGRESS],
    to: PlanStatus.CANCELLED,
  },
} satisfies Record<string, Transition>;

function parseOptionalInstant(
  value: string | null | undefined,
  field: string,
): Date | null | undefined {
  if (value === undefined || value === null) return value;
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw validationFailed(`${field} must include Z or an explicit UTC offset`);
  }
  const instant = new Date(value);
  if (Number.isNaN(instant.valueOf())) {
    throw validationFailed(`${field} must be a valid ISO 8601 instant`);
  }
  return instant;
}

function parseOptionalDate(
  value: string | null | undefined,
): Date | null | undefined {
  if (value === undefined || value === null) return value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationFailed("anniversaryOccurrenceDate must use YYYY-MM-DD");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw validationFailed("anniversaryOccurrenceDate must be a valid date");
  }
  return date;
}

function normalizeNullable(value: string | null): string | null {
  return value === "" ? null : value;
}

function validateTiming(timing: PlanTiming): void {
  if (timing.endsAt !== null && timing.startsAt === null) {
    throw validationFailed("startsAt is required when endsAt is set");
  }
  if (timing.reminderAt !== null && timing.startsAt === null) {
    throw validationFailed("startsAt is required when reminderAt is set");
  }
  if (
    timing.startsAt !== null &&
    timing.endsAt !== null &&
    timing.endsAt <= timing.startsAt
  ) {
    throw validationFailed("endsAt must be later than startsAt");
  }
  if (
    timing.startsAt !== null &&
    timing.reminderAt !== null &&
    timing.reminderAt >= timing.startsAt
  ) {
    throw validationFailed("reminderAt must be earlier than startsAt");
  }
}

function partner(actor: IdentityResponse) {
  const other = actor.couple.members.find(
    (member) => member.id !== actor.user.id,
  );
  if (!other) throw resourceNotFound();
  return other;
}

function sameInstant(left: Date | null, right: Date | null): boolean {
  return left?.valueOf() === right?.valueOf();
}

@Injectable()
export class PlansService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(IdentityService)
    private readonly identities: IdentityService,
    @Inject(Clock)
    private readonly clock: Clock,
  ) {}

  async list(
    role: IdentityRole,
    query: ListPlansQueryDto,
  ): Promise<PlanSummary[]> {
    const actor = await this.identities.current(role);
    const plans = await this.prisma.plan.findMany({
      where: {
        coupleId: actor.couple.id,
        deletedAt: null,
        ...(query.status === undefined ? {} : { status: query.status }),
        ...(query.wishId === undefined ? {} : { wishId: query.wishId }),
        ...(query.anniversaryId === undefined
          ? {}
          : { anniversaryId: query.anniversaryId }),
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: planSelect,
    });
    return plans.map((plan) => toPlanSummary(plan, actor.couple));
  }

  async get(role: IdentityRole, planId: string): Promise<PlanSummary> {
    const actor = await this.identities.current(role);
    const plan = await this.findPlan(this.prisma, actor.couple.id, planId);
    return toPlanSummary(plan, actor.couple);
  }

  /** Idempotent worker entry point for a persisted PLAN_REMINDER event. */
  async deliverReminder(
    coupleId: string,
    planId: string,
    expectedVersion: number,
  ): Promise<void> {
    const now = this.clock.now();
    await this.serializable(async (transaction) => {
      const plan = await transaction.plan.findFirst({
        where: { id: planId, coupleId, deletedAt: null },
        select: {
          id: true,
          coupleId: true,
          status: true,
          version: true,
          reminderAt: true,
        },
      });
      if (
        !plan ||
        plan.status !== PlanStatus.SCHEDULED ||
        plan.version !== expectedVersion ||
        plan.reminderAt === null
      ) {
        return;
      }
      if (plan.reminderAt > now) {
        throw new Error("PLAN_REMINDER was claimed before reminderAt");
      }

      const members = await transaction.coupleMember.findMany({
        where: { coupleId, status: "ACTIVE" },
        orderBy: { slot: "asc" },
        select: { userId: true },
      });
      const eventKey = `plan:${plan.id}:reminder:v${plan.version}`;
      for (const member of members) {
        await createPrivateNotification(transaction, {
          coupleId,
          recipientId: member.userId,
          type: "PLAN_REMINDER",
          dedupeKey: `${eventKey}:notification:${member.userId}`,
          resourceType: "PLAN",
          resourceId: plan.id,
          title: "共同计划快要开始了",
          body: "打开明天，看看这次共同计划的安排。",
        });
      }
      await enqueueOutboxEvent(transaction, {
        coupleId,
        dedupeKey: `${eventKey}:due`,
        aggregateType: "PLAN",
        aggregateId: plan.id,
        eventType: "plan.reminder.due",
        recipientIds: members.map(({ userId }) => userId),
        version: plan.version,
        occurredAt: now,
      });
    });
  }

  async create(role: IdentityRole, dto: CreatePlanDto): Promise<PlanSummary> {
    const actor = await this.identities.current(role);
    const recipient = partner(actor);
    const now = this.clock.now();
    const timing = {
      startsAt: parseOptionalInstant(dto.startsAt, "startsAt") ?? null,
      endsAt: parseOptionalInstant(dto.endsAt, "endsAt") ?? null,
      reminderAt: parseOptionalInstant(dto.reminderAt, "reminderAt") ?? null,
    } satisfies PlanTiming;
    validateTiming(timing);
    const occurrenceDate = parseOptionalDate(dto.anniversaryOccurrenceDate);
    if (
      occurrenceDate !== undefined &&
      occurrenceDate !== null &&
      !dto.anniversaryId
    ) {
      throw validationFailed(
        "anniversaryId is required when anniversaryOccurrenceDate is set",
      );
    }

    const created = await this.serializable(async (transaction) => {
      await this.assertReferences(transaction, actor.couple.id, {
        ...(dto.wishId === undefined ? {} : { wishId: dto.wishId }),
        ...(dto.anniversaryId === undefined
          ? {}
          : { anniversaryId: dto.anniversaryId }),
        ...(dto.placeId === undefined ? {} : { placeId: dto.placeId }),
      });
      const plan = await transaction.plan.create({
        data: {
          coupleId: actor.couple.id,
          createdById: actor.user.id,
          title: dto.title,
          wishId: dto.wishId ?? null,
          anniversaryId: dto.anniversaryId ?? null,
          placeId: dto.placeId ?? null,
          itinerary: normalizeNullable(dto.itinerary ?? null),
          preparations: dto.preparations ?? [],
          participants: dto.participants ?? [],
          expectation: normalizeNullable(dto.expectation ?? null),
          startsAt: timing.startsAt,
          endsAt: timing.endsAt,
          reminderAt: timing.reminderAt,
          anniversaryOccurrenceDate: occurrenceDate ?? null,
        },
        select: planSelect,
      });
      await this.writeMutationEvents(
        transaction,
        plan,
        actor.user.id,
        recipient.id,
        "created",
        now,
      );
      return plan;
    });
    return toPlanSummary(created, actor.couple);
  }

  async update(
    role: IdentityRole,
    planId: string,
    dto: UpdatePlanDto,
  ): Promise<PlanSummary> {
    const actor = await this.identities.current(role);
    const recipient = partner(actor);
    const now = this.clock.now();
    const fields = Object.keys(dto).filter((field) => field !== "version");
    if (fields.length === 0) {
      throw validationFailed("At least one plan field must be updated");
    }

    const updated = await this.serializable(async (transaction) => {
      const existing = await this.findPlan(
        transaction,
        actor.couple.id,
        planId,
      );
      this.assertVersion(existing, dto.version);
      if (
        existing.status === PlanStatus.COMPLETED ||
        existing.status === PlanStatus.CANCELLED
      ) {
        throw stateConflict({ currentStatus: existing.status });
      }
      if (dto.wishId !== undefined && existing.status !== PlanStatus.DRAFT) {
        throw validationFailed(
          "wishId can only be changed while a plan is DRAFT",
        );
      }
      if (
        existing.status === PlanStatus.IN_PROGRESS &&
        dto.reminderAt !== undefined &&
        dto.reminderAt !== null
      ) {
        throw validationFailed("An in-progress plan cannot add a reminder");
      }

      const timing = {
        startsAt:
          dto.startsAt === undefined
            ? existing.startsAt
            : (parseOptionalInstant(dto.startsAt, "startsAt") ?? null),
        endsAt:
          dto.endsAt === undefined
            ? existing.endsAt
            : (parseOptionalInstant(dto.endsAt, "endsAt") ?? null),
        reminderAt:
          dto.reminderAt === undefined
            ? existing.reminderAt
            : (parseOptionalInstant(dto.reminderAt, "reminderAt") ?? null),
      } satisfies PlanTiming;
      validateTiming(timing);
      if (existing.status !== PlanStatus.DRAFT && timing.startsAt === null) {
        throw validationFailed("A scheduled or active plan must keep startsAt");
      }
      if (
        existing.status === PlanStatus.SCHEDULED &&
        dto.reminderAt !== undefined &&
        timing.reminderAt !== null &&
        timing.reminderAt <= now
      ) {
        throw validationFailed("reminderAt must be in the future");
      }

      const anniversaryId =
        dto.anniversaryId === undefined
          ? existing.anniversaryId
          : dto.anniversaryId;
      const occurrenceDate =
        dto.anniversaryId === null &&
        dto.anniversaryOccurrenceDate === undefined
          ? null
          : dto.anniversaryOccurrenceDate === undefined
            ? existing.anniversaryOccurrenceDate
            : (parseOptionalDate(dto.anniversaryOccurrenceDate) ?? null);
      if (occurrenceDate !== null && !anniversaryId) {
        throw validationFailed(
          "anniversaryId is required when anniversaryOccurrenceDate is set",
        );
      }
      await this.assertReferences(
        transaction,
        actor.couple.id,
        {
          ...(dto.wishId === undefined ? {} : { wishId: dto.wishId }),
          ...(dto.anniversaryId === undefined
            ? {}
            : { anniversaryId: dto.anniversaryId }),
          ...(dto.placeId === undefined ? {} : { placeId: dto.placeId }),
        },
        planId,
      );

      const data: Prisma.PlanUncheckedUpdateManyInput = {
        ...(dto.title === undefined ? {} : { title: dto.title }),
        ...(dto.wishId === undefined ? {} : { wishId: dto.wishId }),
        ...(dto.anniversaryId === undefined
          ? {}
          : { anniversaryId: dto.anniversaryId }),
        ...(dto.placeId === undefined ? {} : { placeId: dto.placeId }),
        ...(dto.itinerary === undefined
          ? {}
          : { itinerary: normalizeNullable(dto.itinerary) }),
        ...(dto.preparations === undefined
          ? {}
          : { preparations: dto.preparations }),
        ...(dto.participants === undefined
          ? {}
          : { participants: dto.participants }),
        ...(dto.expectation === undefined
          ? {}
          : { expectation: normalizeNullable(dto.expectation) }),
        startsAt: timing.startsAt,
        endsAt: timing.endsAt,
        reminderAt: timing.reminderAt,
        anniversaryOccurrenceDate: occurrenceDate,
        version: { increment: 1 },
      };
      const changed = await transaction.plan.updateMany({
        where: {
          id: planId,
          coupleId: actor.couple.id,
          deletedAt: null,
          version: dto.version,
          status: existing.status,
        },
        data,
      });
      if (changed.count !== 1) throw stateConflict();
      const plan = await this.findPlan(transaction, actor.couple.id, planId);
      if (plan.status === PlanStatus.SCHEDULED) {
        await this.syncWishPlannedFor(transaction, plan);
      }
      await this.syncReminder(transaction, plan, now);
      await this.writeMutationEvents(
        transaction,
        plan,
        actor.user.id,
        recipient.id,
        "updated",
        now,
      );
      return plan;
    });
    return toPlanSummary(updated, actor.couple);
  }

  async remove(
    role: IdentityRole,
    planId: string,
    version: number,
  ): Promise<void> {
    const actor = await this.identities.current(role);
    const recipient = partner(actor);
    const now = this.clock.now();
    await this.serializable(async (transaction) => {
      const existing = await this.findPlan(
        transaction,
        actor.couple.id,
        planId,
      );
      this.assertVersion(existing, version);
      const releaseLinkedWish =
        existing.wishId !== null && existing.status !== PlanStatus.COMPLETED;
      const linkedWish =
        releaseLinkedWish && existing.wishId !== null
          ? await transaction.wish.findFirst({
              where: {
                id: existing.wishId,
                coupleId: actor.couple.id,
                deletedAt: null,
              },
              select: {
                id: true,
                status: true,
                plannedFor: true,
                completedAt: true,
                completedById: true,
              },
            })
          : null;
      if (releaseLinkedWish && linkedWish === null) {
        throw stateConflict({ linkedWishUnavailable: true });
      }
      const changed = await transaction.plan.updateMany({
        where: {
          id: planId,
          coupleId: actor.couple.id,
          deletedAt: null,
          version,
        },
        data: {
          deletedAt: now,
          ...(releaseLinkedWish ? { wishId: null } : {}),
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw stateConflict();
      if (releaseLinkedWish) {
        await this.releaseWish(transaction, existing, actor.user.id);
      }
      await cancelScheduledEvent(
        transaction,
        REMINDER_KEY(planId),
        REMINDER_CANCELLABLE_STATUSES,
      );
      await createRecycleBinItem(transaction, {
        coupleId: actor.couple.id,
        resourceType: RecycleBinResourceType.PLAN,
        resourceId: planId,
        deletedById: actor.user.id,
        deletedAt: now,
        restoreData: {
          status: existing.status,
          wishId: existing.wishId,
          completedAt: nullableInstant(existing.completedAt),
          cancelledAt: nullableInstant(existing.cancelledAt),
          reminderAt: nullableInstant(existing.reminderAt),
          linkedWish:
            linkedWish === null
              ? null
              : {
                  id: linkedWish.id,
                  status: linkedWish.status,
                  plannedFor: nullableInstant(linkedWish.plannedFor),
                  completedAt: nullableInstant(linkedWish.completedAt),
                  completedById: linkedWish.completedById,
                },
        },
      });
      await this.writeMutationEvents(
        transaction,
        { ...existing, version: version + 1 },
        actor.user.id,
        recipient.id,
        "deleted",
        now,
      );
    });
  }

  schedule(
    role: IdentityRole,
    planId: string,
    dto: PlanActionDto,
  ): Promise<PlanSummary> {
    return this.transition(role, planId, dto, TRANSITIONS.schedule);
  }

  start(
    role: IdentityRole,
    planId: string,
    dto: PlanActionDto,
  ): Promise<PlanSummary> {
    return this.transition(role, planId, dto, TRANSITIONS.start);
  }

  complete(
    role: IdentityRole,
    planId: string,
    dto: PlanActionDto,
  ): Promise<PlanSummary> {
    return this.transition(role, planId, dto, TRANSITIONS.complete);
  }

  cancel(
    role: IdentityRole,
    planId: string,
    dto: PlanActionDto,
  ): Promise<PlanSummary> {
    return this.transition(role, planId, dto, TRANSITIONS.cancel);
  }

  private async transition(
    role: IdentityRole,
    planId: string,
    dto: PlanActionDto,
    transition: Transition,
  ): Promise<PlanSummary> {
    const actor = await this.identities.current(role);
    const recipient = partner(actor);
    const now = this.clock.now();
    const updated = await this.serializable(async (transaction) => {
      const existing = await this.findPlan(
        transaction,
        actor.couple.id,
        planId,
      );
      this.assertVersion(existing, dto.version);
      if (!transition.from.includes(existing.status)) {
        throw stateConflict({ currentStatus: existing.status });
      }
      validateTiming(existing);
      if (transition.to === PlanStatus.SCHEDULED) {
        if (existing.startsAt === null || existing.startsAt <= now) {
          throw validationFailed(
            "startsAt must be in the future to schedule a plan",
          );
        }
        if (existing.reminderAt !== null && existing.reminderAt <= now) {
          throw validationFailed("reminderAt must be in the future");
        }
      }

      const changed = await transaction.plan.updateMany({
        where: {
          id: planId,
          coupleId: actor.couple.id,
          deletedAt: null,
          version: dto.version,
          status: existing.status,
        },
        data: {
          status: transition.to,
          ...(transition.to === PlanStatus.COMPLETED
            ? { completedAt: now }
            : {}),
          ...(transition.to === PlanStatus.CANCELLED
            ? { cancelledAt: now, wishId: null }
            : {}),
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw stateConflict();
      if (transition.to === PlanStatus.CANCELLED) {
        await this.releaseWish(transaction, existing, actor.user.id);
      }
      const plan = await this.findPlan(transaction, actor.couple.id, planId);
      let linkedWishPlaceId: string | null = null;
      if (transition.to === PlanStatus.SCHEDULED) {
        await this.syncWishStatus(
          transaction,
          plan,
          WishStatus.IDEA,
          WishStatus.PLANNED,
          actor.user.id,
          now,
        );
      } else if (transition.to === PlanStatus.IN_PROGRESS) {
        await this.syncWishStatus(
          transaction,
          plan,
          WishStatus.PLANNED,
          WishStatus.IN_PROGRESS,
          actor.user.id,
          now,
        );
      } else if (transition.to === PlanStatus.COMPLETED) {
        linkedWishPlaceId = await this.syncWishStatus(
          transaction,
          plan,
          WishStatus.IN_PROGRESS,
          WishStatus.COMPLETED,
          actor.user.id,
          now,
        );
        if (plan.wishId !== null) {
          await scheduleWishCompletionCapsules(transaction, {
            coupleId: plan.coupleId,
            wishId: plan.wishId,
            completedAt: now,
          });
        }
        await completeLinkedPlaces(transaction, {
          coupleId: plan.coupleId,
          placeIds: [plan.placeId, linkedWishPlaceId],
          completedAt: now,
        });
      }
      await this.syncReminder(transaction, plan, now);
      await this.writeMutationEvents(
        transaction,
        plan,
        actor.user.id,
        recipient.id,
        transition.action,
        now,
      );
      return transition.to === PlanStatus.COMPLETED
        ? this.findPlan(transaction, actor.couple.id, planId)
        : plan;
    });
    return toPlanSummary(updated, actor.couple);
  }

  private async assertReferences(
    transaction: PlanDatabase,
    coupleId: string,
    references: PlanReferences,
    planId?: string,
  ): Promise<void> {
    if (references.wishId) {
      const wish = await transaction.wish.findFirst({
        where: {
          id: references.wishId,
          coupleId,
          deletedAt: null,
        },
        select: { id: true, status: true },
      });
      if (!wish) throw resourceNotFound();
      if (wish.status !== WishStatus.IDEA) {
        throw validationFailed("Only an IDEA wish can be attached to a plan");
      }
      const linkedPlan = await transaction.plan.findFirst({
        where: {
          wishId: references.wishId,
          coupleId,
          ...(planId === undefined ? {} : { id: { not: planId } }),
        },
        select: { id: true },
      });
      if (linkedPlan) throw stateConflict();
    }
    if (references.anniversaryId) {
      const anniversary = await transaction.anniversary.findFirst({
        where: {
          id: references.anniversaryId,
          coupleId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!anniversary) throw resourceNotFound();
    }
    if (references.placeId) {
      const place = await transaction.place.findFirst({
        where: { id: references.placeId, coupleId, deletedAt: null },
        select: { id: true },
      });
      if (!place) throw resourceNotFound();
    }
  }

  private async syncWishStatus(
    transaction: PlanDatabase,
    plan: PlanRecord,
    from: WishStatus,
    to: WishStatus,
    actorId: string,
    now: Date,
  ): Promise<string | null> {
    if (plan.wishId === null) return null;
    const wish = await transaction.wish.findFirst({
      where: {
        id: plan.wishId,
        coupleId: plan.coupleId,
        deletedAt: null,
      },
      select: { id: true, version: true, status: true, placeId: true },
    });
    if (!wish) {
      throw stateConflict({ linkedWishUnavailable: true });
    }
    if (wish.status !== from) {
      throw stateConflict({ currentWishStatus: wish.status });
    }
    const changed = await transaction.wish.updateMany({
      where: {
        id: wish.id,
        coupleId: plan.coupleId,
        deletedAt: null,
        version: wish.version,
        status: from,
      },
      data: {
        status: to,
        ...(to === WishStatus.PLANNED ? { plannedFor: plan.startsAt } : {}),
        ...(to === WishStatus.COMPLETED
          ? { completedAt: now, completedById: actorId }
          : {}),
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1) throw stateConflict();
    await transaction.wishUpdate.create({
      data: {
        wishId: wish.id,
        authorId: actorId,
        fromStatus: from,
        toStatus: to,
      },
      select: { id: true },
    });
    return wish.placeId;
  }

  private async syncWishPlannedFor(
    transaction: PlanDatabase,
    plan: PlanRecord,
  ): Promise<void> {
    if (plan.wishId === null) return;
    const wish = await transaction.wish.findFirst({
      where: {
        id: plan.wishId,
        coupleId: plan.coupleId,
        deletedAt: null,
      },
      select: { id: true, version: true, status: true, plannedFor: true },
    });
    if (!wish) throw stateConflict({ linkedWishUnavailable: true });
    if (wish.status !== WishStatus.PLANNED) {
      throw stateConflict({ currentWishStatus: wish.status });
    }
    if (sameInstant(wish.plannedFor, plan.startsAt)) return;
    const changed = await transaction.wish.updateMany({
      where: {
        id: wish.id,
        coupleId: plan.coupleId,
        deletedAt: null,
        status: WishStatus.PLANNED,
        version: wish.version,
      },
      data: { plannedFor: plan.startsAt, version: { increment: 1 } },
    });
    if (changed.count !== 1) throw stateConflict();
  }

  private async releaseWish(
    transaction: PlanDatabase,
    plan: Pick<PlanRecord, "coupleId" | "wishId">,
    actorId: string,
  ): Promise<void> {
    if (plan.wishId === null) return;
    const wish = await transaction.wish.findFirst({
      where: {
        id: plan.wishId,
        coupleId: plan.coupleId,
        deletedAt: null,
      },
      select: { id: true, version: true, status: true },
    });
    if (!wish) throw stateConflict({ linkedWishUnavailable: true });
    if (
      wish.status === WishStatus.COMPLETED ||
      wish.status === WishStatus.CONVERTED_TO_MEMORY
    ) {
      throw stateConflict({ currentWishStatus: wish.status });
    }
    if (wish.status === WishStatus.IDEA) return;
    const changed = await transaction.wish.updateMany({
      where: {
        id: wish.id,
        coupleId: plan.coupleId,
        deletedAt: null,
        version: wish.version,
        status: wish.status,
      },
      data: {
        status: WishStatus.IDEA,
        plannedFor: null,
        completedAt: null,
        completionNote: null,
        completedById: null,
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1) throw stateConflict();
    await transaction.wishUpdate.create({
      data: {
        wishId: wish.id,
        authorId: actorId,
        fromStatus: wish.status,
        toStatus: WishStatus.IDEA,
      },
      select: { id: true },
    });
  }

  private async syncReminder(
    transaction: PlanDatabase,
    plan: PlanRecord,
    now: Date,
  ): Promise<void> {
    if (
      plan.deletedAt === null &&
      plan.status === PlanStatus.SCHEDULED &&
      plan.reminderAt !== null &&
      plan.reminderAt > now
    ) {
      await upsertScheduledEvent(transaction, {
        coupleId: plan.coupleId,
        dedupeKey: REMINDER_KEY(plan.id),
        type: "PLAN_REMINDER",
        payload: { planId: plan.id, expectedVersion: plan.version },
        runAt: plan.reminderAt,
      });
      return;
    }
    await cancelScheduledEvent(
      transaction,
      REMINDER_KEY(plan.id),
      REMINDER_CANCELLABLE_STATUSES,
    );
  }

  private async writeMutationEvents(
    transaction: PlanDatabase,
    plan: Pick<PlanRecord, "coupleId" | "id" | "version">,
    actorId: string,
    recipientId: string,
    action:
      | "created"
      | "updated"
      | "scheduled"
      | "started"
      | "completed"
      | "cancelled"
      | "deleted",
    now: Date,
  ): Promise<void> {
    await createPrivateNotification(transaction, {
      coupleId: plan.coupleId,
      recipientId,
      type: `PLAN_${action.toUpperCase()}`,
      dedupeKey: `plan:${plan.id}:${action}:v${plan.version}:notification`,
      resourceType: "PLAN",
      resourceId: plan.id,
      title: "共同计划有新动态",
      body: "打开明天查看共同计划的最新状态。",
    });
    await enqueueOutboxEvent(transaction, {
      coupleId: plan.coupleId,
      dedupeKey: `plan:${plan.id}:${action}:v${plan.version}`,
      aggregateType: "PLAN",
      aggregateId: plan.id,
      eventType: `plan.${action}`,
      actorId,
      recipientId,
      version: plan.version,
      occurredAt: now,
    });
  }

  private assertVersion(plan: PlanRecord, version: number): void {
    if (plan.version !== version) {
      throw stateConflict({ currentVersion: plan.version });
    }
  }

  private async findPlan(
    database: Pick<Prisma.TransactionClient, "plan"> | PrismaService,
    coupleId: string,
    planId: string,
  ): Promise<PlanRecord> {
    const plan = await database.plan.findFirst({
      where: { id: planId, coupleId, deletedAt: null },
      select: planSelect,
    });
    if (!plan) throw resourceNotFound();
    return plan;
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
          (error.code === "P2002" || error.code === "P2034")
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
