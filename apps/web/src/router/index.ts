import { createRouter, createWebHistory } from "vue-router";

import AppLayout from "@/layouts/AppLayout.vue";
import PublicLayout from "@/layouts/PublicLayout.vue";
import { useSessionStore } from "@/shared/stores/session";

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
        {
          path: "login",
          name: "login",
          component: () => import("@/features/auth/LoginPage.vue"),
          meta: { title: "登录", guestOnly: true },
        },
        {
          path: "onboarding",
          name: "onboarding",
          component: () => import("@/features/onboarding/OnboardingPage.vue"),
          meta: { title: "建立我们的空间", requiresAuth: true },
        },
      ],
    },
    {
      path: "/",
      component: AppLayout,
      meta: { requiresAuth: true, requiresCouple: true },
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
  const session = useSessionStore();

  // 三态会话守卫：unknown 先向服务端确认，再只处理 anonymous/authenticated。
  if (session.state === "unknown") {
    await session.bootstrap();
  }

  if (to.meta.requiresAuth && session.state === "anonymous") {
    return {
      name: "login",
      query: to.fullPath === "/today" ? {} : { redirect: to.fullPath },
    };
  }

  if (to.meta.guestOnly && session.state === "authenticated") {
    return { name: session.hasCouple ? "today" : "onboarding" };
  }

  if (
    to.meta.requiresCouple &&
    session.state === "authenticated" &&
    !session.hasCouple
  ) {
    return { name: "onboarding" };
  }

  if (
    to.name === "onboarding" &&
    session.state === "authenticated" &&
    session.hasCouple
  ) {
    return { name: "today" };
  }

  return true;
});

router.afterEach((to) => {
  document.title = to.meta.title
    ? `${to.meta.title} · ${BRAND_SUFFIX}`
    : BRAND_SUFFIX;
});
