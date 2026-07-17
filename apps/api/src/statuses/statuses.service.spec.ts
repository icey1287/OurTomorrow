import { HttpException } from "@nestjs/common";
import { CurrentStatusKind, CurrentStatusState } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { Clock } from "../common/clock/clock";
import type { PrismaService } from "../database/prisma.service";
import type { IdentityService } from "../identity/identity.service";
import { StatusesService } from "./statuses.service";

const COUPLE_ID = "00000000-0000-4000-8000-000000000001";
const BOY_ID = "00000000-0000-4000-8000-000000000101";
const GIRL_ID = "00000000-0000-4000-8000-000000000102";
const STATUS_ID = "30000000-0000-4000-8000-000000000001";
const OLD_STATUS_ID = "30000000-0000-4000-8000-000000000002";
const OUTBOX_ID = "30000000-0000-4000-8000-000000000003";
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

function status(authorId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: STATUS_ID,
    authorId,
    kind: CurrentStatusKind.RESTING,
    message: "午休一会儿",
    mood: "安心",
    scene: "家里",
    needsResponse: false,
    startsAt: NOW,
    expiresAt: new Date("2026-07-17T06:00:00.000Z"),
    version: 1,
    ...overrides,
  };
}

function identityService(): IdentityService {
  return {
    current: vi.fn().mockResolvedValue(actor),
  } as unknown as IdentityService;
}

function transaction(overrides: Record<string, unknown> = {}) {
  const currentStatus = {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) =>
      status(BOY_ID, {
        id: data.id,
        kind: data.kind,
        message: data.message,
        mood: data.mood,
        scene: data.scene,
        needsResponse: data.needsResponse,
        startsAt: data.startsAt,
        expiresAt: data.expiresAt,
      }),
    ),
  };
  return {
    currentStatus,
    scheduledEvent: {
      upsert: vi.fn().mockResolvedValue({ id: STATUS_ID }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    notification: {
      upsert: vi.fn().mockResolvedValue({ id: STATUS_ID }),
    },
    outboxEvent: {
      upsert: vi.fn().mockResolvedValue({ id: OUTBOX_ID }),
    },
    ...overrides,
  };
}

function serviceWith(transactionValue: ReturnType<typeof transaction>) {
  const prisma = {
    $transaction: vi.fn(async (operation) => operation(transactionValue)),
  } as unknown as PrismaService;
  return {
    service: new StatusesService(prisma, identityService(), clock),
    prisma,
  };
}

function statusCode(error: unknown): number | undefined {
  return error instanceof HttpException ? error.getStatus() : undefined;
}

describe("StatusesService", () => {
  it("returns only clock-valid statuses and maps mine and partner", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([
        status(BOY_ID),
        status(GIRL_ID, { id: OLD_STATUS_ID }),
      ]);
    const service = new StatusesService(
      { currentStatus: { findMany } } as unknown as PrismaService,
      identityService(),
      clock,
    );

    const result = await service.current("boy");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          coupleId: COUPLE_ID,
          authorId: { in: [BOY_ID, GIRL_ID] },
          state: CurrentStatusState.ACTIVE,
          expiresAt: { gt: NOW },
        }),
      }),
    );
    expect(result.serverNow).toBe(NOW.toISOString());
    expect(result.mine?.author.role).toBe("boy");
    expect(result.partner?.author.role).toBe("girl");
  });

  it("creates a status, expiry job, private notification and outbox atomically", async () => {
    const tx = transaction();
    const { service, prisma } = serviceWith(tx);

    const result = await service.putMine("boy", {
      kind: CurrentStatusKind.NEED_HUG,
      message: "今天有点累",
      needsResponse: true,
      expiresAt: "2026-07-17T08:00:00.000Z",
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.currentStatus.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          coupleId: COUPLE_ID,
          authorId: BOY_ID,
          kind: CurrentStatusKind.NEED_HUG,
          startsAt: NOW,
          expiresAt: new Date("2026-07-17T08:00:00.000Z"),
        }),
      }),
    );
    expect(tx.scheduledEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          type: "STATUS_EXPIRE",
          runAt: new Date("2026-07-17T08:00:00.000Z"),
        }),
      }),
    );
    expect(tx.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          recipientId: GIRL_ID,
          type: "STATUS_RESPONSE_REQUESTED",
        }),
      }),
    );
    expect(tx.outboxEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          aggregateType: "CURRENT_STATUS",
          eventType: "current_status.updated",
        }),
      }),
    );
    expect(result).toMatchObject({
      author: boy,
      kind: CurrentStatusKind.NEED_HUG,
      needsResponse: true,
    });
  });

  it("requires and checks the current version before replacing a status", async () => {
    const tx = transaction();
    tx.currentStatus.findMany.mockResolvedValue([
      {
        id: OLD_STATUS_ID,
        version: 4,
        expiresAt: new Date("2026-07-17T06:00:00.000Z"),
      },
    ]);
    const { service } = serviceWith(tx);

    await expect(
      service.putMine("boy", {
        kind: CurrentStatusKind.BUSY,
        expiresAt: "2026-07-17T08:00:00.000Z",
      }),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 428);
    await expect(
      service.putMine("boy", {
        version: 3,
        kind: CurrentStatusKind.BUSY,
        expiresAt: "2026-07-17T08:00:00.000Z",
      }),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 409);
    expect(tx.currentStatus.create).not.toHaveBeenCalled();
  });

  it("archives the prior active status and cancels its expiry job", async () => {
    const tx = transaction();
    tx.currentStatus.findMany.mockResolvedValue([
      {
        id: OLD_STATUS_ID,
        version: 4,
        expiresAt: new Date("2026-07-17T06:00:00.000Z"),
      },
    ]);
    const { service } = serviceWith(tx);

    await service.putMine("boy", {
      version: 4,
      kind: CurrentStatusKind.HOME,
      expiresAt: "2026-07-17T08:00:00.000Z",
    });

    expect(tx.currentStatus.updateMany).toHaveBeenCalledWith({
      where: {
        id: OLD_STATUS_ID,
        coupleId: COUPLE_ID,
        authorId: BOY_ID,
        state: CurrentStatusState.ACTIVE,
        version: 4,
      },
      data: {
        state: CurrentStatusState.ARCHIVED,
        archivedAt: NOW,
        version: { increment: 1 },
      },
    });
    expect(tx.scheduledEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          dedupeKey: `current-status:${OLD_STATUS_ID}:expire`,
        }),
      }),
    );
  });

  it("does not require an invisible expired status version when replacing it", async () => {
    const tx = transaction();
    tx.currentStatus.findMany.mockResolvedValue([
      {
        id: OLD_STATUS_ID,
        version: 2,
        expiresAt: new Date("2026-07-17T03:59:59.000Z"),
      },
    ]);
    const { service } = serviceWith(tx);

    await expect(
      service.putMine("boy", {
        kind: CurrentStatusKind.HAPPY,
        expiresAt: "2026-07-17T08:00:00.000Z",
      }),
    ).resolves.toMatchObject({ kind: CurrentStatusKind.HAPPY });
    expect(tx.currentStatus.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: [OLD_STATUS_ID] } }),
      }),
    );
  });

  it("rejects past expiry and a custom status without a message", async () => {
    const tx = transaction();
    const { service, prisma } = serviceWith(tx);

    await expect(
      service.putMine("boy", {
        kind: CurrentStatusKind.BUSY,
        expiresAt: NOW.toISOString(),
      }),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 400);
    await expect(
      service.putMine("boy", {
        kind: CurrentStatusKind.CUSTOM,
        expiresAt: "2026-07-17T08:00:00.000Z",
      }),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("ends the caller's current status with optimistic concurrency", async () => {
    const tx = transaction();
    tx.currentStatus.findFirst.mockResolvedValue({
      id: STATUS_ID,
      version: 3,
    });
    const { service } = serviceWith(tx);

    await service.removeMine("boy", 3);

    expect(tx.currentStatus.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          coupleId: COUPLE_ID,
          authorId: BOY_ID,
          expiresAt: { gt: NOW },
        }),
      }),
    );
    expect(tx.currentStatus.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: STATUS_ID, version: 3 }),
        data: expect.objectContaining({
          state: CurrentStatusState.ARCHIVED,
          version: { increment: 1 },
        }),
      }),
    );
    expect(tx.outboxEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          eventType: "current_status.archived",
        }),
      }),
    );
  });

  it("rejects a stale delete without archiving", async () => {
    const tx = transaction();
    tx.currentStatus.findFirst.mockResolvedValue({
      id: STATUS_ID,
      version: 4,
    });
    const { service } = serviceWith(tx);

    await expect(service.removeMine("boy", 3)).rejects.toSatisfy(
      (error: unknown) => statusCode(error) === 409,
    );
    expect(tx.currentStatus.updateMany).not.toHaveBeenCalled();
  });
});
