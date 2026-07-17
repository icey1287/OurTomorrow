import { Temporal } from "@js-temporal/polyfill";

export type InstantLike = Date | string | Temporal.Instant;
export type PlainDateLike = string | Temporal.PlainDate;
export type AnniversaryRepeatValue = "NONE" | "YEARLY";
export type AnniversaryLeapDayRuleValue = "FEBRUARY_28" | "MARCH_1";

function toInstant(value: InstantLike): Temporal.Instant {
  if (value instanceof Date) {
    return Temporal.Instant.from(value.toISOString());
  }
  return typeof value === "string" ? Temporal.Instant.from(value) : value;
}

function toPlainDate(value: PlainDateLike): Temporal.PlainDate {
  return typeof value === "string" ? Temporal.PlainDate.from(value) : value;
}

/** Returns the relationship-local calendar date containing an instant. */
export function instantToPlainDate(
  instant: InstantLike,
  timeZone: string,
): Temporal.PlainDate {
  return toInstant(instant).toZonedDateTimeISO(timeZone).toPlainDate();
}

/** Returns the instant at which a relationship-local calendar date begins. */
export function plainDateStartInstant(
  date: PlainDateLike,
  timeZone: string,
): Temporal.Instant {
  return toPlainDate(date)
    .toPlainDateTime(Temporal.PlainTime.from("00:00"))
    .toZonedDateTime(timeZone, { disambiguation: "compatible" })
    .toInstant();
}

function yearlyOccurrence(
  anniversaryDate: Temporal.PlainDate,
  year: number,
  leapDayRule: AnniversaryLeapDayRuleValue,
): Temporal.PlainDate {
  if (anniversaryDate.month !== 2 || anniversaryDate.day !== 29) {
    return Temporal.PlainDate.from({
      year,
      month: anniversaryDate.month,
      day: anniversaryDate.day,
    });
  }

  if (Temporal.PlainDate.from({ year, month: 2, day: 1 }).daysInMonth === 29) {
    return Temporal.PlainDate.from({ year, month: 2, day: 29 });
  }

  return leapDayRule === "MARCH_1"
    ? Temporal.PlainDate.from({ year, month: 3, day: 1 })
    : Temporal.PlainDate.from({ year, month: 2, day: 28 });
}

/**
 * Finds the next occurrence on or after `fromDate`.
 * A non-repeating anniversary has no next occurrence after its stored date.
 */
export function nextAnniversaryOccurrence(
  anniversaryDate: PlainDateLike,
  repeat: AnniversaryRepeatValue,
  leapDayRule: AnniversaryLeapDayRuleValue,
  fromDate: PlainDateLike,
): Temporal.PlainDate | null {
  const original = toPlainDate(anniversaryDate);
  const lowerBound = toPlainDate(fromDate);

  if (repeat === "NONE") {
    return Temporal.PlainDate.compare(original, lowerBound) >= 0
      ? original
      : null;
  }

  if (Temporal.PlainDate.compare(lowerBound, original) < 0) {
    return original;
  }

  const thisYear = yearlyOccurrence(original, lowerBound.year, leapDayRule);
  if (Temporal.PlainDate.compare(thisYear, lowerBound) >= 0) {
    return thisYear;
  }
  return yearlyOccurrence(original, lowerBound.year + 1, leapDayRule);
}

/**
 * Resolves a reminder's relationship-local wall time to an instant.
 * Temporal's compatible disambiguation moves nonexistent wall times forward
 * and selects the earlier instant for repeated wall times.
 */
export function anniversaryReminderInstant(
  occurrenceDate: PlainDateLike,
  daysBefore: number,
  minuteOfDay: number,
  timeZone: string,
): Temporal.Instant {
  if (!Number.isInteger(daysBefore) || daysBefore < 0) {
    throw new RangeError("daysBefore must be a non-negative integer");
  }
  if (
    !Number.isInteger(minuteOfDay) ||
    minuteOfDay < 0 ||
    minuteOfDay > 1_439
  ) {
    throw new RangeError("minuteOfDay must be an integer from 0 to 1439");
  }

  const reminderDate = toPlainDate(occurrenceDate).subtract({
    days: daysBefore,
  });
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return reminderDate
    .toPlainDateTime({ hour, minute })
    .toZonedDateTime(timeZone, { disambiguation: "compatible" })
    .toInstant();
}
