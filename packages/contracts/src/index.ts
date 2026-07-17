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

export type MemoryStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type MemoryPerspectiveState = "EMPTY" | "DRAFT" | "SUBMITTED";
export type MemoryMediaRole = "COVER" | "GALLERY" | "ATTACHMENT";
export type PlaceStatus =
  | "VISITED"
  | "LIVED"
  | "FIRST_TIME"
  | "WANT_TO_GO"
  | "PLANNED"
  | "DEPARTING"
  | "COMPLETED";

export interface TagSummary {
  id: string;
  version: number;
  name: string;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlaceSummary {
  id: string;
  version: number;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  status: PlaceStatus;
  firstVisitedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MediaAssetSummary {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  url: string;
  thumbnailUrl: string;
  createdAt: string;
}

export interface MemoryMediaView {
  role: MemoryMediaRole;
  sortOrder: number;
  asset: MediaAssetSummary;
}

export interface MemoryPerspectiveView {
  author: UserSummary;
  state: MemoryPerspectiveState;
  editable: boolean;
  version?: number;
  content?: string;
  mood?: string | null;
  submittedAt?: string | null;
  updatedAt?: string;
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export interface MemoryComment {
  id: string;
  content: string;
  author: UserSummary;
  canDelete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryCardSummary {
  id: string;
  version: number;
  title: string;
  excerpt: string | null;
  happenedAt: string;
  status: MemoryStatus;
  place: PlaceSummary | null;
  coverMedia: MediaAssetSummary | null;
  tags: TagSummary[];
  isFirstTime: boolean;
  firstTimeLabel: string | null;
  isPinned: boolean;
  perspectiveSubmittedCount: number;
  perspectivesComplete: boolean;
  commentCount: number;
  reactions: ReactionSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface MemoryDetail extends MemoryCardSummary {
  content: string | null;
  mood: string | null;
  createdBy: UserSummary;
  updatedBy: UserSummary | null;
  media: MemoryMediaView[];
  perspectives: MemoryPerspectiveView[];
  comments: MemoryComment[];
}

export interface MemoryRevision {
  version: number;
  author: UserSummary;
  changes: Record<string, { from: unknown; to: unknown }>;
  createdAt: string;
}

export interface CreateMemoryRequest {
  title: string;
  content?: string | null;
  happenedAt: string;
  placeId?: string | null;
  mood?: string | null;
  isFirstTime?: boolean;
  firstTimeLabel?: string | null;
  isPinned?: boolean;
  status?: Exclude<MemoryStatus, "ARCHIVED">;
  tagIds?: string[];
  mediaIds?: string[];
  coverMediaId?: string | null;
}

export interface UpdateMemoryRequest {
  version: number;
  title?: string;
  content?: string | null;
  happenedAt?: string;
  placeId?: string | null;
  mood?: string | null;
  isFirstTime?: boolean;
  firstTimeLabel?: string | null;
  isPinned?: boolean;
  status?: Exclude<MemoryStatus, "ARCHIVED">;
  tagIds?: string[];
}

export interface UpsertMemoryPerspectiveRequest {
  version?: number;
  content: string;
  mood?: string | null;
}

export interface SubmitMemoryPerspectiveRequest {
  version: number;
}

export interface CreateMemoryCommentRequest {
  content: string;
}

export interface BindMemoryMediaRequest {
  version: number;
  mediaIds: string[];
  coverMediaId?: string | null;
}

export interface CreateTagRequest {
  name: string;
  color?: string | null;
}

export interface UpdateTagRequest {
  version: number;
  name?: string;
  color?: string | null;
}

export interface CreatePlaceRequest {
  name: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status?: PlaceStatus;
  firstVisitedAt?: string | null;
}

export interface UpdatePlaceRequest extends Partial<CreatePlaceRequest> {
  version: number;
}

export interface CreateUploadIntentRequest {
  originalName: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  size: number;
}

export interface UploadIntentResponse {
  uploadId: string;
  uploadUrl: string;
  method: "PUT";
  expiresAt: string;
}

export interface CompleteUploadRequest {
  uploadId: string;
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
  randomMemory: MemoryCardSummary | null;
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
