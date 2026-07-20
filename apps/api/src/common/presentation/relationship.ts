import { Prisma } from "@prisma/client";
import type { IdentityRole } from "../../identity/identity.constants";
import { roleForSlot } from "../../identity/identity.constants";

export type UserSummary = {
  id: string;
  displayName: string;
  slot: 1 | 2;
  role: IdentityRole;
};

export type CoupleSummary = {
  id: string;
  version: number;
  name: string;
  startDate: string;
  timezone: string;
  signature: string | null;
  members: UserSummary[];
};

export const coupleSummarySelect = Prisma.validator<Prisma.CoupleSelect>()({
  id: true,
  version: true,
  name: true,
  startDate: true,
  timezone: true,
  signature: true,
  members: {
    orderBy: { slot: "asc" },
    select: {
      slot: true,
      user: { select: { id: true, displayName: true } },
    },
  },
});

export type CoupleForSummary = Prisma.CoupleGetPayload<{
  select: typeof coupleSummarySelect;
}>;

export function toUserSummary(
  user: { id: string; displayName: string },
  slot: number,
): UserSummary {
  if (slot !== 1 && slot !== 2) {
    throw new Error(`Unexpected fixed identity slot: ${slot}`);
  }
  return {
    id: user.id,
    displayName: user.displayName,
    slot,
    role: roleForSlot(slot),
  };
}

export function toCoupleSummary(couple: CoupleForSummary): CoupleSummary {
  return {
    id: couple.id,
    version: couple.version,
    name: couple.name,
    startDate: couple.startDate.toISOString().slice(0, 10),
    timezone: couple.timezone,
    signature: couple.signature,
    members: couple.members.map((member) =>
      toUserSummary(member.user, member.slot),
    ),
  };
}
