import {
  CoupleMemberStatus,
  CoupleStatus,
  MediaKind,
  MediaStatus,
  MemoryStatus,
  Prisma,
  UserStatus,
} from "@prisma/client";

/**
 * The canonical read boundary for private media. Binding an existing asset to
 * another resource must use the same predicate, otherwise a guessed media id
 * could be attached to public content and become readable through that link.
 */
export function readableMediaAssetWhere(
  coupleId: string,
  userId: string,
): Prisma.MediaAssetWhereInput {
  return {
    coupleId,
    kind: MediaKind.IMAGE,
    status: MediaStatus.READY,
    deletedAt: null,
    OR: [
      {
        AND: [
          { createdById: userId },
          { usedAsUserAvatar: { none: {} } },
          { usedAsCoupleCover: { none: {} } },
          { usedAsMemoryCover: { none: {} } },
          { usedAsAnniversaryCover: { none: {} } },
          { memoryMedia: { none: {} } },
          { wishMedia: { none: {} } },
          { capsuleMedia: { none: {} } },
          { reviewContributions: { none: {} } },
        ],
      },
      {
        memoryMedia: {
          some: {
            memory: {
              coupleId,
              deletedAt: null,
              OR: [
                {
                  status: {
                    in: [MemoryStatus.PUBLISHED, MemoryStatus.ARCHIVED],
                  },
                },
                { status: MemoryStatus.DRAFT, createdById: userId },
              ],
            },
          },
        },
      },
      {
        usedAsMemoryCover: {
          some: {
            coupleId,
            deletedAt: null,
            OR: [
              {
                status: {
                  in: [MemoryStatus.PUBLISHED, MemoryStatus.ARCHIVED],
                },
              },
              { status: MemoryStatus.DRAFT, createdById: userId },
            ],
          },
        },
      },
      {
        usedAsCoupleCover: {
          some: {
            id: coupleId,
            status: CoupleStatus.ACTIVE,
            deletedAt: null,
          },
        },
      },
      {
        usedAsUserAvatar: {
          some: {
            status: UserStatus.ACTIVE,
            deletedAt: null,
            coupleMembers: {
              some: {
                coupleId,
                status: CoupleMemberStatus.ACTIVE,
              },
            },
          },
        },
      },
      {
        usedAsAnniversaryCover: {
          some: { coupleId, deletedAt: null },
        },
      },
      {
        wishMedia: {
          some: { wish: { coupleId, deletedAt: null } },
        },
      },
      {
        reviewContributions: {
          some: {
            annualReview: {
              coupleId,
              status: { in: ["READY", "PUBLISHED"] },
            },
          },
        },
      },
      {
        AND: [
          { createdById: userId },
          {
            capsuleMedia: {
              some: {
                capsule: {
                  coupleId,
                  status: "DRAFT",
                  deletedAt: null,
                },
              },
            },
          },
        ],
      },
      {
        capsuleMedia: {
          some: {
            capsule: {
              coupleId,
              deletedAt: null,
              openRecords: {
                some: { userId, openedAt: { not: null } },
              },
            },
          },
        },
      },
    ],
  };
}
