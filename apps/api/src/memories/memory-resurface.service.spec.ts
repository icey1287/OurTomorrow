import { MemoryResurfaceReason, MemoryStatus, Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { Clock } from "../common/clock/clock";
import { PrismaService } from "../database/prisma.service";
import { IdentityService } from "../identity/identity.service";
import { MemoryResurfaceService } from "./memory-resurface.service";

const COUPLE_ID = "00000000-0000-4000-8000-000000000001";
const BOY_ID = "00000000-0000-4000-8000-000000000101";
const GIRL_ID = "00000000-0000-4000-8000-000000000102";
const BOX_ID = "60000000-0000-4000-8000-000000000001";
const MEMORY_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_MEMORY_ID = "10000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-07-16T08:30:00.000Z");
const LOCAL_DATE = new Date("2026-07-16T00:00:00.000Z");

class FixedClock implements Clock {
  now(): Date {
    return NOW;
  }

  localDate(): string {
    return "2026-07-16";
  }
}

const actor = {
  role: "boy" as const,
  user: { id: BOY_ID },
  couple: {
    id: COUPLE_ID,
    timezone: "Asia/Shanghai",
    members: [{ id: BOY_ID }, { id: GIRL_ID }],
  },
};

function card(
  id = MEMORY_ID,
  happenedAt = new Date("2025-07-16T04:00:00.000Z"),
) {
  const createdAt = new Date("2025-07-17T00:00:00.000Z");
  return {
    id,
    version: 1,
    title: `回忆 ${id.slice(-1)}`,
    content: "旧故事",
    happenedAt,
    status: MemoryStatus.PUBLISHED,
    place: null,
    coverMedia: null,
    tags: [],
    isFirstTime: false,
    firstTimeLabel: null,
    isPinned: false,
    perspectives: [],
    _count: { comments: 0 },
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    resurfaces: [] as Array<{ displayedAt: Date }>,
  };
}

function boxRecord(options?: {
  openedAt?: Date | null;
  dismissedAt?: Date | null;
  memory?: ReturnType<typeof card>;
  reason?: MemoryResurfaceReason;
}) {
  return {
    id: BOX_ID,
    coupleId: COUPLE_ID,
    memoryId: options?.memory?.id ?? MEMORY_ID,
    localDate: LOCAL_DATE,
    reason: options?.reason ?? MemoryResurfaceReason.ON_THIS_DAY,
    displayedAt: NOW,
    openedAt: options?.openedAt ?? null,
    dismissedAt: options?.dismissedAt ?? null,
    memory: options?.memory ?? card(),
  };
}

function identityService() {
  return {
    current: vi.fn().mockResolvedValue(actor),
  } as unknown as IdentityService;
}

function scheduledEvents() {
  return {
    upsert: vi.fn().mockResolvedValue({ id: "scheduled-memory-resurface" }),
  };
}

function outboxStores() {
  return {
    outboxEvent: {
      upsert: vi.fn().mockResolvedValue({ id: "resurface-outbox" }),
    },
    scheduledEvent: scheduledEvents(),
  };
}

describe("MemoryResurfaceService", () => {
  it("creates one couple-local unopened box from safe published past candidates", async () => {
    const selected = card();
    const transaction = {
      ...outboxStores(),
      memoryResurface: {
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue(boxRecord({ memory: selected })),
      },
      memory: {
        findMany: vi.fn().mockResolvedValue([selected]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (operation) => operation(transaction)),
      memoryResurface: { findUnique: vi.fn() },
      scheduledEvent: scheduledEvents(),
      reaction: { findMany: vi.fn() },
    } as unknown as PrismaService;
    const service = new MemoryResurfaceService(
      prisma,
      identityService(),
      new FixedClock(),
    );

    const result = await service.today("boy");

    expect(transaction.memory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          coupleId: COUPLE_ID,
          status: MemoryStatus.PUBLISHED,
          deletedAt: null,
          happenedAt: { lte: NOW },
        },
      }),
    );
    expect(transaction.memoryResurface.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          coupleId: COUPLE_ID,
          memoryId: MEMORY_ID,
          localDate: LOCAL_DATE,
          reason: MemoryResurfaceReason.ON_THIS_DAY,
        },
      }),
    );
    expect(result).toEqual({
      serverNow: NOW.toISOString(),
      localDate: "2026-07-16",
      box: expect.objectContaining({
        id: BOX_ID,
        localDate: "2026-07-16",
        memory: null,
      }),
    });
    expect(JSON.stringify(result)).not.toContain(selected.title);
    expect(prisma.reaction.findMany).not.toHaveBeenCalled();
  });

  it("returns the same unopened slot to both identities without leaking memory fields", async () => {
    const transaction = {
      memoryResurface: { findUnique: vi.fn().mockResolvedValue(boxRecord()) },
    };
    const identities = {
      current: vi.fn().mockImplementation((role: "boy" | "girl") =>
        Promise.resolve({
          ...actor,
          role,
          user: { id: role === "boy" ? BOY_ID : GIRL_ID },
        }),
      ),
    } as unknown as IdentityService;
    const service = new MemoryResurfaceService(
      {
        $transaction: vi.fn(async (operation) => operation(transaction)),
        scheduledEvent: scheduledEvents(),
        reaction: { findMany: vi.fn() },
      } as unknown as PrismaService,
      identities,
      new FixedClock(),
    );

    const [boy, girl] = await Promise.all([
      service.today("boy"),
      service.today("girl"),
    ]);

    expect(boy.box?.id).toBe(BOX_ID);
    expect(girl.box?.id).toBe(BOX_ID);
    expect(boy.box?.memory).toBeNull();
    expect(girl.box?.memory).toBeNull();
  });

  it("reveals the selected memory only after an explicit open", async () => {
    const opened = boxRecord({ openedAt: NOW });
    const transaction = {
      memoryResurface: {
        findFirst: vi.fn().mockResolvedValue(boxRecord()),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(opened),
      },
      outboxEvent: { upsert: vi.fn().mockResolvedValue({}) },
      scheduledEvent: scheduledEvents(),
    };
    const reaction = {
      findMany: vi.fn().mockResolvedValue([{ authorId: BOY_ID, emoji: "❤️" }]),
    };
    const service = new MemoryResurfaceService(
      {
        $transaction: vi.fn(async (operation) => operation(transaction)),
        reaction,
      } as unknown as PrismaService,
      identityService(),
      new FixedClock(),
    );

    const result = await service.open("boy", BOX_ID);

    expect(transaction.memoryResurface.updateMany).toHaveBeenCalledWith({
      where: {
        id: BOX_ID,
        coupleId: COUPLE_ID,
        localDate: LOCAL_DATE,
        openedAt: null,
        dismissedAt: null,
      },
      data: { openedAt: NOW },
    });
    expect(result.memory).toMatchObject({
      id: MEMORY_ID,
      title: "回忆 1",
      reactions: [{ emoji: "❤️", count: 1, reactedByMe: true }],
    });
    expect(transaction.outboxEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          eventType: "memory_resurface.opened",
          payload: expect.objectContaining({
            recipientIds: [BOY_ID, GIRL_ID],
          }),
        }),
      }),
    );
  });

  it("dismisses idempotently and returns no memory body", async () => {
    const dismissedAt = new Date("2026-07-16T09:00:00.000Z");
    const dismissed = boxRecord({ openedAt: NOW, dismissedAt });
    const transaction = {
      memoryResurface: {
        findFirst: vi.fn().mockResolvedValue(dismissed),
        updateMany: vi.fn(),
      },
    };
    const service = new MemoryResurfaceService(
      {
        $transaction: vi.fn(async (operation) => operation(transaction)),
        reaction: { findMany: vi.fn() },
      } as unknown as PrismaService,
      identityService(),
      new FixedClock(),
    );

    const result = await service.dismiss("boy", BOX_ID);

    expect(transaction.memoryResurface.updateMany).not.toHaveBeenCalled();
    expect(result.dismissedAt).toBe(dismissedAt.toISOString());
    expect(result.memory).toBeNull();
  });

  it("publishes a shared invalidation when today's box is dismissed", async () => {
    const dismissedAt = NOW;
    const transaction = {
      ...outboxStores(),
      memoryResurface: {
        findFirst: vi.fn().mockResolvedValue(boxRecord()),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue(boxRecord({ dismissedAt })),
      },
    };
    const service = new MemoryResurfaceService(
      {
        $transaction: vi.fn(async (operation) => operation(transaction)),
        reaction: { findMany: vi.fn() },
      } as unknown as PrismaService,
      identityService(),
      new FixedClock(),
    );

    const result = await service.dismiss("boy", BOX_ID);

    expect(result.memory).toBeNull();
    expect(transaction.outboxEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          eventType: "memory_resurface.dismissed",
          payload: expect.objectContaining({
            recipientIds: [BOY_ID, GIRL_ID],
          }),
        }),
      }),
    );
  });

  it("rereads the concurrently created slot after a unique conflict", async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError(
      "unique conflict",
      { code: "P2002", clientVersion: "6.4.1" },
    );
    const concurrent = boxRecord();
    const service = new MemoryResurfaceService(
      {
        $transaction: vi.fn().mockRejectedValue(conflict),
        memoryResurface: { findUnique: vi.fn().mockResolvedValue(concurrent) },
        scheduledEvent: scheduledEvents(),
        reaction: { findMany: vi.fn() },
      } as unknown as PrismaService,
      identityService(),
      new FixedClock(),
    );

    const result = await service.today("girl");

    expect(result.box?.id).toBe(BOX_ID);
    expect(result.box?.memory).toBeNull();
  });

  it("retries a serialization conflict and converges on the existing daily slot", async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError(
      "serialization conflict",
      { code: "P2034", clientVersion: "6.4.1" },
    );
    const transaction = {
      memoryResurface: { findUnique: vi.fn().mockResolvedValue(boxRecord()) },
    };
    const service = new MemoryResurfaceService(
      {
        $transaction: vi
          .fn()
          .mockRejectedValueOnce(conflict)
          .mockImplementation((operation) => operation(transaction)),
        memoryResurface: { findUnique: vi.fn().mockResolvedValue(null) },
        scheduledEvent: scheduledEvents(),
        reaction: { findMany: vi.fn() },
      } as unknown as PrismaService,
      identityService(),
      new FixedClock(),
    );

    const result = await service.today("boy");

    expect(result.box?.id).toBe(BOX_ID);
    expect(result.box?.memory).toBeNull();
  });

  it("keeps the legacy random endpoint read-only and hides the unopened box selection", async () => {
    const safeAlternative = card(
      OTHER_MEMORY_ID,
      new Date("2025-01-10T00:00:00.000Z"),
    );
    const transaction = {
      memory: {
        findMany: vi.fn().mockResolvedValue([safeAlternative]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      memoryResurface: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const memoryResurface = {
      findUnique: vi.fn().mockResolvedValue(boxRecord()),
    };
    const service = new MemoryResurfaceService(
      {
        $transaction: vi.fn(async (operation) => operation(transaction)),
        memoryResurface,
        reaction: { findMany: vi.fn().mockResolvedValue([]) },
      } as unknown as PrismaService,
      identityService(),
      new FixedClock(),
    );

    const result = await service.random("boy");

    expect(result?.id).toBe(OTHER_MEMORY_ID);
    expect(transaction.memory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { notIn: [MEMORY_ID] } }),
      }),
    );
    expect(transaction.memoryResurface).not.toHaveProperty("create");
  });

  it("falls back to the least recently shown memory after short-term dedup", async () => {
    const older = card(MEMORY_ID, new Date("2025-01-10T00:00:00.000Z"));
    older.resurfaces = [{ displayedAt: new Date("2026-05-01T00:00:00.000Z") }];
    const newer = card(OTHER_MEMORY_ID, new Date("2025-03-10T00:00:00.000Z"));
    newer.resurfaces = [{ displayedAt: new Date("2026-06-01T00:00:00.000Z") }];
    const transaction = {
      memoryResurface: {
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi
          .fn()
          .mockResolvedValue([
            { memoryId: MEMORY_ID },
            { memoryId: OTHER_MEMORY_ID },
          ]),
        create: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve(
            boxRecord({
              memory: data.memoryId === MEMORY_ID ? older : newer,
              reason: data.reason,
            }),
          ),
        ),
      },
      memory: {
        findMany: vi.fn().mockResolvedValue([older, newer]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const service = new MemoryResurfaceService(
      {
        $transaction: vi.fn(async (operation) => operation(transaction)),
        memoryResurface: { findUnique: vi.fn() },
        scheduledEvent: scheduledEvents(),
        reaction: { findMany: vi.fn() },
      } as unknown as PrismaService,
      identityService(),
      new FixedClock(),
    );

    await service.today("boy");

    expect(transaction.memoryResurface.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ memoryId: MEMORY_ID }),
      }),
    );
  });
});
