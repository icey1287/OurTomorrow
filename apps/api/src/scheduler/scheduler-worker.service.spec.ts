import type { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import type { Clock } from "../common/clock/clock";
import type { Environment } from "../config/env.schema";
import type { PrismaService } from "../database/prisma.service";
import { SchedulerWorkerService } from "./scheduler-worker.service";

const EVENT_ID = "90000000-0000-4000-8000-000000000001";
const NOTE_ID = "70000000-0000-4000-8000-000000000001";
const OUTBOX_ID = "71000000-0000-4000-8000-000000000001";
const COUPLE_ID = "00000000-0000-4000-8000-000000000001";
const BOY_ID = "00000000-0000-4000-8000-000000000101";
const GIRL_ID = "00000000-0000-4000-8000-000000000102";
const NOW = new Date("2026-07-17T08:30:00.000Z");

function config(): ConfigService<Environment, true> {
  return {
    get: vi.fn((key: keyof Environment) =>
      key === "WORKER_BATCH_SIZE" ? 20 : 2_000,
    ),
  } as unknown as ConfigService<Environment, true>;
}

function clock(): Clock {
  return {
    now: vi.fn(() => NOW),
    localDate: vi.fn(),
  } as unknown as Clock;
}

function event(
  overrides: Partial<{
    type: "NOTE_SHOW" | "NOTE_EXPIRE" | "STATUS_EXPIRE" | "OUTBOX_RETRY";
    payload: Record<string, unknown>;
    status: "PENDING" | "RUNNING" | "RETRYING";
    attempts: number;
    lockedUntil: Date | null;
  }> = {},
) {
  return {
    id: EVENT_ID,
    coupleId: COUPLE_ID,
    type: "NOTE_SHOW" as const,
    payload: { noteId: NOTE_ID },
    runAt: NOW,
    status: "PENDING" as const,
    attempts: 0,
    maxAttempts: 5,
    lockedUntil: null,
    ...overrides,
  };
}

describe("SchedulerWorkerService", () => {
  it("atomically claims a due note event with a lease before revealing it", async () => {
    const candidate = event();
    const claimed = event({
      status: "RUNNING",
      attempts: 1,
      lockedUntil: new Date(NOW.getTime() + 30_000),
    });
    const scheduledUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const scheduledFindFirst = vi
      .fn()
      .mockResolvedValueOnce(candidate)
      .mockResolvedValueOnce(claimed)
      .mockResolvedValueOnce(null);
    const transaction = {
      note: {
        findFirst: vi.fn().mockResolvedValue({
          id: NOTE_ID,
          coupleId: COUPLE_ID,
          authorId: BOY_ID,
          recipientId: GIRL_ID,
          status: "SCHEDULED",
          version: 1,
          showAt: NOW,
          expiresAt: null,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      notification: { upsert: vi.fn() },
      outboxEvent: {
        upsert: vi.fn().mockResolvedValue({ id: OUTBOX_ID }),
      },
      scheduledEvent: {
        upsert: vi.fn().mockResolvedValue({ id: "outbox-retry" }),
      },
    };
    const prisma = {
      scheduledEvent: {
        findFirst: scheduledFindFirst,
        updateMany: scheduledUpdateMany,
      },
      $transaction: vi.fn(async (operation) => operation(transaction)),
    } as unknown as PrismaService;
    const worker = new SchedulerWorkerService(config(), prisma, clock());

    await worker.poll();

    expect(scheduledUpdateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: EVENT_ID,
          status: "PENDING",
          attempts: 0,
          runAt: { lte: NOW },
        }),
        data: expect.objectContaining({
          status: "RUNNING",
          attempts: { increment: 1 },
          lockedAt: NOW,
          lockedUntil: new Date(NOW.getTime() + 30_000),
          lockedBy: expect.any(String),
        }),
      }),
    );
    expect(transaction.note.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: "VISIBLE",
          visibleAt: NOW,
          version: { increment: 1 },
        },
      }),
    );
    expect(transaction.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          recipientId: GIRL_ID,
          type: "NOTE_VISIBLE",
        }),
      }),
    );
    const outboxPayload =
      transaction.outboxEvent.upsert.mock.calls[0]?.[0].create.payload;
    expect(outboxPayload).toEqual(
      expect.objectContaining({
        aggregateId: NOTE_ID,
        actorId: BOY_ID,
        recipientId: GIRL_ID,
      }),
    );
    expect(outboxPayload).not.toHaveProperty("content");
    expect(outboxPayload).not.toHaveProperty("body");
    expect(scheduledUpdateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: EVENT_ID,
          status: "RUNNING",
          lockedBy: expect.any(String),
        }),
        data: expect.objectContaining({
          status: "COMPLETED",
          lockedUntil: null,
        }),
      }),
    );
  });

  it("releases the lease and schedules exponential retry when a handler fails", async () => {
    const candidate = event({ payload: {} });
    const claimed = event({
      payload: {},
      status: "RUNNING",
      attempts: 1,
      lockedUntil: new Date(NOW.getTime() + 30_000),
    });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      scheduledEvent: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(candidate)
          .mockResolvedValueOnce(claimed)
          .mockResolvedValueOnce(null),
        updateMany,
      },
    } as unknown as PrismaService;
    const worker = new SchedulerWorkerService(config(), prisma, clock());

    await worker.poll();

    expect(updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: EVENT_ID,
          status: "RUNNING",
          attempts: 1,
          lockedBy: expect.any(String),
        }),
        data: {
          status: "RETRYING",
          runAt: new Date(NOW.getTime() + 1_000),
          lockedAt: null,
          lockedUntil: null,
          lockedBy: null,
          lastError: "Scheduled event payload is missing noteId",
        },
      }),
    );
  });

  it("claims and publishes the durable outbox row for OUTBOX_RETRY", async () => {
    const candidate = event({
      type: "OUTBOX_RETRY",
      payload: { outboxEventId: OUTBOX_ID },
    });
    const claimed = event({
      type: "OUTBOX_RETRY",
      payload: { outboxEventId: OUTBOX_ID },
      status: "RUNNING",
      attempts: 1,
      lockedUntil: new Date(NOW.getTime() + 30_000),
    });
    const outboxUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      scheduledEvent: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(candidate)
          .mockResolvedValueOnce(claimed)
          .mockResolvedValueOnce(null),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      outboxEvent: {
        findUnique: vi.fn().mockResolvedValue({
          id: OUTBOX_ID,
          status: "PENDING",
          attempts: 0,
          maxAttempts: 5,
          availableAt: NOW,
          lockedUntil: null,
        }),
        updateMany: outboxUpdateMany,
      },
    } as unknown as PrismaService;
    const worker = new SchedulerWorkerService(config(), prisma, clock());

    await worker.poll();

    expect(outboxUpdateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          status: "RUNNING",
          attempts: { increment: 1 },
          lockedUntil: new Date(NOW.getTime() + 30_000),
        }),
      }),
    );
    expect(outboxUpdateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PUBLISHED",
          publishedAt: NOW,
          lockedUntil: null,
        }),
      }),
    );
  });

  it("keeps its polling timer referenced so the worker process stays alive", () => {
    vi.useFakeTimers();
    const prisma = {
      scheduledEvent: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const worker = new SchedulerWorkerService(config(), prisma, clock());

    worker.start();
    const timer = (worker as unknown as { timer?: NodeJS.Timeout }).timer;

    expect(timer?.hasRef()).toBe(true);
    worker.onApplicationShutdown();
    vi.useRealTimers();
  });
});
