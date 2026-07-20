import type { NoteView } from "@our-tomorrow/contracts";
import { describe, expect, test } from "vitest";

import { isUnread, noteDecoration, visibleNotes } from "./romantic-model";

function note(
  input: Partial<NoteView> & Pick<NoteView, "id" | "createdAt">,
): NoteView {
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
    },
    recipient: {
      id: "me",
      role: "boy",
      slot: 1,
      displayName: "甲",
    },
    content: "一张便笺",
    icon: "peony",
    image: null,
    readAt: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

describe("romantic home note model", () => {
  test("shows the newest note first", () => {
    const older = note({ id: "older", createdAt: "2026-07-20T08:00:00.000Z" });
    const newer = note({ id: "newer", createdAt: "2026-07-20T09:00:00.000Z" });

    expect(visibleNotes([older, newer]).map(({ id }) => id)).toEqual([
      "newer",
      "older",
    ]);
  });

  test("counts only unread notes received by the current user", () => {
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

  test("uses the peony sticker when an icon is unknown", () => {
    expect(noteDecoration("unknown")).toBe("peony");
    expect(noteDecoration("butterfly")).toBe("butterfly");
  });
});
