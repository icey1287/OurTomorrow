import { describe, expect, it } from "vitest";

import {
  boundsAroundPoint,
  boundsCenter,
  CHINA_BOUNDS,
  coordinateInBounds,
  createGeoProjection,
  panGeoBounds,
  projectCoordinate,
  projectGeoPoint,
  zoomGeoBounds,
} from "./map-projection";

describe("map projection", () => {
  it("projects real China coordinates into the viewport", () => {
    const shanghai = projectGeoPoint(
      { longitude: 121.667003, latitude: 31.141447 },
      CHINA_BOUNDS,
      { width: 1000, height: 600, padding: 36 },
    );
    const beijing = projectGeoPoint(
      { longitude: 116.4074, latitude: 39.9042 },
      CHINA_BOUNDS,
      { width: 1000, height: 600, padding: 36 },
    );

    expect(shanghai.x).toBeGreaterThan(36);
    expect(shanghai.x).toBeLessThan(964);
    expect(shanghai.y).toBeGreaterThan(beijing.y);
  });

  it("keeps a city coordinate inside city-scale bounds", () => {
    const coordinate = { longitude: 121.667003, latitude: 31.141447 };
    const bounds = boundsAroundPoint(coordinate);
    expect(coordinateInBounds(coordinate, bounds)).toBe(true);
    expect(bounds.east - bounds.west).toBeCloseTo(1.2);
    expect(bounds.north - bounds.south).toBeCloseTo(0.85);
  });

  it("zooms around the same geographic center", () => {
    const zoomed = zoomGeoBounds(CHINA_BOUNDS, 0.6);
    expect(boundsCenter(zoomed).longitude).toBeCloseTo(
      boundsCenter(CHINA_BOUNDS).longitude,
    );
    expect(boundsCenter(zoomed).latitude).toBeCloseTo(
      boundsCenter(CHINA_BOUNDS).latitude,
    );
    expect(zoomed.east - zoomed.west).toBeLessThan(
      CHINA_BOUNDS.east - CHINA_BOUNDS.west,
    );
  });

  it("pans without changing the geographic span", () => {
    const panned = panGeoBounds(CHINA_BOUNDS, 3.5, -2.25);
    expect(panned.east - panned.west).toBeCloseTo(
      CHINA_BOUNDS.east - CHINA_BOUNDS.west,
    );
    expect(panned.north - panned.south).toBeCloseTo(
      CHINA_BOUNDS.north - CHINA_BOUNDS.south,
    );
    expect(boundsCenter(panned).longitude).toBeCloseTo(
      boundsCenter(CHINA_BOUNDS).longitude + 3.5,
    );
    expect(boundsCenter(panned).latitude).toBeCloseTo(
      boundsCenter(CHINA_BOUNDS).latitude - 2.25,
    );
  });

  it("keeps the rendered scale stable while panning north or south", () => {
    const bounds = { west: 110, south: 20, east: 120, north: 30 };
    const panned = panGeoBounds(bounds, 0, 5);
    const viewport = { width: 1000, height: 600, padding: 38 };
    const before = createGeoProjection(bounds, viewport);
    const after = createGeoProjection(panned, viewport);
    const westPoint = { longitude: 114, latitude: 28 };
    const eastPoint = { longitude: 115, latitude: 28 };
    const beforeWidth =
      projectCoordinate(eastPoint, before).x -
      projectCoordinate(westPoint, before).x;
    const afterWidth =
      projectCoordinate(eastPoint, after).x -
      projectCoordinate(westPoint, after).x;

    expect(afterWidth).toBeCloseTo(beforeWidth, 6);
  });

  it("rejects invalid bounds", () => {
    expect(() =>
      projectGeoPoint(
        { longitude: 121.5, latitude: 31.2 },
        { west: 10, east: 10, south: 0, north: 20 },
        { width: 1000, height: 600 },
      ),
    ).toThrow(RangeError);
  });
});
