import { describe, expect, it } from "vitest";

import {
  addMinutesIso,
  dailyEntryStatusLabel,
  dateTimeLocalToIso,
  isDailyEntryEditable,
  isDailyEntryRevealed,
  localDateInTimeZone,
  noteColorClass,
  noteStatusLabel,
  remainingStatusText,
  statusOption,
} from "@/features/daily/daily-utils";

describe("daily helpers", () => {
  it("maps the persisted state-machine values to calm product copy", () => {
    expect(statusOption("NEED_HUG").label).toBe("需要抱抱");
    expect(statusOption("CUSTOM").label).toBe("自定义此刻");
    expect(noteStatusLabel("SCHEDULED")).toBe("等待揭晓");
    expect(dailyEntryStatusLabel("WAITING_FOR_PARTNER")).toBe("等待对方");
  });

  it("keeps diary editing and reveal boundaries explicit", () => {
    expect(isDailyEntryEditable(undefined)).toBe(true);
    expect(isDailyEntryEditable("EDITING")).toBe(true);
    expect(isDailyEntryEditable("WAITING_FOR_PARTNER")).toBe(false);
    expect(isDailyEntryRevealed("BOTH_SUBMITTED")).toBe(false);
    expect(isDailyEntryRevealed("REVEALED")).toBe(true);
  });

  it("creates absolute instants for server-controlled expiry", () => {
    expect(addMinutesIso("2026-07-17T00:00:00.000Z", 90)).toBe(
      "2026-07-17T01:30:00.000Z",
    );
    expect(dateTimeLocalToIso("not-a-date")).toBeNull();
    expect(dateTimeLocalToIso("")).toBeNull();
  });

  it("derives the couple-local date across UTC day boundaries", () => {
    const instant = new Date("2026-07-16T17:30:00.000Z");
    expect(localDateInTimeZone(instant, "Asia/Shanghai")).toBe("2026-07-17");
    expect(localDateInTimeZone(instant, "America/Los_Angeles")).toBe(
      "2026-07-16",
    );
  });

  it("formats remaining duration without implying a browser-only timer", () => {
    expect(
      remainingStatusText(
        "2026-07-17T02:01:00.000Z",
        "2026-07-17T01:00:00.000Z",
      ),
    ).toBe("约 1 小时 1 分钟后自动结束");
    expect(
      remainingStatusText(
        "2026-07-17T00:59:00.000Z",
        "2026-07-17T01:00:00.000Z",
      ),
    ).toBe("即将自动结束");
  });

  it("uses a safe fallback for legacy note colors", () => {
    expect(noteColorClass("rose")).toContain("rose");
    expect(noteColorClass("legacy-custom-color")).toContain("border-ink");
  });
});
