import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../database/prisma.service";
import { runWithRequestContext } from "../http/request-context";
import { AuditService } from "./audit.service";

describe("AuditService", () => {
  it("uses the current request id and persists only allowlisted metadata", async () => {
    const create = vi.fn().mockResolvedValue({ id: "audit-1" });
    const service = new AuditService({
      auditLog: { create },
    } as unknown as PrismaService);
    const secret = "正文绝不能进入审计";

    await runWithRequestContext("request-stage5a-audit", () =>
      service.record({
        action: "CAPSULE_OPENED",
        actorId: "00000000-0000-4000-8000-000000000101",
        coupleId: "00000000-0000-4000-8000-000000000001",
        resourceType: "CAPSULE",
        resourceId: "c0000000-0000-4000-8000-000000000001",
        metadata: {
          resourceId: "c0000000-0000-4000-8000-000000000001",
          status: "OPENED",
          version: 4,
          secret,
        } as never,
      }),
    );

    expect(create).toHaveBeenCalledWith({
      data: {
        action: "CAPSULE_OPENED",
        actorId: "00000000-0000-4000-8000-000000000101",
        coupleId: "00000000-0000-4000-8000-000000000001",
        resourceType: "CAPSULE",
        resourceId: "c0000000-0000-4000-8000-000000000001",
        requestId: "request-stage5a-audit",
        ipAddress: null,
        userAgent: null,
        metadata: {
          resourceId: "c0000000-0000-4000-8000-000000000001",
          status: "OPENED",
          version: 4,
        },
      },
    });
    expect(JSON.stringify(create.mock.calls)).not.toContain(secret);
  });
});
