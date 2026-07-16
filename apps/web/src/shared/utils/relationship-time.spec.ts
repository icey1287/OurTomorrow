import { describe, expect, it } from "vitest";

import {
  relationshipDay,
  relationshipGreeting,
  relationshipTodayLabel,
} from "./relationship-time";

describe("relationship time", () => {
  it("uses the couple time zone for the local calendar day", () => {
    const serverNow = new Date("2026-07-16T16:30:00.000Z");

    expect(relationshipDay("2026-07-16", "Asia/Shanghai", serverNow)).toBe(2);
    expect(relationshipDay("2026-07-16", "Europe/London", serverNow)).toBe(1);
  });

  it("uses the couple time zone for greetings", () => {
    const serverNow = new Date("2026-07-16T00:30:00.000Z");

    expect(relationshipGreeting(serverNow, "Asia/Shanghai")).toBe("早上好");
    expect(relationshipGreeting(serverNow, "America/Los_Angeles")).toBe(
      "下午好",
    );
  });

  it("formats the displayed date in the couple time zone", () => {
    const serverNow = new Date("2026-07-16T16:30:00.000Z");

    expect(relationshipTodayLabel(serverNow, "Asia/Shanghai")).toContain(
      "7月17日",
    );
  });
});
