import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";

type AuditDatabase = Pick<Prisma.TransactionClient, "auditLog">;

export type AuditEvent = {
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  action: string;
  actorId?: string | null;
  coupleId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Prisma.InputJsonObject;
};

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
        requestId: event.requestId,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        metadata: event.metadata ?? {},
      },
    });
  }
}
