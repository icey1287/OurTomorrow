import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Clock } from "../common/clock/clock";
import {
  ApiException,
  resourceNotFound,
  stateConflict,
  validationFailed,
} from "../common/http/api-exception";
import { PrismaService } from "../database/prisma.service";
import type { IdentityRole } from "../identity/identity.constants";
import { IdentityService } from "../identity/identity.service";
import type { PutCurrentStatusDto } from "./dto/status.dto";
import {
  currentStatusSelect,
  toCurrentStatusView,
  type CurrentStatusesResponse,
  type CurrentStatusView,
} from "./status.presentation";

function preconditionRequired(): ApiException {
  return new ApiException(
    HttpStatus.PRECONDITION_REQUIRED,
    "PRECONDITION_REQUIRED",
    "version is required when replacing the current status",
  );
}

function parseExpiry(value: string, now: Date): Date {
  const expiry = new Date(value);
  if (Number.isNaN(expiry.valueOf())) {
    throw validationFailed("expiresAt must be a valid ISO 8601 instant");
  }
  if (expiry <= now) {
    throw validationFailed("expiresAt must be later than serverNow");
  }
  return expiry;
}

@Injectable()
export class StatusesService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(IdentityService)
    private readonly identities: IdentityService,
    @Inject(Clock)
    private readonly clock: Clock,
  ) {}

  async current(role: IdentityRole): Promise<CurrentStatusesResponse> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    const statuses = await this.prisma.currentStatus.findMany({
      where: {
        coupleId: actor.couple.id,
        archivedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: [{ startsAt: "desc" }, { id: "desc" }],
      select: currentStatusSelect,
    });
    const mine = statuses.find((status) => status.authorId === actor.user.id);
    const partner = statuses.find(
      (status) => status.authorId !== actor.user.id,
    );
    return {
      serverNow: now.toISOString(),
      mine: mine ? toCurrentStatusView(mine, actor.couple) : null,
      partner: partner ? toCurrentStatusView(partner, actor.couple) : null,
    };
  }

  async putMine(
    role: IdentityRole,
    dto: PutCurrentStatusDto,
  ): Promise<CurrentStatusView> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    const expiresAt = parseExpiry(dto.expiresAt, now);
    const latitude = dto.latitude ?? null;
    const longitude = dto.longitude ?? null;
    if ((latitude === null) !== (longitude === null)) {
      throw validationFailed(
        "latitude and longitude must both be provided or both be null",
      );
    }

    const created = await this.serializable(async (transaction) => {
      const current = await transaction.currentStatus.findFirst({
        where: {
          coupleId: actor.couple.id,
          authorId: actor.user.id,
          archivedAt: null,
          expiresAt: { gt: now },
        },
        orderBy: [{ startsAt: "desc" }, { id: "desc" }],
        select: { id: true, version: true },
      });
      if (current && dto.version === undefined) throw preconditionRequired();
      if (
        (current && dto.version !== current.version) ||
        (!current && dto.version !== undefined)
      ) {
        throw stateConflict(
          current ? { currentVersion: current.version } : undefined,
        );
      }

      if (current) {
        const changed = await transaction.currentStatus.updateMany({
          where: { id: current.id, version: current.version, archivedAt: null },
          data: { archivedAt: now, version: { increment: 1 } },
        });
        if (changed.count !== 1) throw stateConflict();
      }
      await transaction.currentStatus.updateMany({
        where: {
          coupleId: actor.couple.id,
          authorId: actor.user.id,
          archivedAt: null,
        },
        data: { archivedAt: now, version: { increment: 1 } },
      });

      return transaction.currentStatus.create({
        data: {
          coupleId: actor.couple.id,
          authorId: actor.user.id,
          kind: dto.kind,
          message: dto.message ?? null,
          location: dto.location,
          locationAddress: dto.locationAddress ?? null,
          latitude,
          longitude,
          startsAt: now,
          expiresAt,
        },
        select: currentStatusSelect,
      });
    });
    return toCurrentStatusView(created, actor.couple);
  }

  async removeMine(role: IdentityRole, version: number): Promise<void> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    const current = await this.prisma.currentStatus.findFirst({
      where: {
        coupleId: actor.couple.id,
        authorId: actor.user.id,
        archivedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: [{ startsAt: "desc" }, { id: "desc" }],
      select: { id: true, version: true },
    });
    if (!current) throw resourceNotFound();
    if (current.version !== version) {
      throw stateConflict({ currentVersion: current.version });
    }
    const changed = await this.prisma.currentStatus.updateMany({
      where: { id: current.id, version, archivedAt: null },
      data: { archivedAt: now, version: { increment: 1 } },
    });
    if (changed.count !== 1) throw stateConflict();
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
          (error.code === "P2034" || error.code === "P2002")
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
