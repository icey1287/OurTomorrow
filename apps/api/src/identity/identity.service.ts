import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { resourceNotFound, stateConflict } from "../common/http/api-exception";
import {
  coupleSummarySelect,
  toCoupleSummary,
  type CoupleSummary,
  type UserSummary,
} from "../common/presentation/relationship";
import { PrismaService } from "../database/prisma.service";
import {
  DEFAULT_COUPLE,
  FIXED_COUPLE_ID,
  FIXED_IDENTITIES,
  FIXED_USER_IDS,
  type IdentityRole,
} from "./identity.constants";

export type IdentityResponse = {
  role: IdentityRole;
  user: UserSummary;
  couple: CoupleSummary;
};

@Injectable()
export class IdentityService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async select(role: IdentityRole): Promise<IdentityResponse> {
    await this.ensureFixedSpace();
    return this.current(role);
  }

  async current(role: IdentityRole): Promise<IdentityResponse> {
    const couple = await this.prisma.couple.findUnique({
      where: { id: FIXED_COUPLE_ID },
      select: coupleSummarySelect,
    });
    if (!couple) throw resourceNotFound();

    const summary = toCoupleSummary(couple);
    const expectedUserId = FIXED_IDENTITIES[role].userId;
    const user = summary.members.find(
      (member) => member.id === expectedUserId && member.role === role,
    );
    const containsBothFixedMembers = FIXED_USER_IDS.every((userId) =>
      summary.members.some((member) => member.id === userId),
    );
    if (!user || !containsBothFixedMembers || summary.members.length !== 2) {
      throw resourceNotFound();
    }
    return { role, user, couple: summary };
  }

  private async ensureFixedSpace(): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await this.prisma.$transaction(
          async (transaction) => {
            for (const identity of Object.values(FIXED_IDENTITIES)) {
              await transaction.user.upsert({
                where: { id: identity.userId },
                create: {
                  id: identity.userId,
                  username: identity.username,
                  displayName: identity.displayName,
                },
                update: {
                  username: identity.username,
                  displayName: identity.displayName,
                },
                select: { id: true },
              });
            }

            await transaction.couple.upsert({
              where: { id: FIXED_COUPLE_ID },
              create: {
                id: FIXED_COUPLE_ID,
                name: DEFAULT_COUPLE.name,
                startDate: new Date(
                  `${DEFAULT_COUPLE.startDate}T00:00:00.000Z`,
                ),
                timezone: DEFAULT_COUPLE.timezone,
                signature: DEFAULT_COUPLE.signature,
              },
              update: {},
              select: { id: true },
            });

            await transaction.coupleMember.deleteMany({
              where: {
                OR: [
                  {
                    coupleId: FIXED_COUPLE_ID,
                    userId: { notIn: [...FIXED_USER_IDS] },
                  },
                  {
                    userId: { in: [...FIXED_USER_IDS] },
                    coupleId: { not: FIXED_COUPLE_ID },
                  },
                ],
              },
            });

            for (const identity of Object.values(FIXED_IDENTITIES)) {
              await transaction.coupleMember.upsert({
                where: { id: identity.memberId },
                create: {
                  id: identity.memberId,
                  coupleId: FIXED_COUPLE_ID,
                  userId: identity.userId,
                  slot: identity.slot,
                },
                update: { slot: identity.slot },
                select: { id: true },
              });
            }
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        return;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === "P2002" || error.code === "P2034")
        ) {
          if (attempt < 3) continue;
          throw stateConflict();
        }
        throw error;
      }
    }
  }
}
