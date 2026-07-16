import { describe, expect, it } from "vitest";
import { ApiException } from "../common/http/api-exception";
import { parseIdentityRole } from "./current-role.decorator";

describe("parseIdentityRole", () => {
  it("accepts the two switchable fixed roles", () => {
    expect(parseIdentityRole("boy")).toBe("boy");
    expect(parseIdentityRole(" GIRL ")).toBe("girl");
  });

  it("uses the stable IDENTITY_REQUIRED error for missing or invalid headers", () => {
    for (const value of [undefined, "", "partner", ["boy"]]) {
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
