import { describe, expect, it } from "vitest";

import {
  capsuleAvailableActions,
  countdownLabel,
  isTomorrowCreateType,
  operationKey,
  parseMinuteOfDay,
  planUpdateRequest,
  roleIsCurrent,
  splitList,
} from "@/features/tomorrow/tomorrow-utils";

describe("tomorrow utilities", () => {
  it("accepts only supported create query values", () => {
    expect(isTomorrowCreateType("wish")).toBe(true);
    expect(isTomorrowCreateType("capsule")).toBe(true);
    expect(isTomorrowCreateType("future-letter")).toBe(false);
    expect(isTomorrowCreateType(["wish"])).toBe(false);
  });

  it("deduplicates compact lists without exceeding the API limit", () => {
    expect(splitList("雨伞\n相机，雨伞,充电宝", 3)).toEqual([
      "雨伞",
      "相机",
      "充电宝",
    ]);
  });

  it("formats countdown boundaries", () => {
    expect(countdownLabel(null)).toBe("不再重复");
    expect(countdownLabel(0)).toBe("就是今天");
    expect(countdownLabel(1)).toBe("还有 1 天");
    expect(countdownLabel(18)).toBe("还有 18 天");
  });

  it("parses reminder wall-clock times safely", () => {
    expect(parseMinuteOfDay("09:30")).toBe(570);
    expect(parseMinuteOfDay("24:00")).toBeNull();
    expect(parseMinuteOfDay("9:30")).toBeNull();
  });

  it("stops a multi-step operation after an identity switch", () => {
    expect(roleIsCurrent("boy", "boy")).toBe(true);
    expect(roleIsCurrent("boy", "girl")).toBe(false);
    expect(roleIsCurrent("girl", null)).toBe(false);
  });

  it("omits server-restricted plan fields outside draft state", () => {
    const common = {
      title: "植物园散步",
      wishId: "11111111-1111-4111-8111-111111111111",
      reminderAt: "2026-07-17T01:00:00.000Z",
    };

    expect(
      planUpdateRequest(
        {
          version: 3,
          status: "SCHEDULED",
          reminderAt: "2026-07-17T01:00:00.000Z",
        },
        common,
      ),
    ).toEqual({ title: "植物园散步", version: 3 });

    expect(
      planUpdateRequest(
        {
          version: 3,
          status: "SCHEDULED",
          reminderAt: "2026-07-17T01:00:00.000Z",
        },
        { ...common, reminderAt: "2026-07-18T01:00:00.000Z" },
      ),
    ).toEqual({
      title: "植物园散步",
      version: 3,
      reminderAt: "2026-07-18T01:00:00.000Z",
    });

    expect(
      planUpdateRequest(
        {
          version: 4,
          status: "IN_PROGRESS",
          reminderAt: "2026-07-17T01:00:00.000Z",
        },
        { ...common, reminderAt: "2026-07-18T01:00:00.000Z" },
      ),
    ).toEqual({ title: "植物园散步", version: 4 });

    expect(
      planUpdateRequest(
        { version: 1, status: "DRAFT", reminderAt: null },
        common,
      ),
    ).toMatchObject({
      version: 1,
      wishId: "11111111-1111-4111-8111-111111111111",
      reminderAt: "2026-07-17T01:00:00.000Z",
    });
  });

  it("derives capsule actions only from API capability flags", () => {
    const lockedDespitePastBrowserTime = {
      canEdit: false,
      canSeal: false,
      canConfirm: false,
      canOpen: false,
      canConvert: false,
      unlockAt: "2000-01-01T00:00:00.000Z",
    };
    expect(capsuleAvailableActions(lockedDespitePastBrowserTime)).toEqual([]);

    expect(
      capsuleAvailableActions({
        canEdit: false,
        canSeal: false,
        canConfirm: true,
        canOpen: false,
        canConvert: false,
      }),
    ).toEqual(["confirm"]);
  });

  it("creates visible ASCII idempotency keys for conversions", () => {
    const key = operationKey("wish-to-memory");
    expect(key).toMatch(
      /^wish-to-memory:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(key.length).toBeGreaterThanOrEqual(8);
    expect(key.length).toBeLessThanOrEqual(128);
  });
});
