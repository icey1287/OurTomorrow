import type {
  NearbyPlacesRequest,
  PlaceSearchResponse,
} from "@our-tomorrow/contracts";

export type NearbyPlacesSearch = (
  input: NearbyPlacesRequest,
) => Promise<PlaceSearchResponse>;

export interface NearbyPlacesFromCurrentPositionOptions {
  geolocation: Pick<Geolocation, "getCurrentPosition">;
  searchNearby: NearbyPlacesSearch;
}

const CURRENT_POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 5 * 60_000,
};

function currentPosition(
  geolocation: Pick<Geolocation, "getCurrentPosition">,
  options: PositionOptions,
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function coordinateForRequest(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("浏览器返回了无效的位置，请再试一次。");
  }
  return Number(value.toFixed(7));
}

export async function nearbyPlacesFromCurrentPosition({
  geolocation,
  searchNearby,
}: NearbyPlacesFromCurrentPositionOptions): Promise<PlaceSearchResponse> {
  const position = await currentPosition(geolocation, CURRENT_POSITION_OPTIONS);
  return searchNearby({
    latitude: coordinateForRequest(position.coords.latitude),
    longitude: coordinateForRequest(position.coords.longitude),
    radius: 1_000,
    limit: 6,
  });
}
