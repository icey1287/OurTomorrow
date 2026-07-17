import { describe, expect, it, vi } from "vitest";
import type { Clock } from "../common/clock/clock";
import { PrismaService } from "../database/prisma.service";
import { IdentityService } from "../identity/identity.service";
import { NotificationsService } from "./notifications.service";

const COUPLE_ID = "00000000-0000-4000-8000-000000000001";
const GIRL_ID = "00000000-0000-4000-8000-000000000102";
const NOTIFICATION_ID = "80000000-0000-4000-8000-000000000001";
const OUTBOX_ID = "81000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-17T08:00:00.000Z");

const actor = {
  role: "girl" as const,
  user: { id: GIRL_ID },
  couple: { id: COUPLE_ID },
};

function notification(status: "UNREAD" | "READ" | "ARCHIVED") {
  return {
    id: NOTIFICATION_ID,
    type: "NOTE_VISIBLE",
    title: "明天有新动态",
    body: "你收到了一条来自明天的新消息。",
    payload: { resourceType: "NOTE", resourceId: "note" },
    status,
    createdAt: NOW,
    readAt: status === "UNREAD" ? null : NOW,
    archivedAt: status === "ARCHIVED" ? NOW : null,
  };
}

function identities(): IdentityService {
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

describe("NotificationsService", () => {
  it("scopes unread counts to the current couple and recipient", async () => {
    const count = vi.fn().mockResolvedValue(2);
    const service = new NotificationsService(
      { notification: { count } } as unknown as PrismaService,
      identities(),
      clock(),
    );

    await expect(service.unreadCount("girl")).resolves.toEqual({ count: 2 });
    expect(count).toHaveBeenCalledWith({
      where: {
        coupleId: COUPLE_ID,
        recipientId: GIRL_ID,
        status: "UNREAD",
      },
    });
  });

  it("marks one notification read conditionally and emits content-free outbox metadata", async () => {
    const transaction = {
      notification: {
        findFirst: vi.fn().mockResolvedValue(notification("UNREAD")),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue(notification("READ")),
      },
      outboxEvent: {
        upsert: vi.fn().mockResolvedValue({ id: OUTBOX_ID }),
      },
      scheduledEvent: {
        upsert: vi.fn().mockResolvedValue({ id: "event" }),
      },
    };
    const service = new NotificationsService(
      {
        $transaction: vi.fn(async (operation) => operation(transaction)),
      } as unknown as PrismaService,
      identities(),
      clock(),
    );

    const result = await service.markRead("girl", NOTIFICATION_ID);

    expect(transaction.notification.updateMany).toHaveBeenCalledWith({
      where: {
        id: NOTIFICATION_ID,
        coupleId: COUPLE_ID,
        recipientId: GIRL_ID,
        status: "UNREAD",
      },
      data: { status: "READ", readAt: NOW },
    });
    const outboxCall = transaction.outboxEvent.upsert.mock.calls[0]?.[0];
    expect(outboxCall.create.payload).toEqual(
      expect.objectContaining({
        aggregateId: NOTIFICATION_ID,
        actorId: GIRL_ID,
      }),
    );
    expect(outboxCall.create.payload).not.toHaveProperty("body");
    expect(outboxCall.create.payload).not.toHaveProperty("title");
    expect(result.status).toBe("READ");
  });
});
