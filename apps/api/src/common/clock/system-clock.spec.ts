import { afterEach, describe, expect, it, vi } from "vitest";
import { SystemClock } from "./system-clock";

describe("SystemClock", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the current server instant", () => {
    const instant = new Date("2026-07-16T12:34:56.789Z");
    vi.useFakeTimers();
    vi.setSystemTime(instant);

    expect(new SystemClock().now()).toEqual(instant);
  });

  it("derives a calendar date in the requested IANA time zone", () => {
    const clock = new SystemClock();
    const instant = new Date("2026-01-01T00:30:00.000Z");

    expect(clock.localDate("Asia/Shanghai", instant)).toBe("2026-01-01");
    expect(clock.localDate("America/Los_Angeles", instant)).toBe("2025-12-31");
  });

  it("uses time-zone rules rather than a fixed offset around daylight saving changes", () => {
    const clock = new SystemClock();

    expect(
      clock.localDate("America/New_York", new Date("2026-03-08T04:30:00.000Z")),
    ).toBe("2026-03-07");
    expect(
      clock.localDate("America/New_York", new Date("2026-03-08T07:30:00.000Z")),
    ).toBe("2026-03-08");
  });
});
