import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { Clock } from "../common/clock/clock";
import type { PrismaService } from "../database/prisma.service";
import type { IdentityService } from "../identity/identity.service";
import { MoodsService } from "./moods.service";

const COUPLE_ID = "00000000-0000-4000-8000-000000000001";
const BOY_ID = "00000000-0000-4000-8000-000000000101";
const GIRL_ID = "00000000-0000-4000-8000-000000000102";
const MOOD_ID = "40000000-0000-4000-8000-000000000001";
const PARTNER_MOOD_ID = "40000000-0000-4000-8000-000000000002";
const HIDDEN_MOOD_ID = "40000000-0000-4000-8000-000000000003";
const OUTBOX_ID = "40000000-0000-4000-8000-000000000004";
const NOW = new Date("2026-07-16T16:30:00.000Z");
const TODAY = new Date("2026-07-17T00:00:00.000Z");

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

function moodEntry(authorId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: MOOD_ID,
    authorId,
    entryDate: TODAY,
    mood: "期待",
    note: "明天见",
    visibleToPartner: true,
    wantsResponse: false,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function identityService(): IdentityService {
  return {
    current: vi.fn().mockResolvedValue(actor),
  } as unknown as IdentityService;
}

function transaction() {
  return {
    moodEntry: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) =>
        moodEntry(BOY_ID, {
          id: data.id,
          entryDate: data.entryDate,
          mood: data.mood,
          note: data.note,
          visibleToPartner: data.visibleToPartner,
          wantsResponse: data.wantsResponse,
        }),
      ),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    scheduledEvent: {
      upsert: vi.fn().mockResolvedValue({ id: OUTBOX_ID }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    notification: {
      upsert: vi.fn().mockResolvedValue({ id: MOOD_ID }),
    },
    outboxEvent: {
      upsert: vi.fn().mockResolvedValue({ id: OUTBOX_ID }),
    },
  };
}

function serviceWith(transactionValue: ReturnType<typeof transaction>) {
  const prisma = {
    $transaction: vi.fn(async (operation) => operation(transactionValue)),
  } as unknown as PrismaService;
  return {
    service: new MoodsService(prisma, identityService(), clock),
    prisma,
  };
}

function statusCode(error: unknown): number | undefined {
  return error instanceof HttpException ? error.getStatus() : undefined;
}

describe("MoodsService", () => {
  it("lists a calendar month and completely omits hidden partner moods", async () => {
    const findMany = vi.fn().mockResolvedValue([
      moodEntry(BOY_ID),
      moodEntry(GIRL_ID, {
        id: PARTNER_MOOD_ID,
        mood: "安心",
        entryDate: new Date("2026-07-18T00:00:00.000Z"),
      }),
      moodEntry(GIRL_ID, {
        id: HIDDEN_MOOD_ID,
        mood: "低落",
        visibleToPartner: false,
        entryDate: new Date("2026-07-19T00:00:00.000Z"),
      }),
    ]);
    const service = new MoodsService(
      { moodEntry: { findMany } } as unknown as PrismaService,
      identityService(),
      clock,
    );

    const result = await service.listMonth("boy", "2026-07");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          coupleId: COUPLE_ID,
          entryDate: {
            gte: new Date("2026-07-01T00:00:00.000Z"),
            lt: new Date("2026-08-01T00:00:00.000Z"),
          },
          OR: [
            { authorId: BOY_ID },
            { authorId: { in: [GIRL_ID] }, visibleToPartner: true },
          ],
        },
      }),
    );
    expect(result.mine).toHaveLength(1);
    expect(result.partner).toHaveLength(1);
    expect(result.partner[0]).toMatchObject({
      id: PARTNER_MOOD_ID,
      author: girl,
      mood: "安心",
    });
    expect(JSON.stringify(result)).not.toContain(HIDDEN_MOOD_ID);
    expect(JSON.stringify(result)).not.toContain("低落");
  });

  it("rejects an invalid month before querying", async () => {
    const findMany = vi.fn();
    const service = new MoodsService(
      { moodEntry: { findMany } } as unknown as PrismaService,
      identityService(),
      clock,
    );

    await expect(service.listMonth("boy", "2026-13")).rejects.toSatisfy(
      (error: unknown) => statusCode(error) === 400,
    );
    expect(findMany).not.toHaveBeenCalled();
  });

  it("derives today's date in the couple timezone and emits response events", async () => {
    const tx = transaction();
    const { service } = serviceWith(tx);

    const result = await service.putToday("boy", {
      mood: "想念",
      note: "想早点见到你",
      visibleToPartner: true,
      wantsResponse: true,
    });

    expect(clock.localDate).toHaveBeenCalledWith("Asia/Shanghai", NOW);
    expect(tx.moodEntry.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          coupleId_authorId_entryDate: {
            coupleId: COUPLE_ID,
            authorId: BOY_ID,
            entryDate: TODAY,
          },
        },
      }),
    );
    expect(tx.moodEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          coupleId: COUPLE_ID,
          authorId: BOY_ID,
          entryDate: TODAY,
          mood: "想念",
          visibleToPartner: true,
          wantsResponse: true,
        }),
      }),
    );
    expect(tx.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          recipientId: GIRL_ID,
          type: "MOOD_RESPONSE_REQUESTED",
        }),
      }),
    );
    expect(tx.outboxEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          eventType: "mood_entry.updated",
        }),
      }),
    );
    expect(result).toMatchObject({
      author: boy,
      entryDate: "2026-07-17",
      mood: "想念",
      wantsResponse: true,
    });
  });

  it("does not allow a hidden mood to request a partner response", async () => {
    const tx = transaction();
    const { service } = serviceWith(tx);

    await expect(
      service.putToday("boy", {
        mood: "想静一静",
        visibleToPartner: false,
        wantsResponse: true,
      }),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 400);
    expect(tx.moodEntry.create).not.toHaveBeenCalled();
    expect(tx.notification.upsert).not.toHaveBeenCalled();
    expect(tx.outboxEvent.upsert).not.toHaveBeenCalled();
  });

  it("requires and checks the version of an existing daily mood", async () => {
    const tx = transaction();
    tx.moodEntry.findUnique.mockResolvedValue(
      moodEntry(BOY_ID, { version: 4 }),
    );
    const { service } = serviceWith(tx);

    await expect(service.putToday("boy", { mood: "平静" })).rejects.toSatisfy(
      (error: unknown) => statusCode(error) === 428,
    );
    await expect(
      service.putToday("boy", { version: 3, mood: "平静" }),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 409);
    expect(tx.moodEntry.updateMany).not.toHaveBeenCalled();
  });

  it("updates by version while retaining omitted optional values", async () => {
    const tx = transaction();
    const existing = moodEntry(BOY_ID, {
      version: 2,
      note: "保留这句",
      visibleToPartner: true,
      wantsResponse: false,
    });
    const updated = moodEntry(BOY_ID, {
      version: 3,
      mood: "安心",
      note: "保留这句",
      visibleToPartner: true,
      wantsResponse: false,
    });
    tx.moodEntry.findUnique
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(updated);
    const { service } = serviceWith(tx);

    const result = await service.putToday("boy", {
      version: 2,
      mood: "安心",
    });

    expect(tx.moodEntry.updateMany).toHaveBeenCalledWith({
      where: {
        id: MOOD_ID,
        coupleId: COUPLE_ID,
        authorId: BOY_ID,
        entryDate: TODAY,
        version: 2,
      },
      data: {
        mood: "安心",
        version: { increment: 1 },
      },
    });
    expect(result).toMatchObject({
      version: 3,
      note: "保留这句",
      mood: "安心",
    });
  });

  it("emits a content-free invalidation when a shared mood becomes private", async () => {
    const tx = transaction();
    const existing = moodEntry(BOY_ID, {
      version: 2,
      mood: "公开的心情",
      note: "对方曾经看得到",
      visibleToPartner: true,
    });
    const updated = moodEntry(BOY_ID, {
      version: 3,
      mood: "只留给自己",
      note: "现在必须从对方缓存撤回",
      visibleToPartner: false,
    });
    tx.moodEntry.findUnique
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(updated);
    const { service } = serviceWith(tx);

    const result = await service.putToday("boy", {
      version: 2,
      mood: "只留给自己",
      note: "现在必须从对方缓存撤回",
      visibleToPartner: false,
    });

    expect(result.visibleToPartner).toBe(false);
    expect(tx.outboxEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          eventType: "mood_entry.hidden",
          payload: expect.not.objectContaining({
            mood: expect.anything(),
            note: expect.anything(),
          }),
        }),
      }),
    );
  });

  it("keeps a hidden mood private by writing no partner notification or outbox", async () => {
    const tx = transaction();
    const { service } = serviceWith(tx);

    const result = await service.putToday("boy", {
      mood: "只想自己记住",
      visibleToPartner: false,
    });

    expect(result.visibleToPartner).toBe(false);
    expect(tx.notification.upsert).not.toHaveBeenCalled();
    expect(tx.outboxEvent.upsert).not.toHaveBeenCalled();
  });

  it("deletes today's visible mood by version and emits a removal event", async () => {
    const tx = transaction();
    tx.moodEntry.findUnique.mockResolvedValue({
      id: MOOD_ID,
      version: 3,
      visibleToPartner: true,
    });
    const { service } = serviceWith(tx);

    await service.removeToday("boy", 3);

    expect(tx.moodEntry.deleteMany).toHaveBeenCalledWith({
      where: {
        id: MOOD_ID,
        coupleId: COUPLE_ID,
        authorId: BOY_ID,
        entryDate: TODAY,
        version: 3,
      },
    });
    expect(tx.outboxEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ eventType: "mood_entry.deleted" }),
      }),
    );
  });

  it("rejects stale mood deletion and never leaks a hidden deletion", async () => {
    const stale = transaction();
    stale.moodEntry.findUnique.mockResolvedValue({
      id: MOOD_ID,
      version: 4,
      visibleToPartner: true,
    });
    const staleService = serviceWith(stale).service;

    await expect(staleService.removeToday("boy", 3)).rejects.toSatisfy(
      (error: unknown) => statusCode(error) === 409,
    );
    expect(stale.moodEntry.deleteMany).not.toHaveBeenCalled();

    const hidden = transaction();
    hidden.moodEntry.findUnique.mockResolvedValue({
      id: HIDDEN_MOOD_ID,
      version: 2,
      visibleToPartner: false,
    });
    await serviceWith(hidden).service.removeToday("boy", 2);
    expect(hidden.outboxEvent.upsert).not.toHaveBeenCalled();
  });
});
