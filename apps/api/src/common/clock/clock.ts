export abstract class Clock {
  abstract now(): Date;
  abstract localDate(timeZone: string, instant?: Date): string;
}
