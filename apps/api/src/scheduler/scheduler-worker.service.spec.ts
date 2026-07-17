import type { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import type { AnniversariesService } from "../anniversaries/anniversaries.service";
import type { AnnualReviewsService } from "../annual-reviews/annual-reviews.service";
import type { CalmLettersService } from "../calm-letters/calm-letters.service";
import type { CapsulesService } from "../capsules/capsules.service";
import type { Clock } from "../common/clock/clock";
import type { Environment } from "../config/env.schema";
import type { PrismaService } from "../database/prisma.service";
import type { MemoryResurfaceService } from "../memories/memory-resurface.service";
import type { PlansService } from "../plans/plans.service";
import { SchedulerWorkerService } from "./scheduler-worker.service";

const EVENT_ID = "90000000-0000-4000-8000-000000000001";
const NOTE_ID = "70000000-0000-4000-8000-000000000001";
const OUTBOX_ID = "71000000-0000-4000-8000-000000000001";
const PLAN_ID = "72000000-0000-4000-8000-000000000001";
const ANNIVERSARY_ID = "73000000-0000-4000-8000-000000000001";
const REMINDER_ID = "74000000-0000-4000-8000-000000000001";
const CAPSULE_ID = "75000000-0000-4000-8000-000000000001";
const CALM_LETTER_ID = "76000000-0000-4000-8000-000000000001";
const ANNUAL_REVIEW_ID = "77000000-0000-4000-8000-000000000001";
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
    type:
      | "NOTE_SHOW"
      | "NOTE_EXPIRE"
      | "STATUS_EXPIRE"
      | "PLAN_REMINDER"
      | "ANNIVERSARY_REMINDER"
      | "CAPSULE_DUE"
      | "CALM_LETTER_UNLOCK"
      | "MEMORY_RESURFACE"
      | "ANNUAL_REVIEW"
      | "OUTBOX_RETRY";
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

function stageFourServices() {
  return {
    plans: {
      deliverReminder: vi.fn().mockResolvedValue(undefined),
    } as unknown as PlansService,
    anniversaries: {
      deliverReminder: vi.fn().mockResolvedValue(undefined),
    } as unknown as AnniversariesService,
    capsules: {
      markDue: vi.fn().mockResolvedValue(undefined),
    } as unknown as CapsulesService,
    calmLetters: {
      materializeUnlock: vi.fn().mockResolvedValue(undefined),
    } as unknown as CalmLettersService,
    memoryResurfaces: {
      materializeScheduled: vi.fn().mockResolvedValue(undefined),
    } as unknown as MemoryResurfaceService,
    annualReviews: {
      generate: vi.fn().mockResolvedValue(undefined),
    } as unknown as AnnualReviewsService,
  };
}

function worker(prisma: PrismaService, services = stageFourServices()) {
  return {
    worker: new SchedulerWorkerService(
      config(),
      prisma,
      clock(),
      services.plans,
      services.anniversaries,
      services.capsules,
      undefined,
      services.calmLetters,
      services.memoryResurfaces,
      services.annualReviews,
    ),
    ...services,
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
    const { worker: scheduler } = worker(prisma);

    await scheduler.poll();

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
    const { worker: scheduler } = worker(prisma);

    await scheduler.poll();

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
    const { worker: scheduler } = worker(prisma);

    await scheduler.poll();

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

  it("recovers an expired lease and dispatches a plan reminder once", async () => {
    const expiredLease = new Date(NOW.getTime() - 1);
    const candidate = event({
      type: "PLAN_REMINDER",
      payload: { planId: PLAN_ID, expectedVersion: 4 },
      status: "RUNNING",
      attempts: 1,
      lockedUntil: expiredLease,
    });
    const claimed = event({
      type: "PLAN_REMINDER",
      payload: { planId: PLAN_ID, expectedVersion: 4 },
      status: "RUNNING",
      attempts: 2,
      lockedUntil: new Date(NOW.getTime() + 30_000),
    });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      scheduledEvent: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(candidate)
          .mockResolvedValueOnce(claimed)
          .mockResolvedValue(null),
        updateMany,
      },
    } as unknown as PrismaService;
    const services = stageFourServices();
    const { worker: scheduler } = worker(prisma, services);

    await scheduler.poll();
    await scheduler.poll();

    expect(updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: EVENT_ID,
          status: "RUNNING",
          attempts: 1,
          lockedUntil: { lte: NOW },
        }),
      }),
    );
    expect(services.plans.deliverReminder).toHaveBeenCalledOnce();
    expect(services.plans.deliverReminder).toHaveBeenCalledWith(
      COUPLE_ID,
      PLAN_ID,
      4,
    );
  });

  it("validates relationship ownership before dispatching anniversary and capsule jobs", async () => {
    const anniversaryCandidate = event({
      type: "ANNIVERSARY_REMINDER",
      payload: {
        anniversaryId: ANNIVERSARY_ID,
        reminderId: REMINDER_ID,
        occurrenceLocalDate: "2026-01-01",
      },
    });
    const anniversaryClaimed = event({
      type: "ANNIVERSARY_REMINDER",
      payload: anniversaryCandidate.payload,
      status: "RUNNING",
      attempts: 1,
      lockedUntil: new Date(NOW.getTime() + 30_000),
    });
    const capsuleCandidate = event({
      type: "CAPSULE_DUE",
      payload: { capsuleId: CAPSULE_ID },
    });
    const capsuleClaimed = event({
      type: "CAPSULE_DUE",
      payload: { capsuleId: CAPSULE_ID },
      status: "RUNNING",
      attempts: 1,
      lockedUntil: new Date(NOW.getTime() + 30_000),
    });
    const prisma = {
      scheduledEvent: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(anniversaryCandidate)
          .mockResolvedValueOnce(anniversaryClaimed)
          .mockResolvedValueOnce(capsuleCandidate)
          .mockResolvedValueOnce(capsuleClaimed)
          .mockResolvedValueOnce(null),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      anniversaryReminder: {
        findFirst: vi.fn().mockResolvedValue({ id: REMINDER_ID }),
      },
      capsule: {
        findFirst: vi.fn().mockResolvedValue({ id: CAPSULE_ID }),
      },
    } as unknown as PrismaService;
    const services = stageFourServices();
    const { worker: scheduler } = worker(prisma, services);

    await scheduler.poll();

    expect(prisma.anniversaryReminder.findFirst).toHaveBeenCalledWith({
      where: {
        id: REMINDER_ID,
        coupleId: COUPLE_ID,
        anniversaryId: ANNIVERSARY_ID,
        anniversary: { coupleId: COUPLE_ID, deletedAt: null },
      },
      select: { id: true },
    });
    expect(services.anniversaries.deliverReminder).toHaveBeenCalledWith(
      REMINDER_ID,
      "2026-01-01",
    );
    expect(prisma.capsule.findFirst).toHaveBeenCalledWith({
      where: { id: CAPSULE_ID, coupleId: COUPLE_ID, deletedAt: null },
      select: { id: true },
    });
    expect(services.capsules.markDue).toHaveBeenCalledWith(CAPSULE_ID);
  });

  it("dispatches a durable calm-letter unlock without loading its content", async () => {
    const candidate = event({
      type: "CALM_LETTER_UNLOCK",
      payload: { calmLetterId: CALM_LETTER_ID },
    });
    const claimed = event({
      type: "CALM_LETTER_UNLOCK",
      payload: { calmLetterId: CALM_LETTER_ID },
      status: "RUNNING",
      attempts: 1,
      lockedUntil: new Date(NOW.getTime() + 30_000),
    });
    const prisma = {
      scheduledEvent: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(candidate)
          .mockResolvedValueOnce(claimed)
          .mockResolvedValueOnce(null),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as PrismaService;
    const services = stageFourServices();
    const { worker: scheduler } = worker(prisma, services);

    await scheduler.poll();

    expect(services.calmLetters.materializeUnlock).toHaveBeenCalledWith(
      COUPLE_ID,
      CALM_LETTER_ID,
      NOW,
    );
  });

  it.each([
    ["MEMORY_RESURFACE", {}, "memory"],
    ["ANNUAL_REVIEW", { annualReviewId: ANNUAL_REVIEW_ID }, "annual"],
  ] as const)(
    "dispatches %s through its domain service",
    async (type, payload, target) => {
      const candidate = event({ type, payload });
      const claimed = event({
        type,
        payload,
        status: "RUNNING",
        attempts: 1,
        lockedUntil: new Date(NOW.getTime() + 30_000),
      });
      const prisma = {
        scheduledEvent: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce(candidate)
            .mockResolvedValueOnce(claimed)
            .mockResolvedValueOnce(null),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      } as unknown as PrismaService;
      const services = stageFourServices();
      const { worker: scheduler } = worker(prisma, services);

      await scheduler.poll();

      if (target === "memory") {
        expect(
          services.memoryResurfaces.materializeScheduled,
        ).toHaveBeenCalledWith(COUPLE_ID, NOW);
      } else {
        expect(services.annualReviews.generate).toHaveBeenCalledWith(
          COUPLE_ID,
          ANNUAL_REVIEW_ID,
          NOW,
        );
      }
    },
  );

  it("keeps its polling timer referenced so the worker process stays alive", () => {
    vi.useFakeTimers();
    const prisma = {
      scheduledEvent: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const { worker: scheduler } = worker(prisma);

    scheduler.start();
    const timer = (scheduler as unknown as { timer?: NodeJS.Timeout }).timer;

    expect(timer?.hasRef()).toBe(true);
    scheduler.onApplicationShutdown();
    vi.useRealTimers();
  });
});
