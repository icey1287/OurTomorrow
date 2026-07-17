import { describe, expect, it, vi } from "vitest";

import {
  parseStoredBooleanPreference,
  setTouchArrivalsEnabled,
  TOUCH_ARRIVALS_STORAGE_KEY,
  usePwa,
} from "./pwa";

describe("PWA local preferences", () => {
  it("uses the fallback for missing or invalid boolean values", () => {
    expect(parseStoredBooleanPreference(null, true)).toBe(true);
    expect(parseStoredBooleanPreference("invalid", false)).toBe(false);
    expect(parseStoredBooleanPreference("true", false)).toBe(true);
    expect(parseStoredBooleanPreference("false", true)).toBe(false);
  });

  it("keeps touch arrivals enabled by default and stores local changes", () => {
    const setItem = vi.fn();
    vi.stubGlobal("window", { localStorage: { setItem } });

    const pwa = usePwa();
    expect(pwa.touchArrivalsEnabled.value).toBe(true);

    setTouchArrivalsEnabled(false);

    expect(pwa.touchArrivalsEnabled.value).toBe(false);
    expect(setItem).toHaveBeenCalledWith(TOUCH_ARRIVALS_STORAGE_KEY, "false");

    setTouchArrivalsEnabled(true);
    vi.unstubAllGlobals();
  });
});
