import { CoupleMemberStatus, Prisma } from "@prisma/client";
import type { IdentityRole } from "../../identity/identity.constants";
import { roleForSlot } from "../../identity/identity.constants";

export type ThemePreference = "system" | "light" | "dark";

export type UserSummary = {
  id: string;
  version: number;
  displayName: string;
  slot: 1 | 2;
  role: IdentityRole;
  nicknameInRelationship: string | null;
  avatarUrl: string | null;
};

export type CoupleSummary = {
  id: string;
  version: number;
  name: string;
  startDate: string;
  timezone: string;
  signature: string | null;
  theme: ThemePreference;
  members: UserSummary[];
};

export const coupleSummarySelect = Prisma.validator<Prisma.CoupleSelect>()({
  id: true,
  version: true,
  name: true,
  startDate: true,
  timezone: true,
  signature: true,
  theme: true,
  members: {
    where: { status: CoupleMemberStatus.ACTIVE },
    orderBy: { slot: "asc" },
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
  },
});

export type CoupleForSummary = Prisma.CoupleGetPayload<{
  select: typeof coupleSummarySelect;
}>;

export type UserForSummary = {
  id: string;
  version: number;
  displayName: string;
};

export type MembershipForSummary = {
  slot: number;
  nicknameInRelationship: string | null;
};

export function toUserSummary(
  user: UserForSummary,
  membership: MembershipForSummary,
): UserSummary {
  if (membership.slot !== 1 && membership.slot !== 2) {
    throw new Error(`Unexpected fixed identity slot: ${membership.slot}`);
  }
  return {
    id: user.id,
    version: user.version,
    displayName: user.displayName,
    slot: membership.slot,
    role: roleForSlot(membership.slot),
    nicknameInRelationship: membership.nicknameInRelationship,
    avatarUrl: null,
  };
}

export function toCoupleSummary(couple: CoupleForSummary): CoupleSummary {
  const theme: ThemePreference =
    couple.theme === "light" || couple.theme === "dark"
      ? couple.theme
      : "system";
  return {
    id: couple.id,
    version: couple.version,
    name: couple.name,
    startDate: couple.startDate.toISOString().slice(0, 10),
    timezone: couple.timezone,
    signature: couple.signature,
    theme,
    members: couple.members.map((member) => toUserSummary(member.user, member)),
  };
}
