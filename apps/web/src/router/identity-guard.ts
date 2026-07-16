import type { IdentityState } from "@/shared/stores/identity";

export interface IdentityGuardRoute {
  fullPath: string;
  meta: {
    identityOnly?: boolean;
    requiresIdentity?: boolean;
  };
}

export interface IdentityGuardSnapshot {
  state: IdentityState;
  hasIdentity: boolean;
}

export function resolveIdentityNavigation(
  to: IdentityGuardRoute,
  identity: IdentityGuardSnapshot,
) {
  if (identity.state === "unknown") return true;

  if (to.meta.requiresIdentity && !identity.hasIdentity) {
    return {
      name: "login",
      query: to.fullPath === "/today" ? {} : { redirect: to.fullPath },
    };
  }

  if (to.meta.identityOnly && identity.hasIdentity) {
    return { name: "today" };
  }

  return true;
}
