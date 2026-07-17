import { VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia } from "pinia";
import { createApp } from "vue";

import App from "@/App.vue";
import { queryClient } from "@/app/query-client";
import { router } from "@/router";
import { revokeAllPrivateMediaUrls } from "@/shared/composables/use-private-media";
import {
  disconnectRealtime,
  syncRealtimeIdentity,
} from "@/shared/realtime/realtime";
import { useIdentityStore } from "@/shared/stores/identity";
import { useThemeStore } from "@/shared/stores/theme";
import "@/shared/styles/index.css";

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(VueQueryPlugin, { queryClient });
app.use(router);

useThemeStore(pinia).initialize();

const identityStore = useIdentityStore(pinia);
let previousRole = identityStore.role;
syncRealtimeIdentity(previousRole, queryClient);
identityStore.$subscribe((_mutation, state) => {
  if (state.role !== previousRole) {
    previousRole = state.role;
    revokeAllPrivateMediaUrls();
    queryClient.clear();
    syncRealtimeIdentity(state.role, queryClient);
  }
});
window.addEventListener("beforeunload", disconnectRealtime, { once: true });

app.mount("#app");
