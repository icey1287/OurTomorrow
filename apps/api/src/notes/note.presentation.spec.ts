import { describe, expect, it } from "vitest";
import type { CoupleSummary } from "../common/presentation/relationship";
import { toNoteView, type NoteRecord } from "./note.presentation";

const BOY_ID = "00000000-0000-4000-8000-000000000101";
const GIRL_ID = "00000000-0000-4000-8000-000000000102";

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
      id: BOY_ID,
      version: 1,
      displayName: "甲",
      slot: 1 as const,
      role: "boy" as const,
      nicknameInRelationship: null,
      avatarUrl: null,
    },
    {
      id: GIRL_ID,
      version: 1,
      displayName: "乙",
      slot: 2 as const,
      role: "girl" as const,
      nicknameInRelationship: null,
      avatarUrl: null,
    },
  ],
} satisfies CoupleSummary;

function scheduledNote(): NoteRecord {
  const createdAt = new Date("2026-07-17T00:00:00.000Z");
  return {
    id: "70000000-0000-4000-8000-000000000001",
    coupleId: couple.id,
    authorId: BOY_ID,
    recipientId: GIRL_ID,
    type: "SURPRISE",
    status: "VISIBLE",
    version: 1,
    content: "今晚看窗外。",
    color: "rose",
    icon: "gift",
    position: 0,
    isPinned: true,
    keepAfterViewed: false,
    showAt: new Date("2026-07-17T12:00:00.000Z"),
    visibleAt: null,
    expiresAt: new Date("2026-07-18T00:00:00.000Z"),
    viewedAt: null,
    archivedAt: null,
    sourceStatusId: null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
}

describe("note presentation", () => {
  it("returns a minimal placeholder to the recipient before server showAt even when persisted status is wrong", () => {
    const view = toNoteView(
      scheduledNote(),
      GIRL_ID,
      couple,
      new Date("2026-07-17T11:59:59.999Z"),
      [],
    );

    expect(view).toEqual({
      id: "70000000-0000-4000-8000-000000000001",
      status: "SCHEDULED",
      isPlaceholder: true,
      author: couple.members[0],
      showAt: "2026-07-17T12:00:00.000Z",
    });
    expect(view).not.toHaveProperty("content");
    expect(view).not.toHaveProperty("type");
    expect(view).not.toHaveProperty("color");
    expect(view).not.toHaveProperty("icon");
    expect(view).not.toHaveProperty("isPinned");
    expect(view).not.toHaveProperty("keepAfterViewed");
  });

  it("allows the author to review an undisplayed note without weakening recipient secrecy", () => {
    const authored = scheduledNote();
    authored.status = "SCHEDULED";
    const view = toNoteView(
      authored,
      BOY_ID,
      couple,
      new Date("2026-07-17T11:00:00.000Z"),
      [],
    );

    expect(view).toMatchObject({
      isPlaceholder: false,
      content: "今晚看窗外。",
      type: "SURPRISE",
      canEdit: true,
    });
  });
});
