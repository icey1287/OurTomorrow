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
