import { VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia } from "pinia";
import { createApp } from "vue";

import App from "@/App.vue";
import { queryClient } from "@/app/query-client";
import { router } from "@/router";
import { clearPwaPrivateData, initializePwa } from "@/shared/pwa/pwa";
import {
  disconnectRealtime,
  syncRealtimeIdentity,
} from "@/shared/realtime/realtime";
import { useIdentityStore } from "@/shared/stores/identity";
import "@/shared/styles/index.css";

try {
  localStorage.removeItem("our-tomorrow-motion");
} catch {
  // The full garden remains the only experience when storage is unavailable.
}
document.documentElement.classList.remove("reduce-motion");
delete document.documentElement.dataset.motion;

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(VueQueryPlugin, { queryClient });
app.use(router);

initializePwa();

const identityStore = useIdentityStore(pinia);
let previousRole = identityStore.role;
syncRealtimeIdentity(previousRole, queryClient);
identityStore.$subscribe((_mutation, state) => {
  if (state.role !== previousRole) {
    previousRole = state.role;
    clearPwaPrivateData();
    queryClient.clear();
    syncRealtimeIdentity(state.role, queryClient);
  }
});
window.addEventListener("beforeunload", disconnectRealtime, { once: true });

app.mount("#app");
