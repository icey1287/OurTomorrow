import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { describe, expect, test } from "vitest";

import { NearbyPlacesDto } from "./place.dto";

describe("NearbyPlacesDto", () => {
  test("accepts the full finite precision returned by browser geolocation", () => {
    const dto = plainToInstance(NearbyPlacesDto, {
      latitude: 31.2304161234,
      longitude: 121.4737011234,
      radius: 1_000,
      limit: 6,
    });

    expect(validateSync(dto)).toEqual([]);
  });
});
