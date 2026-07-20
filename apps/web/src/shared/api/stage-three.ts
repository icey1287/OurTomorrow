import type {
  CreateNoteRequest,
  CurrentStatusSummary,
  CurrentStatusesResponse,
  NearbyPlacesRequest,
  NoteListResponse,
  NoteView,
  PlaceSearchResponse,
  UpsertCurrentStatusRequest,
} from "@our-tomorrow/contracts";

import { apiClient } from "@/shared/api/client";

function queryString(values: Record<string, unknown>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const value = search.toString();
  return value ? `?${value}` : "";
}

export const stageThreeApi = {
  statuses() {
    return apiClient.get<CurrentStatusesResponse>("/statuses/current");
  },

  setStatus(input: UpsertCurrentStatusRequest) {
    return apiClient.put<CurrentStatusSummary>("/statuses/me", input);
  },

  nearbyPlaces(input: NearbyPlacesRequest) {
    return apiClient.post<PlaceSearchResponse>("/places/nearby", input);
  },

  statusMapPreview(statusId: string) {
    return apiClient.getBlob(`/places/status/${statusId}/map-preview`);
  },

  clearStatus(version: number) {
    return apiClient.delete<void>(`/statuses/me${queryString({ version })}`);
  },

  notes(scope: "all" | "sent" | "received" = "all") {
    return apiClient.get<NoteListResponse>(`/notes${queryString({ scope })}`);
  },

  createNote(input: CreateNoteRequest) {
    return apiClient.post<NoteView>("/notes", input);
  },

  markNoteViewed(id: string, version?: number) {
    return apiClient.post<NoteView>(
      `/notes/${id}/mark-viewed`,
      version === undefined ? undefined : { version },
    );
  },
};
