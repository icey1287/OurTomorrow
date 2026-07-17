import type {
  NotificationStatus,
  NotificationView,
} from "@our-tomorrow/contracts";

const DAY_IN_MILLISECONDS = 86_400_000;

interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export interface NotificationCopy {
  title: string;
  body: string;
}

export interface NotificationState {
  isUnread: boolean;
  label: "未读" | "已读" | "已归档";
}

function localParts(
  value: string | Date,
  timeZone: string,
): LocalDateTimeParts | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return null;

  try {
    const parts = new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone,
    }).formatToParts(date);
    const numberPart = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    const result = {
      year: numberPart("year"),
      month: numberPart("month"),
      day: numberPart("day"),
      hour: numberPart("hour"),
      minute: numberPart("minute"),
    };

    return Object.values(result).every(Number.isFinite) ? result : null;
  } catch {
    return null;
  }
}

function calendarOrdinal(parts: LocalDateTimeParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_IN_MILLISECONDS;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

/** Formats an instant in the couple timezone without relying on device locale. */
export function formatNotificationTime(
  value: string,
  timeZone: string,
  now: Date = new Date(),
): string {
  const target = localParts(value, timeZone);
  const current = localParts(now, timeZone);
  if (!target || !current) return "时间未知";

  const time = `${twoDigits(target.hour)}:${twoDigits(target.minute)}`;
  const daysAgo = calendarOrdinal(current) - calendarOrdinal(target);
  if (daysAgo === 0) return `今天 ${time}`;
  if (daysAgo === 1) return `昨天 ${time}`;
  if (target.year === current.year) {
    return `${target.month}月${target.day}日 ${time}`;
  }
  return `${target.year}年${target.month}月${target.day}日 ${time}`;
}

/** Keeps notification rendering independent from potentially private payload data. */
export function notificationCopy(
  notification: Pick<NotificationView, "title" | "body">,
): NotificationCopy {
  return {
    title: notification.title.trim() || "明天有一条新消息",
    body: notification.body.trim() || "打开明天，看看刚刚发生的变化。",
  };
}

export function notificationState(
  status: NotificationStatus,
): NotificationState {
  if (status === "UNREAD") return { isUnread: true, label: "未读" };
  if (status === "ARCHIVED") return { isUnread: false, label: "已归档" };
  return { isUnread: false, label: "已读" };
}

export function unreadBadgeLabel(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  const wholeCount = Math.floor(count);
  return wholeCount > 99 ? "99+" : String(wholeCount);
}
