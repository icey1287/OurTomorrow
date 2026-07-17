import { describe, expect, it } from "vitest";
import { stableJson } from "./idempotency.service";

describe("stableJson", () => {
  it("produces the same request fingerprint regardless of object key order", () => {
    expect(
      stableJson({ title: "明天", nested: { b: 2, a: 1 }, list: [3, 2, 1] }),
    ).toBe(
      stableJson({ list: [3, 2, 1], nested: { a: 1, b: 2 }, title: "明天" }),
    );
  });

  it("normalizes dates and rejects values JSON cannot safely preserve", () => {
    expect(stableJson({ at: new Date("2026-07-17T00:00:00.000Z") })).toBe(
      '{"at":"2026-07-17T00:00:00.000Z"}',
    );
    expect(() => stableJson({ unsafe: 1n })).toThrow(
      "Idempotency requests must be JSON serializable",
    );
  });

  it("treats transformed DTO fields with undefined as omitted JSON keys", () => {
    expect(
      stableJson({ version: 4, title: undefined, mediaIds: undefined }),
    ).toBe(stableJson({ version: 4 }));
  });
});
