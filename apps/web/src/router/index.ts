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
    return { top: 0, behavior: "smooth" };
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
          meta: { title: "选择身份", identityOnly: true },
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
          meta: { title: "今日" },
        },
        {
          path: "remember",
          name: "remember",
          component: () => import("@/features/remember/RememberPage.vue"),
          meta: { title: "记录" },
        },
        {
          path: "daily",
          name: "daily",
          component: () => import("@/features/daily/DailyPage.vue"),
          meta: { title: "日常" },
        },
        {
          path: "tomorrow",
          name: "tomorrow",
          component: () => import("@/features/tomorrow/TomorrowPage.vue"),
          meta: { title: "明天" },
        },
        {
          path: "us",
          name: "us",
          component: () => import("@/features/us/UsPage.vue"),
          meta: { title: "我们" },
        },
        {
          path: "settings",
          name: "settings",
          component: () => import("@/features/settings/SettingsPage.vue"),
          meta: { title: "设置" },
        },
      ],
    },
    {
      path: "/:pathMatch(.*)*",
      component: PublicLayout,
      children: [
        {
          path: "",
          name: "not-found",
          component: () => import("@/features/NotFoundPage.vue"),
          meta: { title: "页面走远了" },
        },
      ],
    },
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
