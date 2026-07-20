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
  test("maps POI search results to safe coordinate suggestions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        status: "1",
        pois: [
          {
            id: "B000001",
            name: "上海迪士尼度假区",
            location: "121.667917,31.149712",
            address: "川沙新镇黄赵路310号",
            pname: "上海市",
            cityname: "上海市",
            adname: "浦东新区",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await service().search("上海迪士尼", { limit: 5 });

    expect(result).toEqual({
      items: [
        {
          id: "B000001",
          name: "上海迪士尼度假区",
          address: "川沙新镇黄赵路310号",
          district: "上海市 · 浦东新区",
          latitude: 31.149712,
          longitude: 121.667917,
        },
      ],
    });
    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.origin + requestedUrl.pathname).toBe(
      "https://restapi.amap.com/v5/place/text",
    );
    expect(requestedUrl.searchParams.get("keywords")).toBe("上海迪士尼");
    expect(requestedUrl.searchParams.get("page_size")).toBe("5");
  });

  test("falls back to geocoding when POI search has no result", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: "1", pois: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "1",
          geocodes: [
            {
              formatted_address: "北京市东城区天安门",
              location: "116.397499,39.908722",
              province: "北京市",
              city: "北京市",
              district: "东城区",
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await service().search("天安门");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.items[0]).toMatchObject({
      name: "天安门",
      address: "北京市东城区天安门",
      latitude: 39.908722,
      longitude: 116.397499,
    });
  });

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
              {
                id: "B002",
                name: "人民广场",
                location: "121.473701,31.230416",
                address: [],
                distance: "0",
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

    expect(result.items).toHaveLength(2);
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
    expect(convertUrl.searchParams.get("locations")).toBe("121.472,31.229");
    const reverseUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(reverseUrl.pathname).toBe("/v3/geocode/regeo");
    expect(reverseUrl.searchParams.get("extensions")).toBe("all");
    expect(reverseUrl.searchParams.get("radius")).toBe("800");
  });

  test("returns a private static-map image without exposing the key", async () => {
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
    expect(requestedUrl.searchParams.get("markers")).toContain(
      "121.473701,31.230416",
    );
  });

  test("fails safely when the key is missing or Amap is unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 502));
    vi.stubGlobal("fetch", fetchMock);

    await expect(service("").search("天安门")).rejects.toMatchObject({
      status: 503,
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await expect(service().search("天安门")).rejects.toMatchObject({
      status: 503,
    });
  });
});
