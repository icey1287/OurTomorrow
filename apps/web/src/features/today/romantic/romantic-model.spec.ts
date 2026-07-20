import type { NoteView, VisibleNoteView } from "@our-tomorrow/contracts";
import { describe, expect, test } from "vitest";

import { isUnread, noteDecoration, visibleNotes } from "./romantic-model";

function note(
  input: Partial<VisibleNoteView> & Pick<VisibleNoteView, "id" | "createdAt">,
): VisibleNoteView {
  const { id, createdAt, ...overrides } = input;
  return {
    id,
    version: 1,
    status: "VISIBLE",
    author: {
      id: "partner",
      role: "girl",
      slot: 2,
      displayName: "乙",
      nicknameInRelationship: "乙",
      avatarUrl: null,
      version: 1,
    },
    recipient: {
      id: "me",
      role: "boy",
      slot: 1,
      displayName: "甲",
      nicknameInRelationship: "甲",
      avatarUrl: null,
      version: 1,
    },
    type: "LOVE",
    content: "一张便笺",
    color: null,
    icon: "peony",
    position: 0,
    isPinned: false,
    keepAfterViewed: true,
    showAt: null,
    visibleAt: createdAt,
    expiresAt: null,
    viewedAt: null,
    archivedAt: null,
    sourceStatusId: null,
    createdAt,
    updatedAt: createdAt,
    isPlaceholder: false,
    canEdit: false,
    canDelete: true,
    reactions: [],
    ...overrides,
  };
}

describe("romantic home note model", () => {
  test("shows the newest revealed note regardless of service wall ordering", () => {
    const older = note({ id: "older", createdAt: "2026-07-20T08:00:00.000Z" });
    const newer = note({ id: "newer", createdAt: "2026-07-20T09:00:00.000Z" });
    const scheduled: NoteView = {
      id: "scheduled",
      status: "SCHEDULED",
      author: newer.author,
      showAt: "2026-07-21T09:00:00.000Z",
      isPlaceholder: true,
    };

    expect(visibleNotes([older, scheduled, newer]).map(({ id }) => id)).toEqual(
      ["newer", "older"],
    );
  });

  test("counts only visible notes received by the current user as unread", () => {
    const incoming = note({
      id: "incoming",
      createdAt: "2026-07-20T09:00:00.000Z",
    });
    const read = note({
      id: "read",
      createdAt: "2026-07-20T08:00:00.000Z",
      status: "VIEWED",
    });
    const outgoing = note({
      id: "outgoing",
      createdAt: "2026-07-20T07:00:00.000Z",
      author: incoming.recipient,
      recipient: incoming.author,
    });

    expect(isUnread(incoming, "me")).toBe(true);
    expect(isUnread(read, "me")).toBe(false);
    expect(isUnread(outgoing, "me")).toBe(false);
  });

  test("falls back to the peony sticker for legacy note icons", () => {
    expect(noteDecoration("💌")).toBe("peony");
    expect(noteDecoration("butterfly")).toBe("butterfly");
  });
});
