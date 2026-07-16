import { describe, expect, it } from "vitest";

import {
  resolveIdentityNavigation,
  type IdentityGuardRoute,
} from "@/router/identity-guard";

function route(
  fullPath: string,
  meta: IdentityGuardRoute["meta"],
): IdentityGuardRoute {
  return { fullPath, meta };
}

describe("identity navigation guard", () => {
  it("does not redirect before cached identity bootstrap finishes", () => {
    expect(
      resolveIdentityNavigation(route("/today", { requiresIdentity: true }), {
        state: "unknown",
        hasIdentity: false,
      }),
    ).toBe(true);
  });

  it("sends users without a selected identity to the chooser", () => {
    expect(
      resolveIdentityNavigation(route("/today", { requiresIdentity: true }), {
        state: "unselected",
        hasIdentity: false,
      }),
    ).toEqual({ name: "login", query: {} });
    expect(
      resolveIdentityNavigation(
        route("/settings", { requiresIdentity: true }),
        { state: "unselected", hasIdentity: false },
      ),
    ).toEqual({
      name: "login",
      query: { redirect: "/settings" },
    });
  });

  it("allows the chooser only while identity is unselected", () => {
    expect(
      resolveIdentityNavigation(route("/login", { identityOnly: true }), {
        state: "unselected",
        hasIdentity: false,
      }),
    ).toBe(true);
    expect(
      resolveIdentityNavigation(route("/login", { identityOnly: true }), {
        state: "selected",
        hasIdentity: true,
      }),
    ).toEqual({ name: "today" });
  });

  it("allows either selected role into private routes", () => {
    expect(
      resolveIdentityNavigation(route("/today", { requiresIdentity: true }), {
        state: "selected",
        hasIdentity: true,
      }),
    ).toBe(true);
  });
});
