import { HttpException } from "@nestjs/common";
import { CapsuleStatus, CapsuleType } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { Clock } from "../common/clock/clock";
import type { PrismaService } from "../database/prisma.service";
import type { IdentityRole } from "../identity/identity.constants";
import type {
  IdentityResponse,
  IdentityService,
} from "../identity/identity.service";
import {
  capsuleContentSelect,
  capsuleMetadataSelect,
  type CapsuleContentRecord,
  type CapsuleMetadataRecord,
} from "./capsule.presentation";
import {
  capsuleDueEventKey,
  CapsulesService,
  scheduleWishCompletionCapsules,
} from "./capsules.service";

const COUPLE_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_COUPLE_ID = "00000000-0000-4000-8000-000000000002";
const BOY_ID = "00000000-0000-4000-8000-000000000101";
const GIRL_ID = "00000000-0000-4000-8000-000000000102";
const CAPSULE_ID = "c0000000-0000-4000-8000-000000000001";
const ANNIVERSARY_ID = "a0000000-0000-4000-8000-000000000001";
const MEDIA_ID = "d0000000-0000-4000-8000-000000000001";
const OUTBOX_ID = "e0000000-0000-4000-8000-000000000001";
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

function identity(role: IdentityRole = "boy"): IdentityResponse {
  return {
    role,
    user: role === "boy" ? boy : girl,
    couple: {
      id: COUPLE_ID,
      version: 1,
      name: "我们的明天",
      startDate: "2024-01-01",
      timezone: "Asia/Shanghai",
      signature: null,
      theme: "system",
      members: [boy, girl],
    },
  };
}

function identityService(): IdentityService {
  return {
    current: vi.fn((role: IdentityRole) => Promise.resolve(identity(role))),
  } as unknown as IdentityService;
}

function fixedClock(now = NOW): Clock {
  return {
    now: vi.fn(() => now),
    localDate: vi.fn(),
  } as unknown as Clock;
}

function auditService() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

function capsule(
  overrides: Partial<CapsuleMetadataRecord> = {},
): CapsuleMetadataRecord {
  return {
    id: CAPSULE_ID,
    coupleId: COUPLE_ID,
    title: "给未来的我们",
    type: CapsuleType.TO_BOTH,
    unlockRule: "AT_TIME",
    status: CapsuleStatus.DRAFT,
    version: 1,
    unlockAt: new Date("2026-01-01T04:00:00.000Z"),
    dueAt: null,
    anniversaryId: null,
    wishId: null,
    requiresBothConfirmation: false,
    createdById: BOY_ID,
    sealedAt: null,
    unlockedAt: null,
    openedAt: null,
    convertedAt: null,
    createdAt: new Date("2026-07-17T03:00:00.000Z"),
    updatedAt: new Date("2026-07-17T03:00:00.000Z"),
    deletedAt: null,
    wish: null,
    openRecords: [],
    convertedMemory: null,
    ...overrides,
  };
}

function content(
  overrides: Partial<CapsuleContentRecord> = {},
): CapsuleContentRecord {
  return {
    id: CAPSULE_ID,
    unlockCondition: null,
    messages: [
      {
        authorId: BOY_ID,
        version: 1,
        content: "这是不能提前泄露的正文",
        updatedAt: NOW,
      },
    ],
    media: [
      {
        mediaAsset: {
          id: MEDIA_ID,
          originalName: "secret.jpg",
          mimeType: "image/jpeg",
          size: 1024n,
          width: 100,
          height: 100,
          status: "READY",
          createdAt: NOW,
          deletedAt: null,
        },
      },
    ],
    ...overrides,
  };
}

function eventStores() {
  return {
    notification: {
      upsert: vi.fn().mockResolvedValue({ id: "notification" }),
    },
    outboxEvent: {
      upsert: vi.fn().mockResolvedValue({ id: OUTBOX_ID }),
    },
    scheduledEvent: {
      upsert: vi.fn().mockResolvedValue({ id: "scheduled" }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

function statusCode(error: unknown): number | undefined {
  return error instanceof HttpException ? error.getStatus() : undefined;
}

describe("CapsulesService privacy", () => {
  it("fetches only metadata and never asks Prisma for body or attachment data while locked", async () => {
    const findFirst = vi.fn().mockResolvedValue(
      capsule({
        status: CapsuleStatus.LOCKED,
        sealedAt: NOW,
        dueAt: new Date("2026-01-01T04:00:00.000Z"),
      }),
    );
    const service = new CapsulesService(
      { capsule: { findFirst } } as unknown as PrismaService,
      identityService(),
      fixedClock(),
      auditService(),
    );

    const result = await service.get("girl", CAPSULE_ID);

    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: CAPSULE_ID, coupleId: COUPLE_ID, deletedAt: null },
      select: capsuleMetadataSelect,
    });
    expect(result).not.toHaveProperty("messages");
    expect(result).not.toHaveProperty("media");
    expect(result).not.toHaveProperty("unlockCondition");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(result.bodyAvailable).toBe(false);
  });

  it("still withholds content after becoming unlocked until this member explicitly opens", async () => {
    const findFirst = vi.fn().mockResolvedValue(
      capsule({
        status: CapsuleStatus.UNLOCKED,
        sealedAt: NOW,
        dueAt: NOW,
        unlockedAt: NOW,
      }),
    );
    const service = new CapsulesService(
      { capsule: { findFirst } } as unknown as PrismaService,
      identityService(),
      fixedClock(),
      auditService(),
    );

    const result = await service.get("girl", CAPSULE_ID);

    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(result.canOpen).toBe(true);
    expect(result.bodyAvailable).toBe(false);
    expect(result).not.toHaveProperty("messages");
    expect(result).not.toHaveProperty("media");
  });

  it("returns 404 for a TO_SELF capsule viewed by the other identity", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValue(
        capsule({ type: CapsuleType.TO_SELF, createdById: BOY_ID }),
      );
    const service = new CapsulesService(
      { capsule: { findFirst } } as unknown as PrismaService,
      identityService(),
      fixedClock(),
      auditService(),
    );

    await expect(service.get("girl", CAPSULE_ID)).rejects.toSatisfy(
      (error: unknown) => statusCode(error) === 404,
    );
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("always scopes metadata lookup to the current relationship space", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = new CapsulesService(
      { capsule: { findFirst } } as unknown as PrismaService,
      identityService(),
      fixedClock(),
      auditService(),
    );

    await expect(service.get("boy", CAPSULE_ID)).rejects.toSatisfy(
      (error: unknown) => statusCode(error) === 404,
    );
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: CAPSULE_ID,
          coupleId: COUPLE_ID,
          deletedAt: null,
        }),
      }),
    );
    expect(findFirst).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ coupleId: OTHER_COUPLE_ID }),
      }),
    );
  });

  it("rejects every field update after sealing without loading draft content", async () => {
    const transactionFind = vi.fn().mockResolvedValue(
      capsule({
        status: CapsuleStatus.LOCKED,
        sealedAt: NOW,
        dueAt: new Date("2026-01-01T04:00:00.000Z"),
      }),
    );
    const prisma = {
      $transaction: vi.fn((operation) =>
        operation({ capsule: { findFirst: transactionFind } }),
      ),
    } as unknown as PrismaService;
    const service = new CapsulesService(
      prisma,
      identityService(),
      fixedClock(),
      auditService(),
    );

    await expect(
      service.update("boy", CAPSULE_ID, {
        version: 1,
        title: "试图修改封存标题",
      }),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 409);
    expect(transactionFind).toHaveBeenCalledTimes(1);
    expect(transactionFind).toHaveBeenCalledWith({
      where: { id: CAPSULE_ID, coupleId: COUPLE_ID, deletedAt: null },
      select: capsuleMetadataSelect,
    });
  });

  it("sends a body-free hidden event to revoke the other member's cache when a draft becomes TO_SELF", async () => {
    const current = capsule({ type: CapsuleType.JOINT });
    const updated = capsule({
      type: CapsuleType.TO_SELF,
      version: 2,
      updatedAt: NOW,
    });
    const stores = eventStores();
    const transaction = {
      ...stores,
      capsule: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(current)
          .mockResolvedValueOnce({ unlockCondition: null }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      capsuleMessage: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      capsuleMedia: {
        deleteMany: vi.fn(),
        createMany: vi.fn(),
      },
      anniversary: { findFirst: vi.fn() },
      wish: { findFirst: vi.fn() },
      mediaAsset: { count: vi.fn() },
    };
    const externalFind = vi
      .fn()
      .mockResolvedValueOnce(updated)
      .mockResolvedValueOnce(content({ media: [] }));
    const service = new CapsulesService(
      {
        $transaction: vi.fn((operation) => operation(transaction)),
        capsule: { findFirst: externalFind },
      } as unknown as PrismaService,
      identityService(),
      fixedClock(),
      auditService(),
    );

    await service.update("boy", CAPSULE_ID, {
      version: 1,
      type: "TO_SELF",
    });

    const outboxCreates = transaction.outboxEvent.upsert.mock.calls.map(
      ([call]) => call.create,
    );
    expect(outboxCreates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "capsule.hidden",
          payload: expect.objectContaining({ recipientIds: [GIRL_ID] }),
        }),
        expect.objectContaining({
          eventType: "capsule.updated",
          payload: expect.objectContaining({ recipientIds: [BOY_ID] }),
        }),
      ]),
    );
    expect(transaction.notification.upsert).not.toHaveBeenCalled();
    expect(JSON.stringify(outboxCreates)).not.toContain("不能提前泄露");
    expect(JSON.stringify(outboxCreates)).not.toContain(MEDIA_ID);
  });
});

describe("CapsulesService sealing and due transitions", () => {
  it("seals atomically with a digest, relationship-local anniversary dueAt and persisted task", async () => {
    const current = capsule({
      type: CapsuleType.ANNIVERSARY,
      unlockRule: "ANNIVERSARY",
      unlockAt: null,
      anniversaryId: ANNIVERSARY_ID,
    });
    const draft = {
      title: current.title,
      type: current.type,
      unlockRule: current.unlockRule,
      unlockAt: null,
      anniversaryId: ANNIVERSARY_ID,
      wishId: null,
      unlockCondition: null,
      requiresBothConfirmation: false,
      messages: [{ authorId: BOY_ID, content: "绝密正文" }],
      media: [{ mediaAssetId: MEDIA_ID, sortOrder: 0 }],
    };
    const stores = eventStores();
    const transaction = {
      ...stores,
      capsule: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(current)
          .mockResolvedValueOnce(draft),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      anniversary: {
        findFirst: vi.fn().mockResolvedValue({
          date: new Date("2024-01-01T00:00:00.000Z"),
          repeat: "YEARLY",
          leapDayRule: "FEBRUARY_28",
        }),
      },
      wish: { findFirst: vi.fn() },
      mediaAsset: { count: vi.fn().mockResolvedValue(1) },
    };
    const locked = capsule({
      ...current,
      status: CapsuleStatus.LOCKED,
      version: 2,
      sealedAt: NOW,
      dueAt: new Date("2026-08-16T16:00:00.000Z"),
    });
    const prisma = {
      $transaction: vi.fn((operation) => operation(transaction)),
      capsule: { findFirst: vi.fn().mockResolvedValue(locked) },
    } as unknown as PrismaService;
    const audit = auditService();
    const service = new CapsulesService(
      prisma,
      identityService(),
      fixedClock(),
      audit,
    );

    const result = await service.seal("boy", CAPSULE_ID, 1);

    expect(transaction.capsule.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: CapsuleStatus.LOCKED,
          sealedAt: NOW,
          dueAt: new Date("2026-08-16T16:00:00.000Z"),
          sealedDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      }),
    );
    expect(transaction.scheduledEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          dedupeKey: capsuleDueEventKey(CAPSULE_ID),
          type: "CAPSULE_DUE",
          payload: { capsuleId: CAPSULE_ID },
          runAt: new Date("2026-08-16T16:00:00.000Z"),
        }),
      }),
    );
    const emitted = JSON.stringify({
      notification: transaction.notification.upsert.mock.calls,
      outbox: transaction.outboxEvent.upsert.mock.calls,
      scheduled: transaction.scheduledEvent.upsert.mock.calls,
    });
    expect(emitted).not.toContain("绝密正文");
    expect(emitted).not.toContain(MEDIA_ID);
    expect(audit.record).toHaveBeenCalledWith(
      {
        action: "CAPSULE_SEALED",
        actorId: BOY_ID,
        coupleId: COUPLE_ID,
        resourceType: "CAPSULE",
        resourceId: CAPSULE_ID,
        metadata: {
          resourceId: CAPSULE_ID,
          status: CapsuleStatus.LOCKED,
          version: 2,
        },
      },
      transaction,
    );
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain("绝密正文");
    expect(result.status).toBe(CapsuleStatus.LOCKED);
    expect(result).not.toHaveProperty("messages");
  });

  it("keeps a JOINT draft unsealed until both members contributed their own message", async () => {
    const current = capsule({ type: CapsuleType.JOINT });
    const transaction = {
      capsule: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(current)
          .mockResolvedValueOnce({
            title: current.title,
            type: CapsuleType.JOINT,
            unlockRule: "AT_TIME",
            unlockAt: current.unlockAt,
            anniversaryId: null,
            wishId: null,
            unlockCondition: null,
            requiresBothConfirmation: false,
            messages: [{ authorId: BOY_ID, content: "我的一半" }],
            media: [],
          }),
        updateMany: vi.fn(),
      },
      anniversary: { findFirst: vi.fn() },
      wish: { findFirst: vi.fn() },
      mediaAsset: { count: vi.fn() },
    };
    const service = new CapsulesService(
      {
        $transaction: vi.fn((operation) => operation(transaction)),
      } as unknown as PrismaService,
      identityService(),
      fixedClock(),
      auditService(),
    );

    await expect(service.seal("boy", CAPSULE_ID, 1)).rejects.toSatisfy(
      (error: unknown) => statusCode(error) === 409,
    );
    expect(transaction.capsule.updateMany).not.toHaveBeenCalled();
  });

  it("does not mark a capsule early and materializes its due event exactly once", async () => {
    const dueAt = new Date("2026-07-17T03:00:00.000Z");
    const future = capsule({
      status: CapsuleStatus.LOCKED,
      version: 2,
      sealedAt: new Date("2026-07-16T03:00:00.000Z"),
      dueAt: new Date("2026-07-18T03:00:00.000Z"),
    });
    const due = capsule({
      ...future,
      dueAt,
    });
    const unlocked = capsule({
      ...due,
      status: CapsuleStatus.UNLOCKED,
      version: 3,
      unlockedAt: NOW,
    });
    const stores = eventStores();
    const transaction = {
      ...stores,
      capsule: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(future)
          .mockResolvedValueOnce(due)
          .mockResolvedValueOnce(unlocked),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      coupleMember: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ userId: BOY_ID }, { userId: GIRL_ID }]),
      },
    };
    const service = new CapsulesService(
      {
        $transaction: vi.fn((operation) => operation(transaction)),
      } as unknown as PrismaService,
      identityService(),
      fixedClock(),
      auditService(),
    );

    await service.markDue(CAPSULE_ID);
    expect(transaction.capsule.updateMany).not.toHaveBeenCalled();

    await service.markDue(CAPSULE_ID);
    await service.markDue(CAPSULE_ID);

    expect(transaction.capsule.updateMany).toHaveBeenCalledTimes(1);
    expect(transaction.capsule.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: CapsuleStatus.UNLOCKED,
          dueAt,
          unlockedAt: NOW,
        }),
      }),
    );
    expect(transaction.outboxEvent.upsert).toHaveBeenCalledTimes(1);
    expect(transaction.notification.upsert).toHaveBeenCalledTimes(2);
    expect(
      JSON.stringify(transaction.outboxEvent.upsert.mock.calls),
    ).not.toContain("不能提前泄露");
  });

  it("atomically stamps and schedules sealed wish-completion capsules without reading content", async () => {
    const completedAt = new Date("2026-07-17T03:30:00.000Z");
    const findMany = vi.fn().mockResolvedValue([
      { id: CAPSULE_ID, version: 2 },
      { id: "c0000000-0000-4000-8000-000000000002", version: 4 },
    ]);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const scheduledUpsert = vi.fn().mockResolvedValue({ id: "scheduled" });
    const transaction = {
      capsule: { findMany, updateMany },
      scheduledEvent: { upsert: scheduledUpsert },
    } as unknown as Parameters<typeof scheduleWishCompletionCapsules>[0];

    await expect(
      scheduleWishCompletionCapsules(transaction, {
        coupleId: COUPLE_ID,
        wishId: "f0000000-0000-4000-8000-000000000001",
        completedAt,
      }),
    ).resolves.toBe(2);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, version: true },
        where: expect.objectContaining({
          coupleId: COUPLE_ID,
          unlockRule: "WISH_COMPLETION",
          status: { in: ["SEALED", "LOCKED"] },
          dueAt: null,
        }),
      }),
    );
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(scheduledUpsert).toHaveBeenCalledTimes(2);
    expect(scheduledUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          type: "CAPSULE_DUE",
          runAt: completedAt,
        }),
      }),
    );
    expect(JSON.stringify(findMany.mock.calls)).not.toContain("messages");
    expect(JSON.stringify(findMany.mock.calls)).not.toContain("media");
  });
});

describe("CapsulesService confirmations and explicit opening", () => {
  it("keeps the shared version stable for the first confirmation so both same-version requests succeed", async () => {
    let state = capsule({
      status: CapsuleStatus.DUE,
      version: 3,
      sealedAt: new Date("2026-07-16T03:00:00.000Z"),
      dueAt: new Date("2026-07-17T03:00:00.000Z"),
      requiresBothConfirmation: true,
    });
    const records = new Map<
      string,
      { userId: string; confirmedAt: Date | null; openedAt: Date | null }
    >();
    const stores = eventStores();
    const capsuleStore = {
      findFirst: vi.fn(() =>
        Promise.resolve({ ...state, openRecords: [...records.values()] }),
      ),
      updateMany: vi.fn(
        (args: { where: { version: number }; data: object }) => {
          if (
            state.status !== CapsuleStatus.DUE ||
            state.version !== args.where.version
          ) {
            return Promise.resolve({ count: 0 });
          }
          state = {
            ...state,
            status: CapsuleStatus.UNLOCKED,
            unlockedAt: NOW,
            version: state.version + 1,
          };
          return Promise.resolve({ count: 1 });
        },
      ),
    };
    const transaction = {
      ...stores,
      capsule: capsuleStore,
      capsuleOpenRecord: {
        upsert: vi.fn(
          (args: { where: { capsuleId_userId: { userId: string } } }) => {
            const userId = args.where.capsuleId_userId.userId;
            records.set(userId, {
              userId,
              confirmedAt: NOW,
              openedAt: records.get(userId)?.openedAt ?? null,
            });
            return Promise.resolve({ id: `record-${userId}` });
          },
        ),
        count: vi.fn(() =>
          Promise.resolve(
            [...records.values()].filter(
              (record) => record.confirmedAt !== null,
            ).length,
          ),
        ),
      },
    };
    const prisma = {
      $transaction: vi.fn((operation) => operation(transaction)),
      capsule: capsuleStore,
    } as unknown as PrismaService;
    const service = new CapsulesService(
      prisma,
      identityService(),
      fixedClock(),
      auditService(),
    );

    const first = await service.confirmOpen("boy", CAPSULE_ID, 3);
    expect(first.status).toBe(CapsuleStatus.DUE);
    expect(first.version).toBe(3);
    expect(capsuleStore.updateMany).not.toHaveBeenCalled();

    const second = await service.confirmOpen("girl", CAPSULE_ID, 3);
    expect(second.status).toBe(CapsuleStatus.UNLOCKED);
    expect(second.version).toBe(4);
    expect(second.confirmedMemberIds).toEqual([BOY_ID, GIRL_ID]);
    expect(capsuleStore.updateMany).toHaveBeenCalledTimes(1);
  });

  it("lets both members explicitly open with the same observed version and only then loads body/media", async () => {
    let state = capsule({
      status: CapsuleStatus.UNLOCKED,
      version: 4,
      sealedAt: new Date("2026-07-16T03:00:00.000Z"),
      dueAt: new Date("2026-07-17T03:00:00.000Z"),
      unlockedAt: NOW,
    });
    const records = new Map<
      string,
      { userId: string; confirmedAt: Date | null; openedAt: Date | null }
    >();
    const stores = eventStores();
    const capsuleStore = {
      findFirst: vi.fn((args: { select: Record<string, unknown> }) => {
        if (args.select === capsuleContentSelect)
          return Promise.resolve(content());
        return Promise.resolve({
          ...state,
          openRecords: [...records.values()],
        });
      }),
      updateMany: vi.fn((args: { where: { version: number } }) => {
        if (
          state.status !== CapsuleStatus.UNLOCKED ||
          state.version !== args.where.version
        ) {
          return Promise.resolve({ count: 0 });
        }
        state = {
          ...state,
          status: CapsuleStatus.OPENED,
          openedAt: NOW,
          version: state.version + 1,
        };
        return Promise.resolve({ count: 1 });
      }),
    };
    const transaction = {
      ...stores,
      capsule: capsuleStore,
      capsuleOpenRecord: {
        upsert: vi.fn(
          (args: { where: { capsuleId_userId: { userId: string } } }) => {
            const userId = args.where.capsuleId_userId.userId;
            records.set(userId, {
              userId,
              confirmedAt: records.get(userId)?.confirmedAt ?? null,
              openedAt: NOW,
            });
            return Promise.resolve({ id: `record-${userId}` });
          },
        ),
      },
    };
    const prisma = {
      $transaction: vi.fn((operation) => operation(transaction)),
      capsule: capsuleStore,
    } as unknown as PrismaService;
    const audit = auditService();
    const service = new CapsulesService(
      prisma,
      identityService(),
      fixedClock(),
      audit,
    );

    const first = await service.open("boy", CAPSULE_ID, 4);
    expect(first.status).toBe(CapsuleStatus.OPENED);
    expect(first.messages?.[0]?.content).toBe("这是不能提前泄露的正文");
    expect(first.media?.[0]?.id).toBe(MEDIA_ID);

    const second = await service.open("girl", CAPSULE_ID, 4);
    expect(second.status).toBe(CapsuleStatus.OPENED);
    expect(second.version).toBe(5);
    expect(second.openedMemberIds).toEqual([BOY_ID, GIRL_ID]);
    expect(second.messages?.[0]?.content).toBe("这是不能提前泄露的正文");
    expect(capsuleStore.updateMany).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledTimes(2);
    expect(audit.record).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        action: "CAPSULE_OPENED",
        resourceId: CAPSULE_ID,
        metadata: {
          resourceId: CAPSULE_ID,
          status: CapsuleStatus.OPENED,
          version: 5,
        },
      }),
      transaction,
    );
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain(
      "这是不能提前泄露的正文",
    );
    expect(capsuleStore.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: capsuleContentSelect,
        where: expect.objectContaining({
          id: CAPSULE_ID,
          coupleId: COUPLE_ID,
          openRecords: {
            some: { userId: GIRL_ID, openedAt: { not: null } },
          },
        }),
      }),
    );
  });

  it("still lets the unopened member explicitly open after the first member converted it to a memory", async () => {
    const converted = capsule({
      status: CapsuleStatus.CONVERTED_TO_MEMORY,
      version: 7,
      sealedAt: new Date("2026-07-16T03:00:00.000Z"),
      dueAt: new Date("2026-07-17T03:00:00.000Z"),
      unlockedAt: new Date("2026-07-17T03:00:00.000Z"),
      openedAt: new Date("2026-07-17T03:10:00.000Z"),
      convertedAt: new Date("2026-07-17T03:20:00.000Z"),
      convertedMemory: { id: "b0000000-0000-4000-8000-000000000001" },
      openRecords: [{ userId: BOY_ID, confirmedAt: null, openedAt: NOW }],
    });
    const girlOpened = {
      ...converted,
      openRecords: [
        ...converted.openRecords,
        { userId: GIRL_ID, confirmedAt: null, openedAt: NOW },
      ],
    };
    const metadataFind = vi
      .fn()
      .mockResolvedValueOnce(converted)
      .mockResolvedValueOnce(girlOpened)
      .mockResolvedValueOnce(content());
    const transaction = {
      ...eventStores(),
      capsule: {
        findFirst: metadataFind,
        updateMany: vi.fn(),
      },
      capsuleOpenRecord: {
        upsert: vi.fn().mockResolvedValue({ id: "girl-open" }),
      },
    };
    const prisma = {
      $transaction: vi.fn((operation) => operation(transaction)),
      capsule: { findFirst: metadataFind },
    } as unknown as PrismaService;
    const service = new CapsulesService(
      prisma,
      identityService(),
      fixedClock(),
      auditService(),
    );

    const result = await service.open("girl", CAPSULE_ID, 6);

    expect(result.status).toBe(CapsuleStatus.CONVERTED_TO_MEMORY);
    expect(result.bodyAvailable).toBe(true);
    expect(result.messages?.[0]?.content).toBe("这是不能提前泄露的正文");
    expect(transaction.capsule.updateMany).not.toHaveBeenCalled();
    expect(transaction.capsuleOpenRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          capsuleId_userId: { capsuleId: CAPSULE_ID, userId: GIRL_ID },
        },
        create: { capsuleId: CAPSULE_ID, userId: GIRL_ID, openedAt: NOW },
        update: { openedAt: NOW },
      }),
    );
  });
});
