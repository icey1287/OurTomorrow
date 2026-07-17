import type {
  CalmLetterActionRequest,
  CalmLetterDetail,
  CalmLetterSummary,
  CreateCalmLetterRequest,
  CreateTouchEventRequest,
  TouchEventView,
} from "@our-tomorrow/contracts";

import { apiClient } from "@/shared/api/client";

export const stageSixApi = {
  sendTouch(input: CreateTouchEventRequest) {
    return apiClient.post<TouchEventView>("/touch-events", input);
  },

  calmLetters() {
    return apiClient.get<CalmLetterSummary[]>("/calm-letters");
  },

  calmLetter(id: string) {
    return apiClient.get<CalmLetterDetail>(
      `/calm-letters/${encodeURIComponent(id)}`,
    );
  },

  createCalmLetter(input: CreateCalmLetterRequest) {
    return apiClient.post<CalmLetterDetail>("/calm-letters", input);
  },

  openCalmLetter(id: string, input: CalmLetterActionRequest) {
    return apiClient.post<CalmLetterDetail>(
      `/calm-letters/${encodeURIComponent(id)}/open`,
      input,
    );
  },
};
