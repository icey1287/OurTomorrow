import { AnnualReviewStatus, MediaStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  annualReviewStatistics,
  toAnnualReviewView,
  type AnnualReviewRecord,
} from "./annual-review.presentation";

const couple = {
  id: "00000000-0000-4000-8000-000000000001",
  version: 1,
  name: "我们的明天",
  startDate: "2024-01-01",
  timezone: "Asia/Shanghai",
  signature: null,
  theme: "system" as const,
  members: [
    {
      id: "00000000-0000-4000-8000-000000000011",
      version: 1,
      displayName: "甲",
      role: "boy" as const,
      slot: 1 as const,
      nicknameInRelationship: null,
      avatarUrl: null,
    },
    {
      id: "00000000-0000-4000-8000-000000000012",
      version: 1,
      displayName: "乙",
      role: "girl" as const,
      slot: 2 as const,
      nicknameInRelationship: null,
      avatarUrl: null,
    },
  ],
};

describe("annual review presentation", () => {
  it("normalizes untrusted JSON statistics", () => {
    expect(
      annualReviewStatistics({
        memories: 12,
        places: -1,
        completedWishes: "3",
        photos: 8,
      }),
    ).toEqual({ memories: 12, places: 0, completedWishes: 0, photos: 8 });
  });

  it("only exposes ready selected media and editability for the current role", () => {
    const now = new Date("2026-01-02T00:00:00.000Z");
    const review = {
      id: "10000000-0000-4000-8000-000000000001",
      coupleId: couple.id,
      year: 2025,
      status: AnnualReviewStatus.READY,
      version: 3,
      statistics: { memories: 1, places: 1, completedWishes: 0, photos: 1 },
      keywords: ["旅行"],
      nextYearLetter: null,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
      contributions: [
        {
          authorId: couple.members[0]!.id,
          message: "这一年很好。",
          selectedMedia: {
            id: "20000000-0000-4000-8000-000000000001",
            originalName: "year.jpg",
            mimeType: "image/jpeg",
            size: 42n,
            width: 10,
            height: 10,
            status: MediaStatus.READY,
            createdAt: now,
            deletedAt: null,
          },
        },
      ],
    } as AnnualReviewRecord;
    const view = toAnnualReviewView(review, couple, couple.members[0]!.id);
    expect(view.contributions[0]).toMatchObject({
      role: "boy",
      editable: true,
      selectedMedia: { originalName: "year.jpg" },
    });
  });
});
