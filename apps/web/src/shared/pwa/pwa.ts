import { computed, readonly, ref, shallowRef } from "vue";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const isOnline = ref(true);
const isInstalled = ref(false);
const registrationReady = ref(false);
const installPrompt = shallowRef<InstallPromptEvent | null>(null);
const touchArrivalsEnabled = ref(true);
let initialized = false;

export const TOUCH_ARRIVALS_STORAGE_KEY = "our-tomorrow-touch-arrivals";

export function parseStoredBooleanPreference(
  value: string | null,
  fallback: boolean,
) {
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function readTouchArrivalsPreference() {
  try {
    return parseStoredBooleanPreference(
      window.localStorage.getItem(TOUCH_ARRIVALS_STORAGE_KEY),
      true,
    );
  } catch {
    return true;
  }
}

export function setTouchArrivalsEnabled(enabled: boolean) {
  touchArrivalsEnabled.value = enabled;
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(TOUCH_ARRIVALS_STORAGE_KEY, String(enabled));
  } catch {
    // The preference still applies to the current tab when storage is blocked.
  }
}

function standaloneMode() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function initializePwa() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  isOnline.value = navigator.onLine;
  isInstalled.value = standaloneMode();
  touchArrivalsEnabled.value = readTouchArrivalsPreference();

  window.addEventListener("online", () => (isOnline.value = true));
  window.addEventListener("offline", () => (isOnline.value = false));
  window.addEventListener("storage", (event) => {
    if (event.key !== TOUCH_ARRIVALS_STORAGE_KEY) return;
    touchArrivalsEnabled.value = parseStoredBooleanPreference(
      event.newValue,
      true,
    );
  });
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt.value = event as InstallPromptEvent;
  });
  window.addEventListener("appinstalled", () => {
    installPrompt.value = null;
    isInstalled.value = true;
  });

  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => (registrationReady.value = true))
      .catch(() => (registrationReady.value = false));
  }
}

export function clearPwaPrivateData() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.controller?.postMessage({
    type: "CLEAR_PRIVATE_DATA",
  });
}

export function usePwa() {
  const canInstall = computed(
    () => installPrompt.value !== null && !isInstalled.value,
  );

  async function install(): Promise<"accepted" | "dismissed" | "unavailable"> {
    const prompt = installPrompt.value;
    if (!prompt) return "unavailable";
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") installPrompt.value = null;
    return choice.outcome;
  }

  return {
    isOnline: readonly(isOnline),
    isInstalled: readonly(isInstalled),
    registrationReady: readonly(registrationReady),
    touchArrivalsEnabled: readonly(touchArrivalsEnabled),
    canInstall,
    install,
    setTouchArrivalsEnabled,
  };
}
