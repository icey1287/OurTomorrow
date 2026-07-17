import type {
  CurrentStatusKind,
  DailyEntryStatus,
  NoteStatus,
  NoteType,
} from "@our-tomorrow/contracts";

export const STATUS_OPTIONS: Array<{
  kind: CurrentStatusKind;
  label: string;
  emoji: string;
}> = [
  { kind: "BUSY", label: "忙碌中", emoji: "🧩" },
  { kind: "COMMUTING", label: "在路上", emoji: "🚇" },
  { kind: "RESTING", label: "休息中", emoji: "🌿" },
  { kind: "TIRED", label: "有点累", emoji: "☁️" },
  { kind: "HAPPY", label: "心情很好", emoji: "☀️" },
  { kind: "NEED_HUG", label: "需要抱抱", emoji: "🫂" },
  { kind: "TALK_LATER", label: "晚点聊聊", emoji: "💬" },
  { kind: "HOME", label: "已经到家", emoji: "🏠" },
  { kind: "MISS_YOU", label: "正在想你", emoji: "💗" },
];

export const MOOD_OPTIONS = [
  { value: "明亮", emoji: "☀️" },
  { value: "安心", emoji: "🌿" },
  { value: "平静", emoji: "🌙" },
  { value: "疲惫", emoji: "☁️" },
  { value: "低落", emoji: "🌧️" },
  { value: "期待", emoji: "✨" },
] as const;

export const NOTE_TYPES: Array<{
  value: NoteType;
  label: string;
  description: string;
  emoji: string;
}> = [
  {
    value: "LOVE",
    label: "想对你说",
    description: "一句情话或想念",
    emoji: "💌",
  },
  {
    value: "REMINDER",
    label: "别忘了",
    description: "轻轻提醒一件事",
    emoji: "🔔",
  },
  {
    value: "THANKS",
    label: "谢谢你",
    description: "把感谢认真留下",
    emoji: "🌷",
  },
  {
    value: "APOLOGY",
    label: "对不起",
    description: "温和表达歉意",
    emoji: "🫶",
  },
  {
    value: "TALK_LATER",
    label: "晚点聊聊",
    description: "留下待沟通的话",
    emoji: "💬",
  },
  {
    value: "DO_TOGETHER",
    label: "一起去做",
    description: "约好一件小事",
    emoji: "🧭",
  },
  {
    value: "SURPRISE",
    label: "隐藏惊喜",
    description: "到指定时间才揭晓",
    emoji: "🎁",
  },
];

export const NOTE_COLORS = [
  {
    value: "rose",
    label: "晚霞粉",
    swatch: "bg-rose-300 dark:bg-rose-700",
    card: "border-rose-200/90 bg-rose-50/85 dark:border-rose-900/55 dark:bg-rose-950/25",
  },
  {
    value: "amber",
    label: "暖杏黄",
    swatch: "bg-amber-300 dark:bg-amber-700",
    card: "border-amber-200/90 bg-amber-50/85 dark:border-amber-900/55 dark:bg-amber-950/25",
  },
  {
    value: "sage",
    label: "安心绿",
    swatch: "bg-emerald-300 dark:bg-emerald-700",
    card: "border-emerald-200/90 bg-emerald-50/75 dark:border-emerald-900/55 dark:bg-emerald-950/20",
  },
  {
    value: "sky",
    label: "晴空蓝",
    swatch: "bg-sky-300 dark:bg-sky-700",
    card: "border-sky-200/90 bg-sky-50/80 dark:border-sky-900/55 dark:bg-sky-950/20",
  },
  {
    value: "violet",
    label: "夜幕紫",
    swatch: "bg-violet-300 dark:bg-violet-700",
    card: "border-violet-200/90 bg-violet-50/80 dark:border-violet-900/55 dark:bg-violet-950/20",
  },
] as const;

export function statusOption(kind: CurrentStatusKind) {
  if (kind === "CUSTOM") {
    return { kind, label: "自定义此刻", emoji: "✍️" } as const;
  }
  return (
    STATUS_OPTIONS.find((option) => option.kind === kind) ?? {
      kind,
      label: "此刻状态",
      emoji: "🌤️",
    }
  );
}

export function noteTypeOption(type: NoteType | undefined) {
  return (
    NOTE_TYPES.find((option) => option.value === type) ?? {
      value: "LOVE" as const,
      label: "便利贴",
      description: "留给彼此的一句话",
      emoji: "💌",
    }
  );
}

export function noteColorClass(color: string | null | undefined) {
  return (
    NOTE_COLORS.find((option) => option.value === color)?.card ??
    "border-ink-200/90 bg-white/70 dark:border-white/10 dark:bg-white/[0.04]"
  );
}

export function noteStatusLabel(status: NoteStatus) {
  const labels: Record<NoteStatus, string> = {
    DRAFT: "草稿",
    SCHEDULED: "等待揭晓",
    VISIBLE: "已送达",
    VIEWED: "已查看",
    ARCHIVED: "已归档",
    EXPIRED: "已失效",
  };
  return labels[status];
}

export function dailyEntryStatusLabel(status: DailyEntryStatus) {
  const labels: Record<DailyEntryStatus, string> = {
    DRAFT: "未填写",
    EDITING: "编辑中",
    SUBMITTED: "已提交",
    WAITING_FOR_PARTNER: "等待对方",
    BOTH_SUBMITTED: "双方已提交",
    REVEALED: "已揭晓",
  };
  return labels[status];
}

export function isDailyEntryEditable(status: DailyEntryStatus | undefined) {
  return status === undefined || status === "DRAFT" || status === "EDITING";
}

export function isDailyEntryRevealed(status: DailyEntryStatus | undefined) {
  return status === "REVEALED";
}

export function addMinutesIso(base: string | number | Date, minutes: number) {
  return new Date(new Date(base).valueOf() + minutes * 60_000).toISOString();
}

export function toDateTimeLocalValue(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  const shifted = new Date(date.valueOf() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

export function dateTimeLocalToIso(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function partsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

export function localDateInTimeZone(
  date: Date = new Date(),
  timeZone = "Asia/Shanghai",
) {
  try {
    const parts = partsInTimeZone(date, timeZone);
    if (!parts.year || !parts.month || !parts.day)
      return date.toISOString().slice(0, 10);
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function localMonthInTimeZone(
  date: Date = new Date(),
  timeZone = "Asia/Shanghai",
) {
  return localDateInTimeZone(date, timeZone).slice(0, 7);
}

export function formatInstant(
  value: string | null | undefined,
  timeZone = "Asia/Shanghai",
) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone,
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }
}

export function remainingStatusText(expiresAt: string, now: string | Date) {
  const remaining = new Date(expiresAt).valueOf() - new Date(now).valueOf();
  if (!Number.isFinite(remaining) || remaining <= 0) return "即将自动结束";
  const minutes = Math.max(1, Math.ceil(remaining / 60_000));
  if (minutes < 60) return `约 ${minutes} 分钟后自动结束`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0
    ? `约 ${hours} 小时后自动结束`
    : `约 ${hours} 小时 ${rest} 分钟后自动结束`;
}
