import { describe, expect, it } from "vitest";

import {
  isValidTimezone,
  validateRequiredText,
} from "@/shared/utils/profile-validation";

describe("profile validation", () => {
  it("validates required text and maximum length", () => {
    expect(validateRequiredText("  ", "名称", 10)).toBe("请填写名称。");
    expect(validateRequiredText("明天", "名称", 10)).toBeNull();
    expect(validateRequiredText("1234", "名称", 3)).toContain("3");
  });

  it("recognizes IANA timezones", () => {
    expect(isValidTimezone("Asia/Shanghai")).toBe(true);
    expect(isValidTimezone("Tomorrow/Somewhere")).toBe(false);
  });
});
