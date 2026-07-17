import { HttpException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { Clock } from "../common/clock/clock";
import type { PrismaService } from "../database/prisma.service";
import type { IdentityService } from "../identity/identity.service";
import {
  AnniversariesService,
  anniversaryReminderEventKey,
} from "./anniversaries.service";

const COUPLE_ID = "00000000-0000-4000-8000-000000000001";
const BOY_ID = "00000000-0000-4000-8000-000000000101";
const GIRL_ID = "00000000-0000-4000-8000-000000000102";
const ANNIVERSARY_ID = "a0000000-0000-4000-8000-000000000001";
const REMINDER_ID = "a0000000-0000-4000-8000-000000000002";
const OUTBOX_ID = "a0000000-0000-4000-8000-000000000003";
const MEMORY_ID = "a0000000-0000-4000-8000-000000000004";
const PLAN_ID = "a0000000-0000-4000-8000-000000000005";
const NOW = new Date("2026-07-17T04:00:00.000Z");

const boy = {
  id: BOY_ID,
  version: 1,
  displayName: "甲",
  slot: 1 as const,
  role: "boy" as const,
  nicknameInRelationship: "甲",
  avatarUrl: null,
};

const girl = {
  id: GIRL_ID,
  version: 1,
  displayName: "乙",
  slot: 2 as const,
  role: "girl" as const,
  nicknameInRelationship: "乙",
  avatarUrl: null,
};

const actor = {
  role: "boy" as const,
  user: boy,
  couple: {
    id: COUPLE_ID,
    version: 1,
    name: "我们的明天",
    startDate: "2024-01-01",
    timezone: "Asia/Shanghai",
    signature: null,
    theme: "system" as const,
    members: [boy, girl],
  },
};

function anniversary(overrides: Record<string, unknown> = {}) {
  return {
    id: ANNIVERSARY_ID,
    coupleId: COUPLE_ID,
    title: "在一起",
    type: "RELATIONSHIP" as const,
    date: new Date("2024-01-01T00:00:00.000Z"),
    repeat: "YEARLY" as const,
    leapDayRule: "FEBRUARY_28" as const,
    version: 1,
    sourceNoteId: null,
    createdById: BOY_ID,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    deletedAt: null,
    backgroundMedia: null,
    reminders: [],
    ...overrides,
  };
}

function reminder(overrides: Record<string, unknown> = {}) {
  return {
    id: REMINDER_ID,
    daysBefore: 0,
    minuteOfDay: 540,
    enabled: true,
    updatedAt: NOW,
    ...overrides,
  };
}

function identityService(): IdentityService {
  return {
    current: vi.fn().mockResolvedValue(actor),
  } as unknown as IdentityService;
}

function fixedClock(now = NOW): Clock {
  return {
    now: vi.fn(() => now),
    localDate: vi.fn(),
  } as unknown as Clock;
}

function statusCode(error: unknown): number | undefined {
  return error instanceof HttpException ? error.getStatus() : undefined;
}

describe("AnniversariesService", () => {
  it("computes and orders the next relationship-local occurrence", async () => {
    const prisma = {
      anniversary: {
        findMany: vi.fn().mockResolvedValue([
          anniversary(),
          anniversary({
            id: "a0000000-0000-4000-8000-000000000099",
            title: "已经过去的一次",
            repeat: "NONE",
            date: new Date("2025-01-01T00:00:00.000Z"),
          }),
        ]),
      },
      scheduledEvent: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const service = new AnniversariesService(
      prisma,
      identityService(),
      fixedClock(),
    );

    const result = await service.list("boy");

    expect(result[0]).toMatchObject({
      id: ANNIVERSARY_ID,
      nextOccurrenceLocalDate: "2026-01-01",
      nextOccurrenceAt: "2026-08-16T16:00:00.000Z",
      daysUntil: 31,
    });
    expect(result[1]?.nextOccurrenceLocalDate).toBeNull();
  });

  it("creates the shared anniversary, private notification and minimal outbox atomically", async () => {
    const created = anniversary({
      date: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: NOW,
      updatedAt: NOW,
    });
    const transaction = {
      mediaAsset: { findFirst: vi.fn().mockResolvedValue({ id: "media" }) },
      anniversary: { create: vi.fn().mockResolvedValue(created) },
      notification: { upsert: vi.fn().mockResolvedValue({ id: "notice" }) },
      outboxEvent: { upsert: vi.fn().mockResolvedValue({ id: OUTBOX_ID }) },
      scheduledEvent: { upsert: vi.fn().mockResolvedValue({ id: "retry" }) },
    };
    const prisma = {
      $transaction: vi.fn(async (operation) => operation(transaction)),
      scheduledEvent: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const service = new AnniversariesService(
      prisma,
      identityService(),
      fixedClock(),
    );

    const result = await service.create("boy", {
      title: "在一起",
      date: "2026-01-01",
      backgroundMediaId: "b0000000-0000-4000-8000-000000000001",
    });

    expect(transaction.mediaAsset.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "b0000000-0000-4000-8000-000000000001",
        coupleId: COUPLE_ID,
        status: "READY",
        deletedAt: null,
        OR: expect.any(Array),
      }),
      select: { id: true },
    });
    expect(transaction.anniversary.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          coupleId: COUPLE_ID,
          createdById: BOY_ID,
          date: new Date("2026-01-01T00:00:00.000Z"),
        }),
      }),
    );
    expect(transaction.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          recipientId: GIRL_ID,
          type: "ANNIVERSARY_CREATED",
        }),
      }),
    );
    expect(transaction.outboxEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          aggregateType: "ANNIVERSARY",
          eventType: "anniversary.created",
        }),
      }),
    );
    expect(result.nextOccurrenceLocalDate).toBe("2026-01-01");
  });

  it("requires the current version before changing an anniversary", async () => {
    const transaction = {
      anniversary: {
        findFirst: vi.fn().mockResolvedValue(anniversary({ version: 4 })),
        updateMany: vi.fn(),
      },
    };
    const service = new AnniversariesService(
      {
        $transaction: vi.fn(async (operation) => operation(transaction)),
      } as unknown as PrismaService,
      identityService(),
      fixedClock(),
    );

    await expect(
      service.update("boy", ANNIVERSARY_ID, { version: 3, title: "五周年" }),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 409);
    expect(transaction.anniversary.updateMany).not.toHaveBeenCalled();
  });

  it("normalizes a reminder and catches up the nearest unexpired occurrence", async () => {
    const transaction = {
      anniversary: {
        findFirst: vi.fn().mockResolvedValue(
          anniversary({
            date: new Date("2026-07-20T00:00:00.000Z"),
            reminders: [],
          }),
        ),
      },
      anniversaryReminder: {
        upsert: vi
          .fn()
          .mockResolvedValue(reminder({ daysBefore: 7, minuteOfDay: 540 })),
      },
      scheduledEvent: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({ id: "scheduled" }),
        updateMany: vi.fn(),
      },
      notification: { upsert: vi.fn().mockResolvedValue({ id: "notice" }) },
      outboxEvent: { upsert: vi.fn().mockResolvedValue({ id: OUTBOX_ID }) },
    };
    const service = new AnniversariesService(
      {
        $transaction: vi.fn(async (operation) => operation(transaction)),
      } as unknown as PrismaService,
      identityService(),
      fixedClock(),
    );

    const result = await service.createReminder("boy", ANNIVERSARY_ID, {
      daysBefore: 7,
    });

    const key = anniversaryReminderEventKey(
      ANNIVERSARY_ID,
      REMINDER_ID,
      "2026-07-20",
    );
    expect(transaction.scheduledEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dedupeKey: key },
        create: expect.objectContaining({
          dedupeKey: key,
          type: "ANNIVERSARY_REMINDER",
          runAt: NOW,
          payload: {
            anniversaryId: ANNIVERSARY_ID,
            reminderId: REMINDER_ID,
            occurrenceLocalDate: "2026-07-20",
          },
        }),
      }),
    );
    expect(result.nextRunAt).toBe(NOW.toISOString());
    expect(transaction.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          dedupeKey: expect.stringContaining(`:configured:u${NOW.valueOf()}:`),
        }),
      }),
    );
    expect(transaction.outboxEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          dedupeKey: expect.stringContaining(`:configured:u${NOW.valueOf()}`),
        }),
      }),
    );
  });

  it("idempotently rebuilds active reminder jobs for a changed Couple timezone", async () => {
    const transaction = {
      anniversary: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: ANNIVERSARY_ID,
            coupleId: COUPLE_ID,
            date: new Date("2024-01-01T00:00:00.000Z"),
            repeat: "YEARLY",
            leapDayRule: "FEBRUARY_28",
            reminders: [reminder()],
          },
        ]),
      },
      scheduledEvent: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({ id: "scheduled" }),
        updateMany: vi.fn(),
      },
      notification: { upsert: vi.fn() },
      outboxEvent: { upsert: vi.fn() },
      anniversaryReminder: {},
      coupleMember: {},
      mediaAsset: {},
    };
    const service = new AnniversariesService(
      {} as PrismaService,
      identityService(),
      fixedClock(),
    );

    await service.rescheduleForCoupleInTransaction(
      transaction as unknown as Prisma.TransactionClient,
      COUPLE_ID,
      "America/New_York",
      NOW,
    );

    const key = anniversaryReminderEventKey(
      ANNIVERSARY_ID,
      REMINDER_ID,
      "2026-01-01",
    );
    expect(transaction.scheduledEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dedupeKey: key },
        create: expect.objectContaining({
          dedupeKey: key,
          runAt: new Date("2026-01-01T13:00:00.000Z"),
        }),
      }),
    );
  });

  it("delivers one privacy-safe reminder per member and schedules a distinct next occurrence", async () => {
    const deliveryNow = new Date("2026-01-01T01:00:00.000Z");
    const transaction = {
      anniversaryReminder: {
        findFirst: vi.fn().mockResolvedValue({
          id: REMINDER_ID,
          coupleId: COUPLE_ID,
          daysBefore: 0,
          minuteOfDay: 540,
          enabled: true,
          updatedAt: deliveryNow,
          anniversary: {
            id: ANNIVERSARY_ID,
            date: new Date("2024-01-01T00:00:00.000Z"),
            repeat: "YEARLY",
            leapDayRule: "FEBRUARY_28",
            deletedAt: null,
            couple: { timezone: "Asia/Shanghai" },
          },
        }),
      },
      coupleMember: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ userId: BOY_ID }, { userId: GIRL_ID }]),
      },
      notification: { upsert: vi.fn().mockResolvedValue({ id: "notice" }) },
      outboxEvent: { upsert: vi.fn().mockResolvedValue({ id: OUTBOX_ID }) },
      scheduledEvent: {
        upsert: vi.fn().mockResolvedValue({ id: "scheduled" }),
      },
    };
    const service = new AnniversariesService(
      {
        $transaction: vi.fn(async (operation) => operation(transaction)),
      } as unknown as PrismaService,
      identityService(),
      fixedClock(deliveryNow),
    );

    await service.deliverReminder(REMINDER_ID, "2026-01-01");

    expect(transaction.notification.upsert).toHaveBeenCalledTimes(2);
    for (const call of transaction.notification.upsert.mock.calls) {
      const data = call[0].create;
      expect(data.type).toBe("ANNIVERSARY_REMINDER");
      expect(data.title).toBe("明天有新动态");
      expect(data.body).toBe("你收到了一条来自明天的新消息。");
      expect(data.payload).toEqual({
        resourceType: "ANNIVERSARY",
        resourceId: ANNIVERSARY_ID,
      });
    }
    expect(transaction.outboxEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          eventType: "anniversary.reminder.due",
          payload: expect.not.objectContaining({
            title: expect.anything(),
            body: expect.anything(),
          }),
        }),
      }),
    );
    const nextKey = anniversaryReminderEventKey(
      ANNIVERSARY_ID,
      REMINDER_ID,
      "2027-01-01",
    );
    expect(transaction.scheduledEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dedupeKey: nextKey },
        create: expect.objectContaining({
          dedupeKey: nextKey,
          runAt: new Date("2027-01-01T01:00:00.000Z"),
        }),
      }),
    );
  });

  it("returns occurrence-scoped memory and plan summaries without partner drafts", async () => {
    const memory = {
      id: MEMORY_ID,
      version: 1,
      title: "一周年旅行",
      content: "一起去了海边",
      happenedAt: new Date("2025-01-01T04:00:00.000Z"),
      status: "PUBLISHED",
      place: null,
      coverMedia: null,
      tags: [],
      isFirstTime: false,
      firstTimeLabel: null,
      isPinned: false,
      perspectives: [],
      _count: { comments: 0 },
      createdAt: new Date("2025-01-01T04:00:00.000Z"),
      updatedAt: new Date("2025-01-01T04:00:00.000Z"),
    };
    const plan = {
      id: PLAN_ID,
      version: 1,
      title: "两周年晚餐",
      itinerary: null,
      preparations: ["订位"],
      participants: ["我们"],
      expectation: null,
      startsAt: null,
      endsAt: null,
      reminderAt: null,
      anniversaryOccurrenceDate: new Date("2026-01-01T00:00:00.000Z"),
      status: "SCHEDULED",
      completedAt: null,
      cancelledAt: null,
      wishId: null,
      anniversaryId: ANNIVERSARY_ID,
      place: null,
      createdById: GIRL_ID,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const memoryFindMany = vi.fn().mockResolvedValue([memory]);
    const prisma = {
      anniversary: { findFirst: vi.fn().mockResolvedValue(anniversary()) },
      plan: { findMany: vi.fn().mockResolvedValue([plan]) },
      memory: { findMany: memoryFindMany },
      reaction: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const service = new AnniversariesService(
      prisma,
      identityService(),
      fixedClock(),
    );

    const result = await service.occurrences("boy", ANNIVERSARY_ID);

    expect(memoryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          coupleId: COUPLE_ID,
          OR: [
            { status: "PUBLISHED" },
            { status: "DRAFT", createdById: BOY_ID },
          ],
        }),
      }),
    );
    expect(
      result.find((item) => item.localDate === "2025-01-01")?.memories,
    ).toHaveLength(1);
    expect(
      result.find((item) => item.localDate === "2026-01-01")?.plan,
    ).toMatchObject({ id: PLAN_ID, createdBy: girl });
  });
});
