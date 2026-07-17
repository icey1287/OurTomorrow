import { MemoryStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { Clock } from "../common/clock/clock";
import { PrismaService } from "../database/prisma.service";
import { IdentityService } from "../identity/identity.service";
import { MemoryResurfaceService } from "./memory-resurface.service";

const COUPLE_ID = "00000000-0000-4000-8000-000000000001";
const BOY_ID = "00000000-0000-4000-8000-000000000101";
const MEMORY_ID = "10000000-0000-4000-8000-000000000001";
const EXCLUDED_ID = "10000000-0000-4000-8000-000000000002";
const RECENT_ID = "10000000-0000-4000-8000-000000000003";

class FixedClock implements Clock {
  now(): Date {
    return new Date("2026-07-16T08:30:00.000Z");
  }
  localDate(): string {
    return "2026-07-16";
  }
}

describe("MemoryResurfaceService", () => {
  it("selects only safe published past memories and records the display", async () => {
    const createdAt = new Date("2026-07-15T00:00:00.000Z");
    const card = {
      id: MEMORY_ID,
      version: 1,
      title: "旧回忆",
      content: null,
      happenedAt: new Date("2025-07-16T00:00:00.000Z"),
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
    };
    const transaction = {
      memoryResurface: {
        findMany: vi.fn().mockResolvedValue([{ memoryId: RECENT_ID }]),
        create: vi.fn().mockResolvedValue({}),
      },
      memory: {
        count: vi.fn().mockResolvedValue(1),
        findFirst: vi.fn().mockResolvedValue(card),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (operation) => operation(transaction)),
      reaction: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const identities = {
      current: vi.fn().mockResolvedValue({
        role: "boy",
        user: { id: BOY_ID },
        couple: { id: COUPLE_ID },
      }),
    } as unknown as IdentityService;
    const service = new MemoryResurfaceService(
      prisma,
      identities,
      new FixedClock(),
    );

    const result = await service.random("boy", EXCLUDED_ID);

    const where = transaction.memory.count.mock.calls[0]![0].where;
    expect(where).toMatchObject({
      coupleId: COUPLE_ID,
      status: "PUBLISHED",
      deletedAt: null,
      happenedAt: { lte: new Date("2026-07-16T08:30:00.000Z") },
      id: { not: EXCLUDED_ID, notIn: [RECENT_ID] },
    });
    expect(transaction.memoryResurface.create).toHaveBeenCalledWith({
      data: {
        coupleId: COUPLE_ID,
        memoryId: MEMORY_ID,
        reason: "RANDOM",
      },
    });
    expect(result?.id).toBe(MEMORY_ID);
  });

  it("falls back to the least recently shown legal memory", async () => {
    const createdAt = new Date("2026-07-15T00:00:00.000Z");
    const base = {
      version: 1,
      title: "旧回忆",
      content: null,
      happenedAt: new Date("2025-07-16T00:00:00.000Z"),
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
    };
    const older = {
      ...base,
      id: MEMORY_ID,
      resurfaces: [{ displayedAt: new Date("2026-06-01T00:00:00.000Z") }],
    };
    const newer = {
      ...base,
      id: RECENT_ID,
      resurfaces: [{ displayedAt: new Date("2026-07-15T00:00:00.000Z") }],
    };
    const transaction = {
      memoryResurface: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { memoryId: MEMORY_ID },
            { memoryId: RECENT_ID },
          ]),
        create: vi.fn().mockResolvedValue({}),
      },
      memory: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([newer, older]),
      },
    };
    const service = new MemoryResurfaceService(
      {
        $transaction: vi.fn(async (operation) => operation(transaction)),
        reaction: { findMany: vi.fn().mockResolvedValue([]) },
      } as unknown as PrismaService,
      {
        current: vi.fn().mockResolvedValue({
          role: "boy",
          user: { id: BOY_ID },
          couple: { id: COUPLE_ID },
        }),
      } as unknown as IdentityService,
      new FixedClock(),
    );

    const result = await service.random("boy");

    expect(result?.id).toBe(MEMORY_ID);
    expect(transaction.memoryResurface.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ memoryId: MEMORY_ID }),
      }),
    );
  });
});
