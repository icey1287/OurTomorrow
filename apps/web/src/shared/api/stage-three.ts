import type {
  CreateNoteRequest,
  CurrentStatusSummary,
  CurrentStatusesResponse,
  DailyEntryCalendarResponse,
  DailyEntryTodayResponse,
  MoodEntrySummary,
  MoodMonthResponse,
  NoteListResponse,
  NoteReactionRequest,
  NoteView,
  NotificationListResponse,
  NotificationUnreadCountResponse,
  ReactionSummary,
  ReorderNotesRequest,
  SaveDailyEntryRequest,
  SubmitDailyEntryRequest,
  UpdateDailyEntryPostscriptRequest,
  UpdateNoteRequest,
  UpsertCurrentStatusRequest,
  UpsertMoodRequest,
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

function noteEtag(id: string, version: number) {
  return `"note:${id}:${version}"`;
}

export const stageThreeApi = {
  statuses() {
    return apiClient.get<CurrentStatusesResponse>("/statuses/current");
  },

  setStatus(input: UpsertCurrentStatusRequest) {
    return apiClient.put<CurrentStatusSummary>("/statuses/me", input);
  },

  clearStatus(version: number) {
    return apiClient.delete<void>(`/statuses/me${queryString({ version })}`);
  },

  notes(scope: "all" | "sent" | "received" = "all", includeArchived = false) {
    return apiClient.get<NoteListResponse>(
      `/notes${queryString({ scope, includeArchived })}`,
    );
  },

  note(id: string) {
    return apiClient.get<NoteView>(`/notes/${id}`);
  },

  createNote(input: CreateNoteRequest) {
    return apiClient.post<NoteView>("/notes", input);
  },

  updateNote(id: string, input: UpdateNoteRequest) {
    return apiClient.patch<NoteView>(`/notes/${id}`, input, {
      headers: { "If-Match": noteEtag(id, input.version) },
    });
  },

  deleteNote(id: string, version: number) {
    return apiClient.delete<void>(`/notes/${id}${queryString({ version })}`, {
      headers: { "If-Match": noteEtag(id, version) },
    });
  },

  markNoteViewed(id: string, version?: number) {
    return apiClient.post<NoteView>(
      `/notes/${id}/mark-viewed`,
      version === undefined ? undefined : { version },
    );
  },

  setNoteReaction(id: string, input: NoteReactionRequest) {
    return apiClient.put<ReactionSummary[]>(`/notes/${id}/reaction`, input);
  },

  removeNoteReaction(id: string, input: NoteReactionRequest) {
    return apiClient.delete<ReactionSummary[]>(`/notes/${id}/reaction`, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  },

  reorderNotes(input: ReorderNotesRequest) {
    return apiClient.put<NoteListResponse>("/notes/order", input);
  },

  dailyEntryToday() {
    return apiClient.get<DailyEntryTodayResponse>("/daily-entries/today");
  },

  dailyEntry(date: string) {
    return apiClient.get<DailyEntryTodayResponse>(
      `/daily-entries/${encodeURIComponent(date)}`,
    );
  },

  saveDailyEntry(input: SaveDailyEntryRequest) {
    return apiClient.put<DailyEntryTodayResponse>(
      "/daily-entries/today",
      input,
    );
  },

  submitDailyEntry(input: SubmitDailyEntryRequest) {
    return apiClient.post<DailyEntryTodayResponse>(
      "/daily-entries/today/submit",
      input,
    );
  },

  updateDailyEntryPostscript(input: UpdateDailyEntryPostscriptRequest) {
    return apiClient.post<DailyEntryTodayResponse>(
      "/daily-entries/today/postscript",
      input,
    );
  },

  dailyEntryCalendar(month: string) {
    return apiClient.get<DailyEntryCalendarResponse>(
      `/daily-entries/calendar${queryString({ month })}`,
    );
  },

  moods(month: string) {
    return apiClient.get<MoodMonthResponse>(`/moods${queryString({ month })}`);
  },

  setMood(input: UpsertMoodRequest) {
    return apiClient.put<MoodEntrySummary>("/moods/today", input);
  },

  deleteMood(version: number) {
    return apiClient.delete<void>(`/moods/today${queryString({ version })}`);
  },

  notifications(cursor?: string | null) {
    return apiClient.get<NotificationListResponse>(
      `/notifications${queryString({ cursor })}`,
    );
  },

  notificationUnreadCount() {
    return apiClient.get<NotificationUnreadCountResponse>(
      "/notifications/unread-count",
    );
  },

  markNotificationRead(id: string) {
    return apiClient.post<void>(`/notifications/${id}/mark-read`);
  },

  markAllNotificationsRead() {
    return apiClient.post<void>("/notifications/mark-all-read");
  },

  archiveNotification(id: string) {
    return apiClient.post<void>(`/notifications/${id}/archive`);
  },
};
