import { HttpException } from "@nestjs/common";
import {
  RecycleBinItemStatus,
  RecycleBinResourceType,
  RecycleBinVisibility,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { Clock } from "../common/clock/clock";
import type { PrismaService } from "../database/prisma.service";
import type {
  IdentityResponse,
  IdentityService,
} from "../identity/identity.service";
import { RecycleBinService } from "./recycle-bin.service";

const COUPLE_ID = "00000000-0000-4000-8000-000000000001";
const BOY_ID = "00000000-0000-4000-8000-000000000101";
const GIRL_ID = "00000000-0000-4000-8000-000000000102";
const ITEM_ID = "80000000-0000-4000-8000-000000000001";
const PLACE_ID = "81000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-17T08:00:00.000Z");

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
  role: "girl" as const,
  user: girl,
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

function identities(): IdentityService {
  return {
    current: vi.fn().mockResolvedValue(actor),
  } as unknown as IdentityService;
}

function clock(): Clock {
  return {
    now: vi.fn(() => NOW),
    localDate: vi.fn(),
  } as unknown as Clock;
}

function config() {
  return {
    get: vi.fn(() => "/tmp/our-tomorrow-recycle-unit"),
  };
}

function recycleItem(overrides: Record<string, unknown> = {}) {
  return {
    id: ITEM_ID,
    coupleId: COUPLE_ID,
    resourceType: RecycleBinResourceType.PLACE,
    resourceId: PLACE_ID,
    status: RecycleBinItemStatus.AVAILABLE,
    visibility: RecycleBinVisibility.SHARED,
    ownerId: null,
    deletedById: BOY_ID,
    restoreData: {},
    deletedAt: NOW,
    retentionUntil: new Date("2026-08-16T08:00:00.000Z"),
    purgeRequestedAt: null,
    purgeAfter: null,
    ...overrides,
  };
}

describe("RecycleBinService", () => {
  it("always combines couple scope with shared-or-owner visibility", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new RecycleBinService(
      { recycleBinItem: { findMany } } as unknown as PrismaService,
      identities(),
      clock(),
      config() as never,
    );

    await service.list("girl", { limit: 30, type: "NOTE" });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          coupleId: COUPLE_ID,
          resourceType: RecycleBinResourceType.NOTE,
          status: {
            in: [
              RecycleBinItemStatus.AVAILABLE,
              RecycleBinItemStatus.PURGE_PENDING,
            ],
          },
          AND: [
            {
              OR: [
                { visibility: RecycleBinVisibility.SHARED },
                {
                  visibility: RecycleBinVisibility.OWNER_ONLY,
                  ownerId: GIRL_ID,
                },
              ],
            },
          ],
        }),
      }),
    );
  });

  it("keeps owner visibility and cursor bounds as separate predicates", async () => {
    const older = recycleItem({
      id: "80000000-0000-4000-8000-000000000002",
      deletedAt: new Date("2026-07-16T08:00:00.000Z"),
    });
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([recycleItem(), older])
      .mockResolvedValueOnce([]);
    const service = new RecycleBinService(
      { recycleBinItem: { findMany } } as unknown as PrismaService,
      identities(),
      clock(),
      config() as never,
    );

    const first = await service.list("girl", { limit: 1 });
    await service.list("girl", { limit: 1, cursor: first.meta.nextCursor! });

    const where = findMany.mock.calls[1]![0].where;
    expect(where.AND).toEqual([
      {
        OR: [
          { visibility: RecycleBinVisibility.SHARED },
          {
            visibility: RecycleBinVisibility.OWNER_ONLY,
            ownerId: GIRL_ID,
          },
        ],
      },
    ]);
    expect(where.OR).toEqual([
      { deletedAt: { lt: NOW } },
      { deletedAt: NOW, id: { lt: ITEM_ID } },
    ]);
  });

  it("restores a shared item and closes its purge event atomically", async () => {
    const item = recycleItem();
    const transaction = {
      recycleBinItem: {
        findFirst: vi.fn().mockResolvedValue(item),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      place: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst: vi.fn(),
      },
      scheduledEvent: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new RecycleBinService(
      {
        $transaction: vi.fn(async (operation) => operation(transaction)),
      } as unknown as PrismaService,
      identities(),
      clock(),
      config() as never,
    );

    await expect(service.restore("girl", ITEM_ID)).resolves.toMatchObject({
      id: ITEM_ID,
      resourceType: RecycleBinResourceType.PLACE,
      resourceId: PLACE_ID,
    });
    expect(transaction.place.updateMany).toHaveBeenCalledWith({
      where: {
        id: PLACE_ID,
        coupleId: COUPLE_ID,
        deletedAt: { not: null },
      },
      data: { deletedAt: null, version: { increment: 1 } },
    });
    expect(transaction.recycleBinItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: ITEM_ID,
          coupleId: COUPLE_ID,
          status: RecycleBinItemStatus.AVAILABLE,
        },
        data: expect.objectContaining({
          status: RecycleBinItemStatus.RESTORED,
          restoredById: GIRL_ID,
        }),
      }),
    );
    expect(transaction.scheduledEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          dedupeKey: `recycle-bin:${ITEM_ID}:purge`,
        }),
      }),
    );
  });

  it("returns not found for a recycle ID outside the actor visibility scope", async () => {
    const transaction = {
      recycleBinItem: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new RecycleBinService(
      {
        $transaction: vi.fn(async (operation) => operation(transaction)),
      } as unknown as PrismaService,
      identities(),
      clock(),
      config() as never,
    );

    await expect(service.restore("girl", ITEM_ID)).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof HttpException && error.getStatus() === 404,
    );
    expect(transaction.recycleBinItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ coupleId: COUPLE_ID }),
      }),
    );
  });

  it("persists a seven-day cooling-off deadline for permanent deletion", async () => {
    const item = recycleItem();
    const transaction = {
      recycleBinItem: {
        findFirst: vi.fn().mockResolvedValue(item),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      scheduledEvent: {
        upsert: vi.fn().mockResolvedValue({ id: ITEM_ID }),
      },
    };
    const service = new RecycleBinService(
      {
        $transaction: vi.fn(async (operation) => operation(transaction)),
      } as unknown as PrismaService,
      identities(),
      clock(),
      config() as never,
    );

    await service.requestPurge("girl", ITEM_ID);

    const purgeAfter = new Date("2026-07-24T08:00:00.000Z");
    expect(transaction.recycleBinItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: RecycleBinItemStatus.PURGE_PENDING,
          purgeAfter,
        }),
      }),
    );
    expect(transaction.scheduledEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          type: "RECYCLE_BIN_PURGE",
          runAt: purgeAfter,
        }),
      }),
    );
  });
});
