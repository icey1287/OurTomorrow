export const API_PREFIX = "/api/v1" as const;

export type ThemePreference = "system" | "light" | "dark";
export type TimeDimension = "remember" | "daily" | "tomorrow";
export type IdentityRole = "boy" | "girl";

export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  requestId: string;
  timestamp: string;
  path: string;
  details?: Record<string, string[]>;
}

export interface UserSummary {
  id: string;
  version: number;
  displayName: string;
  role: IdentityRole;
  slot: 1 | 2;
  nicknameInRelationship: string | null;
  avatarUrl: string | null;
}

export interface CoupleSummary {
  id: string;
  version: number;
  name: string;
  startDate: string;
  timezone: string;
  signature: string | null;
  theme: ThemePreference;
  members: UserSummary[];
}

export interface IdentitySession {
  role: IdentityRole;
  user: UserSummary;
  couple: CoupleSummary;
}

export interface SelectIdentityRequest {
  role: IdentityRole;
}

export interface UpdateCoupleRequest {
  version: number;
  name?: string;
  startDate?: string;
  timezone?: string;
  signature?: string | null;
  theme?: ThemePreference;
}

export interface UpdateProfileRequest {
  version: number;
  displayName?: string;
  nicknameInRelationship?: string | null;
}

export interface TodayRelationship extends CoupleSummary {
  daysTogether: number;
}

export interface TodayResponse {
  serverNow: string;
  localDate: string;
  greeting: string;
  relationship: TodayRelationship;
  partnerStatus: null;
  latestNote: null;
  dailyEntryStatus: null;
  nextAnniversary: null;
  randomMemory: null;
  activeWish: null;
}

export interface PageMeta {
  nextCursor: string | null;
  hasMore: boolean;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

export type WishStatus =
  "IDEA" | "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CONVERTED_TO_MEMORY";

export type CapsuleStatus =
  | "DRAFT"
  | "SEALED"
  | "LOCKED"
  | "DUE"
  | "UNLOCKED"
  | "OPENED"
  | "CONVERTED_TO_MEMORY";

export type NoteStatus =
  "DRAFT" | "SCHEDULED" | "VISIBLE" | "VIEWED" | "ARCHIVED" | "EXPIRED";

export type DailyEntryStatus =
  | "DRAFT"
  | "EDITING"
  | "SUBMITTED"
  | "WAITING_FOR_PARTNER"
  | "BOTH_SUBMITTED"
  | "REVEALED";

export interface LiveHealthResponse {
  status: "ok";
  version: string;
  timestamp: string;
}

export interface ReadyHealthResponse {
  status: "ok" | "error";
  version: string;
  timestamp: string;
  database: "up" | "down";
}
