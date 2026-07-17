import {
  Prisma,
  type ExportFormat,
  type ExportJobStatus,
} from "@prisma/client";

export const exportJobSelect = Prisma.validator<Prisma.ExportJobSelect>()({
  id: true,
  status: true,
  format: true,
  checksum: true,
  startedAt: true,
  completedAt: true,
  expiresAt: true,
  lastError: true,
  createdAt: true,
});

export type ExportJobRecord = Prisma.ExportJobGetPayload<{
  select: typeof exportJobSelect;
}>;

export type ExportJobPublicStatus =
  "QUEUED" | "RUNNING" | "READY" | "FAILED" | "EXPIRED";

export type ExportJobView = {
  id: string;
  status: ExportJobPublicStatus;
  format: ExportFormat;
  checksumSha256: string | null;
  fileSize: number | null;
  downloadAvailable: boolean;
  failureMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

const PUBLIC_STATUS: Record<ExportJobStatus, ExportJobPublicStatus> = {
  PENDING: "QUEUED",
  RUNNING: "RUNNING",
  COMPLETED: "READY",
  FAILED: "FAILED",
  EXPIRED: "EXPIRED",
};

export function toExportJobView(
  job: ExportJobRecord,
  fileSize: number | null,
  now: Date,
): ExportJobView {
  const expired = job.expiresAt !== null && job.expiresAt <= now;
  const status = expired ? "EXPIRED" : PUBLIC_STATUS[job.status];
  return {
    id: job.id,
    status,
    format: job.format,
    checksumSha256: status === "READY" ? job.checksum : null,
    fileSize: status === "READY" ? fileSize : null,
    downloadAvailable: status === "READY" && fileSize !== null,
    failureMessage:
      status === "FAILED" ? "导出没有完成，请重新创建一份导出。" : null,
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    expiresAt: job.expiresAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
  };
}
