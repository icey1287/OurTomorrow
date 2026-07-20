import type { NearbyPlacesRequest } from "@our-tomorrow/contracts";
import { describe, expect, test, vi } from "vitest";

import { nearbyPlacesFromCurrentPosition } from "./geolocation";

const POSITION = {
  coords: {
    latitude: 31.2304161234,
    longitude: 121.4737011234,
  },
  timestamp: 0,
} as GeolocationPosition;

const TIMEOUT_ERROR = {
  code: 3,
  message: "Timeout expired",
} as GeolocationPositionError;

const PERMISSION_DENIED_ERROR = {
  code: 1,
  message: "Permission denied",
} as GeolocationPositionError;

describe("nearbyPlacesFromCurrentPosition", () => {
  test("uses one ordinary-accuracy position request", async () => {
    const positionOptions: PositionOptions[] = [];
    const getCurrentPosition = vi.fn<Geolocation["getCurrentPosition"]>(
      (success, _failure, options) => {
        positionOptions.push(options ?? {});
        success(POSITION);
      },
    );
    const searchNearby = vi.fn(async (_input: NearbyPlacesRequest) => ({
      items: [],
    }));

    await nearbyPlacesFromCurrentPosition({
      geolocation: { getCurrentPosition },
      searchNearby,
    });

    expect(positionOptions).toEqual([
      expect.objectContaining({
        enableHighAccuracy: false,
        timeout: 10_000,
        maximumAge: 5 * 60_000,
      }),
    ]);
    expect(searchNearby).toHaveBeenCalledOnce();
    expect(searchNearby).toHaveBeenCalledWith({
      latitude: 31.2304161,
      longitude: 121.4737011,
      radius: 1_000,
      limit: 6,
    });
  });

  test("does not retry when the user denied location permission", async () => {
    const getCurrentPosition = vi.fn<Geolocation["getCurrentPosition"]>(
      (_success, failure) => failure?.(PERMISSION_DENIED_ERROR),
    );
    const searchNearby = vi.fn(async (_input: NearbyPlacesRequest) => ({
      items: [],
    }));

    await expect(
      nearbyPlacesFromCurrentPosition({
        geolocation: { getCurrentPosition },
        searchNearby,
      }),
    ).rejects.toBe(PERMISSION_DENIED_ERROR);

    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(searchNearby).not.toHaveBeenCalled();
  });

  test("does not retry when the ordinary-accuracy request times out", async () => {
    const getCurrentPosition = vi.fn<Geolocation["getCurrentPosition"]>(
      (_success, failure) => failure?.(TIMEOUT_ERROR),
    );
    const searchNearby = vi.fn(async (_input: NearbyPlacesRequest) => ({
      items: [],
    }));

    await expect(
      nearbyPlacesFromCurrentPosition({
        geolocation: { getCurrentPosition },
        searchNearby,
      }),
    ).rejects.toBe(TIMEOUT_ERROR);

    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(searchNearby).not.toHaveBeenCalled();
  });
});
