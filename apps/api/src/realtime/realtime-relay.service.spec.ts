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
});
