import { readonly, ref } from "vue";

const isOnline = ref(true);
let initialized = false;

export function initializePwa() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  isOnline.value = navigator.onLine;

  window.addEventListener("online", () => (isOnline.value = true));
  window.addEventListener("offline", () => (isOnline.value = false));

  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" });
  }
}

export function clearPwaPrivateData() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.controller?.postMessage({
    type: "CLEAR_PRIVATE_DATA",
  });
}

export function usePwa() {
  return { isOnline: readonly(isOnline) };
}
