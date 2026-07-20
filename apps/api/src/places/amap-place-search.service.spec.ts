import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Environment } from "../config/env.schema";
import { AmapPlaceSearchService } from "./amap-place-search.service";

function service(key = "test-amap-key") {
  return new AmapPlaceSearchService(
    new ConfigService({
      AMAP_WEB_SERVICE_KEY: key,
    }) as ConfigService<Environment, true>,
  );
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AmapPlaceSearchService", () => {
  test("converts browser GPS coordinates and returns nearby buildings", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          status: "1",
          locations: "121.473701,31.230416",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: "1",
          regeocode: {
            formatted_address: "上海市黄浦区人民广场",
            addressComponent: {
              province: "上海市",
              city: "上海市",
              district: "黄浦区",
              township: "南京东路街道",
            },
            pois: [
              {
                id: "B001",
                name: "上海博物馆",
                location: "121.475154,31.228598",
                address: "人民大道201号",
                distance: "186.4",
              },
            ],
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await service().nearby(31.229, 121.472, {
      radius: 800,
      limit: 5,
    });

    expect(result.items[0]).toMatchObject({
      id: "B001",
      name: "上海博物馆",
      address: "人民大道201号",
      latitude: 31.228598,
      longitude: 121.475154,
      distanceMeters: 186,
    });
    const convertUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(convertUrl.pathname).toBe("/v3/assistant/coordinate/convert");
    expect(convertUrl.searchParams.get("coordsys")).toBe("gps");
    const reverseUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(reverseUrl.pathname).toBe("/v3/geocode/regeo");
    expect(reverseUrl.searchParams.get("radius")).toBe("800");
  });

  test("returns a private static-map image", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await service().staticMap(31.230416, 121.473701);

    expect(result.contentType).toBe("image/png");
    expect(result.body).toEqual(Buffer.from([137, 80, 78, 71]));
    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe("/v3/staticmap");
    expect(requestedUrl.searchParams.get("location")).toBe(
      "121.473701,31.230416",
    );
  });

  test("fails safely when the key is missing or Amap is unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 502));
    vi.stubGlobal("fetch", fetchMock);

    await expect(service("").nearby(31, 121)).rejects.toMatchObject({
      status: 503,
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await expect(service().nearby(31, 121)).rejects.toMatchObject({
      status: 503,
    });
  });
});
