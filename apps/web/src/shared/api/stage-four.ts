import type {
  AnniversaryDetail,
  AnniversaryOccurrence,
  AnniversaryReminderView,
  AnniversarySummary,
  CapsuleActionRequest,
  CapsuleDetail,
  CapsuleSummary,
  CompleteWishRequest,
  ConvertCapsuleToMemoryRequest,
  ConvertWishToMemoryRequest,
  CreateAnniversaryReminderRequest,
  CreateAnniversaryRequest,
  CreateCapsuleRequest,
  CreatePlanRequest,
  CreateWishRequest,
  CreateWishUpdateRequest,
  MemoryDetail,
  NoteConversionRequest,
  ConversionResult,
  Paginated,
  PlanStatus,
  PlanSummary,
  ReopenWishRequest,
  TodayUpcomingResponse,
  UpdateAnniversaryRequest,
  UpdateCapsuleRequest,
  UpdatePlanRequest,
  UpdateWishRequest,
  WishActionRequest,
  WishCategory,
  WishDetail,
  WishPlanRequest,
  WishStatus,
  WishSummary,
  WishUpdateView,
} from "@our-tomorrow/contracts";

import { apiClient } from "@/shared/api/client";

export interface WishListFilters {
  cursor?: string | null;
  limit?: number;
  status?: WishStatus | null;
  category?: WishCategory | null;
  placeId?: string | null;
  query?: string | null;
}

export interface PlanListFilters {
  status?: PlanStatus | null;
  wishId?: string | null;
  anniversaryId?: string | null;
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

function conversionHeaders(idempotencyKey: string) {
  return { "Idempotency-Key": idempotencyKey };
}

export const stageFourApi = {
  convertNote(
    id: string,
    input: NoteConversionRequest,
    idempotencyKey: string,
  ) {
    return apiClient.post<ConversionResult>(`/notes/${id}/convert`, input, {
      headers: conversionHeaders(idempotencyKey),
    });
  },

  wishes(filters: WishListFilters = {}) {
    return apiClient.get<Paginated<WishSummary>>(
      `/wishes${queryString(filters)}`,
    );
  },

  wish(id: string) {
    return apiClient.get<WishDetail>(`/wishes/${id}`);
  },

  createWish(input: CreateWishRequest) {
    return apiClient.post<WishDetail>("/wishes", input);
  },

  updateWish(id: string, input: UpdateWishRequest) {
    return apiClient.patch<WishDetail>(`/wishes/${id}`, input);
  },

  deleteWish(id: string, version: number) {
    return apiClient.delete<void>(`/wishes/${id}${queryString({ version })}`);
  },

  planWish(id: string, input: WishPlanRequest) {
    return apiClient.post<WishDetail>(`/wishes/${id}/plan`, input);
  },

  startWish(id: string, input: WishActionRequest) {
    return apiClient.post<WishDetail>(`/wishes/${id}/start`, input);
  },

  completeWish(id: string, input: CompleteWishRequest) {
    return apiClient.post<WishDetail>(`/wishes/${id}/complete`, input);
  },

  reopenWish(id: string, input: ReopenWishRequest) {
    return apiClient.post<WishDetail>(`/wishes/${id}/reopen`, input);
  },

  addWishUpdate(id: string, input: CreateWishUpdateRequest) {
    return apiClient.post<WishUpdateView>(`/wishes/${id}/updates`, input);
  },

  convertWishToMemory(
    id: string,
    input: ConvertWishToMemoryRequest,
    idempotencyKey: string,
  ) {
    return apiClient.post<MemoryDetail>(
      `/wishes/${id}/convert-to-memory`,
      input,
      { headers: conversionHeaders(idempotencyKey) },
    );
  },

  plans(filters: PlanListFilters = {}) {
    return apiClient.get<PlanSummary[]>(`/plans${queryString(filters)}`);
  },

  plan(id: string) {
    return apiClient.get<PlanSummary>(`/plans/${id}`);
  },

  createPlan(input: CreatePlanRequest) {
    return apiClient.post<PlanSummary>("/plans", input);
  },

  updatePlan(id: string, input: UpdatePlanRequest) {
    return apiClient.patch<PlanSummary>(`/plans/${id}`, input);
  },

  deletePlan(id: string, version: number) {
    return apiClient.delete<void>(`/plans/${id}${queryString({ version })}`);
  },

  schedulePlan(id: string, input: WishActionRequest) {
    return apiClient.post<PlanSummary>(`/plans/${id}/schedule`, input);
  },

  startPlan(id: string, input: WishActionRequest) {
    return apiClient.post<PlanSummary>(`/plans/${id}/start`, input);
  },

  completePlan(id: string, input: WishActionRequest) {
    return apiClient.post<PlanSummary>(`/plans/${id}/complete`, input);
  },

  cancelPlan(id: string, input: WishActionRequest) {
    return apiClient.post<PlanSummary>(`/plans/${id}/cancel`, input);
  },

  anniversaries() {
    return apiClient.get<AnniversarySummary[]>("/anniversaries");
  },

  anniversary(id: string) {
    return apiClient.get<AnniversaryDetail>(`/anniversaries/${id}`);
  },

  createAnniversary(input: CreateAnniversaryRequest) {
    return apiClient.post<AnniversarySummary>("/anniversaries", input);
  },

  updateAnniversary(id: string, input: UpdateAnniversaryRequest) {
    return apiClient.patch<AnniversarySummary>(`/anniversaries/${id}`, input);
  },

  deleteAnniversary(id: string, version: number) {
    return apiClient.delete<void>(
      `/anniversaries/${id}${queryString({ version })}`,
    );
  },

  anniversaryOccurrences(id: string) {
    return apiClient.get<AnniversaryOccurrence[]>(
      `/anniversaries/${id}/occurrences`,
    );
  },

  createAnniversaryReminder(
    id: string,
    input: CreateAnniversaryReminderRequest,
  ) {
    return apiClient.post<AnniversaryReminderView>(
      `/anniversaries/${id}/reminders`,
      input,
    );
  },

  deleteAnniversaryReminder(id: string, reminderId: string) {
    return apiClient.delete<void>(
      `/anniversaries/${id}/reminders/${reminderId}`,
    );
  },

  capsules() {
    return apiClient.get<CapsuleSummary[]>("/capsules");
  },

  capsule(id: string) {
    return apiClient.get<CapsuleDetail>(`/capsules/${id}`);
  },

  createCapsule(input: CreateCapsuleRequest) {
    return apiClient.post<CapsuleDetail>("/capsules", input);
  },

  updateCapsule(id: string, input: UpdateCapsuleRequest) {
    return apiClient.patch<CapsuleDetail>(`/capsules/${id}`, input);
  },

  deleteCapsule(id: string, version: number) {
    return apiClient.delete<void>(`/capsules/${id}${queryString({ version })}`);
  },

  sealCapsule(id: string, input: CapsuleActionRequest) {
    return apiClient.post<CapsuleDetail>(`/capsules/${id}/seal`, input);
  },

  markCapsuleConditionMet(id: string, input: CapsuleActionRequest) {
    return apiClient.post<CapsuleDetail>(
      `/capsules/${id}/mark-condition-met`,
      input,
    );
  },

  confirmCapsuleOpen(id: string, input: CapsuleActionRequest) {
    return apiClient.post<CapsuleDetail>(`/capsules/${id}/confirm-open`, input);
  },

  openCapsule(id: string, input: CapsuleActionRequest) {
    return apiClient.post<CapsuleDetail>(`/capsules/${id}/open`, input);
  },

  convertCapsuleToMemory(
    id: string,
    input: ConvertCapsuleToMemoryRequest,
    idempotencyKey: string,
  ) {
    return apiClient.post<MemoryDetail>(
      `/capsules/${id}/convert-to-memory`,
      input,
      { headers: conversionHeaders(idempotencyKey) },
    );
  },

  upcoming(days = 45) {
    return apiClient.get<TodayUpcomingResponse>(
      `/today/upcoming${queryString({ days })}`,
    );
  },
};
