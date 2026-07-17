import type { NoteStatus, NoteType } from "@prisma/client";
import type {
  CoupleSummary,
  UserSummary,
} from "../common/presentation/relationship";
import {
  toReactionSummaries,
  type ReactionRecord,
  type ReactionSummary,
} from "../memories/memory.presentation";

export type NoteRecord = {
  id: string;
  coupleId: string;
  authorId: string;
  recipientId: string;
  type: NoteType;
  status: NoteStatus;
  version: number;
  content: string;
  color: string | null;
  icon: string | null;
  position: number;
  isPinned: boolean;
  keepAfterViewed: boolean;
  showAt: Date | null;
  visibleAt: Date | null;
  expiresAt: Date | null;
  viewedAt: Date | null;
  archivedAt: Date | null;
  sourceStatusId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type ScheduledNotePlaceholder = {
  id: string;
  status: "SCHEDULED";
  isPlaceholder: true;
  author: UserSummary;
  showAt: string;
};

export type VisibleNote = {
  id: string;
  version: number;
  type: NoteType;
  status: NoteStatus;
  isPlaceholder: false;
  content: string;
  color: string | null;
  icon: string | null;
  position: number;
  isPinned: boolean;
  keepAfterViewed: boolean;
  showAt: string | null;
  visibleAt: string | null;
  expiresAt: string | null;
  viewedAt: string | null;
  archivedAt: string | null;
  sourceStatusId: string | null;
  author: UserSummary;
  recipient: UserSummary;
  reactions: ReactionSummary[];
  canEdit: boolean;
  canDelete: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NoteView = ScheduledNotePlaceholder | VisibleNote;

function member(couple: CoupleSummary, userId: string): UserSummary {
  const user = couple.members.find((candidate) => candidate.id === userId);
  if (!user) throw new Error("Note references a non-member user");
  return user;
}

export function effectiveNoteStatus(
  note: Pick<NoteRecord, "status" | "showAt" | "expiresAt">,
  now: Date,
): NoteStatus {
  if (
    note.expiresAt !== null &&
    note.expiresAt <= now &&
    (note.status === "SCHEDULED" ||
      note.status === "VISIBLE" ||
      note.status === "VIEWED")
  ) {
    return "EXPIRED";
  }
  if (
    note.status === "SCHEDULED" &&
    (note.showAt === null || note.showAt <= now)
  ) {
    return "VISIBLE";
  }
  return note.status;
}

export function isNoteRevealable(
  note: NoteRecord,
  actorId: string,
  now: Date,
): boolean {
  if (note.authorId === actorId) return true;
  if (note.recipientId !== actorId || note.status === "DRAFT") return false;
  return note.showAt === null || note.showAt <= now;
}

export function toNoteView(
  note: NoteRecord,
  actorId: string,
  couple: CoupleSummary,
  now: Date,
  reactions: ReactionRecord[],
): NoteView {
  const author = member(couple, note.authorId);
  if (
    note.recipientId === actorId &&
    note.status !== "DRAFT" &&
    note.showAt !== null &&
    note.showAt > now
  ) {
    return {
      id: note.id,
      status: "SCHEDULED",
      isPlaceholder: true,
      author,
      showAt: note.showAt.toISOString(),
    };
  }

  const effectiveStatus = effectiveNoteStatus(note, now);
  const hasBeenDisplayed =
    note.visibleAt !== null ||
    (note.status === "SCHEDULED" &&
      note.showAt !== null &&
      note.showAt <= now) ||
    note.status === "VISIBLE" ||
    note.status === "VIEWED" ||
    note.status === "ARCHIVED" ||
    note.status === "EXPIRED";
  return {
    id: note.id,
    version: note.version,
    type: note.type,
    status: effectiveStatus,
    isPlaceholder: false,
    content: note.content,
    color: note.color,
    icon: note.icon,
    position: note.position,
    isPinned: note.isPinned,
    keepAfterViewed: note.keepAfterViewed,
    showAt: note.showAt?.toISOString() ?? null,
    visibleAt:
      note.visibleAt?.toISOString() ??
      (effectiveStatus === "VISIBLE" && note.showAt !== null
        ? note.showAt.toISOString()
        : null),
    expiresAt: note.expiresAt?.toISOString() ?? null,
    viewedAt: note.viewedAt?.toISOString() ?? null,
    archivedAt: note.archivedAt?.toISOString() ?? null,
    sourceStatusId: note.sourceStatusId,
    author,
    recipient: member(couple, note.recipientId),
    reactions: toReactionSummaries(reactions, actorId),
    canEdit: note.authorId === actorId && !hasBeenDisplayed,
    canDelete:
      note.authorId === actorId ||
      (note.recipientId === actorId && hasBeenDisplayed),
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}
