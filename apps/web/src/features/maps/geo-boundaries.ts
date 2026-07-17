import { geoContains } from "d3-geo";
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
  Position,
} from "geojson";

import chinaProvinceData from "./data/china-provinces.json";
import type { GeoBounds, GeoCoordinate } from "./map-projection";

export type BoundaryGeometry = Polygon | MultiPolygon;

export type ChinaProvinceProperties = {
  adcode: number | string;
  name: string;
  center?: [number, number];
  centroid?: [number, number];
  level?: string;
};

export type ChinaCityProperties = ChinaProvinceProperties;

export type ChinaProvinceFeature = Feature<
  BoundaryGeometry,
  ChinaProvinceProperties
>;
export type ChinaCityFeature = Feature<BoundaryGeometry, ChinaCityProperties>;

function signedRingArea(ring: Position[]): number {
  let area = 0;
  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    index += 1
  ) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    if (currentPoint && previousPoint) {
      area +=
        previousPoint[0]! * currentPoint[1]! -
        currentPoint[0]! * previousPoint[1]!;
    }
    previous = index;
  }
  return area / 2;
}

function normalizeRing(ring: Position[], clockwise: boolean): Position[] {
  const isClockwise = signedRingArea(ring) < 0;
  return isClockwise === clockwise ? ring : [...ring].reverse();
}

function normalizePolygon(coordinates: Position[][]): Position[][] {
  return coordinates.map((ring, index) => normalizeRing(ring, index === 0));
}

function normalizeFeatureWinding<Properties>(
  feature: Feature<BoundaryGeometry, Properties>,
): Feature<BoundaryGeometry, Properties> {
  if (feature.geometry.type === "Polygon") {
    return {
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: normalizePolygon(feature.geometry.coordinates),
      },
    };
  }
  return {
    ...feature,
    geometry: {
      ...feature.geometry,
      coordinates: feature.geometry.coordinates.map(normalizePolygon),
    },
  };
}

const rawChinaProvinceCollection =
  chinaProvinceData as unknown as FeatureCollection<
    BoundaryGeometry,
    ChinaProvinceProperties
  >;
export const chinaProvinceFeatures: ChinaProvinceFeature[] =
  rawChinaProvinceCollection.features.map(normalizeFeatureWinding);

const cityBoundaryModules = import.meta.glob("./data/china-cities/*.json", {
  import: "default",
}) as Record<
  string,
  () => Promise<FeatureCollection<BoundaryGeometry, ChinaCityProperties>>
>;
const cityBoundaryCache = new Map<string, ChinaCityFeature[]>();

export async function loadChinaCityFeatures(
  provinceAdcode: number | string,
): Promise<ChinaCityFeature[]> {
  const adcode = String(provinceAdcode);
  const cached = cityBoundaryCache.get(adcode);
  if (cached) return cached;
  const load = cityBoundaryModules[`./data/china-cities/${adcode}.json`];
  if (!load) return [];
  const collection = await load();
  const features = collection.features.map(normalizeFeatureWinding);
  cityBoundaryCache.set(adcode, features);
  return features;
}

function visitPositions(
  geometry: BoundaryGeometry,
  callback: (position: Position) => void,
): void {
  if (geometry.type === "Polygon") {
    for (const ring of geometry.coordinates) {
      for (const position of ring) callback(position);
    }
    return;
  }
  for (const polygon of geometry.coordinates) {
    for (const ring of polygon) {
      for (const position of ring) callback(position);
    }
  }
}

export function featureBounds(feature: Feature<BoundaryGeometry>): GeoBounds {
  const bounds: GeoBounds = {
    west: Number.POSITIVE_INFINITY,
    south: Number.POSITIVE_INFINITY,
    east: Number.NEGATIVE_INFINITY,
    north: Number.NEGATIVE_INFINITY,
  };
  visitPositions(feature.geometry, (position) => {
    const longitude = position[0];
    const latitude = position[1];
    if (longitude === undefined || latitude === undefined) return;
    bounds.west = Math.min(bounds.west, longitude);
    bounds.south = Math.min(bounds.south, latitude);
    bounds.east = Math.max(bounds.east, longitude);
    bounds.north = Math.max(bounds.north, latitude);
  });
  return bounds;
}

export function featurePrimaryPolygonBounds(
  feature: Feature<BoundaryGeometry>,
): GeoBounds {
  if (feature.geometry.type === "Polygon") return featureBounds(feature);
  const primaryPolygon = feature.geometry.coordinates.reduce(
    (largest, polygon) => {
      const area = Math.abs(signedRingArea(polygon[0] ?? []));
      const largestArea = Math.abs(signedRingArea(largest[0] ?? []));
      return area > largestArea ? polygon : largest;
    },
    feature.geometry.coordinates[0] ?? [],
  );
  return featureBounds({
    type: "Feature",
    properties: feature.properties,
    geometry: { type: "Polygon", coordinates: primaryPolygon },
  });
}

export function provinceLabelCoordinate(
  feature: ChinaProvinceFeature,
): GeoCoordinate | null {
  const coordinate = feature.properties.centroid ?? feature.properties.center;
  if (!coordinate) return null;
  return { longitude: coordinate[0], latitude: coordinate[1] };
}

export function administrativeLabelCoordinate(
  feature: ChinaProvinceFeature | ChinaCityFeature,
): GeoCoordinate | null {
  const coordinate = feature.properties.centroid ?? feature.properties.center;
  if (!coordinate) return null;
  return { longitude: coordinate[0], latitude: coordinate[1] };
}

export function featureContainsCoordinate(
  feature: Feature<BoundaryGeometry>,
  coordinate: GeoCoordinate,
): boolean {
  return geoContains(feature, [coordinate.longitude, coordinate.latitude]);
}

export function provinceContainingCoordinate(
  coordinate: GeoCoordinate,
): ChinaProvinceFeature | null {
  return (
    chinaProvinceFeatures.find(
      (feature) =>
        Boolean(feature.properties.name) &&
        featureContainsCoordinate(feature, coordinate),
    ) ?? null
  );
}

export function shortProvinceName(name: string): string {
  return name
    .replace(/壮族自治区|回族自治区|维吾尔自治区/g, "")
    .replace(/特别行政区|自治区|省|市/g, "");
}

export function shortCityName(name: string): string {
  return name.replace(/自治州$|地区$|市$|盟$/g, "");
}
