import type { ThemePreference } from "@our-tomorrow/contracts";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

type ResolvedTheme = Exclude<ThemePreference, "system">;
export type MotionPreference = "system" | "reduce" | "full";

const STORAGE_KEY = "our-tomorrow-theme";
const MOTION_STORAGE_KEY = "our-tomorrow-motion";

export const useThemeStore = defineStore("theme", () => {
  const preference = ref<ThemePreference>("system");
  const resolvedTheme = ref<ResolvedTheme>("light");
  const motionPreference = ref<MotionPreference>("system");
  const reduceMotion = ref(false);
  let mediaQuery: MediaQueryList | null = null;
  let motionMediaQuery: MediaQueryList | null = null;
  let initialized = false;

  const isDark = computed(() => resolvedTheme.value === "dark");

  function resolveTheme(): ResolvedTheme {
    if (preference.value !== "system") return preference.value;
    return mediaQuery?.matches ? "dark" : "light";
  }

  function applyTheme() {
    resolvedTheme.value = resolveTheme();
    document.documentElement.classList.toggle(
      "dark",
      resolvedTheme.value === "dark",
    );
    document.documentElement.dataset.theme = resolvedTheme.value;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        "content",
        resolvedTheme.value === "dark" ? "#14171d" : "#f7f5f1",
      );
  }

  function setPreference(nextPreference: ThemePreference) {
    preference.value = nextPreference;
    localStorage.setItem(STORAGE_KEY, nextPreference);
    applyTheme();
  }

  function applyMotion() {
    reduceMotion.value =
      motionPreference.value === "reduce" ||
      (motionPreference.value === "system" &&
        Boolean(motionMediaQuery?.matches));
    document.documentElement.classList.toggle(
      "reduce-motion",
      reduceMotion.value,
    );
    document.documentElement.dataset.motion = reduceMotion.value
      ? "reduced"
      : "full";
  }

  function setMotionPreference(nextPreference: MotionPreference) {
    motionPreference.value = nextPreference;
    localStorage.setItem(MOTION_STORAGE_KEY, nextPreference);
    applyMotion();
  }

  function initialize() {
    if (initialized) return;
    initialized = true;

    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    motionMediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const savedPreference = localStorage.getItem(STORAGE_KEY);
    const savedMotionPreference = localStorage.getItem(MOTION_STORAGE_KEY);

    if (
      savedPreference === "light" ||
      savedPreference === "dark" ||
      savedPreference === "system"
    ) {
      preference.value = savedPreference;
    }

    if (
      savedMotionPreference === "system" ||
      savedMotionPreference === "reduce" ||
      savedMotionPreference === "full"
    ) {
      motionPreference.value = savedMotionPreference;
    }

    mediaQuery.addEventListener("change", applyTheme);
    motionMediaQuery.addEventListener("change", applyMotion);
    applyTheme();
    applyMotion();
  }

  return {
    preference,
    resolvedTheme,
    isDark,
    motionPreference,
    reduceMotion,
    initialize,
    setPreference,
    setMotionPreference,
  };
});
