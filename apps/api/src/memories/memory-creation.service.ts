import { Inject, Injectable } from "@nestjs/common";
import { MemoryMediaRole, MemoryStatus, Prisma } from "@prisma/client";
import { Clock } from "../common/clock/clock";
import {
  resourceNotFound,
  validationFailed,
} from "../common/http/api-exception";
import type { IdentityResponse } from "../identity/identity.service";
import { readableMediaAssetWhere } from "../media/media-access";

export type ConvertedMemorySource =
  | { type: "NOTE"; id: string }
  | { type: "WISH"; id: string }
  | { type: "CAPSULE"; id: string }
  | { type: "ANNIVERSARY"; id: string };

export type CreateConvertedMemoryInput = {
  source: ConvertedMemorySource;
  title: string;
  content: string | null;
  happenedAt: Date;
  placeId: string | null;
  mediaIds: string[];
};

function json(value: Record<string, unknown>): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

function initialChanges(
  snapshot: Record<string, unknown>,
): Prisma.InputJsonObject {
  return json(
    Object.fromEntries(
      Object.entries(snapshot).map(([field, value]) => [
        field,
        { from: null, to: value ?? null },
      ]),
    ),
  );
}

@Injectable()
export class MemoryCreationService {
  constructor(@Inject(Clock) private readonly clock: Clock) {}

  async createConverted(
    transaction: Prisma.TransactionClient,
    actor: IdentityResponse,
    input: CreateConvertedMemoryInput,
  ): Promise<string> {
    if (input.happenedAt > this.clock.now()) {
      throw validationFailed("happenedAt cannot be in the future");
    }
    if (input.placeId) {
      const place = await transaction.place.findFirst({
        where: {
          id: input.placeId,
          coupleId: actor.couple.id,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!place) throw resourceNotFound();
    }
    const mediaIds = [...new Set(input.mediaIds)];
    if (mediaIds.length !== input.mediaIds.length) {
      throw validationFailed("mediaIds must not contain duplicates");
    }
    if (mediaIds.length > 0) {
      const mediaCount = await transaction.mediaAsset.count({
        where: {
          id: { in: mediaIds },
          ...readableMediaAssetWhere(actor.couple.id, actor.user.id),
        },
      });
      if (mediaCount !== mediaIds.length) throw resourceNotFound();
    }

    const coverMediaId = mediaIds[0] ?? null;
    const sourceFields =
      input.source.type === "NOTE"
        ? { sourceNoteId: input.source.id }
        : input.source.type === "WISH"
          ? { sourceWishId: input.source.id }
          : input.source.type === "CAPSULE"
            ? { sourceCapsuleId: input.source.id }
            : { sourceAnniversaryId: input.source.id };
    const memory = await transaction.memory.create({
      data: {
        coupleId: actor.couple.id,
        createdById: actor.user.id,
        updatedById: actor.user.id,
        title: input.title,
        content: input.content,
        happenedAt: input.happenedAt,
        placeId: input.placeId,
        coverMediaId,
        status: MemoryStatus.PUBLISHED,
        ...sourceFields,
        ...(mediaIds.length === 0
          ? {}
          : {
              media: {
                createMany: {
                  data: mediaIds.map((mediaAssetId, sortOrder) => ({
                    mediaAssetId,
                    sortOrder,
                    role:
                      mediaAssetId === coverMediaId
                        ? MemoryMediaRole.COVER
                        : MemoryMediaRole.GALLERY,
                  })),
                },
              },
            }),
      },
      select: {
        id: true,
        version: true,
        title: true,
        content: true,
        happenedAt: true,
        placeId: true,
        coverMediaId: true,
        status: true,
        media: {
          orderBy: [{ sortOrder: "asc" }, { mediaAssetId: "asc" }],
          select: { mediaAssetId: true, role: true, sortOrder: true },
        },
      },
    });
    await transaction.contentRevision.create({
      data: {
        coupleId: actor.couple.id,
        resourceType: "MEMORY",
        resourceId: memory.id,
        version: memory.version,
        authorId: actor.user.id,
        changes: initialChanges({
          title: memory.title,
          content: memory.content,
          happenedAt: memory.happenedAt.toISOString(),
          placeId: memory.placeId,
          coverMediaId: memory.coverMediaId,
          mood: null,
          isFirstTime: false,
          firstTimeLabel: null,
          isPinned: false,
          status: memory.status,
          tagIds: [],
          media: memory.media.map(({ mediaAssetId, role, sortOrder }) => ({
            mediaId: mediaAssetId,
            role,
            sortOrder,
          })),
        }),
      },
    });
    return memory.id;
  }
}
