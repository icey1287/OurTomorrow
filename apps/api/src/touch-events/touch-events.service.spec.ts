import { HttpException } from "@nestjs/common";
import { Prisma, TouchEventKind } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { Clock } from "../common/clock/clock";
import type { PrismaService } from "../database/prisma.service";
import type { IdentityService } from "../identity/identity.service";
import {
  TOUCH_COOLDOWN_MS,
  TOUCH_HOURLY_LIMIT,
  TouchEventsService,
} from "./touch-events.service";

const COUPLE_ID = "00000000-0000-4000-8000-000000000001";
const BOY_ID = "00000000-0000-4000-8000-000000000101";
const GIRL_ID = "00000000-0000-4000-8000-000000000102";
const TOUCH_ID = "60000000-0000-4000-8000-000000000001";
const OUTBOX_ID = "60000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-07-17T08:30:00.000Z");

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

function identityService(): IdentityService {
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

function touchRecord() {
  return {
    id: TOUCH_ID,
    senderId: BOY_ID,
    recipientId: GIRL_ID,
    kind: TouchEventKind.HUG,
    createdAt: NOW,
    deliveredAt: NOW,
    readAt: null,
  };
}

function transaction() {
  return {
    touchEvent: {
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          ...touchRecord(),
          id: data.id,
          kind: data.kind,
        }),
      ),
    },
    notification: {
      upsert: vi.fn().mockResolvedValue({ id: "notification" }),
    },
    outboxEvent: {
      upsert: vi.fn().mockResolvedValue({ id: OUTBOX_ID }),
    },
    scheduledEvent: {
      upsert: vi.fn().mockResolvedValue({ id: "outbox-retry" }),
    },
  };
}

function serviceWith(tx: ReturnType<typeof transaction>) {
  const prisma = {
    $transaction: vi.fn(async (operation) => operation(tx)),
  } as unknown as PrismaService;
  return {
    service: new TouchEventsService(prisma, identityService(), clock()),
    prisma,
  };
}

function statusCode(error: unknown): number | undefined {
  return error instanceof HttpException ? error.getStatus() : undefined;
}

describe("TouchEventsService", () => {
  it("derives the fixed partner and persists only a minimal realtime event", async () => {
    const tx = transaction();
    const { service, prisma } = serviceWith(tx);

    const result = await service.create("boy", { kind: TouchEventKind.HUG });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(tx.touchEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          coupleId: COUPLE_ID,
          senderId: BOY_ID,
          recipientId: GIRL_ID,
          deliveredAt: NOW,
        }),
      }),
    );
    expect(tx.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          recipientId: GIRL_ID,
          type: "TOUCH_EVENT_RECEIVED",
          title: "明天有新动态",
          body: "你收到了一条来自明天的新消息。",
          payload: {
            resourceType: "TOUCH_EVENT",
            resourceId: expect.any(String),
            kind: TouchEventKind.HUG,
          },
        }),
      }),
    );
    expect(tx.outboxEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          eventType: "touch.HUG",
          payload: expect.objectContaining({
            aggregateId: expect.any(String),
            actorId: BOY_ID,
            recipientId: GIRL_ID,
          }),
        }),
      }),
    );
    expect(result).toMatchObject({
      kind: TouchEventKind.HUG,
      direction: "SENT",
    });
    expect(result).not.toHaveProperty("message");
    expect(tx.touchEvent.create.mock.calls[0]?.[0].data).not.toHaveProperty(
      "message",
    );
  });

  it("returns 429 during the 30 second sender cooldown", async () => {
    const tx = transaction();
    tx.touchEvent.findFirst.mockResolvedValue({
      createdAt: new Date(NOW.getTime() - TOUCH_COOLDOWN_MS + 1_000),
    });
    const { service } = serviceWith(tx);

    await expect(
      service.create("boy", { kind: TouchEventKind.MISS_YOU }),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 429);

    expect(tx.touchEvent.create).not.toHaveBeenCalled();
    expect(tx.notification.upsert).not.toHaveBeenCalled();
  });

  it("returns 429 after twelve signals in a sliding hour", async () => {
    const tx = transaction();
    tx.touchEvent.count.mockResolvedValue(TOUCH_HOURLY_LIMIT);
    tx.touchEvent.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      createdAt: new Date(NOW.getTime() - 45 * 60 * 1_000),
    });
    const { service } = serviceWith(tx);

    await expect(
      service.create("boy", { kind: TouchEventKind.CHEER }),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 429);

    expect(tx.touchEvent.create).not.toHaveBeenCalled();
  });

  it("retries a serialization loser and then observes the winning cooldown row", async () => {
    const tx = transaction();
    tx.touchEvent.findFirst.mockResolvedValue({ createdAt: NOW });
    const serializationError = new Prisma.PrismaClientKnownRequestError(
      "serialization conflict",
      { code: "P2034", clientVersion: "test" },
    );
    const prisma = {
      $transaction: vi
        .fn()
        .mockRejectedValueOnce(serializationError)
        .mockImplementationOnce(async (operation) => operation(tx)),
    } as unknown as PrismaService;
    const service = new TouchEventsService(prisma, identityService(), clock());

    await expect(
      service.create("boy", { kind: TouchEventKind.KISS }),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 429);

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(tx.touchEvent.create).not.toHaveBeenCalled();
  });
});
