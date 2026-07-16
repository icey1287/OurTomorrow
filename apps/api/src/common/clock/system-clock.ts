import { Injectable } from "@nestjs/common";
import { Clock } from "./clock";

@Injectable()
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  localDate(timeZone: string, instant = this.now()): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
    const value = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );
    return `${value.year}-${value.month}-${value.day}`;
  }
}
