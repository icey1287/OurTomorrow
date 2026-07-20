import type {
  CoupleSummary,
  IdentitySession,
  SelectIdentityRequest,
  UpdateCoupleRequest,
} from "@our-tomorrow/contracts";

import { apiClient } from "@/shared/api/client";

export const stageOneApi = {
  selectIdentity(input: SelectIdentityRequest) {
    return apiClient.post<IdentitySession>("/identity/select", input, {
      includeIdentity: false,
    });
  },
  identity() {
    return apiClient.get<IdentitySession>("/identity/me");
  },
  currentCouple() {
    return apiClient.get<CoupleSummary>("/couples/current");
  },
  updateCouple(input: UpdateCoupleRequest) {
    return apiClient.patch<CoupleSummary>("/couples/current", input);
  },
};
