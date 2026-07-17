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
import { type TagSummary, toTagSummary } from "../memories/memory.presentation";
import type { CreateTagDto, UpdateTagDto } from "./dto/tag.dto";

const tagSelect = Prisma.validator<Prisma.TagSelect>()({
  id: true,
  version: true,
  name: true,
  normalizedName: true,
  color: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

function normalizeName(value: string): string {
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (normalized.length === 0 || normalized.length > 64) {
    throw validationFailed("name must contain between 1 and 64 characters");
  }
  return normalized.toLocaleLowerCase("zh-CN");
}

@Injectable()
export class TagsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(IdentityService)
    private readonly identities: IdentityService,
  ) {}

  async list(role: IdentityRole): Promise<TagSummary[]> {
    const actor = await this.identities.current(role);
    const tags = await this.prisma.tag.findMany({
      where: { coupleId: actor.couple.id, deletedAt: null },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: tagSelect,
    });
    return tags.map(toTagSummary);
  }

  async create(role: IdentityRole, dto: CreateTagDto): Promise<TagSummary> {
    const actor = await this.identities.current(role);
    const normalizedName = normalizeName(dto.name);
    try {
      const tag = await this.serializable(async (transaction) => {
        const existing = await transaction.tag.findUnique({
          where: {
            coupleId_normalizedName: {
              coupleId: actor.couple.id,
              normalizedName,
            },
          },
          select: tagSelect,
        });
        if (existing?.deletedAt === null) throw stateConflict();
        if (existing) {
          const restored = await transaction.tag.updateMany({
            where: {
              id: existing.id,
              coupleId: actor.couple.id,
              version: existing.version,
              deletedAt: { not: null },
            },
            data: {
              name: dto.name,
              color: dto.color ?? null,
              deletedAt: null,
              version: { increment: 1 },
            },
          });
          if (restored.count !== 1) throw stateConflict();
          const result = await transaction.tag.findUnique({
            where: { id: existing.id },
            select: tagSelect,
          });
          if (!result) throw resourceNotFound();
          return result;
        }
        return transaction.tag.create({
          data: {
            coupleId: actor.couple.id,
            name: dto.name,
            normalizedName,
            color: dto.color ?? null,
          },
          select: tagSelect,
        });
      });
      return toTagSummary(tag);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw stateConflict();
      }
      throw error;
    }
  }

  async update(
    role: IdentityRole,
    tagId: string,
    dto: UpdateTagDto,
  ): Promise<TagSummary> {
    const actor = await this.identities.current(role);
    if (dto.name === undefined && dto.color === undefined) {
      throw validationFailed("At least one tag field must be updated");
    }
    const normalizedName =
      dto.name === undefined ? undefined : normalizeName(dto.name);
    try {
      return await this.serializable(async (transaction) => {
        const exists = await transaction.tag.findFirst({
          where: { id: tagId, coupleId: actor.couple.id, deletedAt: null },
          select: { id: true },
        });
        if (!exists) throw resourceNotFound();
        const changed = await transaction.tag.updateMany({
          where: {
            id: tagId,
            coupleId: actor.couple.id,
            deletedAt: null,
            version: dto.version,
          },
          data: {
            ...(dto.name === undefined
              ? {}
              : { name: dto.name, normalizedName: normalizedName! }),
            ...(dto.color === undefined ? {} : { color: dto.color }),
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) throw stateConflict();
        const updated = await transaction.tag.findUnique({
          where: { id: tagId },
          select: tagSelect,
        });
        if (!updated) throw resourceNotFound();
        return toTagSummary(updated);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw stateConflict();
      }
      throw error;
    }
  }

  async remove(
    role: IdentityRole,
    tagId: string,
    version?: number,
  ): Promise<void> {
    const actor = await this.identities.current(role);
    await this.serializable(async (transaction) => {
      const existing = await transaction.tag.findFirst({
        where: { id: tagId, coupleId: actor.couple.id, deletedAt: null },
        select: { version: true },
      });
      if (!existing) throw resourceNotFound();
      const deletedAt = new Date();
      const changed = await transaction.tag.updateMany({
        where: {
          id: tagId,
          coupleId: actor.couple.id,
          deletedAt: null,
          version: version ?? existing.version,
        },
        data: { deletedAt, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw stateConflict();
      await createRecycleBinItem(transaction, {
        coupleId: actor.couple.id,
        resourceType: RecycleBinResourceType.TAG,
        resourceId: tagId,
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
