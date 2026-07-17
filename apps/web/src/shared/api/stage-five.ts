import type {
  DataStatusResponse,
  ExportFormat,
  ExportJobView,
  RecycleBinResourceType,
  RecycleBinResponse,
  RecycleBinRestoreResult,
} from "@our-tomorrow/contracts";

import { apiClient } from "@/shared/api/client";

export type {
  DataStatusResponse,
  ExportJobStatus,
  ExportJobView,
} from "@our-tomorrow/contracts";

function idempotencyHeaders(key: string) {
  return { "Idempotency-Key": key };
}

function queryString(values: Record<string, unknown>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const serialized = search.toString();
  return serialized ? `?${serialized}` : "";
}

export const stageFiveApi = {
  dataStatus() {
    return apiClient.get<DataStatusResponse>("/settings/data-status");
  },

  recycleBin(
    filters: {
      limit?: number;
      cursor?: string | null;
      type?: RecycleBinResourceType | null;
    } = {},
  ) {
    return apiClient.get<RecycleBinResponse>(
      `/recycle-bin${queryString(filters)}`,
    );
  },

  restoreRecycleBinItem(id: string) {
    return apiClient.post<RecycleBinRestoreResult>(
      `/recycle-bin/${id}/restore`,
    );
  },

  requestRecycleBinPurge(id: string) {
    return apiClient.delete<void>(`/recycle-bin/${id}`);
  },

  exports() {
    return apiClient.get<ExportJobView[]>("/exports");
  },

  createExport(format: ExportFormat, idempotencyKey: string) {
    return apiClient.post<ExportJobView>(
      "/exports",
      { confirmed: true, format },
      { headers: idempotencyHeaders(idempotencyKey) },
    );
  },

  downloadExport(id: string) {
    return apiClient.postBlob(`/exports/${id}/download`);
  },

  deleteExport(id: string) {
    return apiClient.delete<void>(`/exports/${id}`);
  },
};
