import { ExportFormat, ExportJobStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { toExportJobView } from "./export.presentation";

const NOW = new Date("2026-07-17T08:00:00.000Z");

describe("export presentation", () => {
  it("maps internal job state without exposing storage details or raw errors", () => {
    const view = toExportJobView(
      {
        id: "11111111-1111-4111-8111-111111111111",
        status: ExportJobStatus.FAILED,
        format: ExportFormat.ZIP,
        checksum: "internal-checksum",
        startedAt: NOW,
        completedAt: null,
        expiresAt: null,
        lastError: "private diary sentinel and /data/media/exports/file.zip",
        createdAt: NOW,
      },
      null,
      NOW,
    );

    expect(view).toMatchObject({
      status: "FAILED",
      checksumSha256: null,
      fileSize: null,
      downloadAvailable: false,
      failureMessage: "导出没有完成，请重新创建一份导出。",
    });
    expect(JSON.stringify(view)).not.toContain("sentinel");
    expect(JSON.stringify(view)).not.toContain("/data/media");
  });

  it("treats a completed but expired package as expired", () => {
    const view = toExportJobView(
      {
        id: "11111111-1111-4111-8111-111111111111",
        status: ExportJobStatus.COMPLETED,
        format: ExportFormat.ZIP,
        checksum: "abc",
        startedAt: NOW,
        completedAt: NOW,
        expiresAt: new Date(NOW.valueOf() - 1),
        lastError: null,
        createdAt: NOW,
      },
      123,
      NOW,
    );

    expect(view.status).toBe("EXPIRED");
    expect(view.downloadAvailable).toBe(false);
    expect(view.checksumSha256).toBeNull();
  });
});
