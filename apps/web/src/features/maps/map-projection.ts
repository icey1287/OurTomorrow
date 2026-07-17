export type GeoCoordinate = {
  latitude: number;
  longitude: number;
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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Pure equirectangular projection for the repository-owned SVG world map. */
export function projectWorldPoint(
  coordinate: GeoCoordinate,
  viewport: MapViewport,
): ProjectedPoint {
  if (
    !Number.isFinite(coordinate.latitude) ||
    !Number.isFinite(coordinate.longitude) ||
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    throw new TypeError("Map coordinates and viewport must be finite");
  }
  const padding = clamp(
    viewport.padding ?? 0,
    0,
    Math.min(viewport.width, viewport.height) / 2,
  );
  const latitude = clamp(coordinate.latitude, -90, 90);
  const longitude = clamp(coordinate.longitude, -180, 180);
  const drawableWidth = viewport.width - padding * 2;
  const drawableHeight = viewport.height - padding * 2;
  return {
    x: padding + ((longitude + 180) / 360) * drawableWidth,
    y: padding + ((90 - latitude) / 180) * drawableHeight,
  };
}
