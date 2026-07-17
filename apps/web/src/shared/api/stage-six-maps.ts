import type {
  CreatePlaceRequest,
  PlaceMapResponse,
  PlaceSummary,
  UpdatePlaceRequest,
  UpdatePlaceStatusRequest,
} from "@our-tomorrow/contracts";

import { apiClient } from "@/shared/api/client";

export const stageSixMapsApi = {
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
