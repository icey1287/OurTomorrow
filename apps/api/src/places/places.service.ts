import { Inject, Injectable } from "@nestjs/common";
import {
  CurrentStatusState,
  MemoryStatus,
  PlaceFutureState,
  PlaceHistoryState,
  PlaceStatus,
  Prisma,
  RecycleBinResourceType,
} from "@prisma/client";
import { Clock } from "../common/clock/clock";
import {
  resourceNotFound,
  stateConflict,
  validationFailed,
} from "../common/http/api-exception";
import { PrismaService } from "../database/prisma.service";
import type { IdentityRole } from "../identity/identity.constants";
import { IdentityService } from "../identity/identity.service";
import { createRecycleBinItem } from "../recycle-bin/recycle-bin.persistence";
import { readableMediaAssetWhere } from "../media/media-access";
import {
  type MediaAssetSummary,
  type PlaceSummary,
  toMediaAssetSummary,
  toPlaceSummary,
} from "../memories/memory.presentation";
import type {
  CreatePlaceDto,
  NearbyPlacesDto,
  PlaceSearchQueryDto,
  UpdatePlaceDto,
  UpdatePlaceStatusDto,
} from "./dto/place.dto";
import {
  AmapPlaceSearchService,
  type PlaceSearchResponse,
  type StaticMapPreview,
} from "./amap-place-search.service";
import {
  completePlaceState,
  patchPlaceState,
  resolvePlaceStateInput,
  type PlaceStateSnapshot,
} from "./place-state";

const placeSelect = Prisma.validator<Prisma.PlaceSelect>()({
  id: true,
  version: true,
  name: true,
  address: true,
  latitude: true,
  longitude: true,
  status: true,
  historyState: true,
  futureState: true,
  firstVisitedAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

const mapMediaSelect = Prisma.validator<Prisma.MediaAssetSelect>()({
  id: true,
  originalName: true,
  mimeType: true,
  size: true,
  width: true,
  height: true,
  status: true,
  createdAt: true,
  deletedAt: true,
});

export type PlaceMapMemorySummary = {
  id: string;
  title: string;
  happenedAt: string;
  coverMedia: MediaAssetSummary | null;
  photos: MediaAssetSummary[];
};

export type PlaceMapWishSummary = {
  id: string;
  title: string;
  status:
    "IDEA" | "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CONVERTED_TO_MEMORY";
  plannedFor: string | null;
};

export type PlaceMapPlanSummary = {
  id: string;
  title: string;
  status: "DRAFT" | "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  startsAt: string | null;
};

export type PlaceMapItem = PlaceSummary & {
  memories: PlaceMapMemorySummary[];
  wishes: PlaceMapWishSummary[];
  plans: PlaceMapPlanSummary[];
};

export type PlaceMapResponse = {
  serverNow: string;
  history: PlaceMapItem[];
  future: PlaceMapItem[];
  withoutCoordinates: PlaceMapItem[];
};

const ACTIVE_FUTURE_STATES = [
  PlaceFutureState.WANT_TO_GO,
  PlaceFutureState.PLANNED,
  PlaceFutureState.DEPARTING,
] as const;

function parseOptionalInstant(
  value: string | null | undefined,
): Date | null | undefined {
  if (value === undefined || value === null) return value;
  const instant = new Date(value);
  if (Number.isNaN(instant.valueOf())) {
    throw validationFailed("firstVisitedAt must be a valid ISO 8601 instant");
  }
  return instant;
}

function validateCoordinatePair(
  latitude: number | null,
  longitude: number | null,
): void {
  if ((latitude === null) !== (longitude === null)) {
    throw validationFailed(
      "latitude and longitude must both be provided or both be null",
    );
  }
}

@Injectable()
export class PlacesService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(IdentityService)
    private readonly identities: IdentityService,
    @Inject(Clock)
    private readonly clock: Clock,
    @Inject(AmapPlaceSearchService)
    private readonly placeSearch: AmapPlaceSearchService,
  ) {}

  async list(role: IdentityRole): Promise<PlaceSummary[]> {
    const actor = await this.identities.current(role);
    const places = await this.prisma.place.findMany({
      where: { coupleId: actor.couple.id, deletedAt: null },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: placeSelect,
    });
    return places.map(toPlaceSummary);
  }

  async search(
    role: IdentityRole,
    query: PlaceSearchQueryDto,
  ): Promise<PlaceSearchResponse> {
    await this.identities.current(role);
    return this.placeSearch.search(query.query, {
      ...(query.region === undefined ? {} : { region: query.region }),
      ...(query.limit === undefined ? {} : { limit: query.limit }),
    });
  }

  async nearby(
    role: IdentityRole,
    dto: NearbyPlacesDto,
  ): Promise<PlaceSearchResponse> {
    await this.identities.current(role);
    return this.placeSearch.nearby(dto.latitude, dto.longitude, {
      ...(dto.radius === undefined ? {} : { radius: dto.radius }),
      ...(dto.limit === undefined ? {} : { limit: dto.limit }),
    });
  }

  async statusMap(
    role: IdentityRole,
    statusId: string,
  ): Promise<StaticMapPreview> {
    const actor = await this.identities.current(role);
    const status = await this.prisma.currentStatus.findFirst({
      where: {
        id: statusId,
        coupleId: actor.couple.id,
        state: CurrentStatusState.ACTIVE,
        expiresAt: { gt: this.clock.now() },
      },
      select: { latitude: true, longitude: true },
    });
    if (status?.latitude === null || status?.longitude === null || !status) {
      throw resourceNotFound();
    }
    return this.placeSearch.staticMap(
      Number(status.latitude),
      Number(status.longitude),
    );
  }

  async create(role: IdentityRole, dto: CreatePlaceDto): Promise<PlaceSummary> {
    const actor = await this.identities.current(role);
    const latitude = dto.latitude ?? null;
    const longitude = dto.longitude ?? null;
    validateCoordinatePair(latitude, longitude);
    const parsedFirstVisitedAt =
      parseOptionalInstant(dto.firstVisitedAt) ?? null;
    const usesNewDimensions =
      dto.historyState !== undefined || dto.futureState !== undefined;
    const initial: PlaceStateSnapshot = {
      status: PlaceStatus.VISITED,
      historyState: usesNewDimensions
        ? PlaceHistoryState.UNVISITED
        : PlaceHistoryState.VISITED,
      futureState: PlaceFutureState.NONE,
      firstVisitedAt: parsedFirstVisitedAt,
    };
    let state = resolvePlaceStateInput(initial, {
      ...(dto.status === undefined ? {} : { status: dto.status }),
      ...(dto.historyState === undefined
        ? {}
        : { historyState: dto.historyState }),
      ...(dto.futureState === undefined
        ? {}
        : { futureState: dto.futureState }),
    });
    if (state.futureState === PlaceFutureState.COMPLETED) {
      state = completePlaceState(
        state,
        parsedFirstVisitedAt ?? this.clock.now(),
      );
    }
    const place = await this.prisma.place.create({
      data: {
        coupleId: actor.couple.id,
        createdById: actor.user.id,
        name: dto.name,
        address: dto.address === "" ? null : (dto.address ?? null),
        latitude,
        longitude,
        status: state.status,
        historyState: state.historyState,
        futureState: state.futureState,
        firstVisitedAt: state.firstVisitedAt,
      },
      select: placeSelect,
    });
    return toPlaceSummary(place);
  }

  async update(
    role: IdentityRole,
    placeId: string,
    dto: UpdatePlaceDto,
  ): Promise<PlaceSummary> {
    const actor = await this.identities.current(role);
    const fields = Object.keys(dto).filter((field) => field !== "version");
    if (fields.length === 0) {
      throw validationFailed("At least one place field must be updated");
    }
    return this.serializable(async (transaction) => {
      const existing = await transaction.place.findFirst({
        where: { id: placeId, coupleId: actor.couple.id, deletedAt: null },
        select: {
          latitude: true,
          longitude: true,
          status: true,
          historyState: true,
          futureState: true,
          firstVisitedAt: true,
        },
      });
      if (!existing) throw resourceNotFound();
      const latitude =
        dto.latitude === undefined
          ? (existing.latitude?.toNumber() ?? null)
          : dto.latitude;
      const longitude =
        dto.longitude === undefined
          ? (existing.longitude?.toNumber() ?? null)
          : dto.longitude;
      validateCoordinatePair(latitude, longitude);
      const requestedFirstVisitedAt =
        dto.firstVisitedAt === undefined
          ? existing.firstVisitedAt
          : dto.firstVisitedAt === null
            ? null
            : parseOptionalInstant(dto.firstVisitedAt)!;
      const changesState =
        dto.status !== undefined ||
        dto.historyState !== undefined ||
        dto.futureState !== undefined;
      let state = changesState
        ? resolvePlaceStateInput(
            { ...existing, firstVisitedAt: requestedFirstVisitedAt },
            {
              ...(dto.status === undefined ? {} : { status: dto.status }),
              ...(dto.historyState === undefined
                ? {}
                : { historyState: dto.historyState }),
              ...(dto.futureState === undefined
                ? {}
                : { futureState: dto.futureState }),
            },
          )
        : { ...existing, firstVisitedAt: requestedFirstVisitedAt };
      if (changesState && state.futureState === PlaceFutureState.COMPLETED) {
        state = completePlaceState(state, this.clock.now());
      }
      const changed = await transaction.place.updateMany({
        where: {
          id: placeId,
          coupleId: actor.couple.id,
          deletedAt: null,
          version: dto.version,
        },
        data: {
          ...(dto.name === undefined ? {} : { name: dto.name }),
          ...(dto.address === undefined
            ? {}
            : { address: dto.address === "" ? null : dto.address }),
          ...(dto.latitude === undefined ? {} : { latitude: dto.latitude }),
          ...(dto.longitude === undefined ? {} : { longitude: dto.longitude }),
          ...(changesState
            ? {
                status: state.status,
                historyState: state.historyState,
                futureState: state.futureState,
              }
            : {}),
          ...(changesState || dto.firstVisitedAt !== undefined
            ? { firstVisitedAt: state.firstVisitedAt }
            : {}),
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw stateConflict();
      const updated = await transaction.place.findUnique({
        where: { id: placeId },
        select: placeSelect,
      });
      if (!updated) throw resourceNotFound();
      return toPlaceSummary(updated);
    });
  }

  async map(role: IdentityRole): Promise<PlaceMapResponse> {
    const actor = await this.identities.current(role);
    const places = await this.prisma.place.findMany({
      where: { coupleId: actor.couple.id, deletedAt: null },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        ...placeSelect,
        memories: {
          where: {
            deletedAt: null,
            OR: [
              {
                status: {
                  in: [MemoryStatus.PUBLISHED, MemoryStatus.ARCHIVED],
                },
              },
              { status: MemoryStatus.DRAFT, createdById: actor.user.id },
            ],
          },
          orderBy: [{ happenedAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            title: true,
            happenedAt: true,
            coverMediaId: true,
            media: {
              where: {
                mediaAsset: readableMediaAssetWhere(
                  actor.couple.id,
                  actor.user.id,
                ),
              },
              orderBy: [{ sortOrder: "asc" }, { mediaAssetId: "asc" }],
              select: { mediaAsset: { select: mapMediaSelect } },
            },
          },
        },
        wishes: {
          where: { deletedAt: null },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            title: true,
            status: true,
            plannedFor: true,
          },
        },
        plans: {
          where: { deletedAt: null },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            title: true,
            status: true,
            startsAt: true,
          },
        },
      },
    });
    const coverMediaIds = [
      ...new Set(
        places.flatMap((place) =>
          place.memories.flatMap((memory) =>
            memory.coverMediaId === null ? [] : [memory.coverMediaId],
          ),
        ),
      ),
    ];
    const coverMedia =
      coverMediaIds.length === 0
        ? []
        : await this.prisma.mediaAsset.findMany({
            where: {
              AND: [
                readableMediaAssetWhere(actor.couple.id, actor.user.id),
                { id: { in: coverMediaIds } },
              ],
            },
            select: mapMediaSelect,
          });
    const mediaById = new Map(
      coverMedia.map((asset) => [asset.id, toMediaAssetSummary(asset)]),
    );
    const items = places.map<PlaceMapItem>((place) => ({
      ...toPlaceSummary(place),
      memories: place.memories.map((memory) => ({
        id: memory.id,
        title: memory.title,
        happenedAt: memory.happenedAt.toISOString(),
        coverMedia:
          memory.coverMediaId === null
            ? null
            : (mediaById.get(memory.coverMediaId) ?? null),
        photos: memory.media.map(({ mediaAsset }) =>
          toMediaAssetSummary(mediaAsset),
        ),
      })),
      wishes: place.wishes.map((wish) => ({
        id: wish.id,
        title: wish.title,
        status: wish.status,
        plannedFor: wish.plannedFor?.toISOString() ?? null,
      })),
      plans: place.plans.map((plan) => ({
        id: plan.id,
        title: plan.title,
        status: plan.status,
        startsAt: plan.startsAt?.toISOString() ?? null,
      })),
    }));
    const withCoordinates = items.filter(
      (place) => place.latitude !== null && place.longitude !== null,
    );
    return {
      serverNow: this.clock.now().toISOString(),
      history: withCoordinates.filter(
        (place) => place.historyState !== PlaceHistoryState.UNVISITED,
      ),
      future: withCoordinates.filter((place) =>
        ACTIVE_FUTURE_STATES.includes(
          place.futureState as (typeof ACTIVE_FUTURE_STATES)[number],
        ),
      ),
      withoutCoordinates: items.filter(
        (place) => place.latitude === null || place.longitude === null,
      ),
    };
  }

  async updateStatus(
    role: IdentityRole,
    placeId: string,
    dto: UpdatePlaceStatusDto,
  ): Promise<PlaceSummary> {
    if (dto.historyState === undefined && dto.futureState === undefined) {
      throw validationFailed("At least one place status field must be updated");
    }
    const actor = await this.identities.current(role);
    return this.serializable(async (transaction) => {
      const existing = await transaction.place.findFirst({
        where: { id: placeId, coupleId: actor.couple.id, deletedAt: null },
        select: {
          version: true,
          status: true,
          historyState: true,
          futureState: true,
          firstVisitedAt: true,
        },
      });
      if (!existing) throw resourceNotFound();
      const next = patchPlaceState(
        existing,
        {
          ...(dto.historyState === undefined
            ? {}
            : { historyState: dto.historyState }),
          ...(dto.futureState === undefined
            ? {}
            : { futureState: dto.futureState }),
        },
        this.clock.now(),
      );
      const changed = await transaction.place.updateMany({
        where: {
          id: placeId,
          coupleId: actor.couple.id,
          deletedAt: null,
          version: dto.version,
        },
        data: {
          status: next.status,
          historyState: next.historyState,
          futureState: next.futureState,
          firstVisitedAt: next.firstVisitedAt,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw stateConflict();
      const updated = await transaction.place.findUnique({
        where: { id: placeId },
        select: placeSelect,
      });
      if (!updated) throw resourceNotFound();
      return toPlaceSummary(updated);
    });
  }

  async remove(
    role: IdentityRole,
    placeId: string,
    version?: number,
  ): Promise<void> {
    const actor = await this.identities.current(role);
    await this.serializable(async (transaction) => {
      const existing = await transaction.place.findFirst({
        where: { id: placeId, coupleId: actor.couple.id, deletedAt: null },
        select: { version: true },
      });
      if (!existing) throw resourceNotFound();
      const deletedAt = new Date();
      const changed = await transaction.place.updateMany({
        where: {
          id: placeId,
          coupleId: actor.couple.id,
          deletedAt: null,
          version: version ?? existing.version,
        },
        data: { deletedAt, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw stateConflict();
      await createRecycleBinItem(transaction, {
        coupleId: actor.couple.id,
        resourceType: RecycleBinResourceType.PLACE,
        resourceId: placeId,
        deletedById: actor.user.id,
        deletedAt,
        restoreData: {},
      });
    });
  }

  private async serializable<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034"
        ) {
          if (attempt < 3) continue;
          throw stateConflict();
        }
        throw error;
      }
    }
    throw stateConflict();
  }
}
