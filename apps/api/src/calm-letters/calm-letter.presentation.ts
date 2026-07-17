import {
  CalmLetterStatus,
  Prisma,
  type CalmLetterPurpose,
} from "@prisma/client";

export const calmLetterMetadataSelect =
  Prisma.validator<Prisma.CalmLetterSelect>()({
    id: true,
    coupleId: true,
    authorId: true,
    recipientId: true,
    purpose: true,
    status: true,
    version: true,
    unlockAt: true,
    sentAt: true,
    openedAt: true,
    createdAt: true,
    deletedAt: true,
  });

export const calmLetterContentSelect =
  Prisma.validator<Prisma.CalmLetterSelect>()({
    id: true,
    content: true,
  });

export type CalmLetterMetadataRecord = Prisma.CalmLetterGetPayload<{
  select: typeof calmLetterMetadataSelect;
}>;

export type CalmLetterPublicStatus = Exclude<CalmLetterStatus, "DRAFT">;

export type CalmLetterSummary = {
  id: string;
  version: number;
  direction: "SENT" | "RECEIVED";
  purpose: CalmLetterPurpose;
  status: CalmLetterPublicStatus;
  unlockAt: string | null;
  sentAt: string;
  openedAt: string | null;
  createdAt: string;
  bodyAvailable: boolean;
  canOpen: boolean;
};

export type CalmLetterDetail = CalmLetterSummary & {
  content?: string;
};

export function toCalmLetterSummary(
  letter: CalmLetterMetadataRecord,
  actorId: string,
): CalmLetterSummary {
  if (letter.status === CalmLetterStatus.DRAFT) {
    throw new Error("Draft calm letters are not part of the public API");
  }
  const direction = letter.authorId === actorId ? "SENT" : "RECEIVED";
  const bodyAvailable =
    direction === "SENT" || letter.status === CalmLetterStatus.OPENED;

  return {
    id: letter.id,
    version: letter.version,
    direction,
    purpose: letter.purpose,
    status: letter.status,
    unlockAt: letter.unlockAt?.toISOString() ?? null,
    sentAt: (letter.sentAt ?? letter.createdAt).toISOString(),
    openedAt: letter.openedAt?.toISOString() ?? null,
    createdAt: letter.createdAt.toISOString(),
    bodyAvailable,
    canOpen:
      direction === "RECEIVED" && letter.status === CalmLetterStatus.AVAILABLE,
  };
}
