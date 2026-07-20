import { describe, expect, test } from "vitest";

import { noteImageOrientation } from "./note-image";

describe("noteImageOrientation", () => {
  test("distinguishes portrait, landscape and nearly-square photos", () => {
    expect(noteImageOrientation(900, 1_600)).toBe("portrait");
    expect(noteImageOrientation(1_600, 900)).toBe("landscape");
    expect(noteImageOrientation(1_000, 1_040)).toBe("square");
  });
});
