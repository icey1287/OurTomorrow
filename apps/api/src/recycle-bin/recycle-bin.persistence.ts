import { randomUUID } from "node:crypto";
import {
  Prisma,
  RecycleBinResourceType,
  RecycleBinVisibility,
} from "@prisma/client";
import {
  cancelScheduledEvent,
  upsertScheduledEvent,
} from "../shared-events/persistent-event";

export const RECYCLE_BIN_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
export const RECYCLE_BIN_PURGE_COOLING_OFF_MS = 7 * 24 * 60 * 60 * 1_000;

type RecycleBinDatabase = Pick<
  Prisma.TransactionClient,
  "recycleBinItem" | "scheduledEvent"
>;

export type RecycleBinRecordInput = {
  coupleId: string;
  resourceType: RecycleBinResourceType;
  resourceId: string;
  deletedById: string;
  deletedAt: Date;
  restoreData: Prisma.InputJsonObject;
  visibility?: RecycleBinVisibility;
  ownerId?: string | null;
};

export function recycleBinPurgeEventKey(itemId: string): string {
  return `recycle-bin:${itemId}:purge`;
}

export async function createRecycleBinItem(
  database: RecycleBinDatabase,
  input: RecycleBinRecordInput,
): Promise<string> {
  const id = randomUUID();
  const visibility = input.visibility ?? RecycleBinVisibility.SHARED;
  const ownerId = input.ownerId ?? null;
  if (visibility === RecycleBinVisibility.OWNER_ONLY && ownerId === null) {
    throw new Error("Owner-only recycle-bin items require ownerId");
  }
  const retentionUntil = new Date(
    input.deletedAt.getTime() + RECYCLE_BIN_RETENTION_MS,
  );
  await database.recycleBinItem.create({
    data: {
      id,
      coupleId: input.coupleId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      visibility,
      ownerId,
      deletedById: input.deletedById,
      restoreData: input.restoreData,
      deletedAt: input.deletedAt,
      retentionUntil,
    },
    select: { id: true },
  });
  await upsertScheduledEvent(database, {
    coupleId: input.coupleId,
    dedupeKey: recycleBinPurgeEventKey(id),
    type: "RECYCLE_BIN_PURGE",
    payload: { recycleBinItemId: id },
    runAt: retentionUntil,
    maxAttempts: 10,
  });
  return id;
}

export async function cancelRecycleBinPurge(
  database: Pick<Prisma.TransactionClient, "scheduledEvent">,
  itemId: string,
): Promise<void> {
  await cancelScheduledEvent(database, recycleBinPurgeEventKey(itemId), [
    "PENDING",
    "RETRYING",
    "RUNNING",
  ]);
}

export function nullableInstant(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}
