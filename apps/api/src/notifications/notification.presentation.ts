import { Prisma, type NotificationStatus } from "@prisma/client";

export const notificationSelect = Prisma.validator<Prisma.NotificationSelect>()(
  {
    id: true,
    type: true,
    title: true,
    body: true,
    payload: true,
    status: true,
    createdAt: true,
    readAt: true,
    archivedAt: true,
  },
);

export type NotificationRecord = Prisma.NotificationGetPayload<{
  select: typeof notificationSelect;
}>;

export type NotificationView = {
  id: string;
  type: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  status: NotificationStatus;
  createdAt: string;
  readAt: string | null;
  archivedAt: string | null;
};

export function toNotificationView(
  notification: NotificationRecord,
): NotificationView {
  const payload =
    notification.payload !== null &&
    !Array.isArray(notification.payload) &&
    typeof notification.payload === "object"
      ? (notification.payload as Record<string, unknown>)
      : {};
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    payload,
    status: notification.status,
    createdAt: notification.createdAt.toISOString(),
    readAt: notification.readAt?.toISOString() ?? null,
    archivedAt: notification.archivedAt?.toISOString() ?? null,
  };
}
