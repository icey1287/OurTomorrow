import { describe, expect, it } from "vitest";
import { ApiException } from "../common/http/api-exception";
import { parseIdentityRole } from "./current-role.decorator";

describe("parseIdentityRole", () => {
  it("accepts the two switchable fixed roles", () => {
    expect(parseIdentityRole("boy")).toBe("boy");
    expect(parseIdentityRole("girl")).toBe("girl");
  });

  it("requires the exact lowercase role value", () => {
    for (const value of [
      undefined,
      "",
      "partner",
      "BOY",
      "Girl",
      " boy",
      "girl ",
      ["boy"],
    ]) {
      try {
        parseIdentityRole(value);
        throw new Error("expected identity role parsing to fail");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiException);
        expect((error as ApiException).getResponse()).toMatchObject({
          code: "IDENTITY_REQUIRED",
        });
      }
    }
  });
});
