import type {
  CurrentStatusKind,
  NoteView,
  VisibleNoteView,
} from "@our-tomorrow/contracts";

import {
  butterflyOpen,
  coupleEmblem,
  envelopeClosed,
  envelopeOpen,
  journalCollage,
  microButterfly,
  microHearts,
  microLily,
  microPeony,
  microStamp,
  pinkPetal,
  springDivider,
  springFloralCorner,
  statusHome,
  statusLetter,
  statusLocation,
  statusRest,
  statusSunny,
  statusTransit,
  statusWork,
} from "@/shared/assets/romantic";

export type RomanticStatusKey =
  "sunny" | "work" | "transit" | "home" | "rest" | "letter";

export type NoteDecorationKey = "peony" | "lily" | "butterfly" | "hearts";

export const statusOptions: ReadonlyArray<{
  key: RomanticStatusKey;
  kind: CurrentStatusKind;
  label: string;
  asset: string;
}> = [
  { key: "sunny", kind: "HAPPY", label: "心情晴朗", asset: statusSunny },
  { key: "work", kind: "BUSY", label: "专心忙碌", asset: statusWork },
  {
    key: "transit",
    kind: "COMMUTING",
    label: "正在路上",
    asset: statusTransit,
  },
  { key: "home", kind: "HOME", label: "已经到家", asset: statusHome },
  { key: "rest", kind: "RESTING", label: "准备休息", asset: statusRest },
  { key: "letter", kind: "MISS_YOU", label: "正在想你", asset: statusLetter },
];

const fallbackStatus: Record<
  CurrentStatusKind,
  { key: RomanticStatusKey; label: string }
> = {
  BUSY: { key: "work", label: "专心忙碌" },
  COMMUTING: { key: "transit", label: "正在路上" },
  RESTING: { key: "rest", label: "准备休息" },
  TIRED: { key: "rest", label: "有一点累" },
  HAPPY: { key: "sunny", label: "心情晴朗" },
  NEED_HUG: { key: "letter", label: "需要抱抱" },
  TALK_LATER: { key: "work", label: "晚点聊聊" },
  HOME: { key: "home", label: "已经到家" },
  MISS_YOU: { key: "letter", label: "正在想你" },
  CUSTOM: { key: "sunny", label: "此刻" },
};

export const statusAssetByKey = Object.fromEntries(
  statusOptions.map((option) => [option.key, option.asset]),
) as Record<RomanticStatusKey, string>;

export function statusPresentation(kind: CurrentStatusKind) {
  return fallbackStatus[kind];
}

export const decorationOptions: ReadonlyArray<{
  key: NoteDecorationKey;
  label: string;
  asset: string;
}> = [
  { key: "peony", label: "芍药", asset: microPeony },
  { key: "lily", label: "铃兰", asset: microLily },
  { key: "butterfly", label: "蝴蝶", asset: microButterfly },
  { key: "hearts", label: "双心", asset: microHearts },
];

export const decorationAssetByKey = Object.fromEntries(
  decorationOptions.map((option) => [option.key, option.asset]),
) as Record<NoteDecorationKey, string>;

export function noteDecoration(icon: string | null): NoteDecorationKey {
  return decorationOptions.some((option) => option.key === icon)
    ? (icon as NoteDecorationKey)
    : "peony";
}

export function visibleNotes(items: NoteView[]): VisibleNoteView[] {
  return items
    .filter((note): note is VisibleNoteView => !note.isPlaceholder)
    .sort((left, right) => {
      const time =
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime();
      return time || right.id.localeCompare(left.id);
    });
}

export function isIncoming(note: VisibleNoteView, currentUserId: string) {
  return note.recipient.id === currentUserId;
}

export function isUnread(note: VisibleNoteView, currentUserId: string) {
  return isIncoming(note, currentUserId) && note.status === "VISIBLE";
}

export const romanticArt = {
  butterflyOpen,
  coupleEmblem,
  envelopeClosed,
  envelopeOpen,
  journalCollage,
  microHearts,
  microLily,
  microStamp,
  pinkPetal,
  springDivider,
  springFloralCorner,
  statusLocation,
} as const;
