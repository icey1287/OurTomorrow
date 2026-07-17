import { HttpException } from "@nestjs/common";
import { MemoryStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { Clock } from "../common/clock/clock";
import { PrismaService } from "../database/prisma.service";
import { IdentityService } from "../identity/identity.service";
import { MemoriesService } from "./memories.service";

const COUPLE_ID = "00000000-0000-4000-8000-000000000001";
const BOY_ID = "00000000-0000-4000-8000-000000000101";
const GIRL_ID = "00000000-0000-4000-8000-000000000102";
const MEMORY_ID = "10000000-0000-4000-8000-000000000001";
const TAG_ID = "40000000-0000-4000-8000-000000000001";
const MEDIA_ID = "20000000-0000-4000-8000-000000000001";

const actor = {
  role: "boy" as const,
  user: {
    id: BOY_ID,
    version: 1,
    displayName: "甲",
    slot: 1 as const,
    role: "boy" as const,
    nicknameInRelationship: "甲",
    avatarUrl: null,
  },
  couple: {
    id: COUPLE_ID,
    version: 1,
    name: "我们的明天",
    startDate: "2024-01-01",
    timezone: "Asia/Shanghai",
    signature: null,
    theme: "system" as const,
    members: [
      {
        id: BOY_ID,
        version: 1,
        displayName: "甲",
        slot: 1 as const,
        role: "boy" as const,
        nicknameInRelationship: "甲",
        avatarUrl: null,
      },
      {
        id: GIRL_ID,
        version: 1,
        displayName: "乙",
        slot: 2 as const,
        role: "girl" as const,
        nicknameInRelationship: "乙",
        avatarUrl: null,
      },
    ],
  },
};

class FixedClock implements Clock {
  now(): Date {
    return new Date("2026-07-16T08:30:00.000Z");
  }

  localDate(): string {
    return "2026-07-16";
  }
}

function cardRecord() {
  const createdAt = new Date("2026-07-15T08:00:00.000Z");
  return {
    id: MEMORY_ID,
    version: 2,
    title: "第一次一起看海",
    content: "傍晚风很大。",
    happenedAt: new Date("2024-01-01T10:30:00.000Z"),
    status: MemoryStatus.PUBLISHED,
    place: null,
    coverMedia: null,
    tags: [],
    isFirstTime: true,
    firstTimeLabel: "第一次看海",
    isPinned: false,
    perspectives: [{ submittedAt: createdAt }, { submittedAt: null }],
    _count: { comments: 0 },
    createdAt,
    updatedAt: createdAt,
  };
}

function snapshot(version = 2) {
  return {
    id: MEMORY_ID,
    version,
    title: "第一次一起看海",
    content: "傍晚风很大。",
    happenedAt: new Date("2024-01-01T10:30:00.000Z"),
    placeId: null,
    coverMediaId: null,
    mood: null,
    isFirstTime: true,
    firstTimeLabel: "第一次看海",
    isPinned: false,
    status: MemoryStatus.PUBLISHED,
    createdById: BOY_ID,
    tags: [],
    media: [],
  };
}

function serviceWith(prisma: object): MemoriesService {
  return new MemoriesService(
    prisma as PrismaService,
    {
      current: vi.fn().mockResolvedValue(actor),
    } as unknown as IdentityService,
    new FixedClock(),
  );
}

function statusOf(error: unknown): number | undefined {
  return error instanceof HttpException ? error.getStatus() : undefined;
}

describe("MemoriesService", () => {
  it("keeps role visibility, text search, tags and cursor filters in one scoped AND", async () => {
    const memory = { findMany: vi.fn().mockResolvedValue([cardRecord()]) };
    const reaction = { findMany: vi.fn().mockResolvedValue([]) };
    const service = serviceWith({ memory, reaction });

    const firstPage = await service.list("boy", {
      limit: 1,
      tagId: TAG_ID,
      query: "海",
      perspectiveState: "incomplete",
    });

    expect(firstPage.items).toHaveLength(1);
    const where = memory.findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({ coupleId: COUPLE_ID, deletedAt: null });
    expect(where.AND).toEqual(
      expect.arrayContaining([
        {
          OR: [
            { status: "PUBLISHED" },
            { status: "DRAFT", createdById: BOY_ID },
          ],
        },
        expect.objectContaining({ tags: expect.any(Object) }),
        expect.objectContaining({ OR: expect.any(Array) }),
        expect.objectContaining({ NOT: expect.any(Object) }),
      ]),
    );
  });

  it("rejects malformed cursors instead of widening the query", async () => {
    const service = serviceWith({ memory: {}, reaction: {} });
    await expect(
      service.list("boy", { limit: 20, cursor: "not-a-cursor" }),
    ).rejects.toSatisfy((error: unknown) => statusOf(error) === 400);
  });

  it("rejects a cursor when its filter context changes", async () => {
    const second = {
      ...cardRecord(),
      id: "10000000-0000-4000-8000-000000000002",
    };
    const memory = {
      findMany: vi.fn().mockResolvedValueOnce([cardRecord(), second]),
    };
    const service = serviceWith({
      memory,
      reaction: { findMany: vi.fn().mockResolvedValue([]) },
    });
    const firstPage = await service.list("boy", { limit: 1, query: "海" });

    await expect(
      service.list("boy", {
        limit: 1,
        query: "山",
        cursor: firstPage.meta.nextCursor!,
      }),
    ).rejects.toSatisfy((error: unknown) => statusOf(error) === 400);
    expect(memory.findMany).toHaveBeenCalledTimes(1);
  });

  it("builds month boundaries in the couple time zone", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = serviceWith({ memory: { findMany } });

    await service.list("boy", { limit: 20, year: 2024, month: 8 });

    expect(findMany.mock.calls[0]![0].where.AND).toEqual(
      expect.arrayContaining([
        {
          happenedAt: {
            gte: new Date("2024-07-31T16:00:00.000Z"),
            lt: new Date("2024-08-31T16:00:00.000Z"),
          },
        },
      ]),
    );
  });

  it("does not load the partner's unsubmitted perspective body", async () => {
    const createdAt = new Date("2026-07-15T08:00:00.000Z");
    const findFirst = vi.fn().mockResolvedValue({
      ...cardRecord(),
      mood: null,
      createdById: BOY_ID,
      updatedById: BOY_ID,
      media: [],
      perspectives: [
        {
          authorId: BOY_ID,
          content: "我的草稿",
          mood: null,
          submittedAt: null,
          version: 1,
          updatedAt: createdAt,
        },
      ],
      comments: [],
    });
    const service = serviceWith({
      memory: { findFirst },
      reaction: { findMany: vi.fn().mockResolvedValue([]) },
    });

    const detail = await service.get("boy", MEMORY_ID);

    expect(findFirst.mock.calls[0]![0].select.perspectives.where).toEqual({
      OR: [{ authorId: BOY_ID }, { submittedAt: { not: null } }],
    });
    expect(
      detail.perspectives.find(({ author }) => author.id === GIRL_ID),
    ).toEqual({
      author: actor.couple.members[1],
      state: "EMPTY",
      editable: false,
    });
  });

  it("uses couple scope and version in the conditional shared update", async () => {
    const transaction = {
      memory: {
        findFirst: vi.fn().mockResolvedValue(snapshot()),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      place: {},
      tag: {},
    };
    const prisma = {
      $transaction: vi.fn(async (operation) => operation(transaction)),
    };
    const service = serviceWith(prisma);

    await expect(
      service.update(
        "boy",
        MEMORY_ID,
        { version: 2, title: "改过的标题" },
        `"memory:${MEMORY_ID}:2"`,
      ),
    ).rejects.toSatisfy((error: unknown) => statusOf(error) === 409);

    expect(transaction.memory.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: MEMORY_ID,
          coupleId: COUPLE_ID,
          version: 2,
        }),
      }),
    );
  });

  it("writes a safe shared-field revision after a successful update", async () => {
    const before = snapshot();
    const after = {
      ...snapshot(3),
      title: "改过的标题",
      tags: [{ tagId: TAG_ID }],
    };
    const transaction = {
      memory: {
        findFirst: vi.fn().mockResolvedValue(before),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue(after),
      },
      place: {},
      tag: { count: vi.fn().mockResolvedValue(1) },
      memoryTag: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      contentRevision: { create: vi.fn().mockResolvedValue({}) },
    };
    const detail = {
      ...cardRecord(),
      version: 3,
      title: "改过的标题",
      mood: null,
      createdById: BOY_ID,
      updatedById: BOY_ID,
      media: [],
      perspectives: [],
      comments: [],
    };
    const service = serviceWith({
      $transaction: vi.fn(async (operation) => operation(transaction)),
      memory: { findFirst: vi.fn().mockResolvedValue(detail) },
      reaction: { findMany: vi.fn().mockResolvedValue([]) },
    });

    const result = await service.update("boy", MEMORY_ID, {
      version: 2,
      title: "改过的标题",
      tagIds: [TAG_ID],
    });

    expect(transaction.contentRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        coupleId: COUPLE_ID,
        resourceType: "MEMORY",
        resourceId: MEMORY_ID,
        version: 3,
        authorId: BOY_ID,
        changes: expect.objectContaining({
          title: { from: "第一次一起看海", to: "改过的标题" },
          tagIds: { from: [], to: [TAG_ID] },
        }),
      }),
    });
    expect(result).toMatchObject({ version: 3, title: "改过的标题" });
  });

  it("publishes a clean revision baseline without discarded draft content", async () => {
    const before = {
      ...snapshot(1),
      content: "只属于草稿的秘密",
      status: MemoryStatus.DRAFT,
    };
    const after = {
      ...snapshot(2),
      content: "可以共同看到的正文",
      status: MemoryStatus.PUBLISHED,
    };
    const transaction = {
      memory: {
        findFirst: vi.fn().mockResolvedValue(before),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue(after),
      },
      place: {},
      tag: {},
      contentRevision: { create: vi.fn().mockResolvedValue({}) },
    };
    const detail = {
      ...cardRecord(),
      version: 2,
      content: "可以共同看到的正文",
      mood: null,
      createdById: BOY_ID,
      updatedById: BOY_ID,
      media: [],
      perspectives: [],
      comments: [],
    };
    const service = serviceWith({
      $transaction: vi.fn(async (operation) => operation(transaction)),
      memory: { findFirst: vi.fn().mockResolvedValue(detail) },
      reaction: { findMany: vi.fn().mockResolvedValue([]) },
    });

    await service.update("boy", MEMORY_ID, {
      version: 1,
      content: "可以共同看到的正文",
      status: MemoryStatus.PUBLISHED,
    });

    expect(transaction.contentRevision.create).toHaveBeenCalledOnce();
    expect(transaction.contentRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        coupleId: COUPLE_ID,
        resourceType: "MEMORY",
        resourceId: MEMORY_ID,
        version: 2,
        authorId: BOY_ID,
        changes: expect.objectContaining({
          content: { from: null, to: "可以共同看到的正文" },
          status: { from: null, to: MemoryStatus.PUBLISHED },
        }),
      }),
    });
    expect(
      JSON.stringify(transaction.contentRevision.create.mock.calls),
    ).not.toContain("只属于草稿的秘密");
  });

  it("requires a version before overwriting an existing personal perspective", async () => {
    const transaction = {
      memory: { findFirst: vi.fn().mockResolvedValue({ id: MEMORY_ID }) },
      memoryPerspective: {
        findUnique: vi.fn().mockResolvedValue({
          id: "50000000-0000-4000-8000-000000000001",
          version: 3,
        }),
      },
    };
    const service = serviceWith({
      $transaction: vi.fn(async (operation) => operation(transaction)),
    });

    await expect(
      service.upsertPerspective("boy", MEMORY_ID, { content: "我的视角" }),
    ).rejects.toSatisfy((error: unknown) => statusOf(error) === 428);
  });

  it("returns forbidden when one member tries to delete the other's comment", async () => {
    const transaction = {
      memory: { findFirst: vi.fn().mockResolvedValue({ id: MEMORY_ID }) },
      comment: {
        findFirst: vi.fn().mockResolvedValue({
          authorId: GIRL_ID,
          deletedAt: null,
        }),
      },
    };
    const service = serviceWith({
      $transaction: vi.fn(async (operation) => operation(transaction)),
    });

    await expect(
      service.removeComment(
        "boy",
        MEMORY_ID,
        "30000000-0000-4000-8000-000000000001",
      ),
    ).rejects.toSatisfy((error: unknown) => statusOf(error) === 403);
  });

  it("requires a version or ETag before soft deleting a memory", async () => {
    const transaction = vi.fn();
    const service = serviceWith({ $transaction: transaction });

    await expect(service.remove("boy", MEMORY_ID)).rejects.toSatisfy(
      (error: unknown) => statusOf(error) === 428,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it("sets a memory reaction idempotently with actor and couple derived server-side", async () => {
    const memory = { findFirst: vi.fn().mockResolvedValue({ id: MEMORY_ID }) };
    const reaction = {
      upsert: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([{ authorId: BOY_ID, emoji: "❤️" }]),
    };
    const service = serviceWith({ memory, reaction });

    const result = await service.addReaction("boy", MEMORY_ID, "❤️");

    expect(reaction.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          coupleId: COUPLE_ID,
          authorId: BOY_ID,
          targetId: MEMORY_ID,
        }),
      }),
    );
    expect(result).toEqual([{ emoji: "❤️", count: 1, reactedByMe: true }]);
  });

  it("rejects non-emoji reaction path values", async () => {
    const service = serviceWith({});
    await expect(service.addReaction("boy", MEMORY_ID, "1")).rejects.toSatisfy(
      (error: unknown) => statusOf(error) === 400,
    );
  });

  it("synchronizes the complete media set and removes omitted associations", async () => {
    const before = {
      ...snapshot(),
      coverMediaId: "20000000-0000-4000-8000-000000000002",
      media: [
        {
          mediaAssetId: "20000000-0000-4000-8000-000000000002",
          role: "COVER",
          sortOrder: 0,
        },
      ],
    };
    const after = {
      ...snapshot(3),
      coverMediaId: null,
      media: [{ mediaAssetId: MEDIA_ID, role: "GALLERY", sortOrder: 0 }],
    };
    const transaction = {
      memory: {
        findFirst: vi.fn().mockResolvedValue(before),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue(after),
      },
      mediaAsset: { count: vi.fn().mockResolvedValue(1) },
      memoryMedia: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        upsert: vi.fn().mockResolvedValue({}),
      },
      contentRevision: { create: vi.fn().mockResolvedValue({}) },
    };
    const detail = {
      ...cardRecord(),
      version: 3,
      mood: null,
      createdById: BOY_ID,
      updatedById: BOY_ID,
      media: [],
      perspectives: [],
      comments: [],
    };
    const service = serviceWith({
      $transaction: vi.fn(async (operation) => operation(transaction)),
      memory: { findFirst: vi.fn().mockResolvedValue(detail) },
      reaction: { findMany: vi.fn().mockResolvedValue([]) },
    });

    const result = await service.bindMedia("boy", MEMORY_ID, {
      version: 2,
      mediaIds: [MEDIA_ID],
      coverMediaId: null,
    });

    expect(transaction.memoryMedia.deleteMany).toHaveBeenCalledWith({
      where: {
        memoryId: MEMORY_ID,
        mediaAssetId: { notIn: [MEDIA_ID] },
      },
    });
    expect(transaction.memoryMedia.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          memoryId_mediaAssetId: {
            memoryId: MEMORY_ID,
            mediaAssetId: MEDIA_ID,
          },
        },
      }),
    );
    expect(result.version).toBe(3);
  });
});
