import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CurrentStatusState,
  NoteStatus,
  OutboxEventStatus,
  Prisma,
  ScheduledEventStatus,
  type ScheduledEventType,
} from "@prisma/client";
import { AnniversariesService } from "../anniversaries/anniversaries.service";
import { CapsulesService } from "../capsules/capsules.service";
import { Clock } from "../common/clock/clock";
import type { Environment } from "../config/env.schema";
import { PrismaService } from "../database/prisma.service";
import { PlansService } from "../plans/plans.service";
import {
  createPrivateNotification,
  enqueueOutboxEvent,
} from "../shared-events/persistent-event";

const LEASE_DURATION_MS = 30_000;
const MAX_CLAIM_CONTENTION_RETRIES = 10;
const SUPPORTED_TYPES = [
  "NOTE_SHOW",
  "NOTE_EXPIRE",
  "STATUS_EXPIRE",
  "PLAN_REMINDER",
  "ANNIVERSARY_REMINDER",
  "CAPSULE_DUE",
  "OUTBOX_RETRY",
] satisfies ScheduledEventType[];

const scheduledEventSelect = Prisma.validator<Prisma.ScheduledEventSelect>()({
  id: true,
  coupleId: true,
  type: true,
  payload: true,
  runAt: true,
  status: true,
  attempts: true,
  maxAttempts: true,
  lockedUntil: true,
});

type ClaimedEvent = Prisma.ScheduledEventGetPayload<{
  select: typeof scheduledEventSelect;
}>;

function objectPayload(value: Prisma.JsonValue): Prisma.JsonObject {
  if (value !== null && !Array.isArray(value) && typeof value === "object") {
    return value as Prisma.JsonObject;
  }
  throw new Error("Scheduled event payload must be an object");
}

function requiredString(payload: Prisma.JsonObject, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Scheduled event payload is missing ${key}`);
  }
  return value;
}

function optionalInteger(
  payload: Prisma.JsonObject,
  key: string,
): number | undefined {
  const value = payload[key];
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : undefined;
}

function requiredInteger(payload: Prisma.JsonObject, key: string): number {
  const value = optionalInteger(payload, key);
  if (value === undefined || value < 1) {
    throw new Error(`Scheduled event payload is missing ${key}`);
  }
  return value;
}

function requiredCoupleId(event: ClaimedEvent): string {
  if (event.coupleId === null) {
    throw new Error(`${event.type} scheduled event is missing coupleId`);
  }
  return event.coupleId;
}

function retryDelay(attempts: number): number {
  return Math.min(60_000, 1_000 * 2 ** Math.max(0, attempts - 1));
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 8_000 ? message.slice(0, 8_000) : message;
}

@Injectable()
export class SchedulerWorkerService implements OnApplicationShutdown {
  private readonly logger = new Logger(SchedulerWorkerService.name);
  private readonly workerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  private timer?: NodeJS.Timeout;
  private polling = false;

  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(Clock)
    private readonly clock: Clock,
    @Optional()
    @Inject(PlansService)
    private readonly plans?: PlansService,
    @Optional()
    @Inject(AnniversariesService)
    private readonly anniversaries?: AnniversariesService,
    @Optional()
    @Inject(CapsulesService)
    private readonly capsules?: CapsulesService,
  ) {}

  start(): void {
    const interval = this.config.get("WORKER_POLL_INTERVAL_MS", {
      infer: true,
    });
    this.logger.log(`Scheduler worker started (poll interval ${interval}ms)`);
    void this.poll();
    this.timer = setInterval(() => void this.poll(), interval);
  }

  async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const now = this.clock.now();
      const batchSize = this.config.get("WORKER_BATCH_SIZE", { infer: true });
      for (let handled = 0; handled < batchSize; handled += 1) {
        const event = await this.claimNext(now);
        if (!event) break;
        try {
          await this.handle(event, now);
          await this.complete(event.id, now);
        } catch (error) {
          await this.fail(event, error, now);
        }
      }
    } catch (error) {
      this.logger.error(
        "Scheduler poll failed",
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.polling = false;
    }
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async claimNext(now: Date): Promise<ClaimedEvent | null> {
    for (
      let contention = 0;
      contention < MAX_CLAIM_CONTENTION_RETRIES;
      contention += 1
    ) {
      const candidate = await this.prisma.scheduledEvent.findFirst({
        where: {
          type: { in: SUPPORTED_TYPES },
          OR: [
            {
              status: {
                in: [
                  ScheduledEventStatus.PENDING,
                  ScheduledEventStatus.RETRYING,
                ],
              },
              runAt: { lte: now },
            },
            {
              status: ScheduledEventStatus.RUNNING,
              lockedUntil: { lte: now },
            },
          ],
        },
        orderBy: [{ runAt: "asc" }, { id: "asc" }],
        select: scheduledEventSelect,
      });
      if (!candidate) return null;

      if (candidate.attempts >= candidate.maxAttempts) {
        await this.prisma.scheduledEvent.updateMany({
          where: {
            id: candidate.id,
            status: candidate.status,
            attempts: candidate.attempts,
          },
          data: {
            status: ScheduledEventStatus.FAILED,
            lastError: "Maximum attempts exhausted before claim",
            lockedAt: null,
            lockedUntil: null,
            lockedBy: null,
          },
        });
        continue;
      }

      const lockedUntil = new Date(now.getTime() + LEASE_DURATION_MS);
      const claimed = await this.prisma.scheduledEvent.updateMany({
        where: {
          id: candidate.id,
          status: candidate.status,
          attempts: candidate.attempts,
          ...(candidate.status === ScheduledEventStatus.RUNNING
            ? { lockedUntil: { lte: now } }
            : { runAt: { lte: now } }),
        },
        data: {
          status: ScheduledEventStatus.RUNNING,
          attempts: { increment: 1 },
          lockedAt: now,
          lockedUntil,
          lockedBy: this.workerId,
          lastError: null,
        },
      });
      if (claimed.count !== 1) continue;
      const event = await this.prisma.scheduledEvent.findFirst({
        where: {
          id: candidate.id,
          status: ScheduledEventStatus.RUNNING,
          lockedBy: this.workerId,
          lockedUntil,
        },
        select: scheduledEventSelect,
      });
      if (event) return event;
    }
    return null;
  }

  private async handle(event: ClaimedEvent, now: Date): Promise<void> {
    const payload = objectPayload(event.payload);
    switch (event.type) {
      case "NOTE_SHOW":
        await this.showNote(requiredString(payload, "noteId"), now);
        return;
      case "NOTE_EXPIRE":
        await this.expireNote(requiredString(payload, "noteId"), now);
        return;
      case "STATUS_EXPIRE":
        await this.expireStatus(
          requiredString(payload, "statusId"),
          optionalInteger(payload, "expectedVersion"),
          now,
        );
        return;
      case "PLAN_REMINDER":
        if (!this.plans) throw new Error("PlansService is unavailable");
        await this.plans.deliverReminder(
          requiredCoupleId(event),
          requiredString(payload, "planId"),
          requiredInteger(payload, "expectedVersion"),
        );
        return;
      case "ANNIVERSARY_REMINDER":
        await this.deliverAnniversaryReminder(event, payload);
        return;
      case "CAPSULE_DUE":
        await this.markCapsuleDue(event, payload);
        return;
      case "OUTBOX_RETRY":
        await this.publishOutbox(requiredString(payload, "outboxEventId"), now);
        return;
      default:
        throw new Error(`Unsupported scheduled event type: ${event.type}`);
    }
  }

  private async deliverAnniversaryReminder(
    event: ClaimedEvent,
    payload: Prisma.JsonObject,
  ): Promise<void> {
    const coupleId = requiredCoupleId(event);
    const anniversaryId = requiredString(payload, "anniversaryId");
    const reminderId = requiredString(payload, "reminderId");
    const ownedReminder = await this.prisma.anniversaryReminder.findFirst({
      where: {
        id: reminderId,
        coupleId,
        anniversaryId,
        anniversary: { coupleId, deletedAt: null },
      },
      select: { id: true },
    });
    if (!ownedReminder) return;
    if (!this.anniversaries) {
      throw new Error("AnniversariesService is unavailable");
    }
    await this.anniversaries.deliverReminder(
      reminderId,
      requiredString(payload, "occurrenceLocalDate"),
    );
  }

  private async markCapsuleDue(
    event: ClaimedEvent,
    payload: Prisma.JsonObject,
  ): Promise<void> {
    const coupleId = requiredCoupleId(event);
    const capsuleId = requiredString(payload, "capsuleId");
    const ownedCapsule = await this.prisma.capsule.findFirst({
      where: { id: capsuleId, coupleId, deletedAt: null },
      select: { id: true },
    });
    if (!ownedCapsule) return;
    if (!this.capsules) throw new Error("CapsulesService is unavailable");
    await this.capsules.markDue(capsuleId);
  }

  private async showNote(noteId: string, now: Date): Promise<void> {
    await this.prisma.$transaction(
      async (transaction) => {
        const note = await transaction.note.findFirst({
          where: { id: noteId, deletedAt: null },
          select: {
            id: true,
            coupleId: true,
            authorId: true,
            recipientId: true,
            status: true,
            version: true,
            showAt: true,
            expiresAt: true,
          },
        });
        if (!note || note.status !== NoteStatus.SCHEDULED) return;
        if (note.showAt !== null && note.showAt > now) {
          throw new Error("NOTE_SHOW was claimed before showAt");
        }
        if (note.expiresAt !== null && note.expiresAt <= now) {
          await this.expireNoteInTransaction(transaction, note, now);
          return;
        }
        const changed = await transaction.note.updateMany({
          where: {
            id: note.id,
            coupleId: note.coupleId,
            deletedAt: null,
            status: NoteStatus.SCHEDULED,
            version: note.version,
            OR: [{ showAt: null }, { showAt: { lte: now } }],
          },
          data: {
            status: NoteStatus.VISIBLE,
            visibleAt: now,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) return;
        const nextVersion = note.version + 1;
        await createPrivateNotification(transaction, {
          coupleId: note.coupleId,
          recipientId: note.recipientId,
          type: "NOTE_VISIBLE",
          dedupeKey: `note:${note.id}:visible`,
          resourceType: "NOTE",
          resourceId: note.id,
        });
        await enqueueOutboxEvent(transaction, {
          coupleId: note.coupleId,
          dedupeKey: `note:${note.id}:visible:v${nextVersion}`,
          aggregateType: "NOTE",
          aggregateId: note.id,
          eventType: "note.visible",
          actorId: note.authorId,
          recipientId: note.recipientId,
          version: nextVersion,
          occurredAt: now,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async expireNote(noteId: string, now: Date): Promise<void> {
    await this.prisma.$transaction(
      async (transaction) => {
        const note = await transaction.note.findFirst({
          where: { id: noteId, deletedAt: null },
          select: {
            id: true,
            coupleId: true,
            authorId: true,
            recipientId: true,
            status: true,
            version: true,
            expiresAt: true,
          },
        });
        if (!note) return;
        await this.expireNoteInTransaction(transaction, note, now);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async expireNoteInTransaction(
    transaction: Prisma.TransactionClient,
    note: {
      id: string;
      coupleId: string;
      authorId: string;
      recipientId: string;
      status: NoteStatus;
      version: number;
      expiresAt: Date | null;
    },
    now: Date,
  ): Promise<void> {
    if (
      note.expiresAt === null ||
      note.expiresAt > now ||
      (note.status !== NoteStatus.SCHEDULED &&
        note.status !== NoteStatus.VISIBLE &&
        note.status !== NoteStatus.VIEWED)
    ) {
      return;
    }
    const changed = await transaction.note.updateMany({
      where: {
        id: note.id,
        coupleId: note.coupleId,
        status: note.status,
        version: note.version,
        deletedAt: null,
        expiresAt: { lte: now },
      },
      data: { status: NoteStatus.EXPIRED, version: { increment: 1 } },
    });
    if (changed.count !== 1) return;
    await enqueueOutboxEvent(transaction, {
      coupleId: note.coupleId,
      dedupeKey: `note:${note.id}:expired:v${note.version + 1}`,
      aggregateType: "NOTE",
      aggregateId: note.id,
      eventType: "note.expired",
      actorId: note.authorId,
      recipientId: note.recipientId,
      version: note.version + 1,
      occurredAt: now,
    });
  }

  private async expireStatus(
    statusId: string,
    expectedVersion: number | undefined,
    now: Date,
  ): Promise<void> {
    await this.prisma.$transaction(
      async (transaction) => {
        const status = await transaction.currentStatus.findFirst({
          where: { id: statusId },
          select: {
            id: true,
            coupleId: true,
            authorId: true,
            state: true,
            version: true,
            expiresAt: true,
          },
        });
        if (
          !status ||
          status.state !== CurrentStatusState.ACTIVE ||
          status.expiresAt > now ||
          (expectedVersion !== undefined && status.version !== expectedVersion)
        ) {
          return;
        }
        const changed = await transaction.currentStatus.updateMany({
          where: {
            id: status.id,
            coupleId: status.coupleId,
            state: CurrentStatusState.ACTIVE,
            version: status.version,
            expiresAt: { lte: now },
          },
          data: {
            state: CurrentStatusState.EXPIRED,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) return;
        const partner = await transaction.coupleMember.findFirst({
          where: {
            coupleId: status.coupleId,
            userId: { not: status.authorId },
            status: "ACTIVE",
          },
          select: { userId: true },
        });
        await enqueueOutboxEvent(transaction, {
          coupleId: status.coupleId,
          dedupeKey: `current-status:${status.id}:v${status.version + 1}:expired`,
          aggregateType: "CURRENT_STATUS",
          aggregateId: status.id,
          eventType: "current_status.expired",
          actorId: status.authorId,
          recipientId: partner?.userId ?? null,
          version: status.version + 1,
          occurredAt: now,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async publishOutbox(outboxEventId: string, now: Date): Promise<void> {
    const outbox = await this.claimOutbox(outboxEventId, now);
    if (!outbox) return;
    try {
      const published = await this.prisma.outboxEvent.updateMany({
        where: {
          id: outbox.id,
          status: OutboxEventStatus.RUNNING,
          attempts: outbox.attempts,
          lockedBy: this.workerId,
        },
        data: {
          status: OutboxEventStatus.PUBLISHED,
          publishedAt: now,
          lockedAt: null,
          lockedUntil: null,
          lockedBy: null,
          lastError: null,
        },
      });
      if (published.count !== 1) {
        throw new Error("Outbox event lease was lost before publication");
      }
    } catch (error) {
      await this.failOutbox(outbox, error, now);
      throw error;
    }
  }

  private async claimOutbox(
    outboxEventId: string,
    now: Date,
  ): Promise<{
    id: string;
    status: OutboxEventStatus;
    attempts: number;
    maxAttempts: number;
  } | null> {
    const candidate = await this.prisma.outboxEvent.findUnique({
      where: { id: outboxEventId },
      select: {
        id: true,
        status: true,
        attempts: true,
        maxAttempts: true,
        availableAt: true,
        lockedUntil: true,
      },
    });
    if (
      !candidate ||
      candidate.status === OutboxEventStatus.PUBLISHED ||
      candidate.status === OutboxEventStatus.FAILED
    ) {
      return null;
    }
    const claimable =
      ((candidate.status === OutboxEventStatus.PENDING ||
        candidate.status === OutboxEventStatus.RETRYING) &&
        candidate.availableAt <= now) ||
      (candidate.status === OutboxEventStatus.RUNNING &&
        candidate.lockedUntil !== null &&
        candidate.lockedUntil <= now);
    if (!claimable) {
      throw new Error("Outbox event is not available for retry yet");
    }
    if (candidate.attempts >= candidate.maxAttempts) {
      await this.prisma.outboxEvent.updateMany({
        where: {
          id: candidate.id,
          status: candidate.status,
          attempts: candidate.attempts,
        },
        data: {
          status: OutboxEventStatus.FAILED,
          lastError: "Maximum attempts exhausted before claim",
          lockedAt: null,
          lockedUntil: null,
          lockedBy: null,
        },
      });
      return null;
    }
    const claimed = await this.prisma.outboxEvent.updateMany({
      where: {
        id: candidate.id,
        status: candidate.status,
        attempts: candidate.attempts,
        ...(candidate.status === OutboxEventStatus.RUNNING
          ? { lockedUntil: { lte: now } }
          : { availableAt: { lte: now } }),
      },
      data: {
        status: OutboxEventStatus.RUNNING,
        attempts: { increment: 1 },
        lockedAt: now,
        lockedUntil: new Date(now.getTime() + LEASE_DURATION_MS),
        lockedBy: this.workerId,
        lastError: null,
      },
    });
    if (claimed.count !== 1) {
      throw new Error("Outbox event was claimed by another worker");
    }
    return {
      id: candidate.id,
      status: OutboxEventStatus.RUNNING,
      attempts: candidate.attempts + 1,
      maxAttempts: candidate.maxAttempts,
    };
  }

  private async failOutbox(
    outbox: {
      id: string;
      attempts: number;
      maxAttempts: number;
    },
    error: unknown,
    now: Date,
  ): Promise<void> {
    const exhausted = outbox.attempts >= outbox.maxAttempts;
    await this.prisma.outboxEvent.updateMany({
      where: {
        id: outbox.id,
        status: OutboxEventStatus.RUNNING,
        attempts: outbox.attempts,
        lockedBy: this.workerId,
      },
      data: {
        status: exhausted
          ? OutboxEventStatus.FAILED
          : OutboxEventStatus.RETRYING,
        availableAt: new Date(now.getTime() + retryDelay(outbox.attempts)),
        lockedAt: null,
        lockedUntil: null,
        lockedBy: null,
        lastError: errorMessage(error),
      },
    });
  }

  private async complete(eventId: string, now: Date): Promise<void> {
    await this.prisma.scheduledEvent.updateMany({
      where: {
        id: eventId,
        status: ScheduledEventStatus.RUNNING,
        lockedBy: this.workerId,
      },
      data: {
        status: ScheduledEventStatus.COMPLETED,
        completedAt: now,
        lockedAt: null,
        lockedUntil: null,
        lockedBy: null,
        lastError: null,
      },
    });
  }

  private async fail(
    event: ClaimedEvent,
    error: unknown,
    now: Date,
  ): Promise<void> {
    const exhausted = event.attempts >= event.maxAttempts;
    await this.prisma.scheduledEvent.updateMany({
      where: {
        id: event.id,
        status: ScheduledEventStatus.RUNNING,
        attempts: event.attempts,
        lockedBy: this.workerId,
      },
      data: {
        status: exhausted
          ? ScheduledEventStatus.FAILED
          : ScheduledEventStatus.RETRYING,
        runAt: new Date(now.getTime() + retryDelay(event.attempts)),
        lockedAt: null,
        lockedUntil: null,
        lockedBy: null,
        lastError: errorMessage(error),
      },
    });
    this.logger.warn(
      `Scheduled event ${event.id} (${event.type}) failed on attempt ${event.attempts}: ${errorMessage(error)}`,
    );
  }
}
