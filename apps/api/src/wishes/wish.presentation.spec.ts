import {
  MediaStatus,
  PlanStatus,
  WishCategory,
  WishStatus,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { CoupleSummary } from "../common/presentation/relationship";
import { toWishDetail, type WishDetailRecord } from "./wish.presentation";

const COUPLE_ID = "00000000-0000-4000-8000-000000000001";
const BOY_ID = "00000000-0000-4000-8000-000000000101";
const GIRL_ID = "00000000-0000-4000-8000-000000000102";
const WISH_ID = "10000000-0000-4000-8000-000000000001";
const PLAN_ID = "20000000-0000-4000-8000-000000000001";
const MEDIA_ID = "30000000-0000-4000-8000-000000000001";
const HIDDEN_MEDIA_ID = "30000000-0000-4000-8000-000000000002";
const MEMORY_ID = "40000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-17T04:00:00.000Z");

const couple: CoupleSummary = {
  id: COUPLE_ID,
  version: 1,
  name: "我们的明天",
  startDate: "2024-01-01",
  timezone: "Asia/Shanghai",
  signature: null,
  theme: "system",
  members: [
    {
      id: BOY_ID,
      version: 1,
      displayName: "甲",
      slot: 1,
      role: "boy",
      nicknameInRelationship: "甲",
      avatarUrl: null,
    },
    {
      id: GIRL_ID,
      version: 1,
      displayName: "乙",
      slot: 2,
      role: "girl",
      nicknameInRelationship: "乙",
      avatarUrl: null,
    },
  ],
};

function record(): WishDetailRecord {
  return {
    id: WISH_ID,
    coupleId: COUPLE_ID,
    title: "去看海",
    description: "一起等日落",
    expectation: "慢慢走",
    category: WishCategory.TRAVEL,
    status: WishStatus.COMPLETED,
    version: 7,
    placeId: null,
    plannedFor: new Date("2026-07-20T04:00:00.000Z"),
    completedAt: NOW,
    completionNote: "终于看到啦",
    completedById: GIRL_ID,
    sourceNoteId: null,
    createdById: BOY_ID,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    place: null,
    media: [
      {
        sortOrder: 0,
        mediaAsset: {
          id: MEDIA_ID,
          originalName: "sunset.jpg",
          mimeType: "image/webp",
          size: 128n,
          width: 1200,
          height: 800,
          status: MediaStatus.READY,
          createdAt: NOW,
          deletedAt: null,
        },
      },
      {
        sortOrder: 1,
        mediaAsset: {
          id: HIDDEN_MEDIA_ID,
          originalName: "pending.jpg",
          mimeType: "image/webp",
          size: 64n,
          width: null,
          height: null,
          status: MediaStatus.PENDING,
          createdAt: NOW,
          deletedAt: null,
        },
      },
    ],
    plan: {
      id: PLAN_ID,
      coupleId: COUPLE_ID,
      wishId: WISH_ID,
      anniversaryId: null,
      placeId: null,
      title: "去看海",
      itinerary: null,
      preparations: ["带相机"],
      participants: ["我们"],
      expectation: "慢慢走",
      startsAt: new Date("2026-07-20T04:00:00.000Z"),
      endsAt: null,
      reminderAt: null,
      anniversaryOccurrenceDate: null,
      status: PlanStatus.COMPLETED,
      version: 4,
      completedAt: NOW,
      cancelledAt: null,
      createdById: BOY_ID,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
      place: null,
    },
    convertedMemory: { id: MEMORY_ID, deletedAt: null },
    updates: [
      {
        id: "50000000-0000-4000-8000-000000000001",
        authorId: GIRL_ID,
        fromStatus: WishStatus.IN_PROGRESS,
        toStatus: WishStatus.COMPLETED,
        note: "终于看到啦",
        createdAt: NOW,
      },
    ],
  };
}

describe("wish presentation", () => {
  it("returns the shared contract shape and exposes only READY media", () => {
    const result = toWishDetail(record(), couple);

    expect(result).toMatchObject({
      id: WISH_ID,
      version: 7,
      status: WishStatus.COMPLETED,
      createdBy: couple.members[0],
      completedBy: couple.members[1],
      convertedMemoryId: MEMORY_ID,
      plan: {
        id: PLAN_ID,
        status: PlanStatus.COMPLETED,
        preparations: ["带相机"],
      },
      updates: [
        {
          author: couple.members[1],
          fromStatus: WishStatus.IN_PROGRESS,
          toStatus: WishStatus.COMPLETED,
        },
      ],
    });
    expect(result.media).toEqual([
      expect.objectContaining({
        id: MEDIA_ID,
        size: 128,
        url: `/api/v1/media/${MEDIA_ID}`,
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain(HIDDEN_MEDIA_ID);
  });
});
