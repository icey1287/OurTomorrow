import type {
  AnnualReviewView,
  MediaAssetSummary,
  PublishAnnualReviewRequest,
  UpdateAnnualReviewRequest,
} from "@our-tomorrow/contracts";

import { apiClient } from "@/shared/api/client";

export const annualReviewApi = {
  list() {
    return apiClient.get<AnnualReviewView[]>("/annual-reviews");
  },

  mediaOptions(year: number) {
    return apiClient.get<MediaAssetSummary[]>(
      `/annual-reviews/${year}/media-options`,
    );
  },

  get(year: number) {
    return apiClient.get<AnnualReviewView>(`/annual-reviews/${year}`);
  },

  request(year: number) {
    return apiClient.post<AnnualReviewView>(`/annual-reviews/${year}`);
  },

  update(year: number, input: UpdateAnnualReviewRequest) {
    return apiClient.patch<AnnualReviewView>(`/annual-reviews/${year}`, input);
  },

  publish(year: number, input: PublishAnnualReviewRequest) {
    return apiClient.post<AnnualReviewView>(
      `/annual-reviews/${year}/publish`,
      input,
    );
  },
};
