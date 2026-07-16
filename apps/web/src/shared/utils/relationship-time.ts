const DAY_MS = 86_400_000;

type CalendarParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
};

function safeTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return timeZone;
  } catch {
    return "UTC";
  }
}

function calendarParts(now: Date, timeZone: string): CalendarParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    numberingSystem: "latn",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
  };
}

export function relationshipDay(
  startDate: string,
  timeZone: string,
  now = new Date(),
): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(startDate);
  if (!match) return null;

  const startYear = Number(match[1]);
  const startMonth = Number(match[2]);
  const startDay = Number(match[3]);
  const current = calendarParts(now, timeZone);
  const difference =
    Date.UTC(current.year, current.month - 1, current.day) -
    Date.UTC(startYear, startMonth - 1, startDay);
  const day = Math.floor(difference / DAY_MS) + 1;

  return Number.isFinite(day) && day > 0 ? day : 1;
}

export function relationshipGreeting(now: Date, timeZone: string): string {
  const hour = calendarParts(now, timeZone).hour;
  if (hour < 6) return "夜深了";
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

export function relationshipTodayLabel(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: safeTimeZone(timeZone),
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(now);
}
