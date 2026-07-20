import { createRouter, createWebHistory } from "vue-router";

import AppLayout from "@/layouts/AppLayout.vue";
import PublicLayout from "@/layouts/PublicLayout.vue";
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
    {
      path: "/",
      component: PublicLayout,
      children: [
        { path: "", redirect: "/login" },
        {
          path: "login",
          name: "login",
          component: () => import("@/features/identity/IdentityPage.vue"),
          meta: {
            title: "写下名字",
            identityOnly: true,
            transitionName: "journal-route",
          },
        },
        { path: "identity", redirect: "/login" },
        { path: "join", redirect: "/login" },
        { path: "onboarding", redirect: "/login" },
      ],
    },
    {
      path: "/",
      component: AppLayout,
      meta: { requiresIdentity: true },
      children: [
        { path: "", redirect: "/today" },
        {
          path: "today",
          name: "today",
          component: () => import("@/features/today/TodayPage.vue"),
          meta: { title: "今天", transitionName: "journal-route" },
        },
        {
          path: "settings",
          name: "settings",
          component: () => import("@/features/settings/SettingsPage.vue"),
          meta: { title: "手账的小抽屉", transitionName: "journal-route" },
        },
      ],
    },
    { path: "/:pathMatch(.*)*", redirect: "/today" },
  ],
});

router.beforeEach(async (to) => {
  const identity = useIdentityStore();

  if (identity.state === "unknown") {
    await identity.bootstrap();
  }

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
