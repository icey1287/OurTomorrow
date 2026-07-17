import { geoIdentity, type GeoIdentityTransform } from "d3-geo";
import type { Polygon } from "geojson";

export type GeoCoordinate = {
  latitude: number;
  longitude: number;
};

export type GeoBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type MapViewport = {
  width: number;
  height: number;
  padding?: number;
};

export type ProjectedPoint = {
  x: number;
  y: number;
};

export type MapProjection = GeoIdentityTransform;

export const CHINA_BOUNDS: GeoBounds = {
  west: 72.5,
  south: 17.5,
  east: 136,
  north: 54.8,
};

export const SOUTH_CHINA_SEA_BOUNDS: GeoBounds = {
  west: 108,
  south: 3,
  east: 123,
  north: 25,
};

const MAX_MERCATOR_LATITUDE = 85.05112878;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite`);
  }
}

export function assertGeoBounds(bounds: GeoBounds): void {
  assertFinite(bounds.west, "West longitude");
  assertFinite(bounds.south, "South latitude");
  assertFinite(bounds.east, "East longitude");
  assertFinite(bounds.north, "North latitude");
  if (bounds.west >= bounds.east || bounds.south >= bounds.north) {
    throw new RangeError("Map bounds must have a positive width and height");
  }
}

function normalizedBounds(bounds: GeoBounds): GeoBounds {
  assertGeoBounds(bounds);
  return {
    west: clamp(bounds.west, -180, 180),
    south: clamp(bounds.south, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE),
    east: clamp(bounds.east, -180, 180),
    north: clamp(bounds.north, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE),
  };
}

function boundsPolygon(bounds: GeoBounds): Polygon {
  return {
    type: "Polygon",
    coordinates: [
      [
        [bounds.west, bounds.south],
        [bounds.west, bounds.north],
        [bounds.east, bounds.north],
        [bounds.east, bounds.south],
        [bounds.west, bounds.south],
      ],
    ],
  };
}

export function createGeoProjection(
  bounds: GeoBounds,
  viewport: MapViewport,
): MapProjection {
  const safeBounds = normalizedBounds(bounds);
  assertFinite(viewport.width, "Viewport width");
  assertFinite(viewport.height, "Viewport height");
  if (viewport.width <= 0 || viewport.height <= 0) {
    throw new RangeError("Map viewport must have a positive width and height");
  }

  const padding = clamp(
    viewport.padding ?? 0,
    0,
    Math.min(viewport.width, viewport.height) / 2,
  );
  const extent: [[number, number], [number, number]] = [
    [padding, padding],
    [viewport.width - padding, viewport.height - padding],
  ];
  const projection = geoIdentity().reflectY(true);
  projection.fitExtent(extent, boundsPolygon(safeBounds));

  return projection.clipExtent(extent);
}

export function projectCoordinate(
  coordinate: GeoCoordinate,
  projection: MapProjection,
): ProjectedPoint {
  assertFinite(coordinate.latitude, "Latitude");
  assertFinite(coordinate.longitude, "Longitude");
  const point = projection([
    clamp(coordinate.longitude, -180, 180),
    clamp(coordinate.latitude, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE),
  ]);
  if (!point) {
    throw new RangeError("Coordinate cannot be projected in the current view");
  }
  return { x: point[0], y: point[1] };
}

export function projectGeoPoint(
  coordinate: GeoCoordinate,
  bounds: GeoBounds,
  viewport: MapViewport,
): ProjectedPoint {
  return projectCoordinate(coordinate, createGeoProjection(bounds, viewport));
}

export function coordinateInBounds(
  coordinate: GeoCoordinate,
  bounds: GeoBounds,
): boolean {
  return (
    Number.isFinite(coordinate.latitude) &&
    Number.isFinite(coordinate.longitude) &&
    coordinate.longitude >= bounds.west &&
    coordinate.longitude <= bounds.east &&
    coordinate.latitude >= bounds.south &&
    coordinate.latitude <= bounds.north
  );
}

export function boundsCenter(bounds: GeoBounds): GeoCoordinate {
  assertGeoBounds(bounds);
  return {
    longitude: (bounds.west + bounds.east) / 2,
    latitude: (bounds.south + bounds.north) / 2,
  };
}

export function boundsAroundPoint(
  coordinate: GeoCoordinate,
  longitudeSpan = 1.2,
  latitudeSpan = 0.85,
): GeoBounds {
  assertFinite(coordinate.latitude, "Latitude");
  assertFinite(coordinate.longitude, "Longitude");
  assertFinite(longitudeSpan, "Longitude span");
  assertFinite(latitudeSpan, "Latitude span");
  if (longitudeSpan <= 0 || latitudeSpan <= 0) {
    throw new RangeError("Map spans must be positive");
  }
  return clampGeoBounds({
    west: coordinate.longitude - longitudeSpan / 2,
    east: coordinate.longitude + longitudeSpan / 2,
    south: coordinate.latitude - latitudeSpan / 2,
    north: coordinate.latitude + latitudeSpan / 2,
  });
}

export function expandGeoBounds(bounds: GeoBounds, factor = 1.16): GeoBounds {
  assertGeoBounds(bounds);
  assertFinite(factor, "Bounds expansion factor");
  if (factor <= 0)
    throw new RangeError("Bounds expansion factor must be positive");
  const center = boundsCenter(bounds);
  const longitudeSpan = (bounds.east - bounds.west) * factor;
  const latitudeSpan = (bounds.north - bounds.south) * factor;
  return clampGeoBounds({
    west: center.longitude - longitudeSpan / 2,
    east: center.longitude + longitudeSpan / 2,
    south: center.latitude - latitudeSpan / 2,
    north: center.latitude + latitudeSpan / 2,
  });
}

export function zoomGeoBounds(bounds: GeoBounds, factor: number): GeoBounds {
  assertGeoBounds(bounds);
  assertFinite(factor, "Zoom factor");
  if (factor <= 0) throw new RangeError("Zoom factor must be positive");
  const center = boundsCenter(bounds);
  const longitudeSpan = clamp((bounds.east - bounds.west) * factor, 0.06, 360);
  const latitudeSpan = clamp((bounds.north - bounds.south) * factor, 0.04, 170);
  return clampGeoBounds({
    west: center.longitude - longitudeSpan / 2,
    east: center.longitude + longitudeSpan / 2,
    south: center.latitude - latitudeSpan / 2,
    north: center.latitude + latitudeSpan / 2,
  });
}

export function panGeoBounds(
  bounds: GeoBounds,
  longitudeDelta: number,
  latitudeDelta: number,
): GeoBounds {
  assertGeoBounds(bounds);
  assertFinite(longitudeDelta, "Longitude delta");
  assertFinite(latitudeDelta, "Latitude delta");
  return clampGeoBounds({
    west: bounds.west + longitudeDelta,
    east: bounds.east + longitudeDelta,
    south: bounds.south + latitudeDelta,
    north: bounds.north + latitudeDelta,
  });
}

export function clampGeoBounds(bounds: GeoBounds): GeoBounds {
  assertGeoBounds(bounds);
  const longitudeSpan = Math.min(bounds.east - bounds.west, 360);
  const latitudeSpan = Math.min(bounds.north - bounds.south, 170);
  const center = boundsCenter(bounds);
  let west = center.longitude - longitudeSpan / 2;
  let east = center.longitude + longitudeSpan / 2;
  let south = center.latitude - latitudeSpan / 2;
  let north = center.latitude + latitudeSpan / 2;

  if (west < -180) {
    east += -180 - west;
    west = -180;
  }
  if (east > 180) {
    west -= east - 180;
    east = 180;
  }
  if (south < -MAX_MERCATOR_LATITUDE) {
    north += -MAX_MERCATOR_LATITUDE - south;
    south = -MAX_MERCATOR_LATITUDE;
  }
  if (north > MAX_MERCATOR_LATITUDE) {
    south -= north - MAX_MERCATOR_LATITUDE;
    north = MAX_MERCATOR_LATITUDE;
  }

  return { west, south, east, north };
}
