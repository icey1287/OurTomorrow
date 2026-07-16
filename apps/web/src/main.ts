import { VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia } from "pinia";
import { createApp } from "vue";

import App from "@/App.vue";
import { queryClient } from "@/app/query-client";
import { router } from "@/router";
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
identityStore.$subscribe((_mutation, state) => {
  if (state.role !== previousRole) {
    previousRole = state.role;
    queryClient.clear();
  }
});

app.mount("#app");
