import type {
  AnniversaryType,
  CapsuleSummary,
  CapsuleStatus,
  CapsuleType,
  CapsuleUnlockRule,
  IdentityRole,
  CreatePlanRequest,
  PlanSummary,
  PlanStatus,
  UpdatePlanRequest,
  WishCategory,
  WishStatus,
} from "@our-tomorrow/contracts";

export const TOMORROW_CREATE_TYPES = [
  "wish",
  "plan",
  "anniversary",
  "capsule",
] as const;

export type TomorrowCreateType = (typeof TOMORROW_CREATE_TYPES)[number];
export type CapsuleCapability =
  "edit" | "seal" | "confirm" | "open" | "convert";

export const WISH_CATEGORIES: Array<{
  value: WishCategory;
  label: string;
  emoji: string;
}> = [
  { value: "TRAVEL", label: "旅行", emoji: "🧳" },
  { value: "FOOD", label: "美食", emoji: "🍜" },
  { value: "LIFE", label: "生活", emoji: "🏡" },
  { value: "LEARNING", label: "学习", emoji: "📚" },
  { value: "COMMEMORATION", label: "纪念", emoji: "💫" },
  { value: "FAMILY", label: "家庭", emoji: "🫶" },
  { value: "PHOTOGRAPHY", label: "摄影", emoji: "📷" },
  { value: "ADVENTURE", label: "小冒险", emoji: "⛰️" },
  { value: "CUSTOM", label: "其他", emoji: "✨" },
];

export const WISH_STATUSES: Array<{ value: WishStatus; label: string }> = [
  { value: "IDEA", label: "有个想法" },
  { value: "PLANNED", label: "已经计划" },
  { value: "IN_PROGRESS", label: "正在实现" },
  { value: "COMPLETED", label: "已经完成" },
  { value: "CONVERTED_TO_MEMORY", label: "已成为回忆" },
];

export const PLAN_STATUSES: Array<{ value: PlanStatus; label: string }> = [
  { value: "DRAFT", label: "草稿" },
  { value: "SCHEDULED", label: "已安排" },
  { value: "IN_PROGRESS", label: "进行中" },
  { value: "COMPLETED", label: "已完成" },
  { value: "CANCELLED", label: "已取消" },
];

export const ANNIVERSARY_TYPES: Array<{
  value: AnniversaryType;
  label: string;
}> = [
  { value: "RELATIONSHIP", label: "恋爱纪念日" },
  { value: "FIRST_MEETING", label: "初见纪念日" },
  { value: "BIRTHDAY", label: "生日" },
  { value: "MARRIAGE", label: "领证或婚礼" },
  { value: "MOVING", label: "搬家" },
  { value: "PET_BIRTHDAY", label: "宠物生日" },
  { value: "CUSTOM", label: "自定义" },
];

export const CAPSULE_TYPES: Array<{ value: CapsuleType; label: string }> = [
  { value: "TO_PARTNER", label: "写给对方" },
  { value: "TO_SELF", label: "写给未来的自己" },
  { value: "TO_BOTH", label: "写给未来的两个人" },
  { value: "JOINT", label: "共同胶囊" },
  { value: "ANNIVERSARY", label: "纪念日胶囊" },
  { value: "EVENT", label: "某件事之后" },
  { value: "FUTURE_LETTER", label: "未来来信胶囊" },
];

export const CAPSULE_UNLOCK_RULES: Array<{
  value: CapsuleUnlockRule;
  label: string;
}> = [
  { value: "AT_TIME", label: "到指定时间" },
  { value: "ANNIVERSARY", label: "到某个纪念日" },
  { value: "WISH_COMPLETION", label: "愿望完成后" },
  { value: "MANUAL_CONDITION", label: "满足约定条件" },
];

const CAPSULE_STATUS_LABELS: Record<CapsuleStatus, string> = {
  DRAFT: "草稿",
  SEALED: "已封存",
  LOCKED: "锁定中",
  DUE: "等待确认",
  UNLOCKED: "可以打开",
  OPENED: "已经打开",
  CONVERTED_TO_MEMORY: "已成为回忆",
};

export function isTomorrowCreateType(
  value: unknown,
): value is TomorrowCreateType {
  return (
    typeof value === "string" &&
    (TOMORROW_CREATE_TYPES as readonly string[]).includes(value)
  );
}

export function wishCategoryMeta(value: WishCategory) {
  return (
    WISH_CATEGORIES.find((option) => option.value === value) ??
    WISH_CATEGORIES[WISH_CATEGORIES.length - 1]!
  );
}

export function wishStatusLabel(value: WishStatus) {
  return WISH_STATUSES.find((option) => option.value === value)?.label ?? value;
}

export function planStatusLabel(value: PlanStatus) {
  return PLAN_STATUSES.find((option) => option.value === value)?.label ?? value;
}

export function anniversaryTypeLabel(value: AnniversaryType) {
  return (
    ANNIVERSARY_TYPES.find((option) => option.value === value)?.label ?? value
  );
}

export function capsuleTypeLabel(value: CapsuleType) {
  return CAPSULE_TYPES.find((option) => option.value === value)?.label ?? value;
}

export function capsuleUnlockRuleLabel(value: CapsuleUnlockRule) {
  return (
    CAPSULE_UNLOCK_RULES.find((option) => option.value === value)?.label ??
    value
  );
}

export function capsuleStatusLabel(value: CapsuleStatus) {
  return CAPSULE_STATUS_LABELS[value];
}

export function capsuleAvailableActions(
  capsule: Pick<
    CapsuleSummary,
    "canEdit" | "canSeal" | "canConfirm" | "canOpen" | "canConvert"
  >,
): CapsuleCapability[] {
  return [
    ...(capsule.canEdit ? (["edit"] as const) : []),
    ...(capsule.canSeal ? (["seal"] as const) : []),
    ...(capsule.canConfirm ? (["confirm"] as const) : []),
    ...(capsule.canOpen ? (["open"] as const) : []),
    ...(capsule.canConvert ? (["convert"] as const) : []),
  ];
}

export function splitList(value: string, maxItems: number) {
  const items = value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(items)].slice(0, maxItems);
}

export function joinList(items: string[]) {
  return items.join("\n");
}

export function formatInstant(value: string | null, timeZone?: string) {
  if (!value) return "尚未设置";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

export function formatLocalDate(value: string | null) {
  if (!value) return "日期待定";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return `${Number(match[1])} 年 ${Number(match[2])} 月 ${Number(match[3])} 日`;
}

export function countdownLabel(daysUntil: number | null) {
  if (daysUntil === null) return "不再重复";
  if (daysUntil < 0) return "已经过去";
  if (daysUntil === 0) return "就是今天";
  if (daysUntil === 1) return "还有 1 天";
  return `还有 ${daysUntil} 天`;
}

export function formatMinuteOfDay(minuteOfDay: number) {
  const normalized = Math.max(0, Math.min(1439, minuteOfDay));
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function parseMinuteOfDay(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function planUpdateRequest(
  plan: Pick<PlanSummary, "version" | "status" | "reminderAt">,
  input: CreatePlanRequest,
): UpdatePlanRequest {
  const { wishId, reminderAt, ...editable } = input;
  let reminderChanged = false;
  if (reminderAt !== undefined) {
    if (reminderAt === null || plan.reminderAt === null) {
      reminderChanged = reminderAt !== plan.reminderAt;
    } else {
      reminderChanged =
        new Date(reminderAt).valueOf() !== new Date(plan.reminderAt).valueOf();
    }
  }

  return {
    ...editable,
    version: plan.version,
    ...(plan.status === "DRAFT" && wishId !== undefined ? { wishId } : {}),
    ...((plan.status === "DRAFT" ||
      (plan.status === "SCHEDULED" && reminderChanged)) &&
    reminderAt !== undefined
      ? { reminderAt }
      : {}),
  };
}

export function roleIsCurrent(
  startingRole: IdentityRole,
  currentRole: IdentityRole | null,
) {
  return startingRole === currentRole;
}

export function operationKey(scope: string) {
  return `${scope}:${globalThis.crypto.randomUUID()}`;
}
