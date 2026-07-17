import type {
  MemoryCardSummary,
  MemoryResurfaceReason,
} from "@our-tomorrow/contracts";

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export function formatMemoryDate(
  value: string,
  includeTime = false,
  timeZone?: string,
) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    ...(timeZone ? { timeZone } : {}),
    ...(includeTime ? ({ hour: "2-digit", minute: "2-digit" } as const) : {}),
  }).format(date);
}

function dateTimeParts(value: Date, timeZone?: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(value);
  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
}

export function yearInTimeZone(value: string | Date, timeZone: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return dateTimeParts(date, timeZone).year ?? null;
}

export function toDateTimeLocal(value: string, timeZone?: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  if (timeZone) {
    const parts = dateTimeParts(date, timeZone);
    return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
  }
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.valueOf() - offset).toISOString().slice(0, 16);
}

export function fromDateTimeLocal(value: string, timeZone?: string) {
  if (timeZone) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
      value,
    );
    if (!match) return null;
    const desired = {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4]),
      minute: Number(match[5]),
      second: Number(match[6] ?? 0),
    };
    const wallClockUtc = Date.UTC(
      desired.year,
      desired.month - 1,
      desired.day,
      desired.hour,
      desired.minute,
      desired.second,
    );
    let instant = wallClockUtc;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const represented = dateTimeParts(new Date(instant), timeZone);
      const representedUtc = Date.UTC(
        represented.year ?? 0,
        (represented.month ?? 1) - 1,
        represented.day ?? 1,
        represented.hour ?? 0,
        represented.minute ?? 0,
        represented.second ?? 0,
      );
      const adjustment = wallClockUtc - representedUtc;
      instant += adjustment;
      if (adjustment === 0) break;
    }
    const verified = dateTimeParts(new Date(instant), timeZone);
    if (
      verified.year !== desired.year ||
      verified.month !== desired.month ||
      verified.day !== desired.day ||
      verified.hour !== desired.hour ||
      verified.minute !== desired.minute
    ) {
      return null;
    }
    return new Date(instant).toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

export function imageFileError(file: File) {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return `${file.name} 不是支持的 JPEG、PNG 或 WebP 图片。`;
  }
  if (file.size <= 0) return `${file.name} 是空文件。`;
  if (file.size > MAX_IMAGE_BYTES) {
    return `${file.name} 超过 15 MB，请压缩后再上传。`;
  }
  return null;
}

export function groupMemoriesByMonth(
  items: MemoryCardSummary[],
  timeZone?: string,
) {
  const groups = new Map<
    string,
    { key: string; label: string; items: MemoryCardSummary[] }
  >();

  for (const memory of items) {
    const date = new Date(memory.happenedAt);
    const valid = !Number.isNaN(date.valueOf());
    const parts = valid ? dateTimeParts(date, timeZone) : null;
    const key = parts
      ? `${parts.year}-${String(parts.month).padStart(2, "0")}`
      : "unknown";
    const label = valid
      ? new Intl.DateTimeFormat("zh-CN", {
          year: "numeric",
          month: "long",
          ...(timeZone ? { timeZone } : {}),
        }).format(date)
      : "日期待确认";
    const group = groups.get(key) ?? { key, label, items: [] };
    group.items.push(memory);
    groups.set(key, group);
  }

  return [...groups.values()];
}

export function firstTimeSentence(
  memory: Pick<MemoryCardSummary, "firstTimeLabel" | "title" | "happenedAt">,
  timeZone?: string,
) {
  const labelled =
    memory.firstTimeLabel?.trim().replace(/^第一次\s*/, "") ?? "";
  const titled = memory.title.trim().replace(/^第一次\s*/, "");
  const subject = labelled || titled || "留下这段故事";
  return `我们第一次${subject}，是在 ${formatMemoryDate(memory.happenedAt, false, timeZone)}。`;
}

const MEMORY_RESURFACE_REASON_TEXT: Record<MemoryResurfaceReason, string> = {
  ON_THIS_DAY: "同一天的旧时光，今天又绕回了我们身边。",
  FIRST_UPLOAD: "这是最早被我们收藏起来的影像故事。",
  PLACE: "一个共同地点，把这段故事重新带了回来。",
  SEASON: "相似的季节里，过去正轻轻回应今天。",
  COMPLETE_PERSPECTIVES: "这段故事里，刚好保存着两个人的完整视角。",
  RANDOM: "很久没遇见的旧故事，今天随机来敲门。",
};

export function memoryResurfaceReasonText(reason: MemoryResurfaceReason) {
  return MEMORY_RESURFACE_REASON_TEXT[reason];
}
