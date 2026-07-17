import type { NotificationView } from "@our-tomorrow/contracts";
import { describe, expect, it } from "vitest";

import {
  formatNotificationTime,
  notificationCopy,
  notificationState,
  unreadBadgeLabel,
} from "./notification-utils";

describe("formatNotificationTime", () => {
  const now = new Date("2026-07-17T03:00:00.000Z");

  it("uses the couple timezone for today and yesterday labels", () => {
    expect(
      formatNotificationTime("2026-07-17T00:05:00.000Z", "Asia/Shanghai", now),
    ).toBe("今天 08:05");
    expect(
      formatNotificationTime("2026-07-16T12:30:00.000Z", "Asia/Shanghai", now),
    ).toBe("昨天 20:30");
  });

  it("includes the year only when it differs from the current year", () => {
    expect(
      formatNotificationTime("2026-06-01T01:02:00.000Z", "Asia/Shanghai", now),
    ).toBe("6月1日 09:02");
    expect(
      formatNotificationTime("2025-12-30T16:00:00.000Z", "Asia/Shanghai", now),
    ).toBe("2025年12月31日 00:00");
  });

  it("falls back safely for invalid instants or timezones", () => {
    expect(formatNotificationTime("not-a-date", "Asia/Shanghai", now)).toBe(
      "时间未知",
    );
    expect(
      formatNotificationTime("2026-07-17T00:05:00.000Z", "Not/A-Timezone", now),
    ).toBe("时间未知");
  });
});

describe("notification presentation helpers", () => {
  it("renders backend copy without exposing payload values", () => {
    const notification: NotificationView = {
      id: "8db9a847-6f65-4e67-811c-d9ae8d92d74b",
      type: "NOTE_VISIBLE",
      title: "你收到了一条新纸条",
      body: "打开明天，看看对方留下的新消息。",
      payload: { privateBody: "这段私密内容绝不能出现在通知中心" },
      status: "UNREAD",
      createdAt: "2026-07-17T00:05:00.000Z",
      readAt: null,
      archivedAt: null,
    };

    const copy = notificationCopy(notification);
    expect(copy).toEqual({
      title: "你收到了一条新纸条",
      body: "打开明天，看看对方留下的新消息。",
    });
    expect(JSON.stringify(copy)).not.toContain("私密内容");
  });

  it("provides generic copy when the backend fields are empty", () => {
    expect(notificationCopy({ title: " ", body: "" })).toEqual({
      title: "明天有一条新消息",
      body: "打开明天，看看刚刚发生的变化。",
    });
  });

  it("normalizes read states and caps the badge", () => {
    expect(notificationState("UNREAD")).toEqual({
      isUnread: true,
      label: "未读",
    });
    expect(notificationState("READ")).toEqual({
      isUnread: false,
      label: "已读",
    });
    expect(notificationState("ARCHIVED")).toEqual({
      isUnread: false,
      label: "已归档",
    });
    expect(unreadBadgeLabel(0)).toBeNull();
    expect(unreadBadgeLabel(8)).toBe("8");
    expect(unreadBadgeLabel(108)).toBe("99+");
    expect(unreadBadgeLabel(Number.NaN)).toBeNull();
  });
});
