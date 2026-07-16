import { Inject, Injectable } from "@nestjs/common";
import { CoupleMemberStatus, CoupleStatus, Prisma } from "@prisma/client";
import { Clock } from "../common/clock/clock";
import {
  resourceNotFound,
  stateConflict,
  validationFailed,
} from "../common/http/api-exception";
import {
  coupleSummarySelect,
  toCoupleSummary,
  type CoupleSummary,
} from "../common/presentation/relationship";
import { PrismaService } from "../database/prisma.service";
import type { IdentityRole } from "../identity/identity.constants";
import { IdentityService } from "../identity/identity.service";
import type { UpdateCoupleDto } from "./dto/couple.dto";

function parseDateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationFailed("startDate must use YYYY-MM-DD");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw validationFailed("startDate must be a real calendar date");
  }
  return date;
}

function validateTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
  } catch {
    throw validationFailed("timezone must be a valid IANA time zone");
  }
}

@Injectable()
export class CouplesService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(IdentityService)
    private readonly identities: IdentityService,
    @Inject(Clock)
    private readonly clock: Clock,
  ) {}

  async current(role: IdentityRole): Promise<CoupleSummary> {
    return (await this.identities.current(role)).couple;
  }

  async update(
    role: IdentityRole,
    dto: UpdateCoupleDto,
    ifMatch?: string,
  ): Promise<CoupleSummary> {
    const identity = await this.identities.current(role);
    const changedFields = Object.keys(dto).filter(
      (field) => field !== "version",
    );
    if (changedFields.length === 0) {
      throw validationFailed("At least one couple field must be updated");
    }
    if (ifMatch && ifMatch !== this.etag(identity.couple.id, dto.version)) {
      throw stateConflict();
    }
    if (dto.timezone !== undefined) validateTimeZone(dto.timezone);
    const parsedStartDate =
      dto.startDate === undefined ? undefined : parseDateOnly(dto.startDate);

    return this.serializable(async (transaction) => {
      const existing = await transaction.couple.findFirst({
        where: {
          id: identity.couple.id,
          status: CoupleStatus.ACTIVE,
          deletedAt: null,
          members: {
            some: {
              userId: identity.user.id,
              status: CoupleMemberStatus.ACTIVE,
            },
          },
        },
        select: { timezone: true, startDate: true },
      });
      if (!existing) throw resourceNotFound();
      const nextTimeZone = dto.timezone ?? existing.timezone;
      const nextStartDate =
        dto.startDate ?? existing.startDate.toISOString().slice(0, 10);
      if (nextStartDate > this.clock.localDate(nextTimeZone)) {
        throw validationFailed("startDate cannot be in the future");
      }

      const result = await transaction.couple.updateMany({
        where: {
          id: identity.couple.id,
          version: dto.version,
          status: CoupleStatus.ACTIVE,
          deletedAt: null,
          members: {
            some: {
              userId: identity.user.id,
              status: CoupleMemberStatus.ACTIVE,
            },
          },
        },
        data: {
          ...(dto.name === undefined ? {} : { name: dto.name }),
          ...(parsedStartDate === undefined
            ? {}
            : { startDate: parsedStartDate }),
          ...(dto.timezone === undefined ? {} : { timezone: dto.timezone }),
          ...(dto.signature === undefined ? {} : { signature: dto.signature }),
          ...(dto.theme === undefined ? {} : { theme: dto.theme }),
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) throw stateConflict();

      const updated = await transaction.couple.findUnique({
        where: { id: identity.couple.id },
        select: coupleSummarySelect,
      });
      if (!updated) throw resourceNotFound();
      return toCoupleSummary(updated);
    });
  }

  etag(coupleId: string, version: number): string {
    return `\"couple:${coupleId}:${version}\"`;
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
