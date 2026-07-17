import { HttpException } from "@nestjs/common";
import {
  CapsuleStatus,
  CapsuleType,
  ConversionSourceType,
  ConversionTargetType,
  NoteStatus,
  WishCategory,
  WishStatus,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { Clock } from "../common/clock/clock";
import type { IdempotencyService } from "../common/idempotency/idempotency.service";
import type { PrismaService } from "../database/prisma.service";
import type { IdentityService } from "../identity/identity.service";
import type { MemoryCreationService } from "../memories/memory-creation.service";
import type { MemoriesService } from "../memories/memories.service";
import { ConversionsService } from "./conversions.service";

const COUPLE_ID = "00000000-0000-4000-8000-000000000001";
const BOY_ID = "00000000-0000-4000-8000-000000000101";
const GIRL_ID = "00000000-0000-4000-8000-000000000102";
const NOTE_ID = "10000000-0000-4000-8000-000000000001";
const WISH_ID = "20000000-0000-4000-8000-000000000001";
const CAPSULE_ID = "20000000-0000-4000-8000-000000000002";
const MEMORY_ID = "30000000-0000-4000-8000-000000000001";
const PLACE_ID = "40000000-0000-4000-8000-000000000001";
const CONVERSION_ID = "50000000-0000-4000-8000-000000000001";
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

function note(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTE_ID,
    version: 2,
    content: "一起去看海",
    createdAt: new Date("2026-07-16T04:00:00.000Z"),
    status: NoteStatus.VISIBLE,
    ...overrides,
  };
}

function wish(overrides: Record<string, unknown> = {}) {
  return {
    id: WISH_ID,
    version: 4,
    status: WishStatus.COMPLETED,
    title: "去看海",
    description: "一起等日落",
    expectation: "慢慢走",
    completionNote: "终于看到啦",
    completedAt: new Date("2026-07-17T03:00:00.000Z"),
    placeId: PLACE_ID,
    media: [],
    ...overrides,
  };
}

function capsule(overrides: Record<string, unknown> = {}) {
  return {
    id: CAPSULE_ID,
    version: 5,
    status: CapsuleStatus.OPENED,
    type: CapsuleType.TO_BOTH,
    createdById: BOY_ID,
    title: "写给明天",
    openedAt: NOW,
    openRecords: [
      { userId: BOY_ID, openedAt: NOW },
      { userId: GIRL_ID, openedAt: NOW },
    ],
    ...overrides,
  };
}

function capsuleContent() {
  return {
    messages: [
      { authorId: BOY_ID, content: "一起慢慢走。" },
      { authorId: GIRL_ID, content: "也一起看很多日落。" },
    ],
    media: [],
  };
}

function conversion(
  sourceType: ConversionSourceType,
  sourceId: string,
  targetType: ConversionTargetType,
  targetId: string,
) {
  return {
    id: CONVERSION_ID,
    sourceType,
    sourceId,
    sourceOccurrence: "once",
    targetType,
    targetId,
    convertedById: BOY_ID,
    convertedAt: NOW,
  };
}

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    contentConversion: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ ...data, id: CONVERSION_ID, convertedAt: NOW }),
        ),
    },
    note: {
      findFirst: vi.fn().mockResolvedValue(note()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    wish: {
      findFirst: vi.fn().mockResolvedValue(wish()),
      create: vi.fn().mockResolvedValue({ id: WISH_ID }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    capsule: {
      findFirst: vi
        .fn()
        .mockResolvedValueOnce(capsule())
        .mockResolvedValueOnce(capsuleContent()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    wishUpdate: { create: vi.fn().mockResolvedValue({ id: CONVERSION_ID }) },
    anniversary: {
      create: vi.fn().mockResolvedValue({ id: WISH_ID }),
    },
    place: { findFirst: vi.fn().mockResolvedValue({ id: PLACE_ID }) },
    scheduledEvent: {
      upsert: vi.fn().mockResolvedValue({ id: CONVERSION_ID }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    notification: { upsert: vi.fn().mockResolvedValue({ id: CONVERSION_ID }) },
    outboxEvent: { upsert: vi.fn().mockResolvedValue({ id: CONVERSION_ID }) },
    ...overrides,
  };
}

function setup(tx = transaction()) {
  const identity = {
    current: vi.fn().mockResolvedValue(actor),
  } as unknown as IdentityService;
  const clock = { now: vi.fn(() => NOW) } as unknown as Clock;
  const idempotency = {
    execute: vi.fn(async ({ operation }) => {
      const response = await operation(tx);
      return { ...response, replayed: false };
    }),
  } as unknown as IdempotencyService;
  const memoryCreation = {
    createConverted: vi.fn().mockResolvedValue(MEMORY_ID),
  } as unknown as MemoryCreationService;
  const memoryDetail = { id: MEMORY_ID };
  const memories = {
    get: vi.fn().mockResolvedValue(memoryDetail),
  } as unknown as MemoriesService;
  const service = new ConversionsService(
    {} as PrismaService,
    identity,
    clock,
    idempotency,
    memoryCreation,
    memories,
  );
  return { service, idempotency, memoryCreation, memories, tx };
}

function statusCode(error: unknown): number | undefined {
  return error instanceof HttpException ? error.getStatus() : undefined;
}

describe("ConversionsService", () => {
  it("converts an owned active note to a wish and archives it atomically", async () => {
    const { service, tx } = setup();

    const response = await service.convertNote(
      "boy",
      NOTE_ID,
      {
        targetType: ConversionTargetType.WISH,
        category: WishCategory.TRAVEL,
        placeId: PLACE_ID,
      },
      "note-to-wish",
    );

    expect(response.status).toBe(201);
    expect(response.result).toMatchObject({
      sourceType: ConversionSourceType.NOTE,
      sourceId: NOTE_ID,
      targetType: ConversionTargetType.WISH,
      targetId: WISH_ID,
    });
    expect(tx.note.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: NOTE_ID,
          coupleId: COUPLE_ID,
          authorId: BOY_ID,
        }),
      }),
    );
    expect(tx.place.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PLACE_ID, coupleId: COUPLE_ID, deletedAt: null },
      }),
    );
    expect(tx.note.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ version: 2 }),
        data: expect.objectContaining({ status: NoteStatus.ARCHIVED }),
      }),
    );
    expect(tx.outboxEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ eventType: "conversion.completed" }),
      }),
    );
  });

  it("does not allow a foreign place to be attached by note conversion", async () => {
    const tx = transaction();
    tx.place.findFirst.mockResolvedValue(null);
    const { service } = setup(tx);

    await expect(
      service.convertNote(
        "boy",
        NOTE_ID,
        {
          targetType: ConversionTargetType.WISH,
          placeId: PLACE_ID,
        },
        "foreign-place",
      ),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 404);
    expect(tx.wish.create).not.toHaveBeenCalled();
  });

  it("hides archived notes and rejects a raced archive update", async () => {
    const archivedTx = transaction();
    archivedTx.note.findFirst.mockResolvedValue(
      note({ status: NoteStatus.ARCHIVED }),
    );
    const archived = setup(archivedTx);
    await expect(
      archived.service.convertNote(
        "boy",
        NOTE_ID,
        { targetType: ConversionTargetType.MEMORY },
        "archived-note",
      ),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 404);

    const racedTx = transaction();
    racedTx.note.updateMany.mockResolvedValue({ count: 0 });
    const raced = setup(racedTx);
    await expect(
      raced.service.convertNote(
        "boy",
        NOTE_ID,
        { targetType: ConversionTargetType.MEMORY },
        "raced-note",
      ),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 409);
  });

  it("reuses an existing same-target note conversion and rejects a different target", async () => {
    const existing = conversion(
      ConversionSourceType.NOTE,
      NOTE_ID,
      ConversionTargetType.WISH,
      WISH_ID,
    );
    const tx = transaction();
    tx.contentConversion.findUnique.mockResolvedValue(existing);
    const { service } = setup(tx);

    await expect(
      service.convertNote(
        "boy",
        NOTE_ID,
        { targetType: ConversionTargetType.WISH },
        "same-target",
      ),
    ).resolves.toMatchObject({ status: 200 });
    await expect(
      service.convertNote(
        "boy",
        NOTE_ID,
        { targetType: ConversionTargetType.MEMORY },
        "different-target",
      ),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 409);
    expect(tx.note.findFirst).toHaveBeenCalledTimes(2);
    expect(tx.wish.create).not.toHaveBeenCalled();
  });

  it("does not let the other identity replay an author's note conversion", async () => {
    const tx = transaction();
    tx.note.findFirst.mockResolvedValue(null);
    tx.contentConversion.findUnique.mockResolvedValue(
      conversion(
        ConversionSourceType.NOTE,
        NOTE_ID,
        ConversionTargetType.WISH,
        WISH_ID,
      ),
    );
    const { service } = setup(tx);

    await expect(
      service.convertNote(
        "boy",
        NOTE_ID,
        { targetType: ConversionTargetType.WISH },
        "foreign-note-replay",
      ),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 404);
    expect(tx.contentConversion.findUnique).not.toHaveBeenCalled();
  });

  it("converts only a completed wish and moves it to CONVERTED_TO_MEMORY", async () => {
    const { service, memoryCreation, memories, tx } = setup();

    const response = await service.convertWishToMemory(
      "boy",
      WISH_ID,
      { version: 4 },
      "wish-to-memory",
    );

    expect(response).toEqual({ status: 201, memory: { id: MEMORY_ID } });
    expect(memoryCreation.createConverted).toHaveBeenCalledWith(
      tx,
      actor,
      expect.objectContaining({
        source: { type: "WISH", id: WISH_ID },
        title: "去看海",
        happenedAt: new Date("2026-07-17T03:00:00.000Z"),
        placeId: PLACE_ID,
      }),
    );
    expect(tx.wish.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          coupleId: COUPLE_ID,
          version: 4,
          status: WishStatus.COMPLETED,
        }),
        data: expect.objectContaining({
          status: WishStatus.CONVERTED_TO_MEMORY,
        }),
      }),
    );
    expect(memories.get).toHaveBeenCalledWith("boy", MEMORY_ID);
  });

  it("rejects stale or unfinished wishes before creating a memory", async () => {
    const staleTx = transaction();
    staleTx.wish.findFirst.mockResolvedValue(wish({ version: 5 }));
    const stale = setup(staleTx);
    await expect(
      stale.service.convertWishToMemory(
        "boy",
        WISH_ID,
        { version: 4 },
        "stale-wish",
      ),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 409);
    expect(stale.memoryCreation.createConverted).not.toHaveBeenCalled();

    const unfinishedTx = transaction();
    unfinishedTx.wish.findFirst.mockResolvedValue(
      wish({ status: WishStatus.IN_PROGRESS, completedAt: null }),
    );
    const unfinished = setup(unfinishedTx);
    await expect(
      unfinished.service.convertWishToMemory(
        "boy",
        WISH_ID,
        { version: 4 },
        "unfinished-wish",
      ),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 409);
    expect(unfinished.memoryCreation.createConverted).not.toHaveBeenCalled();
  });

  it("converts an explicitly opened capsule without loading body before authorization", async () => {
    const { service, memoryCreation, tx } = setup();

    const response = await service.convertCapsuleToMemory(
      "boy",
      CAPSULE_ID,
      { version: 5 },
      "capsule-to-memory",
    );

    expect(response).toEqual({ status: 201, memory: { id: MEMORY_ID } });
    expect(tx.capsule.findFirst).toHaveBeenCalledTimes(2);
    expect(memoryCreation.createConverted).toHaveBeenCalledWith(
      tx,
      actor,
      expect.objectContaining({
        source: { type: "CAPSULE", id: CAPSULE_ID },
        title: "写给明天",
        content: expect.stringContaining("甲写下"),
        happenedAt: NOW,
      }),
    );
    expect(tx.capsule.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          coupleId: COUPLE_ID,
          status: CapsuleStatus.OPENED,
          version: 5,
        }),
        data: expect.objectContaining({
          status: CapsuleStatus.CONVERTED_TO_MEMORY,
        }),
      }),
    );
  });

  it("refuses unopened or invisible capsules before querying messages and media", async () => {
    const unopenedTx = transaction();
    unopenedTx.capsule.findFirst.mockReset();
    unopenedTx.capsule.findFirst.mockResolvedValue(
      capsule({ openRecords: [] }),
    );
    const unopened = setup(unopenedTx);
    await expect(
      unopened.service.convertCapsuleToMemory(
        "boy",
        CAPSULE_ID,
        { version: 5 },
        "unopened-capsule",
      ),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 409);
    expect(unopenedTx.capsule.findFirst).toHaveBeenCalledTimes(1);
    expect(unopened.memoryCreation.createConverted).not.toHaveBeenCalled();

    const waitingTx = transaction();
    waitingTx.capsule.findFirst.mockReset();
    waitingTx.capsule.findFirst.mockResolvedValue(
      capsule({ openRecords: [{ userId: BOY_ID, openedAt: NOW }] }),
    );
    const waiting = setup(waitingTx);
    await expect(
      waiting.service.convertCapsuleToMemory(
        "boy",
        CAPSULE_ID,
        { version: 5 },
        "waiting-capsule",
      ),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 409);
    expect(waitingTx.capsule.findFirst).toHaveBeenCalledTimes(1);
    expect(waiting.memoryCreation.createConverted).not.toHaveBeenCalled();

    const hiddenTx = transaction();
    hiddenTx.capsule.findFirst.mockReset();
    hiddenTx.capsule.findFirst.mockResolvedValue(
      capsule({
        type: CapsuleType.TO_SELF,
        createdById: GIRL_ID,
      }),
    );
    const hidden = setup(hiddenTx);
    await expect(
      hidden.service.convertCapsuleToMemory(
        "boy",
        CAPSULE_ID,
        { version: 5 },
        "hidden-capsule",
      ),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 404);
    expect(hiddenTx.contentConversion.findUnique).not.toHaveBeenCalled();
    expect(hiddenTx.capsule.findFirst).toHaveBeenCalledTimes(1);
  });

  it("does not publish a TO_SELF capsule into the shared memory timeline", async () => {
    const tx = transaction();
    tx.capsule.findFirst.mockReset();
    tx.capsule.findFirst
      .mockResolvedValueOnce(capsule({ type: CapsuleType.TO_SELF }))
      .mockResolvedValueOnce(capsuleContent());
    const { service } = setup(tx);

    await expect(
      service.convertCapsuleToMemory(
        "boy",
        CAPSULE_ID,
        { version: 5 },
        "private-capsule",
      ),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 403);

    expect(tx.notification.upsert).not.toHaveBeenCalled();
    expect(tx.outboxEvent.upsert).not.toHaveBeenCalled();
    expect(tx.contentConversion.create).not.toHaveBeenCalled();
  });
});
