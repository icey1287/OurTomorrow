import { Inject, Injectable } from "@nestjs/common";
import { Prisma, RecycleBinResourceType } from "@prisma/client";
import {
  resourceNotFound,
  stateConflict,
  validationFailed,
} from "../common/http/api-exception";
import { PrismaService } from "../database/prisma.service";
import type { IdentityRole } from "../identity/identity.constants";
import { IdentityService } from "../identity/identity.service";
import { createRecycleBinItem } from "../recycle-bin/recycle-bin.persistence";
import {
  type PlaceSummary,
  toPlaceSummary,
} from "../memories/memory.presentation";
import type { CreatePlaceDto, UpdatePlaceDto } from "./dto/place.dto";

const placeSelect = Prisma.validator<Prisma.PlaceSelect>()({
  id: true,
  version: true,
  name: true,
  address: true,
  latitude: true,
  longitude: true,
  status: true,
  firstVisitedAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

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

  async create(role: IdentityRole, dto: CreatePlaceDto): Promise<PlaceSummary> {
    const actor = await this.identities.current(role);
    const latitude = dto.latitude ?? null;
    const longitude = dto.longitude ?? null;
    validateCoordinatePair(latitude, longitude);
    const place = await this.prisma.place.create({
      data: {
        coupleId: actor.couple.id,
        createdById: actor.user.id,
        name: dto.name,
        address: dto.address === "" ? null : (dto.address ?? null),
        latitude,
        longitude,
        ...(dto.status === undefined ? {} : { status: dto.status }),
        firstVisitedAt: parseOptionalInstant(dto.firstVisitedAt) ?? null,
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
          ...(dto.status === undefined ? {} : { status: dto.status }),
          ...(dto.firstVisitedAt === undefined
            ? {}
            : {
                firstVisitedAt:
                  dto.firstVisitedAt === null
                    ? null
                    : parseOptionalInstant(dto.firstVisitedAt)!,
              }),
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
