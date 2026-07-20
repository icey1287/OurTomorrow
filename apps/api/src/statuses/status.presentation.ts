import { type CurrentStatusKind, Prisma } from "@prisma/client";
import type {
  CoupleSummary,
  UserSummary,
} from "../common/presentation/relationship";

export const currentStatusSelect =
  Prisma.validator<Prisma.CurrentStatusSelect>()({
    id: true,
    authorId: true,
    kind: true,
    message: true,
    mood: true,
    scene: true,
    location: true,
    locationAddress: true,
    latitude: true,
    longitude: true,
    needsResponse: true,
    startsAt: true,
    expiresAt: true,
    version: true,
    createdAt: true,
    updatedAt: true,
  });

export type CurrentStatusRecord = Prisma.CurrentStatusGetPayload<{
  select: typeof currentStatusSelect;
}>;

export type CurrentStatusView = {
  id: string;
  version: number;
  author: UserSummary;
  kind: CurrentStatusKind;
  message: string | null;
  mood: string | null;
  scene: string | null;
  location: string | null;
  locationAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  needsResponse: boolean;
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

function member(couple: CoupleSummary, userId: string): UserSummary {
  const result = couple.members.find((candidate) => candidate.id === userId);
  if (!result) throw new Error("Current status references a non-member user");
  return result;
}

export function toCurrentStatusView(
  status: CurrentStatusRecord,
  couple: CoupleSummary,
): CurrentStatusView {
  return {
    id: status.id,
    version: status.version,
    author: member(couple, status.authorId),
    kind: status.kind,
    message: status.message,
    mood: status.mood,
    scene: status.scene,
    location: status.location,
    locationAddress: status.locationAddress,
    latitude: status.latitude === null ? null : Number(status.latitude),
    longitude: status.longitude === null ? null : Number(status.longitude),
    needsResponse: status.needsResponse,
    startsAt: status.startsAt.toISOString(),
    expiresAt: status.expiresAt.toISOString(),
    createdAt: status.createdAt.toISOString(),
    updatedAt: status.updatedAt.toISOString(),
  };
}
