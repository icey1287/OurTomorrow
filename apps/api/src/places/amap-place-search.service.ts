import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import { externalServiceUnavailable } from "../common/http/api-exception";
import type { Environment } from "../config/env.schema";

const AMAP_COORDINATE_CONVERT_URL =
  "https://restapi.amap.com/v3/assistant/coordinate/convert";
const AMAP_REVERSE_GEOCODE_URL = "https://restapi.amap.com/v3/geocode/regeo";
const AMAP_STATIC_MAP_URL = "https://restapi.amap.com/v3/staticmap";

export type PlaceSearchSuggestion = {
  id: string;
  name: string;
  address: string | null;
  district: string | null;
  latitude: number;
  longitude: number;
  distanceMeters: number | null;
};

export type PlaceSearchResponse = { items: PlaceSearchSuggestion[] };

export type StaticMapPreview = {
  body: Buffer;
  contentType: string;
};

const flexibleText = z.union([z.string(), z.array(z.string())]).optional();
const flexibleDistance = z.union([z.string(), z.number()]).optional();

const coordinateResponseSchema = z.object({
  status: z.string(),
  locations: z.string().optional(),
});

const reverseGeocodeResponseSchema = z.object({
  status: z.string(),
  regeocode: z
    .object({
      formatted_address: z.string().optional(),
      addressComponent: z
        .object({
          province: flexibleText,
          city: flexibleText,
          district: flexibleText,
          township: flexibleText,
        })
        .optional(),
      pois: z
        .array(
          z.object({
            id: z.string().optional(),
            name: z.string(),
            location: z.string(),
            address: flexibleText,
            distance: flexibleDistance,
          }),
        )
        .optional(),
    })
    .optional(),
});

function textValue(value: z.infer<typeof flexibleText>): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (!value?.length) return null;
  return value.map((item) => item.trim()).find(Boolean) ?? null;
}

function parseLocation(
  value: string,
): { latitude: number; longitude: number } | null {
  const [longitudeText, latitudeText] = value.split(",");
  const longitude = Number(longitudeText);
  const latitude = Number(latitudeText);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function districtLabel(...values: Array<string | null>): string | null {
  return (
    [
      ...new Set(values.filter((value): value is string => Boolean(value))),
    ].join(" · ") || null
  );
}

function distanceValue(value: z.infer<typeof flexibleDistance>): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

@Injectable()
export class AmapPlaceSearchService {
  private readonly key: string;

  constructor(
    @Inject(ConfigService)
    config: ConfigService<Environment, true>,
  ) {
    this.key = config.get("AMAP_WEB_SERVICE_KEY", { infer: true });
  }

  async nearby(
    latitude: number,
    longitude: number,
    options: { radius?: number; limit?: number } = {},
  ): Promise<PlaceSearchResponse> {
    this.assertConfigured();
    const converted = await this.convertGpsCoordinate(latitude, longitude);
    return this.reverseGeocode(converted.latitude, converted.longitude, {
      radius: options.radius ?? 1_000,
      limit: options.limit ?? 6,
    });
  }

  async staticMap(
    latitude: number,
    longitude: number,
  ): Promise<StaticMapPreview> {
    this.assertConfigured();
    const url = new URL(AMAP_STATIC_MAP_URL);
    const location = `${longitude},${latitude}`;
    url.searchParams.set("key", this.key);
    url.searchParams.set("location", location);
    url.searchParams.set("zoom", "16");
    url.searchParams.set("size", "500*300");
    url.searchParams.set("scale", "2");
    url.searchParams.set("markers", `mid,0xA6534C,A:${location}`);

    const response = await this.fetchResponse(url, 12_000, "image/*");
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      throw externalServiceUnavailable("地图预览暂时不可用");
    }
    return {
      body: Buffer.from(await response.arrayBuffer()),
      contentType,
    };
  }

  private assertConfigured(): void {
    if (!this.key) {
      throw externalServiceUnavailable("地点搜索暂时还没有配置好");
    }
  }

  private async convertGpsCoordinate(
    latitude: number,
    longitude: number,
  ): Promise<{ latitude: number; longitude: number }> {
    const url = new URL(AMAP_COORDINATE_CONVERT_URL);
    url.searchParams.set("key", this.key);
    url.searchParams.set("locations", `${longitude},${latitude}`);
    url.searchParams.set("coordsys", "gps");
    const parsed = coordinateResponseSchema.safeParse(
      await this.fetchJson(url),
    );
    const location = parsed.success
      ? parseLocation(parsed.data.locations ?? "")
      : null;
    if (!parsed.success || parsed.data.status !== "1" || !location) {
      throw externalServiceUnavailable("当前位置暂时无法解析");
    }
    return location;
  }

  private async reverseGeocode(
    latitude: number,
    longitude: number,
    options: { radius: number; limit: number },
  ): Promise<PlaceSearchResponse> {
    const url = new URL(AMAP_REVERSE_GEOCODE_URL);
    url.searchParams.set("key", this.key);
    url.searchParams.set("location", `${longitude},${latitude}`);
    url.searchParams.set("radius", String(options.radius));
    url.searchParams.set("extensions", "all");
    url.searchParams.set("homeorcorp", "0");

    const parsed = reverseGeocodeResponseSchema.safeParse(
      await this.fetchJson(url),
    );
    if (!parsed.success || parsed.data.status !== "1") {
      throw externalServiceUnavailable("附近地点暂时不可用");
    }

    const regeocode = parsed.data.regeocode;
    const component = regeocode?.addressComponent;
    const district = districtLabel(
      textValue(component?.province),
      textValue(component?.city),
      textValue(component?.district),
      textValue(component?.township),
    );
    const fallbackAddress = regeocode?.formatted_address?.trim() || null;
    const items: PlaceSearchSuggestion[] = [];
    const seen = new Set<string>();

    for (const poi of regeocode?.pois ?? []) {
      const location = parseLocation(poi.location);
      const name = poi.name.trim();
      if (!location || !name) continue;
      const id = poi.id?.trim() || `nearby:${poi.location}:${name}`;
      if (seen.has(id)) continue;
      seen.add(id);
      items.push({
        id,
        name,
        address: textValue(poi.address) ?? fallbackAddress,
        district,
        ...location,
        distanceMeters: distanceValue(poi.distance),
      });
      if (items.length >= options.limit) break;
    }

    if (items.length === 0 && fallbackAddress) {
      items.push({
        id: `current:${longitude},${latitude}`,
        name: "当前位置",
        address: fallbackAddress,
        district,
        latitude,
        longitude,
        distanceMeters: 0,
      });
    }
    return { items };
  }

  private async fetchJson(url: URL): Promise<unknown> {
    const response = await this.fetchResponse(url);
    try {
      return await response.json();
    } catch {
      throw externalServiceUnavailable("地点搜索暂时不可用");
    }
  }

  private async fetchResponse(
    url: URL,
    timeoutMs = 5_000,
    accept = "application/json",
  ): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: accept },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw externalServiceUnavailable("地点搜索暂时不可用");
    }
    if (!response.ok) {
      throw externalServiceUnavailable("地点搜索暂时不可用");
    }
    return response;
  }
}
