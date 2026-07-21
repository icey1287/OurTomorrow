import type {
  CoupleSummary,
  IdentitySession,
  ResolveIdentityRequest,
  SelectIdentityRequest,
  UpdateCoupleRequest,
} from "@our-tomorrow/contracts";

import { apiClient } from "@/shared/api/client";

export const stageOneApi = {
  resolveIdentity(input: ResolveIdentityRequest) {
    return apiClient.post<IdentitySession>("/identity/resolve", input, {
      includeIdentity: false,
    });
  },
  selectIdentity(input: SelectIdentityRequest) {
    return apiClient.post<IdentitySession>("/identity/select", input, {
      includeIdentity: false,
    });
  },
  updateCouple(input: UpdateCoupleRequest) {
    return apiClient.patch<CoupleSummary>("/couples/current", input);
  },
};
