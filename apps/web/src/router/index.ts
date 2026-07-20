import { createRouter, createWebHistory } from "vue-router";

import IdentityPage from "@/features/identity/IdentityPage.vue";
import SettingsPage from "@/features/settings/SettingsPage.vue";
import TodayPage from "@/features/today/TodayPage.vue";
import { resolveIdentityNavigation } from "@/router/identity-guard";
import { useIdentityStore } from "@/shared/stores/identity";

const BRAND_SUFFIX = "我们的明天";

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition;
    if (to.path === from.path) return undefined;
    return { top: 0 };
  },
  routes: [
    { path: "/", redirect: "/today" },
    {
      path: "/login",
      name: "login",
      component: IdentityPage,
      meta: {
        title: "写下名字",
        identityOnly: true,
        transitionName: "journal-route",
      },
    },
    {
      path: "/today",
      name: "today",
      component: TodayPage,
      meta: {
        title: "今天",
        requiresIdentity: true,
        transitionName: "journal-route",
      },
    },
    {
      path: "/settings",
      name: "settings",
      component: SettingsPage,
      meta: {
        title: "手账的小抽屉",
        requiresIdentity: true,
        transitionName: "journal-route",
      },
    },
    { path: "/:pathMatch(.*)*", redirect: "/today" },
  ],
});

router.beforeEach(async (to) => {
  const identity = useIdentityStore();
  if (identity.state === "unknown") await identity.bootstrap();
  return resolveIdentityNavigation(to, {
    state: identity.state,
    hasIdentity: identity.hasIdentity,
  });
});

router.afterEach((to) => {
  document.title = to.meta.title
    ? `${to.meta.title} · ${BRAND_SUFFIX}`
    : BRAND_SUFFIX;
});
