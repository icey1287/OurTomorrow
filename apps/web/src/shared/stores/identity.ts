import type {
  CoupleSummary,
  IdentityRole,
  IdentitySession,
  UpdateCoupleRequest,
  UpdateProfileRequest,
} from "@our-tomorrow/contracts";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { ApiClientError, setApiIdentityRole } from "@/shared/api/client";
import { stageOneApi } from "@/shared/api/stage-one";

export const IDENTITY_STORAGE_KEY = "our-tomorrow-role";
export type IdentityState = "unknown" | "unselected" | "selected";

function readCachedRole(): IdentityRole | null {
  try {
    const value = localStorage.getItem(IDENTITY_STORAGE_KEY);
    return value === "boy" || value === "girl" ? value : null;
  } catch {
    return null;
  }
}

function cacheRole(role: IdentityRole | null) {
  try {
    if (role) localStorage.setItem(IDENTITY_STORAGE_KEY, role);
    else localStorage.removeItem(IDENTITY_STORAGE_KEY);
  } catch {
    // Identity remains usable for this tab when storage is unavailable.
  }
}

function userForCouple(
  user: IdentitySession["user"],
  couple: CoupleSummary,
): IdentitySession["user"] {
  const membership = couple.members.find((member) => member.id === user.id);
  return membership ? { ...user, ...membership } : user;
}

export const useIdentityStore = defineStore("identity", () => {
  const state = ref<IdentityState>("unknown");
  const role = ref<IdentityRole | null>(null);
  const identity = ref<IdentitySession | null>(null);
  const errorMessage = ref<string | null>(null);
  let bootstrapPromise: Promise<void> | null = null;

  const hasIdentity = computed(() => role.value !== null);
  const user = computed(() => identity.value?.user ?? null);
  const couple = computed(() => identity.value?.couple ?? null);

  function setIdentity(nextIdentity: IdentitySession) {
    role.value = nextIdentity.role;
    identity.value = {
      ...nextIdentity,
      user: userForCouple(nextIdentity.user, nextIdentity.couple),
    };
    state.value = "selected";
    errorMessage.value = null;
    setApiIdentityRole(nextIdentity.role);
    cacheRole(nextIdentity.role);
  }

  function clearIdentity() {
    role.value = null;
    identity.value = null;
    state.value = "unselected";
    errorMessage.value = null;
    setApiIdentityRole(null);
    cacheRole(null);
  }

  async function bootstrap() {
    if (state.value !== "unknown") return;
    if (bootstrapPromise) return bootstrapPromise;

    bootstrapPromise = (async () => {
      const cachedRole = readCachedRole();
      if (!cachedRole) {
        clearIdentity();
        return;
      }

      role.value = cachedRole;
      setApiIdentityRole(cachedRole);

      try {
        setIdentity(await stageOneApi.selectIdentity({ role: cachedRole }));
      } catch (error) {
        if (
          error instanceof ApiClientError &&
          error.code === "IDENTITY_REQUIRED"
        ) {
          clearIdentity();
          return;
        }

        state.value = "selected";
        errorMessage.value =
          error instanceof Error ? error.message : "暂时无法恢复身份。";
      }
    })().finally(() => {
      bootstrapPromise = null;
    });

    return bootstrapPromise;
  }

  async function selectRole(nextRole: IdentityRole) {
    errorMessage.value = null;
    try {
      const nextIdentity = await stageOneApi.selectIdentity({ role: nextRole });
      setIdentity(nextIdentity);
      return nextIdentity;
    } catch (error) {
      errorMessage.value =
        error instanceof Error ? error.message : "身份选择没有成功。";
      throw error;
    }
  }

  function replaceCouple(nextCouple: CoupleSummary) {
    if (!identity.value) {
      const selectedRole = role.value;
      const selectedUser = selectedRole
        ? nextCouple.members.find((member) => member.role === selectedRole)
        : null;
      if (selectedRole && selectedUser) {
        setIdentity({
          role: selectedRole,
          user: selectedUser,
          couple: nextCouple,
        });
      }
      return;
    }
    const currentCouple = identity.value.couple;

    if (nextCouple.version < currentCouple.version) return;
    if (nextCouple.version === currentCouple.version) {
      const wouldLoseNewerMember = currentCouple.members.some(
        (currentMember) => {
          const nextMember = nextCouple.members.find(
            (member) => member.id === currentMember.id,
          );
          return !nextMember || nextMember.version < currentMember.version;
        },
      );
      if (wouldLoseNewerMember) return;
    }

    identity.value = {
      ...identity.value,
      user: userForCouple(identity.value.user, nextCouple),
      couple: nextCouple,
    };
  }

  function replaceUser(nextUser: IdentitySession["user"]) {
    if (!identity.value) return;
    identity.value = {
      ...identity.value,
      user: nextUser,
      couple: {
        ...identity.value.couple,
        members: identity.value.couple.members.map((member) =>
          member.id === nextUser.id ? { ...member, ...nextUser } : member,
        ),
      },
    };
  }

  async function refreshIdentity() {
    const nextIdentity = await stageOneApi.identity();
    setIdentity(nextIdentity);
    return nextIdentity;
  }

  async function updateProfile(input: UpdateProfileRequest) {
    const nextUser = await stageOneApi.updateProfile(input);
    replaceUser(nextUser);
    const nextCouple = await stageOneApi.currentCouple();
    replaceCouple(nextCouple);
    return nextUser;
  }

  async function updateCouple(input: UpdateCoupleRequest) {
    const nextCouple = await stageOneApi.updateCouple(input);
    replaceCouple(nextCouple);
    return nextCouple;
  }

  return {
    state,
    role,
    identity,
    errorMessage,
    hasIdentity,
    user,
    couple,
    bootstrap,
    selectRole,
    clearIdentity,
    refreshIdentity,
    updateProfile,
    updateCouple,
    setIdentity,
    replaceCouple,
    replaceUser,
  };
});
