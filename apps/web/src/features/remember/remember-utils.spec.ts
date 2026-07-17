import type { MemoryCardSummary } from "@our-tomorrow/contracts";
import { describe, expect, it } from "vitest";

import {
  fromDateTimeLocal,
  groupMemoriesByMonth,
  imageFileError,
  MAX_IMAGE_BYTES,
  toDateTimeLocal,
  yearInTimeZone,
} from "@/features/remember/remember-utils";

function memory(id: string, happenedAt: string): MemoryCardSummary {
  return {
    id,
    version: 1,
    title: id,
    excerpt: null,
    happenedAt,
    status: "PUBLISHED",
    place: null,
    coverMedia: null,
    tags: [],
    isFirstTime: false,
    firstTimeLabel: null,
    isPinned: false,
    perspectiveSubmittedCount: 0,
    perspectivesComplete: false,
    commentCount: 0,
    reactions: [],
    createdAt: happenedAt,
    updatedAt: happenedAt,
  };
}

describe("remember utilities", () => {
  it("groups an ordered timeline by local month without reordering cards", () => {
    const groups = groupMemoriesByMonth([
      memory("later", "2024-08-20T10:00:00.000Z"),
      memory("earlier", "2024-08-01T10:00:00.000Z"),
      memory("july", "2024-07-15T10:00:00.000Z"),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.items.map((item) => item.id)).toEqual([
      "later",
      "earlier",
    ]);
    expect(groups[1]?.items.map((item) => item.id)).toEqual(["july"]);
  });

  it("rejects unsupported and oversized image files before upload", () => {
    expect(
      imageFileError(new File(["x"], "note.txt", { type: "text/plain" })),
    ).toContain("JPEG、PNG 或 WebP");
    expect(
      imageFileError(
        new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "large.jpg", {
          type: "image/jpeg",
        }),
      ),
    ).toContain("15 MB");
    expect(
      imageFileError(new File(["x"], "photo.webp", { type: "image/webp" })),
    ).toBeNull();
  });

  it("turns a datetime-local value into an ISO instant", () => {
    expect(fromDateTimeLocal("2024-01-01T18:30")).toMatch(
      /^2024-01-01T\d{2}:30:00\.000Z$/,
    );
    expect(fromDateTimeLocal("not-a-date")).toBeNull();
  });

  it("uses the couple timezone for midnight grouping and editing", () => {
    const instant = "2024-07-31T16:30:00.000Z";
    expect(toDateTimeLocal(instant, "Asia/Shanghai")).toBe("2024-08-01T00:30");
    expect(fromDateTimeLocal("2024-08-01T00:30", "Asia/Shanghai")).toBe(
      instant,
    );
    expect(
      groupMemoriesByMonth([memory("midnight", instant)], "Asia/Shanghai")[0]
        ?.key,
    ).toBe("2024-08");
    expect(yearInTimeZone("2024-12-31T16:30:00.000Z", "Asia/Shanghai")).toBe(
      2025,
    );
  });
});
