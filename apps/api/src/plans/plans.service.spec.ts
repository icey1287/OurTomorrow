import { HttpException } from "@nestjs/common";
import { PlanStatus, WishStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { Clock } from "../common/clock/clock";
import type { PrismaService } from "../database/prisma.service";
import type {
  IdentityResponse,
  IdentityService,
} from "../identity/identity.service";
import type { PlanRecord } from "./plan.presentation";
import { PlansService } from "./plans.service";

const COUPLE_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_COUPLE_ID = "00000000-0000-4000-8000-000000000002";
const BOY_ID = "00000000-0000-4000-8000-000000000101";
const GIRL_ID = "00000000-0000-4000-8000-000000000102";
const PLAN_ID = "40000000-0000-4000-8000-000000000001";
const WISH_ID = "41000000-0000-4000-8000-000000000001";
const PLACE_ID = "42000000-0000-4000-8000-000000000001";
const OUTBOX_ID = "43000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-17T08:00:00.000Z");
const STARTS_AT = new Date("2026-07-20T02:00:00.000Z");
const REMINDER_AT = new Date("2026-07-19T02:00:00.000Z");

const boy = {
  id: BOY_ID,
  version: 1,
  displayName: "甲",
  slot: 1 as const,
  role: "boy" as const,
  nicknameInRelationship: null,
  avatarUrl: null,
};

const girl = {
  id: GIRL_ID,
  version: 1,
  displayName: "乙",
  slot: 2 as const,
  role: "girl" as const,
  nicknameInRelationship: null,
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
} satisfies IdentityResponse;

const clock = {
  now: vi.fn(() => NOW),
  localDate: vi.fn(() => "2026-07-17"),
} as unknown as Clock;

function identityService(selected: IdentityResponse = actor): IdentityService {
  return {
    current: vi.fn().mockResolvedValue(selected),
  } as unknown as IdentityService;
}

function plan(overrides: Partial<PlanRecord> = {}): PlanRecord {
  return {
    id: PLAN_ID,
    coupleId: COUPLE_ID,
    wishId: null,
    anniversaryId: null,
    placeId: null,
    title: "去看海",
    itinerary: "沿海散步",
    preparations: ["带相机"],
    participants: ["我们"],
    expectation: "一起看日落",
    startsAt: STARTS_AT,
    endsAt: new Date("2026-07-20T06:00:00.000Z"),
    reminderAt: REMINDER_AT,
    anniversaryOccurrenceDate: null,
    status: PlanStatus.DRAFT,
    version: 1,
    completedAt: null,
    cancelledAt: null,
    createdById: BOY_ID,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    place: null,
    ...overrides,
  };
}

function transaction() {
  return {
    plan: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    wish: {
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    wishUpdate: {
      create: vi.fn().mockResolvedValue({ id: WISH_ID }),
    },
    capsule: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    anniversary: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    coupleMember: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ userId: BOY_ID }, { userId: GIRL_ID }]),
    },
    place: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    scheduledEvent: {
      upsert: vi.fn().mockResolvedValue({ id: PLAN_ID }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    notification: {
      upsert: vi.fn().mockResolvedValue({ id: PLAN_ID }),
    },
    outboxEvent: {
      upsert: vi.fn().mockResolvedValue({ id: OUTBOX_ID }),
    },
  };
}

function serviceWith(tx: ReturnType<typeof transaction>) {
  const prisma = {
    $transaction: vi.fn(async (operation) => operation(tx)),
  } as unknown as PrismaService;
  return {
    service: new PlansService(prisma, identityService(), clock),
    prisma,
  };
}

function statusCode(error: unknown): number | undefined {
  return error instanceof HttpException ? error.getStatus() : undefined;
}

function scheduledCall(tx: ReturnType<typeof transaction>, dedupeKey: string) {
  return tx.scheduledEvent.upsert.mock.calls.find(
    ([input]) => input.where.dedupeKey === dedupeKey,
  )?.[0];
}

describe("PlansService", () => {
  it("always scopes list queries to the selected relationship space", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new PlansService(
      { plan: { findMany } } as unknown as PrismaService,
      identityService(),
      clock,
    );

    await service.list("boy", { status: PlanStatus.SCHEDULED });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          coupleId: COUPLE_ID,
          deletedAt: null,
          status: PlanStatus.SCHEDULED,
        }),
      }),
    );
  });

  it("rejects a reference from another relationship without creating a plan", async () => {
    const tx = transaction();
    const { service } = serviceWith(tx);

    await expect(
      service.create("boy", {
        title: "越界地点",
        placeId: PLACE_ID,
      }),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 404);

    expect(tx.place.findFirst).toHaveBeenCalledWith({
      where: { id: PLACE_ID, coupleId: COUPLE_ID, deletedAt: null },
      select: { id: true },
    });
    expect(tx.place.findFirst).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ coupleId: OTHER_COUPLE_ID }),
      }),
    );
    expect(tx.plan.create).not.toHaveBeenCalled();
  });

  it("attaches a new plan only to an IDEA wish", async () => {
    const tx = transaction();
    tx.wish.findFirst.mockResolvedValue({
      id: WISH_ID,
      status: WishStatus.IN_PROGRESS,
    });
    const { service } = serviceWith(tx);

    await expect(
      service.create("boy", {
        title: "另一份计划",
        wishId: WISH_ID,
      }),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 400);
    expect(tx.plan.create).not.toHaveBeenCalled();
  });

  it("rejects invalid time ordering before opening a transaction", async () => {
    const tx = transaction();
    const { service, prisma } = serviceWith(tx);

    await expect(
      service.create("boy", {
        title: "时间倒流",
        startsAt: "2026-07-20T02:00:00.000Z",
        endsAt: "2026-07-20T01:00:00.000Z",
      }),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("schedules a draft, synchronizes its wish and creates one reusable reminder", async () => {
    const tx = transaction();
    tx.plan.findFirst
      .mockResolvedValueOnce(plan({ wishId: WISH_ID }))
      .mockResolvedValueOnce(
        plan({
          wishId: WISH_ID,
          status: PlanStatus.SCHEDULED,
          version: 2,
        }),
      );
    tx.wish.findFirst.mockResolvedValue({
      id: WISH_ID,
      version: 4,
      status: WishStatus.IDEA,
    });
    const { service, prisma } = serviceWith(tx);

    const result = await service.schedule("boy", PLAN_ID, { version: 1 });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.plan.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          coupleId: COUPLE_ID,
          version: 1,
          status: PlanStatus.DRAFT,
        }),
        data: expect.objectContaining({
          status: PlanStatus.SCHEDULED,
          version: { increment: 1 },
        }),
      }),
    );
    expect(tx.wish.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          coupleId: COUPLE_ID,
          status: WishStatus.IDEA,
          version: 4,
        }),
        data: expect.objectContaining({
          status: WishStatus.PLANNED,
          plannedFor: STARTS_AT,
        }),
      }),
    );
    expect(tx.wishUpdate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: WishStatus.IDEA,
          toStatus: WishStatus.PLANNED,
        }),
      }),
    );
    expect(scheduledCall(tx, `plan:${PLAN_ID}:reminder`)).toEqual(
      expect.objectContaining({
        create: expect.objectContaining({
          type: "PLAN_REMINDER",
          payload: { planId: PLAN_ID, expectedVersion: 2 },
          runAt: REMINDER_AT,
        }),
      }),
    );
    expect(result.status).toBe(PlanStatus.SCHEDULED);
    const outboxPayload =
      tx.outboxEvent.upsert.mock.calls[0]?.[0].create.payload;
    expect(outboxPayload).toMatchObject({
      aggregateId: PLAN_ID,
      actorId: BOY_ID,
      recipientId: GIRL_ID,
      version: 2,
    });
    expect(JSON.stringify(outboxPayload)).not.toContain("去看海");
  });

  it("enforces the action state machine and stale versions before writing", async () => {
    const stale = transaction();
    stale.plan.findFirst.mockResolvedValue(plan({ version: 3 }));
    const staleService = serviceWith(stale).service;

    await expect(
      staleService.update("boy", PLAN_ID, { version: 2, title: "旧修改" }),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 409);
    expect(stale.plan.updateMany).not.toHaveBeenCalled();

    const terminal = transaction();
    terminal.plan.findFirst.mockResolvedValue(
      plan({ status: PlanStatus.COMPLETED }),
    );
    const terminalService = serviceWith(terminal).service;
    await expect(
      terminalService.schedule("boy", PLAN_ID, { version: 1 }),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 409);
    expect(terminal.plan.updateMany).not.toHaveBeenCalled();
  });

  it("starts only a scheduled plan, advances a planned wish and cancels the reminder", async () => {
    const tx = transaction();
    tx.plan.findFirst
      .mockResolvedValueOnce(
        plan({
          wishId: WISH_ID,
          status: PlanStatus.SCHEDULED,
          version: 2,
        }),
      )
      .mockResolvedValueOnce(
        plan({
          wishId: WISH_ID,
          status: PlanStatus.IN_PROGRESS,
          version: 3,
        }),
      );
    tx.wish.findFirst.mockResolvedValue({
      id: WISH_ID,
      version: 5,
      status: WishStatus.PLANNED,
    });
    const { service } = serviceWith(tx);

    await service.start("boy", PLAN_ID, { version: 2 });

    expect(tx.wish.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: WishStatus.IN_PROGRESS }),
      }),
    );
    expect(tx.scheduledEvent.updateMany).toHaveBeenCalledWith({
      where: {
        dedupeKey: `plan:${PLAN_ID}:reminder`,
        status: { in: ["PENDING", "RETRYING", "RUNNING"] },
      },
      data: {
        status: "CANCELLED",
        lockedAt: null,
        lockedUntil: null,
        lockedBy: null,
      },
    });
  });

  it("completes only an in-progress plan and records the completing identity on its wish", async () => {
    const tx = transaction();
    tx.plan.findFirst
      .mockResolvedValueOnce(
        plan({
          wishId: WISH_ID,
          status: PlanStatus.IN_PROGRESS,
          version: 3,
        }),
      )
      .mockResolvedValueOnce(
        plan({
          wishId: WISH_ID,
          status: PlanStatus.COMPLETED,
          version: 4,
          completedAt: NOW,
        }),
      );
    tx.wish.findFirst.mockResolvedValue({
      id: WISH_ID,
      version: 6,
      status: WishStatus.IN_PROGRESS,
    });
    const { service } = serviceWith(tx);

    const result = await service.complete("boy", PLAN_ID, { version: 3 });

    expect(tx.plan.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PlanStatus.COMPLETED,
          completedAt: NOW,
        }),
      }),
    );
    expect(tx.wish.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WishStatus.COMPLETED,
          completedAt: NOW,
          completedById: BOY_ID,
        }),
      }),
    );
    expect(tx.capsule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          coupleId: COUPLE_ID,
          wishId: WISH_ID,
          unlockRule: "WISH_COMPLETION",
        }),
      }),
    );
    expect(result.completedAt).toBe(NOW.toISOString());
  });

  it("cancels an active plan and releases its wish back to IDEA", async () => {
    const tx = transaction();
    tx.plan.findFirst
      .mockResolvedValueOnce(
        plan({
          wishId: WISH_ID,
          status: PlanStatus.IN_PROGRESS,
          version: 7,
        }),
      )
      .mockResolvedValueOnce(
        plan({
          wishId: null,
          status: PlanStatus.CANCELLED,
          version: 8,
          cancelledAt: NOW,
        }),
      );
    tx.wish.findFirst.mockResolvedValue({
      id: WISH_ID,
      version: 11,
      status: WishStatus.IN_PROGRESS,
    });
    const { service } = serviceWith(tx);

    await service.cancel("boy", PLAN_ID, { version: 7 });

    expect(tx.plan.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PlanStatus.CANCELLED,
          cancelledAt: NOW,
          wishId: null,
        }),
      }),
    );
    expect(tx.wish.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          coupleId: COUPLE_ID,
          version: 11,
          status: WishStatus.IN_PROGRESS,
        }),
        data: expect.objectContaining({
          status: WishStatus.IDEA,
          plannedFor: null,
        }),
      }),
    );
    expect(tx.wishUpdate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: WishStatus.IN_PROGRESS,
          toStatus: WishStatus.IDEA,
        }),
      }),
    );
  });

  it("reschedules and cancels the same reminder key when timing changes", async () => {
    const newReminder = new Date("2026-07-19T04:00:00.000Z");
    const reschedule = transaction();
    reschedule.plan.findFirst
      .mockResolvedValueOnce(plan({ status: PlanStatus.SCHEDULED, version: 3 }))
      .mockResolvedValueOnce(
        plan({
          status: PlanStatus.SCHEDULED,
          version: 4,
          reminderAt: newReminder,
        }),
      );
    const rescheduleService = serviceWith(reschedule).service;

    await rescheduleService.update("boy", PLAN_ID, {
      version: 3,
      reminderAt: newReminder.toISOString(),
    });

    expect(scheduledCall(reschedule, `plan:${PLAN_ID}:reminder`)).toEqual(
      expect.objectContaining({
        update: expect.objectContaining({
          runAt: newReminder,
          status: "PENDING",
          attempts: 0,
        }),
      }),
    );

    const cancel = transaction();
    cancel.plan.findFirst
      .mockResolvedValueOnce(plan({ status: PlanStatus.SCHEDULED, version: 4 }))
      .mockResolvedValueOnce(
        plan({
          status: PlanStatus.SCHEDULED,
          version: 5,
          reminderAt: null,
        }),
      );
    const cancelService = serviceWith(cancel).service;
    await cancelService.update("boy", PLAN_ID, {
      version: 4,
      reminderAt: null,
    });

    expect(cancel.scheduledEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          dedupeKey: `plan:${PLAN_ID}:reminder`,
        }),
      }),
    );
    expect(scheduledCall(cancel, `plan:${PLAN_ID}:reminder`)).toBeUndefined();
  });

  it("delivers a due plan reminder once to both members and ignores stale versions", async () => {
    const tx = transaction();
    tx.plan.findFirst.mockResolvedValue(
      plan({
        status: PlanStatus.SCHEDULED,
        version: 4,
        reminderAt: new Date(NOW.getTime() - 1_000),
      }),
    );
    const { service } = serviceWith(tx);

    await service.deliverReminder(COUPLE_ID, PLAN_ID, 4);
    await service.deliverReminder(COUPLE_ID, PLAN_ID, 3);

    expect(tx.plan.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PLAN_ID, coupleId: COUPLE_ID, deletedAt: null },
      }),
    );
    expect(tx.notification.upsert).toHaveBeenCalledTimes(2);
    expect(tx.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          recipientId: BOY_ID,
          type: "PLAN_REMINDER",
          dedupeKey: `plan:${PLAN_ID}:reminder:v4:notification:${BOY_ID}`,
        }),
      }),
    );
    expect(tx.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          recipientId: GIRL_ID,
          type: "PLAN_REMINDER",
          dedupeKey: `plan:${PLAN_ID}:reminder:v4:notification:${GIRL_ID}`,
        }),
      }),
    );
    const dueEvent = tx.outboxEvent.upsert.mock.calls.find(
      ([input]) => input.where.dedupeKey === `plan:${PLAN_ID}:reminder:v4:due`,
    )?.[0];
    expect(dueEvent).toEqual(
      expect.objectContaining({
        create: expect.objectContaining({
          eventType: "plan.reminder.due",
          payload: expect.objectContaining({
            recipientIds: [BOY_ID, GIRL_ID],
            version: 4,
          }),
        }),
      }),
    );
  });

  it("soft-deletes with a version CAS and cancels pending reminders", async () => {
    const tx = transaction();
    tx.plan.findFirst.mockResolvedValue(
      plan({ status: PlanStatus.SCHEDULED, version: 9 }),
    );
    const { service } = serviceWith(tx);

    await service.remove("boy", PLAN_ID, 9);

    expect(tx.plan.updateMany).toHaveBeenCalledWith({
      where: {
        id: PLAN_ID,
        coupleId: COUPLE_ID,
        deletedAt: null,
        version: 9,
      },
      data: { deletedAt: NOW, version: { increment: 1 } },
    });
    expect(tx.scheduledEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          dedupeKey: `plan:${PLAN_ID}:reminder`,
        }),
      }),
    );
  });
});
