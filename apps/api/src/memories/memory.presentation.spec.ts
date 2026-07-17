import { MediaStatus, MemoryStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { CoupleSummary } from "../common/presentation/relationship";
import { type MemoryDetailRecord, toMemoryDetail } from "./memory.presentation";

const BOY_ID = "00000000-0000-4000-8000-000000000101";
const GIRL_ID = "00000000-0000-4000-8000-000000000102";

const couple: CoupleSummary = {
  id: "00000000-0000-4000-8000-000000000001",
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

function detailRecord(): MemoryDetailRecord {
  const createdAt = new Date("2026-07-15T10:00:00.000Z");
  return {
    id: "10000000-0000-4000-8000-000000000001",
    version: 3,
    title: "雨天散步",
    content: "一起走了很久。",
    happenedAt: new Date("2026-07-14T10:00:00.000Z"),
    status: MemoryStatus.PUBLISHED,
    place: null,
    coverMedia: null,
    tags: [],
    isFirstTime: false,
    firstTimeLabel: null,
    isPinned: false,
    _count: { comments: 1 },
    createdAt,
    updatedAt: createdAt,
    mood: "平静",
    createdById: BOY_ID,
    updatedById: GIRL_ID,
    media: [
      {
        role: "GALLERY",
        sortOrder: 0,
        mediaAsset: {
          id: "20000000-0000-4000-8000-000000000001",
          originalName: "walk.jpg",
          mimeType: "image/webp",
          size: 128n,
          width: 1200,
          height: 800,
          status: MediaStatus.READY,
          createdAt,
          deletedAt: null,
        },
      },
    ],
    perspectives: [
      {
        authorId: BOY_ID,
        content: "这是只有我能先看到的草稿。",
        mood: "期待",
        submittedAt: null,
        version: 2,
        updatedAt: createdAt,
      },
      {
        authorId: GIRL_ID,
        content: "我已经写完啦。",
        mood: "开心",
        submittedAt: createdAt,
        version: 1,
        updatedAt: createdAt,
      },
    ],
    comments: [
      {
        id: "30000000-0000-4000-8000-000000000001",
        authorId: GIRL_ID,
        content: "下次再去。",
        createdAt,
        updatedAt: createdAt,
      },
    ],
  };
}

describe("memory presentation", () => {
  it("hides a partner's unsubmitted perspective without leaking draft state", () => {
    const detail = toMemoryDetail(detailRecord(), GIRL_ID, couple, []);
    const boyPerspective = detail.perspectives.find(
      ({ author }) => author.id === BOY_ID,
    );

    expect(boyPerspective).toEqual({
      author: couple.members[0],
      state: "EMPTY",
      editable: false,
    });
    expect(boyPerspective).not.toHaveProperty("content");
    expect(boyPerspective).not.toHaveProperty("updatedAt");
  });

  it("shows the current role's own draft and exposes no storage keys", () => {
    const detail = toMemoryDetail(detailRecord(), BOY_ID, couple, []);
    const ownPerspective = detail.perspectives.find(
      ({ author }) => author.id === BOY_ID,
    );

    expect(ownPerspective).toMatchObject({
      state: "DRAFT",
      editable: true,
      version: 2,
      content: "这是只有我能先看到的草稿。",
    });
    expect(detail.media[0]?.asset).toEqual(
      expect.objectContaining({
        url: "/api/v1/media/20000000-0000-4000-8000-000000000001",
        size: 128,
      }),
    );
    expect(JSON.stringify(detail)).not.toContain("storageKey");
  });
});
