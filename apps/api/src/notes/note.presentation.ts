import { Prisma } from "@prisma/client";
import type { CoupleSummary } from "../common/presentation/relationship";

type NoteImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export const noteSelect = Prisma.validator<Prisma.NoteSelect>()({
  id: true,
  authorId: true,
  recipientId: true,
  version: true,
  content: true,
  icon: true,
  imageMimeType: true,
  imageSizeBytes: true,
  readAt: true,
  createdAt: true,
  updatedAt: true,
});

export type NoteRecord = Prisma.NoteGetPayload<{ select: typeof noteSelect }>;

export type NoteView = {
  id: string;
  version: number;
  status: "VISIBLE" | "VIEWED";
  content: string;
  icon: string | null;
  image: {
    mimeType: NoteImageMimeType;
    sizeBytes: number;
  } | null;
  author: CoupleSummary["members"][number];
  recipient: CoupleSummary["members"][number];
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function member(couple: CoupleSummary, userId: string) {
  const user = couple.members.find((candidate) => candidate.id === userId);
  if (!user) throw new Error("Note references a non-member user");
  return user;
}

export function toNoteView(note: NoteRecord, couple: CoupleSummary): NoteView {
  return {
    id: note.id,
    version: note.version,
    status: note.readAt ? "VIEWED" : "VISIBLE",
    content: note.content,
    icon: note.icon,
    image:
      note.imageMimeType && note.imageSizeBytes !== null
        ? {
            mimeType: note.imageMimeType as NoteImageMimeType,
            sizeBytes: note.imageSizeBytes,
          }
        : null,
    author: member(couple, note.authorId),
    recipient: member(couple, note.recipientId),
    readAt: note.readAt?.toISOString() ?? null,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}
