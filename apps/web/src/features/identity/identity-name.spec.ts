import { describe, expect, it } from "vitest";

import { resolveIdentityRoleFromName } from "./identity-name";

describe("resolveIdentityRoleFromName", () => {
  it("matches the two real names to their fixed roles", () => {
    expect(resolveIdentityRoleFromName("示例用户乙")).toBe("girl");
    expect(resolveIdentityRoleFromName("示例用户甲")).toBe("boy");
  });

  it("ignores surrounding whitespace", () => {
    expect(resolveIdentityRoleFromName("  示例用户乙  ")).toBe("girl");
    expect(resolveIdentityRoleFromName("\n示例用户甲\t")).toBe("boy");
  });

  it("rejects empty, partial, or unknown names", () => {
    expect(resolveIdentityRoleFromName("")).toBeNull();
    expect(resolveIdentityRoleFromName("杨")).toBeNull();
    expect(resolveIdentityRoleFromName("张一名")).toBeNull();
  });
});
