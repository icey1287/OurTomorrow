import { VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia } from "pinia";
import { createApp } from "vue";

import App from "@/App.vue";
import { queryClient } from "@/app/query-client";
import { router } from "@/router";
import { useThemeStore } from "@/shared/stores/theme";
import "@/shared/styles/index.css";

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(VueQueryPlugin, { queryClient });
app.use(router);

useThemeStore(pinia).initialize();

app.mount("#app");
