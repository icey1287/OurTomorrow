import { Inject, Injectable } from "@nestjs/common";
import { NotificationStatus, Prisma } from "@prisma/client";
import { Clock } from "../common/clock/clock";
import {
  resourceNotFound,
  stateConflict,
  validationFailed,
} from "../common/http/api-exception";
import { PrismaService } from "../database/prisma.service";
import type { IdentityRole } from "../identity/identity.constants";
import { IdentityService } from "../identity/identity.service";
import { enqueueOutboxEvent } from "../shared-events/persistent-event";
import type { ListNotificationsQueryDto } from "./dto/notification.dto";
import {
  notificationSelect,
  type NotificationRecord,
  type NotificationView,
  toNotificationView,
} from "./notification.presentation";

type NotificationCursor = {
  version: 1;
  createdAt: string;
  id: string;
};

export type NotificationPage = {
  items: NotificationView[];
  nextCursor: string | null;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function encodeCursor(notification: NotificationRecord): string {
  const cursor: NotificationCursor = {
    version: 1,
    createdAt: notification.createdAt.toISOString(),
    id: notification.id,
  };
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string): NotificationCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<NotificationCursor>;
    const createdAt = new Date(parsed.createdAt ?? "");
    if (
      parsed.version !== 1 ||
      typeof parsed.id !== "string" ||
      !UUID.test(parsed.id) ||
      Number.isNaN(createdAt.valueOf()) ||
      createdAt.toISOString() !== parsed.createdAt
    ) {
      throw new Error("invalid cursor");
    }
    return parsed as NotificationCursor;
  } catch {
    throw validationFailed("cursor is invalid or expired");
  }
}

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(IdentityService)
    private readonly identities: IdentityService,
    @Inject(Clock)
    private readonly clock: Clock,
  ) {}

  async list(
    role: IdentityRole,
    query: ListNotificationsQueryDto,
  ): Promise<NotificationPage> {
    const actor = await this.identities.current(role);
    const limit = query.limit ?? 30;
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const notifications = await this.prisma.notification.findMany({
      where: {
        coupleId: actor.couple.id,
        recipientId: actor.user.id,
        status:
          query.status === undefined
            ? { not: NotificationStatus.ARCHIVED }
            : query.status,
        ...(cursor === null
          ? {}
          : {
              OR: [
                { createdAt: { lt: new Date(cursor.createdAt) } },
                {
                  createdAt: new Date(cursor.createdAt),
                  id: { lt: cursor.id },
                },
              ],
            }),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: notificationSelect,
    });
    const hasMore = notifications.length > limit;
    const page = notifications.slice(0, limit);
    return {
      items: page.map(toNotificationView),
      nextCursor:
        hasMore && page.length > 0
          ? encodeCursor(page[page.length - 1]!)
          : null,
    };
  }

  async unreadCount(role: IdentityRole): Promise<{ count: number }> {
    const actor = await this.identities.current(role);
    const count = await this.prisma.notification.count({
      where: {
        coupleId: actor.couple.id,
        recipientId: actor.user.id,
        status: NotificationStatus.UNREAD,
      },
    });
    return { count };
  }

  async markRead(
    role: IdentityRole,
    notificationId: string,
  ): Promise<NotificationView> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    const notification = await this.serializable(async (transaction) => {
      const existing = await transaction.notification.findFirst({
        where: {
          id: notificationId,
          coupleId: actor.couple.id,
          recipientId: actor.user.id,
        },
        select: notificationSelect,
      });
      if (!existing) throw resourceNotFound();
      if (existing.status !== NotificationStatus.UNREAD) return existing;
      const changed = await transaction.notification.updateMany({
        where: {
          id: notificationId,
          coupleId: actor.couple.id,
          recipientId: actor.user.id,
          status: NotificationStatus.UNREAD,
        },
        data: { status: NotificationStatus.READ, readAt: now },
      });
      if (changed.count !== 1) throw stateConflict();
      await enqueueOutboxEvent(transaction, {
        coupleId: actor.couple.id,
        dedupeKey: `notification:${notificationId}:read`,
        aggregateType: "NOTIFICATION",
        aggregateId: notificationId,
        eventType: "notification.read",
        actorId: actor.user.id,
        recipientId: actor.user.id,
        occurredAt: now,
      });
      const updated = await transaction.notification.findUnique({
        where: { id: notificationId },
        select: notificationSelect,
      });
      if (!updated) throw resourceNotFound();
      return updated;
    });
    return toNotificationView(notification);
  }

  async markAllRead(role: IdentityRole): Promise<{ count: number }> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    const count = await this.serializable(async (transaction) => {
      const unread = await transaction.notification.findMany({
        where: {
          coupleId: actor.couple.id,
          recipientId: actor.user.id,
          status: NotificationStatus.UNREAD,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
      });
      if (unread.length === 0) return 0;
      const ids = unread.map((notification) => notification.id);
      const changed = await transaction.notification.updateMany({
        where: {
          id: { in: ids },
          coupleId: actor.couple.id,
          recipientId: actor.user.id,
          status: NotificationStatus.UNREAD,
        },
        data: { status: NotificationStatus.READ, readAt: now },
      });
      if (changed.count !== ids.length) throw stateConflict();
      for (const notification of unread) {
        await enqueueOutboxEvent(transaction, {
          coupleId: actor.couple.id,
          dedupeKey: `notification:${notification.id}:read`,
          aggregateType: "NOTIFICATION",
          aggregateId: notification.id,
          eventType: "notification.read",
          actorId: actor.user.id,
          recipientId: actor.user.id,
          occurredAt: now,
        });
      }
      return changed.count;
    });
    return { count };
  }

  async archive(
    role: IdentityRole,
    notificationId: string,
  ): Promise<NotificationView> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    const notification = await this.serializable(async (transaction) => {
      const existing = await transaction.notification.findFirst({
        where: {
          id: notificationId,
          coupleId: actor.couple.id,
          recipientId: actor.user.id,
        },
        select: notificationSelect,
      });
      if (!existing) throw resourceNotFound();
      if (existing.status === NotificationStatus.ARCHIVED) return existing;
      const changed = await transaction.notification.updateMany({
        where: {
          id: notificationId,
          coupleId: actor.couple.id,
          recipientId: actor.user.id,
          status: existing.status,
        },
        data: {
          status: NotificationStatus.ARCHIVED,
          archivedAt: now,
          readAt: existing.readAt ?? now,
        },
      });
      if (changed.count !== 1) throw stateConflict();
      await enqueueOutboxEvent(transaction, {
        coupleId: actor.couple.id,
        dedupeKey: `notification:${notificationId}:archived`,
        aggregateType: "NOTIFICATION",
        aggregateId: notificationId,
        eventType: "notification.archived",
        actorId: actor.user.id,
        recipientId: actor.user.id,
        occurredAt: now,
      });
      const updated = await transaction.notification.findUnique({
        where: { id: notificationId },
        select: notificationSelect,
      });
      if (!updated) throw resourceNotFound();
      return updated;
    });
    return toNotificationView(notification);
  }

  private async serializable<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034"
        ) {
          if (attempt < 3) continue;
          throw stateConflict();
        }
        throw error;
      }
    }
    throw stateConflict();
  }
}
