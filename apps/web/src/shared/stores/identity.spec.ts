import type {
  CoupleSummary,
  IdentityRole,
  IdentitySession,
  UserSummary,
} from "@our-tomorrow/contracts";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setApiIdentityRole } from "@/shared/api/client";
import { stageOneApi } from "@/shared/api/stage-one";
import {
  IDENTITY_STORAGE_KEY,
  useIdentityStore,
} from "@/shared/stores/identity";

function member(role: IdentityRole, version = 1): UserSummary {
  const boy = role === "boy";
  return {
    id: boy ? "user-boy" : "user-girl",
    version,
    displayName: boy ? "甲" : "乙",
    role,
    slot: boy ? 1 : 2,
    nicknameInRelationship: boy ? "甲" : "乙",
    avatarUrl: null,
  };
}

function couple(version = 1, boyVersion = 1): CoupleSummary {
  return {
    id: "couple-1",
    version,
    name: "我们的明天",
    startDate: "2024-01-01",
    timezone: "Asia/Shanghai",
    signature: null,
    theme: "system",
    members: [member("boy", boyVersion), member("girl")],
  };
}

function identitySession(role: IdentityRole = "boy"): IdentitySession {
  const currentCouple = couple();
  return {
    role,
    user: member(role),
    couple: currentCouple,
  };
}

function installStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
    clear: vi.fn(() => values.clear()),
  });
  return values;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  installStorage();
  setApiIdentityRole(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setApiIdentityRole(null);
});

describe("identity store", () => {
  it("stays unselected when this browser has no cached role", async () => {
    const identityApi = vi.spyOn(stageOneApi, "identity");
    const store = useIdentityStore();

    await store.bootstrap();

    expect(store.state).toBe("unselected");
    expect(store.hasIdentity).toBe(false);
    expect(identityApi).not.toHaveBeenCalled();
  });

  it("restores a cached role through the identity API", async () => {
    localStorage.setItem(IDENTITY_STORAGE_KEY, "boy");
    const select = vi
      .spyOn(stageOneApi, "selectIdentity")
      .mockResolvedValue(identitySession());
    const store = useIdentityStore();

    await store.bootstrap();

    expect(store.state).toBe("selected");
    expect(store.role).toBe("boy");
    expect(select).toHaveBeenCalledWith({ role: "boy" });
    expect(store.user?.slot).toBe(1);
    expect(store.couple?.members).toHaveLength(2);
  });

  it("selects, caches, switches, and clears a role", async () => {
    const select = vi
      .spyOn(stageOneApi, "selectIdentity")
      .mockResolvedValueOnce(identitySession("boy"))
      .mockResolvedValueOnce(identitySession("girl"));
    const store = useIdentityStore();

    await store.selectRole("boy");
    expect(select).toHaveBeenLastCalledWith({ role: "boy" });
    expect(localStorage.getItem(IDENTITY_STORAGE_KEY)).toBe("boy");

    await store.selectRole("girl");
    expect(store.role).toBe("girl");
    expect(store.user?.role).toBe("girl");
    expect(localStorage.getItem(IDENTITY_STORAGE_KEY)).toBe("girl");

    store.clearIdentity();
    expect(store.state).toBe("unselected");
    expect(store.identity).toBeNull();
    expect(localStorage.getItem(IDENTITY_STORAGE_KEY)).toBeNull();
  });

  it("synchronizes the top-level user and rejects stale couple summaries", () => {
    const store = useIdentityStore();
    store.setIdentity(identitySession("boy"));
    const freshCouple = {
      ...couple(2, 2),
      members: [
        {
          ...member("boy", 2),
          nicknameInRelationship: "新称呼",
        },
        member("girl"),
      ],
    };

    store.replaceCouple(freshCouple);
    expect(store.user?.nicknameInRelationship).toBe("新称呼");
    expect(store.couple?.version).toBe(2);

    store.replaceCouple(couple(1, 1));
    expect(store.couple?.version).toBe(2);
    expect(store.user?.version).toBe(2);
  });

  it("refreshes the couple version after updating a profile", async () => {
    const store = useIdentityStore();
    store.setIdentity(identitySession("boy"));
    const updatedUser = { ...member("boy", 2), displayName: "新名字" };
    const updatedCouple = {
      ...couple(2, 2),
      members: [updatedUser, member("girl")],
    };
    vi.spyOn(stageOneApi, "updateProfile").mockResolvedValue(updatedUser);
    vi.spyOn(stageOneApi, "currentCouple").mockResolvedValue(updatedCouple);

    await store.updateProfile({ version: 1, displayName: "新名字" });

    expect(store.user?.displayName).toBe("新名字");
    expect(store.couple?.version).toBe(2);
  });
});
