import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import {
  identityNameMismatch,
  resourceNotFound,
  stateConflict,
} from "../common/http/api-exception";
import {
  coupleSummarySelect,
  toCoupleSummary,
  type CoupleSummary,
  type UserSummary,
} from "../common/presentation/relationship";
import { PrismaService } from "../database/prisma.service";
import type { Environment } from "../config/env.schema";
import {
  FIXED_COUPLE_ID,
  FIXED_BOY_MEMBER_ID,
  FIXED_BOY_USER_ID,
  FIXED_GIRL_MEMBER_ID,
  FIXED_GIRL_USER_ID,
  FIXED_USER_IDS,
  IDENTITY_ROLES,
  type IdentityRole,
} from "./identity.constants";

export type IdentityResponse = {
  role: IdentityRole;
  user: UserSummary;
  couple: CoupleSummary;
};

type FixedIdentity = {
  role: IdentityRole;
  slot: 1 | 2;
  userId: string;
  memberId: string;
  username: string;
  displayName: string;
};

function normalizeIdentityName(value: string): string {
  return value.trim().normalize("NFKC");
}

@Injectable()
export class IdentityService {
  private readonly realNames: Record<IdentityRole, string>;
  private readonly identities: Record<IdentityRole, FixedIdentity>;
  private readonly defaultCouple: {
    name: string;
    startDate: string;
    timezone: string;
    signature: string | null;
  };

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(ConfigService)
    config: ConfigService<Environment, true>,
  ) {
    this.realNames = {
      boy: normalizeIdentityName(config.get("BOY_REAL_NAME", { infer: true })),
      girl: normalizeIdentityName(
        config.get("GIRL_REAL_NAME", { infer: true }),
      ),
    };
    this.identities = {
      boy: {
        role: "boy",
        slot: 1,
        userId: FIXED_BOY_USER_ID,
        memberId: FIXED_BOY_MEMBER_ID,
        username: "boy",
        displayName: config.get("BOY_DISPLAY_NAME", { infer: true }),
      },
      girl: {
        role: "girl",
        slot: 2,
        userId: FIXED_GIRL_USER_ID,
        memberId: FIXED_GIRL_MEMBER_ID,
        username: "girl",
        displayName: config.get("GIRL_DISPLAY_NAME", { infer: true }),
      },
    };
    const signature = config.get("COUPLE_SIGNATURE", { infer: true });
    this.defaultCouple = {
      name: config.get("COUPLE_NAME", { infer: true }),
      startDate: config.get("COUPLE_START_DATE", { infer: true }),
      timezone: config.get("COUPLE_TIMEZONE", { infer: true }),
      signature: signature || null,
    };
  }

  async selectByName(name: string): Promise<IdentityResponse> {
    const normalizedName = normalizeIdentityName(name);
    const role = IDENTITY_ROLES.find(
      (candidate) => this.realNames[candidate] === normalizedName,
    );
    if (!role) throw identityNameMismatch();
    return this.select(role);
  }

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
    const expectedUserId = this.identities[role].userId;
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
            for (const identity of Object.values(this.identities)) {
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
                name: this.defaultCouple.name,
                startDate: new Date(
                  `${this.defaultCouple.startDate}T00:00:00.000Z`,
                ),
                timezone: this.defaultCouple.timezone,
                signature: this.defaultCouple.signature,
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

            for (const identity of Object.values(this.identities)) {
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
