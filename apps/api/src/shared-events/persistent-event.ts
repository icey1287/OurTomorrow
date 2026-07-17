import type {
  Prisma,
  ScheduledEventStatus,
  ScheduledEventType,
} from "@prisma/client";

type EventDatabase = Pick<
  Prisma.TransactionClient,
  "notification" | "outboxEvent" | "scheduledEvent"
>;

export type ScheduledEventInput = {
  coupleId?: string | null;
  dedupeKey: string;
  type: ScheduledEventType;
  payload: Prisma.InputJsonObject;
  runAt: Date;
  maxAttempts?: number;
};

export type NotificationInput = {
  coupleId: string;
  recipientId: string;
  type: string;
  dedupeKey: string;
  resourceType: string;
  resourceId: string;
  title?: string;
  body?: string;
};

export type OutboxEventInput = {
  coupleId?: string | null;
  dedupeKey: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  actorId?: string | null;
  recipientId?: string | null;
  version?: number | null;
  occurredAt: Date;
};

const PRIVATE_NOTIFICATION_TITLE = "明天有新动态";
const PRIVATE_NOTIFICATION_BODY = "你收到了一条来自明天的新消息。";

export async function upsertScheduledEvent(
  database: EventDatabase,
  input: ScheduledEventInput,
): Promise<void> {
  await database.scheduledEvent.upsert({
    where: { dedupeKey: input.dedupeKey },
    create: {
      coupleId: input.coupleId ?? null,
      dedupeKey: input.dedupeKey,
      type: input.type,
      payload: input.payload,
      runAt: input.runAt,
      ...(input.maxAttempts === undefined
        ? {}
        : { maxAttempts: input.maxAttempts }),
    },
    update: {
      coupleId: input.coupleId ?? null,
      type: input.type,
      payload: input.payload,
      runAt: input.runAt,
      status: "PENDING",
      attempts: 0,
      ...(input.maxAttempts === undefined
        ? {}
        : { maxAttempts: input.maxAttempts }),
      lockedAt: null,
      lockedUntil: null,
      lockedBy: null,
      lastError: null,
      completedAt: null,
    },
    select: { id: true },
  });
}

export async function cancelScheduledEvent(
  database: EventDatabase,
  dedupeKey: string,
  statuses: ScheduledEventStatus[] = ["PENDING", "RETRYING"],
): Promise<void> {
  await database.scheduledEvent.updateMany({
    where: { dedupeKey, status: { in: statuses } },
    data: {
      status: "CANCELLED",
      lockedAt: null,
      lockedUntil: null,
      lockedBy: null,
    },
  });
}

export async function createPrivateNotification(
  database: EventDatabase,
  input: NotificationInput,
): Promise<void> {
  await database.notification.upsert({
    where: { dedupeKey: input.dedupeKey },
    create: {
      coupleId: input.coupleId,
      recipientId: input.recipientId,
      type: input.type,
      title: input.title ?? PRIVATE_NOTIFICATION_TITLE,
      body: input.body ?? PRIVATE_NOTIFICATION_BODY,
      payload: {
        resourceType: input.resourceType,
        resourceId: input.resourceId,
      },
      dedupeKey: input.dedupeKey,
    },
    update: {},
    select: { id: true },
  });
}

export async function enqueueOutboxEvent(
  database: EventDatabase,
  input: OutboxEventInput,
): Promise<void> {
  const payload: Prisma.InputJsonObject = {
    aggregateId: input.aggregateId,
    ...(input.actorId === undefined || input.actorId === null
      ? {}
      : { actorId: input.actorId }),
    ...(input.recipientId === undefined || input.recipientId === null
      ? {}
      : { recipientId: input.recipientId }),
    ...(input.version === undefined || input.version === null
      ? {}
      : { version: input.version }),
    occurredAt: input.occurredAt.toISOString(),
  };
  const event = await database.outboxEvent.upsert({
    where: { dedupeKey: input.dedupeKey },
    create: {
      coupleId: input.coupleId ?? null,
      dedupeKey: input.dedupeKey,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      eventType: input.eventType,
      payload,
      availableAt: input.occurredAt,
    },
    update: {},
    select: { id: true },
  });

  await database.scheduledEvent.upsert({
    where: { dedupeKey: `outbox:${event.id}:retry` },
    create: {
      coupleId: input.coupleId ?? null,
      dedupeKey: `outbox:${event.id}:retry`,
      type: "OUTBOX_RETRY",
      payload: { outboxEventId: event.id },
      runAt: input.occurredAt,
    },
    update: {},
    select: { id: true },
  });
}
