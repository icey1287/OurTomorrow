import { Inject, Injectable } from "@nestjs/common";
import {
  CoupleMemberStatus,
  CoupleStatus,
  Prisma,
  UserStatus,
} from "@prisma/client";
import {
  resourceNotFound,
  stateConflict,
  validationFailed,
} from "../common/http/api-exception";
import {
  toUserSummary,
  type UserSummary,
} from "../common/presentation/relationship";
import { PrismaService } from "../database/prisma.service";
import type { IdentityRole } from "../identity/identity.constants";
import { IdentityService } from "../identity/identity.service";
import type { UpdateProfileDto } from "./dto/update-profile.dto";

@Injectable()
export class UsersService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(IdentityService)
    private readonly identities: IdentityService,
  ) {}

  async updateMe(
    role: IdentityRole,
    dto: UpdateProfileDto,
  ): Promise<UserSummary> {
    const identity = await this.identities.current(role);
    const changedFields = Object.keys(dto).filter(
      (field) => field !== "version",
    );
    if (changedFields.length === 0) {
      throw validationFailed("At least one profile field must be updated");
    }

    return this.serializable(async (transaction) => {
      const updated = await transaction.user.updateMany({
        where: {
          id: identity.user.id,
          version: dto.version,
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
        data: {
          ...(dto.displayName === undefined
            ? {}
            : { displayName: dto.displayName }),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw stateConflict();

      if (dto.nicknameInRelationship !== undefined) {
        const membership = await transaction.coupleMember.updateMany({
          where: {
            userId: identity.user.id,
            coupleId: identity.couple.id,
            status: CoupleMemberStatus.ACTIVE,
          },
          data: { nicknameInRelationship: dto.nicknameInRelationship },
        });
        if (membership.count !== 1) throw resourceNotFound();
      }

      const couple = await transaction.couple.updateMany({
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
        data: { version: { increment: 1 } },
      });
      if (couple.count !== 1) throw resourceNotFound();

      const membership = await transaction.coupleMember.findFirst({
        where: {
          userId: identity.user.id,
          coupleId: identity.couple.id,
          status: CoupleMemberStatus.ACTIVE,
        },
        select: {
          slot: true,
          nicknameInRelationship: true,
          user: {
            select: {
              id: true,
              version: true,
              displayName: true,
            },
          },
        },
      });
      if (!membership) throw resourceNotFound();
      return toUserSummary(membership.user, membership);
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
