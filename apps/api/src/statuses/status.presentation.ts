import { Prisma } from "@prisma/client";
import type { CoupleSummary } from "../common/presentation/relationship";
import type { CurrentStatusKind } from "./dto/status.dto";

export const currentStatusSelect =
  Prisma.validator<Prisma.CurrentStatusSelect>()({
    id: true,
    authorId: true,
    version: true,
    kind: true,
    message: true,
    location: true,
    locationAddress: true,
    latitude: true,
    longitude: true,
    startsAt: true,
    expiresAt: true,
    createdAt: true,
    updatedAt: true,
  });

export type CurrentStatusRecord = Prisma.CurrentStatusGetPayload<{
  select: typeof currentStatusSelect;
}>;

export type CurrentStatusView = {
  id: string;
  version: number;
  author: CoupleSummary["members"][number];
  kind: CurrentStatusKind;
  message: string | null;
  location: string | null;
  locationAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  startsAt: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type CurrentStatusesResponse = {
  serverNow: string;
  mine: CurrentStatusView | null;
  partner: CurrentStatusView | null;
};

export function toCurrentStatusView(
  status: CurrentStatusRecord,
  couple: CoupleSummary,
): CurrentStatusView {
  const author = couple.members.find((member) => member.id === status.authorId);
  if (!author) throw new Error("Current status author is not a couple member");
  return {
    id: status.id,
    version: status.version,
    author,
    kind: status.kind as CurrentStatusKind,
    message: status.message,
    location: status.location,
    locationAddress: status.locationAddress,
    latitude: status.latitude === null ? null : Number(status.latitude),
    longitude: status.longitude === null ? null : Number(status.longitude),
    startsAt: status.startsAt.toISOString(),
    expiresAt: status.expiresAt.toISOString(),
    createdAt: status.createdAt.toISOString(),
    updatedAt: status.updatedAt.toISOString(),
  };
}
