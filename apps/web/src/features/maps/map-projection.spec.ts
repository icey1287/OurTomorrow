import { describe, expect, it } from "vitest";

import { projectWorldPoint } from "./map-projection";

describe("projectWorldPoint", () => {
  it("projects the prime-meridian equator to the map centre", () => {
    expect(
      projectWorldPoint(
        { latitude: 0, longitude: 0 },
        { width: 1000, height: 500 },
      ),
    ).toEqual({ x: 500, y: 250 });
  });

  it("keeps poles and the date line inside the requested padding", () => {
    expect(
      projectWorldPoint(
        { latitude: 90, longitude: -180 },
        { width: 1000, height: 500, padding: 20 },
      ),
    ).toEqual({ x: 20, y: 20 });
    expect(
      projectWorldPoint(
        { latitude: -90, longitude: 180 },
        { width: 1000, height: 500, padding: 20 },
      ),
    ).toEqual({ x: 980, y: 480 });
  });

  it("clamps defensive out-of-range coordinates", () => {
    expect(
      projectWorldPoint(
        { latitude: 120, longitude: 220 },
        { width: 360, height: 180 },
      ),
    ).toEqual({ x: 360, y: 0 });
  });

  it("rejects invalid dimensions instead of producing an unusable marker", () => {
    expect(() =>
      projectWorldPoint(
        { latitude: Number.NaN, longitude: 0 },
        { width: 1000, height: 500 },
      ),
    ).toThrow(TypeError);
  });
});
