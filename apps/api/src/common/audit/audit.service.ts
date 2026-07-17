import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { currentRequestId } from "../http/request-context";

type AuditDatabase = Pick<Prisma.TransactionClient, "auditLog">;

export type AuditMetadata = {
  resourceId?: string;
  status?: string;
  version?: number;
};

export type AuditEvent = {
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  action: string;
  actorId?: string | null;
  coupleId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: AuditMetadata;
};

function safeMetadata(
  metadata: AuditMetadata | undefined,
): Prisma.InputJsonObject {
  if (!metadata) return {};
  return {
    ...(typeof metadata.resourceId === "string"
      ? { resourceId: metadata.resourceId }
      : {}),
    ...(typeof metadata.status === "string" ? { status: metadata.status } : {}),
    ...(typeof metadata.version === "number" &&
    Number.isSafeInteger(metadata.version)
      ? { version: metadata.version }
      : {}),
  };
}

@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(
    event: AuditEvent,
    database: AuditDatabase = this.prisma,
  ): Promise<void> {
    await database.auditLog.create({
      data: {
        action: event.action,
        actorId: event.actorId ?? null,
        coupleId: event.coupleId ?? null,
        resourceType: event.resourceType ?? null,
        resourceId: event.resourceId ?? null,
        requestId: event.requestId ?? currentRequestId(),
        ipAddress: event.ipAddress ?? null,
        userAgent: event.userAgent ?? null,
        metadata: safeMetadata(event.metadata),
      },
    });
  }
}
