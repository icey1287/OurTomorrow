import { Inject, Injectable } from "@nestjs/common";
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
import { Clock } from "../common/clock/clock";
import { PrismaService } from "../database/prisma.service";
import type { IdentityRole } from "../identity/identity.constants";
import { IdentityService } from "../identity/identity.service";
import type { UpdateCoupleDto } from "./dto/couple.dto";

function parseDateOnly(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw validationFailed("startDate must be a real calendar date");
  }
  return date;
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

  async update(
    role: IdentityRole,
    dto: UpdateCoupleDto,
  ): Promise<CoupleSummary> {
    const identity = await this.identities.current(role);
    if (dto.startDate === undefined && dto.signature === undefined) {
      throw validationFailed("At least one couple field must be updated");
    }

    const startDate =
      dto.startDate === undefined ? undefined : parseDateOnly(dto.startDate);
    if (
      dto.startDate !== undefined &&
      dto.startDate > this.clock.localDate(identity.couple.timezone)
    ) {
      throw validationFailed("startDate cannot be in the future");
    }

    const changed = await this.prisma.couple.updateMany({
      where: { id: identity.couple.id, version: dto.version },
      data: {
        ...(startDate === undefined ? {} : { startDate }),
        ...(dto.signature === undefined ? {} : { signature: dto.signature }),
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1) throw stateConflict();

    const updated = await this.prisma.couple.findUnique({
      where: { id: identity.couple.id },
      select: coupleSummarySelect,
    });
    if (!updated) throw resourceNotFound();
    return toCoupleSummary(updated);
  }
}
