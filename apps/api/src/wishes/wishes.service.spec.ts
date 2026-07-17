import { HttpException } from "@nestjs/common";
import {
  MediaStatus,
  PlanStatus,
  WishCategory,
  WishStatus,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { Clock } from "../common/clock/clock";
import type { PrismaService } from "../database/prisma.service";
import type { IdentityService } from "../identity/identity.service";
import { WishesService } from "./wishes.service";

const COUPLE_ID = "00000000-0000-4000-8000-000000000001";
const BOY_ID = "00000000-0000-4000-8000-000000000101";
const GIRL_ID = "00000000-0000-4000-8000-000000000102";
const WISH_ID = "10000000-0000-4000-8000-000000000001";
const WISH_ID_2 = "10000000-0000-4000-8000-000000000002";
const PLAN_ID = "20000000-0000-4000-8000-000000000001";
const PLACE_ID = "30000000-0000-4000-8000-000000000001";
const MEDIA_ID = "40000000-0000-4000-8000-000000000001";
const MEDIA_ID_2 = "40000000-0000-4000-8000-000000000002";
const UPDATE_ID = "50000000-0000-4000-8000-000000000001";
const OUTBOX_ID = "60000000-0000-4000-8000-000000000001";
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

const clock = {
  now: vi.fn(() => NOW),
  localDate: vi.fn(() => "2026-07-17"),
} as unknown as Clock;

function identityService(): IdentityService {
  return {
    current: vi.fn().mockResolvedValue(actor),
  } as unknown as IdentityService;
}

function planRecord(
  status: PlanStatus,
  version = 2,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: PLAN_ID,
    coupleId: COUPLE_ID,
    wishId: WISH_ID,
    anniversaryId: null,
    placeId: null,
    title: "去看海",
    itinerary: null,
    preparations: [],
    participants: [],
    expectation: null,
    startsAt: new Date("2026-07-20T04:00:00.000Z"),
    endsAt: new Date("2026-07-20T08:00:00.000Z"),
    reminderAt: new Date("2026-07-19T04:00:00.000Z"),
    anniversaryOccurrenceDate: null,
    status,
    version,
    completedAt: status === PlanStatus.COMPLETED ? NOW : null,
    cancelledAt: null,
    createdById: BOY_ID,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    place: null,
    ...overrides,
  };
}

function wishRecord(
  status: WishStatus,
  version = 1,
  plan: ReturnType<typeof planRecord> | null = null,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: WISH_ID,
    coupleId: COUPLE_ID,
    title: "去看海",
    description: "一起等日落",
    expectation: "慢慢走",
    category: WishCategory.TRAVEL,
    status,
    version,
    placeId: null,
    plannedFor: plan?.startsAt ?? null,
    completedAt: status === WishStatus.COMPLETED ? NOW : null,
    completionNote: status === WishStatus.COMPLETED ? "终于看到啦" : null,
    completedById: status === WishStatus.COMPLETED ? BOY_ID : null,
    sourceNoteId: null,
    createdById: BOY_ID,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    place: null,
    media: [],
    plan,
    convertedMemory: null,
    updates: [],
    ...overrides,
  };
}

function actionWish(
  status: WishStatus,
  version: number,
  plan: ReturnType<typeof planRecord> | null,
) {
  return {
    id: WISH_ID,
    version,
    status,
    title: "去看海",
    expectation: "慢慢走",
    placeId: null,
    plan:
      plan === null
        ? null
        : {
            id: plan.id,
            version: plan.version,
            status: plan.status,
            placeId: plan.placeId,
            reminderAt: plan.reminderAt,
            completedAt: plan.completedAt,
            cancelledAt: plan.cancelledAt,
            deletedAt: plan.deletedAt,
          },
  };
}

function transaction(
  current = actionWish(WishStatus.IDEA, 1, null),
  overrides: Record<string, unknown> = {},
) {
  return {
    wish: {
      findFirst: vi.fn().mockResolvedValue(current),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: WISH_ID, version: 1 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    wishUpdate: {
      create: vi.fn().mockResolvedValue({
        id: UPDATE_ID,
        authorId: BOY_ID,
        fromStatus: null,
        toStatus: null,
        note: "准备好相机了",
        createdAt: NOW,
      }),
    },
    plan: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: PLAN_ID, version: 1 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    place: {
      findFirst: vi.fn().mockResolvedValue({ id: PLACE_ID }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    mediaAsset: {
      count: vi.fn().mockResolvedValue(2),
    },
    wishMedia: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    capsule: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    notification: {
      upsert: vi.fn().mockResolvedValue({ id: UPDATE_ID }),
    },
    outboxEvent: {
      upsert: vi.fn().mockResolvedValue({ id: OUTBOX_ID }),
    },
    scheduledEvent: {
      upsert: vi.fn().mockResolvedValue({ id: OUTBOX_ID }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    recycleBinItem: {
      create: vi.fn().mockResolvedValue({ id: WISH_ID }),
    },
    ...overrides,
  };
}

function serviceWith(
  tx: ReturnType<typeof transaction>,
  detail = wishRecord(WishStatus.IDEA),
) {
  const prisma = {
    $transaction: vi.fn(async (operation) => operation(tx)),
    wish: {
      findFirst: vi.fn().mockResolvedValue(detail),
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;
  return {
    service: new WishesService(prisma, identityService(), clock),
    prisma,
  };
}

function statusCode(error: unknown): number | undefined {
  return error instanceof HttpException ? error.getStatus() : undefined;
}

describe("WishesService", () => {
  it("lists only the current couple with filters and an opaque cursor", async () => {
    const first = wishRecord(WishStatus.IDEA, 2);
    const second = wishRecord(WishStatus.IDEA, 1, null, {
      id: WISH_ID_2,
      updatedAt: new Date("2026-07-16T04:00:00.000Z"),
    });
    const findMany = vi.fn().mockResolvedValue([first, second]);
    const service = new WishesService(
      { wish: { findMany } } as unknown as PrismaService,
      identityService(),
      clock,
    );

    const page = await service.list("boy", {
      limit: 1,
      status: WishStatus.IDEA,
      category: WishCategory.TRAVEL,
      query: "海",
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          coupleId: COUPLE_ID,
          deletedAt: null,
          status: WishStatus.IDEA,
          category: WishCategory.TRAVEL,
        }),
        take: 2,
      }),
    );
    expect(page.items).toHaveLength(1);
    expect(page.meta).toMatchObject({ hasMore: true });
    expect(page.meta.nextCursor).toEqual(expect.any(String));

    await expect(
      service.list("boy", {
        limit: 1,
        status: WishStatus.COMPLETED,
        cursor: page.meta.nextCursor!,
      }),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 400);
  });

  it("scopes detail lookup by couple and hides foreign resources", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = new WishesService(
      { wish: { findFirst } } as unknown as PrismaService,
      identityService(),
      clock,
    );

    await expect(service.get("boy", WISH_ID)).rejects.toSatisfy(
      (error: unknown) => statusCode(error) === 404,
    );
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: WISH_ID, coupleId: COUPLE_ID, deletedAt: null },
      }),
    );
  });

  it("creates the wish, initial history, private notification and outbox atomically", async () => {
    const tx = transaction();
    const { service, prisma } = serviceWith(tx);

    await service.create("boy", {
      title: "去看海",
      category: WishCategory.TRAVEL,
      placeId: PLACE_ID,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.place.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PLACE_ID, coupleId: COUPLE_ID, deletedAt: null },
      }),
    );
    expect(tx.wish.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          coupleId: COUPLE_ID,
          createdById: BOY_ID,
          placeId: PLACE_ID,
        }),
      }),
    );
    expect(tx.wishUpdate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: null,
          toStatus: WishStatus.IDEA,
        }),
      }),
    );
    expect(tx.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ recipientId: GIRL_ID }),
      }),
    );
    expect(tx.outboxEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ eventType: "wish.created" }),
      }),
    );
  });

  it("rejects a place from another space before updating", async () => {
    const tx = transaction(actionWish(WishStatus.IDEA, 2, null));
    tx.place.findFirst.mockResolvedValue(null);
    const { service } = serviceWith(tx);

    await expect(
      service.update("boy", WISH_ID, {
        version: 2,
        placeId: PLACE_ID,
      }),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 404);
    expect(tx.place.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PLACE_ID, coupleId: COUPLE_ID, deletedAt: null },
      }),
    );
    expect(tx.wish.updateMany).not.toHaveBeenCalled();
  });

  it("plans only an IDEA and persists its reminder with synchronized states", async () => {
    const tx = transaction(actionWish(WishStatus.IDEA, 3, null));
    const { service } = serviceWith(
      tx,
      wishRecord(WishStatus.PLANNED, 4, planRecord(PlanStatus.SCHEDULED, 1)),
    );

    await service.plan("boy", WISH_ID, {
      version: 3,
      startsAt: "2026-07-20T04:00:00.000Z",
      endsAt: "2026-07-20T08:00:00.000Z",
      reminderAt: "2026-07-19T04:00:00.000Z",
    });

    expect(tx.plan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PlanStatus.SCHEDULED }),
      }),
    );
    expect(tx.wish.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          coupleId: COUPLE_ID,
          version: 3,
          status: WishStatus.IDEA,
        }),
        data: expect.objectContaining({ status: WishStatus.PLANNED }),
      }),
    );
    expect(tx.scheduledEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          dedupeKey: `plan:${PLAN_ID}:reminder`,
          type: "PLAN_REMINDER",
          runAt: new Date("2026-07-19T04:00:00.000Z"),
        }),
      }),
    );
  });

  it("rejects invalid plan timing before writing state", async () => {
    const tx = transaction(actionWish(WishStatus.IDEA, 3, null));
    const { service } = serviceWith(tx);

    await expect(
      service.plan("boy", WISH_ID, {
        version: 3,
        startsAt: "2026-07-20T04:00:00.000Z",
        endsAt: "2026-07-19T04:00:00.000Z",
      }),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 400);
    expect(tx.plan.create).not.toHaveBeenCalled();
    expect(tx.wish.updateMany).not.toHaveBeenCalled();
  });

  it("does not schedule a wish plan in the past", async () => {
    const tx = transaction(actionWish(WishStatus.IDEA, 3, null));
    const { service } = serviceWith(tx);

    await expect(
      service.plan("boy", WISH_ID, {
        version: 3,
        startsAt: "2026-07-17T03:00:00.000Z",
      }),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 400);
    expect(tx.plan.create).not.toHaveBeenCalled();
  });

  it("rejects a stale version before changing either state", async () => {
    const plan = planRecord(PlanStatus.SCHEDULED, 2);
    const tx = transaction(actionWish(WishStatus.PLANNED, 5, plan));
    const { service } = serviceWith(tx);

    await expect(service.start("boy", WISH_ID, 4)).rejects.toSatisfy(
      (error: unknown) => statusCode(error) === 409,
    );
    expect(tx.plan.updateMany).not.toHaveBeenCalled();
    expect(tx.wish.updateMany).not.toHaveBeenCalled();
  });

  it("starts adjacent Wish and Plan states and cancels the pending reminder", async () => {
    const plan = planRecord(PlanStatus.SCHEDULED, 2);
    const tx = transaction(actionWish(WishStatus.PLANNED, 5, plan));
    const { service } = serviceWith(
      tx,
      wishRecord(
        WishStatus.IN_PROGRESS,
        6,
        planRecord(PlanStatus.IN_PROGRESS, 3),
      ),
    );

    await service.start("boy", WISH_ID, 5);

    expect(tx.plan.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          version: 2,
          status: { in: [PlanStatus.DRAFT, PlanStatus.SCHEDULED] },
        }),
        data: expect.objectContaining({ status: PlanStatus.IN_PROGRESS }),
      }),
    );
    expect(tx.wish.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: WishStatus.PLANNED }),
        data: expect.objectContaining({ status: WishStatus.IN_PROGRESS }),
      }),
    );
    expect(tx.scheduledEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          dedupeKey: `plan:${PLAN_ID}:reminder`,
        }),
      }),
    );
  });

  it("completes both states and binds only READY media from this couple", async () => {
    const plan = planRecord(PlanStatus.IN_PROGRESS, 3, { placeId: PLACE_ID });
    const tx = transaction(actionWish(WishStatus.IN_PROGRESS, 6, plan));
    tx.place.findFirst.mockResolvedValue({
      version: 4,
      status: "PLANNED",
      historyState: "UNVISITED",
      futureState: "PLANNED",
      firstVisitedAt: null,
    });
    const { service } = serviceWith(
      tx,
      wishRecord(WishStatus.COMPLETED, 7, planRecord(PlanStatus.COMPLETED, 4)),
    );

    await service.complete("boy", WISH_ID, {
      version: 6,
      completedAt: "2026-07-17T03:00:00.000Z",
      completionNote: "终于看到啦",
      mediaIds: [MEDIA_ID, MEDIA_ID_2],
    });

    expect(tx.mediaAsset.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: { in: [MEDIA_ID, MEDIA_ID_2] },
        coupleId: COUPLE_ID,
        status: MediaStatus.READY,
        deletedAt: null,
        OR: expect.any(Array),
      }),
    });
    expect(tx.plan.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PlanStatus.COMPLETED,
          completedAt: new Date("2026-07-17T03:00:00.000Z"),
        }),
      }),
    );
    expect(tx.wish.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WishStatus.COMPLETED,
          completionNote: "终于看到啦",
          completedById: BOY_ID,
        }),
      }),
    );
    expect(tx.wishMedia.createMany).toHaveBeenCalledWith({
      data: [
        { wishId: WISH_ID, mediaAssetId: MEDIA_ID, sortOrder: 0 },
        { wishId: WISH_ID, mediaAssetId: MEDIA_ID_2, sortOrder: 1 },
      ],
    });
    expect(tx.capsule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          coupleId: COUPLE_ID,
          wishId: WISH_ID,
          unlockRule: "WISH_COMPLETION",
        }),
      }),
    );
    expect(tx.place.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: PLACE_ID, version: 4 }),
        data: expect.objectContaining({
          status: "COMPLETED",
          historyState: "VISITED",
          futureState: "COMPLETED",
          firstVisitedAt: new Date("2026-07-17T03:00:00.000Z"),
        }),
      }),
    );
  });

  it("rejects missing, non-ready, or foreign completion media atomically", async () => {
    const plan = planRecord(PlanStatus.IN_PROGRESS, 3);
    const tx = transaction(actionWish(WishStatus.IN_PROGRESS, 6, plan));
    tx.mediaAsset.count.mockResolvedValue(1);
    const { service } = serviceWith(tx);

    await expect(
      service.complete("boy", WISH_ID, {
        version: 6,
        mediaIds: [MEDIA_ID, MEDIA_ID_2],
      }),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 404);
    expect(tx.plan.updateMany).not.toHaveBeenCalled();
    expect(tx.wish.updateMany).not.toHaveBeenCalled();
    expect(tx.wishMedia.createMany).not.toHaveBeenCalled();
  });

  it("reopens only the adjacent completed states without deleting media", async () => {
    const plan = planRecord(PlanStatus.COMPLETED, 4, { placeId: PLACE_ID });
    const tx = transaction(actionWish(WishStatus.COMPLETED, 7, plan));
    tx.place.findFirst.mockResolvedValue({
      version: 5,
      status: "COMPLETED",
      historyState: "VISITED",
      futureState: "COMPLETED",
      firstVisitedAt: NOW,
    });
    tx.wish.findMany.mockResolvedValue([{ status: WishStatus.IN_PROGRESS }]);
    tx.plan.findMany.mockResolvedValue([{ status: PlanStatus.IN_PROGRESS }]);
    const { service } = serviceWith(
      tx,
      wishRecord(
        WishStatus.IN_PROGRESS,
        8,
        planRecord(PlanStatus.IN_PROGRESS, 5),
      ),
    );

    await service.reopen("boy", WISH_ID, {
      version: 7,
      note: "还想补一段旅程",
    });

    expect(tx.plan.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: PlanStatus.COMPLETED }),
        data: expect.objectContaining({
          status: PlanStatus.IN_PROGRESS,
          completedAt: null,
        }),
      }),
    );
    expect(tx.wish.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: WishStatus.COMPLETED }),
        data: expect.objectContaining({
          status: WishStatus.IN_PROGRESS,
          completedAt: null,
          completionNote: null,
          completedById: null,
        }),
      }),
    );
    expect(tx.wishMedia.deleteMany).not.toHaveBeenCalled();
    expect(tx.wishUpdate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ note: "还想补一段旅程" }),
      }),
    );
    expect(tx.place.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "DEPARTING",
          historyState: "VISITED",
          futureState: "DEPARTING",
          firstVisitedAt: NOW,
        }),
      }),
    );
  });

  it("soft-deletes a linked plan and cancels its reminder in the same transaction", async () => {
    const plan = planRecord(PlanStatus.SCHEDULED, 4);
    const tx = transaction(actionWish(WishStatus.PLANNED, 7, plan));
    const { service } = serviceWith(tx);

    await service.remove("boy", WISH_ID, 7);

    expect(tx.wish.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          coupleId: COUPLE_ID,
          version: 7,
        }),
        data: { deletedAt: NOW, version: { increment: 1 } },
      }),
    );
    expect(tx.plan.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          coupleId: COUPLE_ID,
          version: 4,
        }),
        data: expect.objectContaining({
          deletedAt: NOW,
          status: PlanStatus.CANCELLED,
          cancelledAt: NOW,
        }),
      }),
    );
    expect(tx.scheduledEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          dedupeKey: `plan:${PLAN_ID}:reminder`,
        }),
      }),
    );
    expect(tx.recycleBinItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resourceType: "WISH",
          resourceId: WISH_ID,
        }),
      }),
    );
  });

  it("adds a lightweight update without changing the wish version", async () => {
    const tx = transaction(actionWish(WishStatus.IN_PROGRESS, 6, null));
    const { service } = serviceWith(tx);

    const update = await service.addUpdate("boy", WISH_ID, {
      note: "准备好相机了",
    });

    expect(tx.wish.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: WISH_ID, coupleId: COUPLE_ID, deletedAt: null },
        select: { id: true, version: true },
      }),
    );
    expect(tx.wish.updateMany).not.toHaveBeenCalled();
    expect(tx.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          type: "WISH_UPDATE_ADDED",
          recipientId: GIRL_ID,
        }),
      }),
    );
    expect(update).toMatchObject({ note: "准备好相机了", author: boy });
  });
});
