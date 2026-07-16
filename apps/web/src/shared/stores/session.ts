import type { AuthSession } from "@our-tomorrow/contracts";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

import {
  apiClient,
  ApiClientError,
  setApiCsrfToken,
} from "@/shared/api/client";

export type SessionState = "unknown" | "anonymous" | "authenticated";

interface LoginInput {
  username: string;
  password: string;
}

export const useSessionStore = defineStore("session", () => {
  const state = ref<SessionState>("unknown");
  const session = ref<AuthSession | null>(null);
  const errorMessage = ref<string | null>(null);
  let bootstrapPromise: Promise<void> | null = null;

  const isAuthenticated = computed(() => state.value === "authenticated");
  const hasCouple = computed(() => Boolean(session.value?.couple));
  const user = computed(() => session.value?.user ?? null);
  const couple = computed(() => session.value?.couple ?? null);

  function setSession(nextSession: AuthSession) {
    session.value = nextSession;
    state.value = "authenticated";
    errorMessage.value = null;
    setApiCsrfToken(nextSession.csrfToken);
  }

  function clearSession() {
    session.value = null;
    state.value = "anonymous";
    setApiCsrfToken(null);
  }

  async function bootstrap() {
    if (state.value !== "unknown") return;
    if (bootstrapPromise) return bootstrapPromise;

    bootstrapPromise = (async () => {
      try {
        setSession(await apiClient.get<AuthSession>("/auth/me"));
      } catch (error) {
        clearSession();

        if (!(error instanceof ApiClientError && error.isUnauthorized)) {
          errorMessage.value =
            error instanceof Error ? error.message : "无法检查登录状态。";
        }
      } finally {
        bootstrapPromise = null;
      }
    })();

    return bootstrapPromise;
  }

  async function login(input: LoginInput) {
    errorMessage.value = null;

    try {
      const nextSession = await apiClient.post<AuthSession>(
        "/auth/login",
        input,
      );
      setSession(nextSession);
      return nextSession;
    } catch (error) {
      errorMessage.value =
        error instanceof Error ? error.message : "登录没有成功，请稍后再试。";
      throw error;
    }
  }

  async function logout() {
    try {
      await apiClient.post<void>("/auth/logout");
    } finally {
      clearSession();
    }
  }

  return {
    state,
    session,
    errorMessage,
    isAuthenticated,
    hasCouple,
    user,
    couple,
    bootstrap,
    login,
    logout,
    setSession,
    clearSession,
  };
});
