import type { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import type { Clock } from "../common/clock/clock";
import type { Environment } from "../config/env.schema";
import type { PrismaService } from "../database/prisma.service";
import type { RealtimeGateway } from "./realtime.gateway";
import { RealtimeRelayService } from "./realtime-relay.service";

describe("RealtimeRelayService", () => {
  it("relays published outbox rows with a minimal payload", async () => {
    const publishedAt = new Date("2026-07-17T00:00:01.000Z");
    const findMany = vi.fn(async () => [
      {
        id: "90000000-0000-4000-8000-000000000001",
        coupleId: "00000000-0000-4000-8000-000000000001",
        aggregateId: "80000000-0000-4000-8000-000000000001",
        eventType: "note.visible",
        payload: {
          recipientId: "00000000-0000-4000-8000-000000000102",
          resourceId: "80000000-0000-4000-8000-000000000001",
        },
        publishedAt,
      },
    ]);
    const publish = vi.fn();
    const relay = new RealtimeRelayService(
      {
        get: vi.fn((key: string) => (key === "WORKER_BATCH_SIZE" ? 20 : 1_000)),
      } as unknown as ConfigService<Environment, true>,
      { outboxEvent: { findMany } } as unknown as PrismaService,
      {
        now: vi.fn(() => new Date("2026-07-17T00:00:00.000Z")),
        localDate: vi.fn(),
      } as unknown as Clock,
      { publish } as unknown as RealtimeGateway,
    );

    await relay.poll();

    expect(publish).toHaveBeenCalledWith(
      {
        coupleId: "00000000-0000-4000-8000-000000000001",
        recipientIds: ["00000000-0000-4000-8000-000000000102"],
      },
      {
        id: "90000000-0000-4000-8000-000000000001",
        type: "note.visible",
        resourceId: "80000000-0000-4000-8000-000000000001",
        occurredAt: publishedAt.toISOString(),
      },
    );
  });

  it("relays every stage-four domain event family without exposing outbox payloads", async () => {
    const publishedAt = new Date("2026-07-17T00:00:01.000Z");
    const eventTypes = [
      "wish.completed",
      "plan.reminder.due",
      "anniversary.updated",
      "capsule.unlocked",
      "conversion.completed",
    ];
    const findMany = vi.fn(async () =>
      eventTypes.map((eventType, index) => ({
        id: `90000000-0000-4000-8000-00000000000${index + 1}`,
        coupleId: "00000000-0000-4000-8000-000000000001",
        aggregateId: `80000000-0000-4000-8000-00000000000${index + 1}`,
        eventType,
        payload: {
          recipientIds: ["00000000-0000-4000-8000-000000000101"],
          resourceId: `80000000-0000-4000-8000-00000000000${index + 1}`,
          secret: "must-not-be-relayed",
        },
        publishedAt,
      })),
    );
    const publish = vi.fn();
    const relay = new RealtimeRelayService(
      {
        get: vi.fn((key: string) => (key === "WORKER_BATCH_SIZE" ? 20 : 1_000)),
      } as unknown as ConfigService<Environment, true>,
      { outboxEvent: { findMany } } as unknown as PrismaService,
      {
        now: vi.fn(() => new Date("2026-07-17T00:00:00.000Z")),
        localDate: vi.fn(),
      } as unknown as Clock,
      { publish } as unknown as RealtimeGateway,
    );

    await relay.poll();

    expect(publish).toHaveBeenCalledTimes(eventTypes.length);
    expect(publish.mock.calls.map(([, event]) => event.type)).toEqual(
      eventTypes,
    );
    for (const [, realtimeEvent] of publish.mock.calls) {
      expect(realtimeEvent).not.toHaveProperty("secret");
      expect(realtimeEvent).toEqual({
        id: expect.any(String),
        type: expect.any(String),
        resourceId: expect.any(String),
        occurredAt: publishedAt.toISOString(),
      });
    }
  });
});
