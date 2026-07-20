export const API_PREFIX = "/api/v1" as const;

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
  displayName: string;
  slot: 1 | 2;
  role: IdentityRole;
}

export interface CoupleSummary {
  id: string;
  version: number;
  name: string;
  startDate: string;
  timezone: string;
  signature: string | null;
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
  startDate?: string;
  signature?: string | null;
}

export interface PlaceSearchSuggestion {
  id: string;
  name: string;
  address: string | null;
  district: string | null;
  latitude: number;
  longitude: number;
  distanceMeters?: number | null;
}

export interface PlaceSearchResponse {
  items: PlaceSearchSuggestion[];
}

export interface NearbyPlacesRequest {
  latitude: number;
  longitude: number;
  radius?: number;
  limit?: number;
}

export type CurrentStatusKind =
  "HAPPY" | "BUSY" | "COMMUTING" | "HOME" | "RESTING" | "MISS_YOU";

export interface CurrentStatusSummary {
  id: string;
  version: number;
  author: UserSummary;
  kind: CurrentStatusKind;
  message: string | null;
  location: string | null;
  locationAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  startsAt: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CurrentStatusesResponse {
  serverNow: string;
  mine: CurrentStatusSummary | null;
  partner: CurrentStatusSummary | null;
}

export interface UpsertCurrentStatusRequest {
  kind: CurrentStatusKind;
  message?: string | null;
  location: string;
  locationAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  expiresAt: string;
  version?: number;
}

export type NoteStatus = "VISIBLE" | "VIEWED";

export interface NoteView {
  id: string;
  version: number;
  status: NoteStatus;
  content: string;
  icon: string | null;
  author: UserSummary;
  recipient: UserSummary;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NoteListResponse {
  serverNow: string;
  items: NoteView[];
}

export interface CreateNoteRequest {
  content: string;
  icon?: string | null;
}

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
