import type {
  BindMemoryMediaRequest,
  CreateMemoryCommentRequest,
  CreateMemoryRequest,
  CreatePlaceRequest,
  CreateTagRequest,
  CreateUploadIntentRequest,
  MediaAssetSummary,
  MemoryCardSummary,
  MemoryComment,
  MemoryDetail,
  MemoryPerspectiveView,
  MemoryResurfaceTodayResponse,
  MemoryResurfaceView,
  MemoryRevision,
  Paginated,
  PlaceSummary,
  ReactionSummary,
  SubmitMemoryPerspectiveRequest,
  TagSummary,
  UpdateMemoryRequest,
  UpsertMemoryPerspectiveRequest,
  UploadIntentResponse,
} from "@our-tomorrow/contracts";
import { API_PREFIX } from "@our-tomorrow/contracts";

import { apiClient, type ApiRequestInit } from "@/shared/api/client";

export type PerspectiveFilter = "complete" | "incomplete";

export interface MemoryListFilters {
  cursor?: string | null;
  limit?: number;
  year?: number | null;
  month?: number | null;
  tagId?: string | null;
  placeId?: string | null;
  firstTime?: boolean | null;
  perspectiveState?: PerspectiveFilter | null;
  query?: string | null;
}

export interface FirstTimeListFilters {
  cursor?: string | null;
  limit?: number;
}

const uploadCompletionKeys = new Map<string, string>();

function uploadCompletionKey(uploadId: string) {
  const existing = uploadCompletionKeys.get(uploadId);
  if (existing) return existing;

  const key = globalThis.crypto.randomUUID();
  uploadCompletionKeys.set(uploadId, key);
  return key;
}

function queryString(values: object) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }

  const serialized = search.toString();
  return serialized ? `?${serialized}` : "";
}

function memoryEtag(id: string, version: number) {
  return `"memory:${id}:${version}"`;
}

/**
 * Upload and media URLs are returned as same-origin API-root paths. The API
 * client already adds /api/v1, so remove that prefix before passing them on.
 */
export function normalizeStageTwoApiPath(value: string) {
  let pathname = value;

  try {
    if (/^https?:\/\//i.test(value)) pathname = new URL(value).pathname;
  } catch {
    // Let the API client surface an ordinary request error for malformed URLs.
  }

  if (pathname === API_PREFIX) return "/";
  if (pathname.startsWith(`${API_PREFIX}/`)) {
    return pathname.slice(API_PREFIX.length);
  }

  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

export const stageTwoApi = {
  memories(filters: MemoryListFilters = {}) {
    return apiClient.get<Paginated<MemoryCardSummary>>(
      `/memories${queryString(filters)}`,
    );
  },

  firstTimes(filters: FirstTimeListFilters = {}) {
    return apiClient.get<Paginated<MemoryCardSummary>>(
      `/memories/first-times${queryString(filters)}`,
    );
  },

  memory(id: string) {
    return apiClient.get<MemoryDetail>(`/memories/${id}`);
  },

  createMemory(input: CreateMemoryRequest) {
    return apiClient.post<MemoryDetail>("/memories", input);
  },

  updateMemory(id: string, input: UpdateMemoryRequest) {
    return apiClient.patch<MemoryDetail>(`/memories/${id}`, input, {
      headers: { "If-Match": memoryEtag(id, input.version) },
    });
  },

  deleteMemory(id: string, version: number) {
    return apiClient.delete<void>(
      `/memories/${id}${queryString({ version })}`,
      { headers: { "If-Match": memoryEtag(id, version) } },
    );
  },

  revisions(id: string) {
    return apiClient.get<MemoryRevision[]>(`/memories/${id}/revisions`);
  },

  savePerspective(id: string, input: UpsertMemoryPerspectiveRequest) {
    return apiClient.put<MemoryPerspectiveView>(
      `/memories/${id}/perspective`,
      input,
    );
  },

  submitPerspective(id: string, input: SubmitMemoryPerspectiveRequest) {
    return apiClient.post<MemoryPerspectiveView>(
      `/memories/${id}/perspective/submit`,
      input,
    );
  },

  addComment(id: string, input: CreateMemoryCommentRequest) {
    return apiClient.post<MemoryComment>(`/memories/${id}/comments`, input);
  },

  deleteComment(id: string, commentId: string) {
    return apiClient.delete<void>(`/memories/${id}/comments/${commentId}`);
  },

  setReaction(id: string, emoji: string) {
    return apiClient.put<ReactionSummary[]>(
      `/memories/${id}/reactions/${encodeURIComponent(emoji)}`,
    );
  },

  removeReaction(id: string, emoji: string) {
    return apiClient.delete<void>(
      `/memories/${id}/reactions/${encodeURIComponent(emoji)}`,
    );
  },

  bindMedia(id: string, input: BindMemoryMediaRequest) {
    return apiClient.post<MemoryDetail>(`/memories/${id}/media`, input, {
      headers: { "If-Match": memoryEtag(id, input.version) },
    });
  },

  detachMedia(id: string, mediaId: string, version: number) {
    return apiClient.delete<MemoryDetail>(
      `/memories/${id}/media/${mediaId}${queryString({ version })}`,
      { headers: { "If-Match": memoryEtag(id, version) } },
    );
  },

  tags() {
    return apiClient.get<TagSummary[]>("/tags");
  },

  createTag(input: CreateTagRequest) {
    return apiClient.post<TagSummary>("/tags", input);
  },

  places() {
    return apiClient.get<PlaceSummary[]>("/places");
  },

  createPlace(input: CreatePlaceRequest) {
    return apiClient.post<PlaceSummary>("/places", input);
  },

  createUploadIntent(input: CreateUploadIntentRequest) {
    return apiClient.post<UploadIntentResponse>("/uploads/presign", input);
  },

  uploadBinary(uploadUrl: string, file: Blob, mimeType: string) {
    return apiClient.putBinary(
      normalizeStageTwoApiPath(uploadUrl),
      file,
      mimeType,
    );
  },

  completeUpload(uploadId: string) {
    return apiClient.post<MediaAssetSummary>(
      "/uploads/complete",
      { uploadId },
      { headers: { "Idempotency-Key": uploadCompletionKey(uploadId) } },
    );
  },

  privateMedia(url: string, init?: ApiRequestInit) {
    return apiClient.blob(normalizeStageTwoApiPath(url), init);
  },

  deleteMedia(id: string) {
    return apiClient.delete<void>(`/media/${id}`);
  },

  randomMemory(excludeId?: string | null) {
    return apiClient.get<MemoryCardSummary | null>(
      `/today/random-memory${queryString({ excludeId })}`,
    );
  },

  memoryResurfaceToday() {
    return apiClient.get<MemoryResurfaceTodayResponse>(
      "/memory-resurfaces/today",
    );
  },

  openMemoryResurface(id: string) {
    return apiClient.post<MemoryResurfaceView>(`/memory-resurfaces/${id}/open`);
  },

  dismissMemoryResurface(id: string) {
    return apiClient.post<MemoryResurfaceView>(
      `/memory-resurfaces/${id}/dismiss`,
    );
  },
};
