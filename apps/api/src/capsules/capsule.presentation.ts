import {
  CapsuleStatus,
  MediaStatus,
  Prisma,
  type CapsuleType,
  type CapsuleUnlockRule,
} from "@prisma/client";
import type {
  CoupleSummary,
  UserSummary,
} from "../common/presentation/relationship";
import {
  toMediaAssetSummary,
  type MediaAssetRecord,
  type MediaAssetSummary,
} from "../memories/memory.presentation";

export type CapsuleMessageView = {
  author: UserSummary;
  version: number;
  content: string;
  updatedAt: string;
};

export type CapsuleSummary = {
  id: string;
  version: number;
  title: string;
  type: CapsuleType;
  unlockRule: CapsuleUnlockRule;
  status: CapsuleStatus;
  unlockAt: string | null;
  dueAt: string | null;
  anniversaryId: string | null;
  wishId: string | null;
  requiresBothConfirmation: boolean;
  confirmedMemberIds: string[];
  openedMemberIds: string[];
  createdBy: UserSummary;
  sealedAt: string | null;
  unlockedAt: string | null;
  openedAt: string | null;
  convertedMemoryId: string | null;
  bodyAvailable: boolean;
  canEdit: boolean;
  canSeal: boolean;
  canConfirm: boolean;
  canOpen: boolean;
  canConvert: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CapsuleDetail = CapsuleSummary & {
  unlockCondition?: string | null;
  messages?: CapsuleMessageView[];
  media?: MediaAssetSummary[];
};

export const capsuleMetadataSelect = Prisma.validator<Prisma.CapsuleSelect>()({
  id: true,
  coupleId: true,
  title: true,
  type: true,
  unlockRule: true,
  status: true,
  version: true,
  unlockAt: true,
  dueAt: true,
  anniversaryId: true,
  wishId: true,
  requiresBothConfirmation: true,
  createdById: true,
  sealedAt: true,
  unlockedAt: true,
  openedAt: true,
  convertedAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  wish: {
    select: {
      status: true,
      completedAt: true,
      deletedAt: true,
    },
  },
  openRecords: {
    orderBy: { userId: "asc" },
    select: {
      userId: true,
      confirmedAt: true,
      openedAt: true,
    },
  },
  convertedMemory: { select: { id: true } },
});

export const capsuleContentSelect = Prisma.validator<Prisma.CapsuleSelect>()({
  id: true,
  unlockCondition: true,
  messages: {
    orderBy: [{ authorId: "asc" }, { id: "asc" }],
    select: {
      authorId: true,
      version: true,
      content: true,
      updatedAt: true,
    },
  },
  media: {
    orderBy: [{ sortOrder: "asc" }, { mediaAssetId: "asc" }],
    select: {
      mediaAsset: {
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          size: true,
          width: true,
          height: true,
          status: true,
          createdAt: true,
          deletedAt: true,
        },
      },
    },
  },
});

export type CapsuleMetadataRecord = Prisma.CapsuleGetPayload<{
  select: typeof capsuleMetadataSelect;
}>;

export type CapsuleContentRecord = Prisma.CapsuleGetPayload<{
  select: typeof capsuleContentSelect;
}>;

function member(couple: CoupleSummary, userId: string): UserSummary {
  const result = couple.members.find((candidate) => candidate.id === userId);
  if (!result) throw new Error("Capsule references a non-member user");
  return result;
}

export function isCapsuleVisibleTo(
  capsule: Pick<CapsuleMetadataRecord, "type" | "createdById">,
  actorId: string,
): boolean {
  return capsule.type !== "TO_SELF" || capsule.createdById === actorId;
}

export function canOpenCapsuleType(
  capsule: Pick<CapsuleMetadataRecord, "type" | "createdById">,
  actorId: string,
): boolean {
  if (capsule.type === "TO_SELF") return capsule.createdById === actorId;
  if (capsule.type === "TO_PARTNER" || capsule.type === "FUTURE_LETTER") {
    return capsule.createdById !== actorId;
  }
  return true;
}

export function capsuleDerivedDueAt(
  capsule: Pick<CapsuleMetadataRecord, "dueAt" | "unlockRule" | "wish">,
): Date | null {
  if (capsule.dueAt !== null) return capsule.dueAt;
  if (
    capsule.unlockRule === "WISH_COMPLETION" &&
    capsule.wish !== null &&
    capsule.wish.deletedAt === null &&
    capsule.wish.completedAt !== null &&
    (capsule.wish.status === "COMPLETED" ||
      capsule.wish.status === "CONVERTED_TO_MEMORY")
  ) {
    return capsule.wish.completedAt;
  }
  return null;
}

export function effectiveCapsuleStatus(
  capsule: CapsuleMetadataRecord,
  now: Date,
  memberCount: number,
): CapsuleStatus {
  const dueAt = capsuleDerivedDueAt(capsule);
  if (
    (capsule.status === CapsuleStatus.SEALED ||
      capsule.status === CapsuleStatus.LOCKED) &&
    dueAt !== null &&
    dueAt <= now
  ) {
    return capsule.requiresBothConfirmation
      ? CapsuleStatus.DUE
      : CapsuleStatus.UNLOCKED;
  }
  if (
    capsule.status === CapsuleStatus.DUE &&
    capsule.requiresBothConfirmation &&
    capsule.openRecords.filter((record) => record.confirmedAt !== null)
      .length >= memberCount
  ) {
    return CapsuleStatus.UNLOCKED;
  }
  return capsule.status;
}

export function shouldLoadCapsuleBody(
  capsule: CapsuleMetadataRecord,
  actorId: string,
): boolean {
  if (capsule.status === CapsuleStatus.DRAFT) {
    return capsule.createdById === actorId || capsule.type === "JOINT";
  }
  return capsule.openRecords.some(
    (record) => record.userId === actorId && record.openedAt !== null,
  );
}

export function toCapsuleSummary(
  capsule: CapsuleMetadataRecord,
  actorId: string,
  couple: CoupleSummary,
  now: Date,
): CapsuleSummary {
  const status = effectiveCapsuleStatus(capsule, now, couple.members.length);
  const actorRecord = capsule.openRecords.find(
    (record) => record.userId === actorId,
  );
  const confirmedMemberIds = capsule.openRecords
    .filter((record) => record.confirmedAt !== null)
    .map((record) => record.userId);
  const openedMemberIds = capsule.openRecords
    .filter((record) => record.openedAt !== null)
    .map((record) => record.userId);
  const allEligibleMembersOpened = couple.members
    .filter((candidate) => canOpenCapsuleType(capsule, candidate.id))
    .every((candidate) => openedMemberIds.includes(candidate.id));
  const bodyAvailable = shouldLoadCapsuleBody(capsule, actorId);
  const actorCanOpen = canOpenCapsuleType(capsule, actorId);
  const dueAt = capsuleDerivedDueAt(capsule);
  const derivedUnlockedAt =
    capsule.unlockedAt ??
    ((capsule.status === CapsuleStatus.SEALED ||
      capsule.status === CapsuleStatus.LOCKED) &&
    status === CapsuleStatus.UNLOCKED
      ? dueAt
      : null);

  return {
    id: capsule.id,
    version: capsule.version,
    title: capsule.title,
    type: capsule.type,
    unlockRule: capsule.unlockRule,
    status,
    unlockAt: capsule.unlockAt?.toISOString() ?? null,
    dueAt: dueAt?.toISOString() ?? null,
    anniversaryId: capsule.anniversaryId,
    wishId: capsule.wishId,
    requiresBothConfirmation: capsule.requiresBothConfirmation,
    confirmedMemberIds,
    openedMemberIds,
    createdBy: member(couple, capsule.createdById),
    sealedAt: capsule.sealedAt?.toISOString() ?? null,
    unlockedAt: derivedUnlockedAt?.toISOString() ?? null,
    openedAt: capsule.openedAt?.toISOString() ?? null,
    convertedMemoryId: capsule.convertedMemory?.id ?? null,
    bodyAvailable,
    canEdit:
      capsule.status === CapsuleStatus.DRAFT &&
      (capsule.createdById === actorId || capsule.type === "JOINT"),
    canSeal:
      capsule.status === CapsuleStatus.DRAFT && capsule.createdById === actorId,
    canConfirm:
      status === CapsuleStatus.DUE &&
      capsule.requiresBothConfirmation &&
      actorRecord?.confirmedAt == null,
    canOpen:
      (status === CapsuleStatus.UNLOCKED ||
        status === CapsuleStatus.OPENED ||
        status === CapsuleStatus.CONVERTED_TO_MEMORY) &&
      actorCanOpen &&
      actorRecord?.openedAt == null,
    canConvert:
      status === CapsuleStatus.OPENED &&
      actorRecord?.openedAt != null &&
      capsule.type !== "TO_SELF" &&
      allEligibleMembersOpened &&
      capsule.convertedMemory === null,
    createdAt: capsule.createdAt.toISOString(),
    updatedAt: capsule.updatedAt.toISOString(),
  };
}

export function toCapsuleDetail(
  capsule: CapsuleMetadataRecord,
  content: CapsuleContentRecord | null,
  actorId: string,
  couple: CoupleSummary,
  now: Date,
): CapsuleDetail {
  const summary = toCapsuleSummary(capsule, actorId, couple, now);
  if (content === null) return summary;

  const messages =
    capsule.status === CapsuleStatus.DRAFT && capsule.type === "JOINT"
      ? content.messages.filter((message) => message.authorId === actorId)
      : content.messages;
  const media =
    capsule.status === CapsuleStatus.DRAFT && capsule.createdById !== actorId
      ? []
      : content.media
          .map(({ mediaAsset }) => mediaAsset as MediaAssetRecord)
          .filter(
            (asset) =>
              asset.status === MediaStatus.READY && asset.deletedAt === null,
          )
          .map(toMediaAssetSummary);

  return {
    ...summary,
    unlockCondition: content.unlockCondition,
    messages: messages.map((message) => ({
      author: member(couple, message.authorId),
      version: message.version,
      content: message.content,
      updatedAt: message.updatedAt.toISOString(),
    })),
    media,
  };
}
