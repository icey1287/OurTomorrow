import { describe, expect, it } from "vitest";
import {
  anniversaryReminderInstant,
  instantToPlainDate,
  nextAnniversaryOccurrence,
  plainDateStartInstant,
} from "./calendar";

describe("calendar utilities", () => {
  it("maps instants and local date starts in Asia/Shanghai", () => {
    expect(
      instantToPlainDate(
        new Date("2026-07-16T16:00:00.000Z"),
        "Asia/Shanghai",
      ).toString(),
    ).toBe("2026-07-17");
    expect(
      plainDateStartInstant("2026-07-17", "Asia/Shanghai").toString(),
    ).toBe("2026-07-16T16:00:00Z");
  });

  it("uses the correct New York offset at DST date boundaries", () => {
    expect(
      plainDateStartInstant("2024-03-10", "America/New_York").toString(),
    ).toBe("2024-03-10T05:00:00Z");
    expect(
      plainDateStartInstant("2024-11-03", "America/New_York").toString(),
    ).toBe("2024-11-03T04:00:00Z");
  });

  it("returns a one-off anniversary only while it is upcoming", () => {
    expect(
      nextAnniversaryOccurrence(
        "2026-07-17",
        "NONE",
        "FEBRUARY_28",
        "2026-07-17",
      )?.toString(),
    ).toBe("2026-07-17");
    expect(
      nextAnniversaryOccurrence(
        "2026-07-17",
        "NONE",
        "FEBRUARY_28",
        "2026-07-18",
      ),
    ).toBeNull();
  });

  it("rolls yearly anniversaries to the next local occurrence", () => {
    expect(
      nextAnniversaryOccurrence(
        "2026-08-12",
        "YEARLY",
        "FEBRUARY_28",
        "2025-01-01",
      )?.toString(),
    ).toBe("2026-08-12");
    expect(
      nextAnniversaryOccurrence(
        "2020-08-12",
        "YEARLY",
        "FEBRUARY_28",
        "2026-08-11",
      )?.toString(),
    ).toBe("2026-08-12");
    expect(
      nextAnniversaryOccurrence(
        "2020-08-12",
        "YEARLY",
        "FEBRUARY_28",
        "2026-08-13",
      )?.toString(),
    ).toBe("2027-08-12");
  });

  it("honours both leap-day rules in non-leap years", () => {
    expect(
      nextAnniversaryOccurrence(
        "2024-02-29",
        "YEARLY",
        "FEBRUARY_28",
        "2025-01-01",
      )?.toString(),
    ).toBe("2025-02-28");
    expect(
      nextAnniversaryOccurrence(
        "2024-02-29",
        "YEARLY",
        "MARCH_1",
        "2025-01-01",
      )?.toString(),
    ).toBe("2025-03-01");
    expect(
      nextAnniversaryOccurrence(
        "2024-02-29",
        "YEARLY",
        "MARCH_1",
        "2028-01-01",
      )?.toString(),
    ).toBe("2028-02-29");
  });

  it("resolves reminder wall times through New York DST transitions", () => {
    expect(
      anniversaryReminderInstant(
        "2024-03-10",
        0,
        2 * 60 + 30,
        "America/New_York",
      ).toString(),
    ).toBe("2024-03-10T07:30:00Z");
    expect(
      anniversaryReminderInstant(
        "2024-11-03",
        0,
        1 * 60 + 30,
        "America/New_York",
      ).toString(),
    ).toBe("2024-11-03T05:30:00Z");
  });

  it("validates normalized reminder inputs", () => {
    expect(() =>
      anniversaryReminderInstant("2026-07-17", -1, 540, "Asia/Shanghai"),
    ).toThrow("daysBefore must be a non-negative integer");
    expect(() =>
      anniversaryReminderInstant("2026-07-17", 0, 1_440, "Asia/Shanghai"),
    ).toThrow("minuteOfDay must be an integer from 0 to 1439");
  });
});
