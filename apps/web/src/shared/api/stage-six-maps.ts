import type {
  CreatePlaceRequest,
  PlaceMapResponse,
  PlaceSearchResponse,
  PlaceSummary,
  UpdatePlaceRequest,
  UpdatePlaceStatusRequest,
} from "@our-tomorrow/contracts";

import { apiClient } from "@/shared/api/client";

export const stageSixMapsApi = {
  searchPlaces(input: { query: string; region?: string; limit?: number }) {
    const params = new URLSearchParams({ query: input.query });
    if (input.region) params.set("region", input.region);
    if (input.limit) params.set("limit", String(input.limit));
    return apiClient.get<PlaceSearchResponse>(`/places/search?${params}`);
  },

  createPlace(input: CreatePlaceRequest) {
    return apiClient.post<PlaceSummary>("/places", input);
  },

  updatePlace(id: string, input: UpdatePlaceRequest) {
    return apiClient.patch<PlaceSummary>(`/places/${id}`, input);
  },

  map() {
    return apiClient.get<PlaceMapResponse>("/places/map");
  },

  updateStatus(id: string, input: UpdatePlaceStatusRequest) {
    return apiClient.patch<PlaceSummary>(`/places/${id}/status`, input);
  },
};
