<script setup lang="ts">
import type { Component } from "vue";
import {
  CircleUserRound,
  Clock3,
  Heart,
  House,
  Plus,
  Settings,
  Sparkles,
  StickyNote,
  Sunrise,
} from "lucide-vue-next";
import { computed, ref } from "vue";
import { RouterLink, RouterView, useRouter } from "vue-router";

import BrandMark from "@/shared/components/BrandMark.vue";
import CreatePanel, {
  type CreateSelection,
} from "@/shared/components/CreatePanel.vue";
import { useSessionStore } from "@/shared/stores/session";

interface NavItem {
  label: string;
  to: string;
  icon: Component;
}

const router = useRouter();
const session = useSessionStore();
const createOpen = ref(false);

const primaryNavigation: NavItem[] = [
  { label: "今日", to: "/today", icon: House },
  { label: "记录", to: "/remember", icon: Clock3 },
  { label: "日常", to: "/daily", icon: StickyNote },
  { label: "明天", to: "/tomorrow", icon: Sunrise },
  { label: "我们", to: "/us", icon: Heart },
];

const mobileNavigation: NavItem[] = [
  { label: "记录", to: "/remember", icon: Clock3 },
  { label: "日常", to: "/daily", icon: StickyNote },
  { label: "明天", to: "/tomorrow", icon: Sunrise },
  { label: "我们", to: "/us", icon: Heart },
];

const userName = computed(
  () =>
    session.user?.nicknameInRelationship ??
    session.user?.displayName ??
    "我们的空间",
);
const coupleName = computed(() => session.couple?.name ?? "我们的明天");
const initials = computed(() => userName.value.trim().slice(0, 1) || "甲");

async function handleCreate(selection: CreateSelection) {
  await router.push({
    name: selection.routeName,
    query: { create: selection.type },
  });
}
</script>

<template>
  <div class="min-h-dvh">
    <aside
      class="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/70 bg-[#f8f6f2]/80 px-4 py-5 backdrop-blur-2xl dark:border-white/10 dark:bg-ink-950/80 lg:flex"
    >
      <RouterLink to="/today" class="px-2 py-1" aria-label="打开今日首页">
        <BrandMark />
      </RouterLink>

      <button
        type="button"
        class="group mt-8 flex w-full items-center gap-3 rounded-2xl bg-ink-950 px-4 py-3.5 text-left text-sm font-semibold text-white shadow-lg shadow-ink-950/15 transition hover:-translate-y-0.5 hover:bg-ink-800 dark:bg-white dark:text-ink-950 dark:hover:bg-ink-100"
        @click="createOpen = true"
      >
        <span
          class="grid size-8 place-items-center rounded-xl bg-white/15 dark:bg-ink-950/10"
        >
          <Plus class="size-4 transition group-hover:rotate-90" />
        </span>
        留下这一刻
      </button>

      <nav class="mt-6 space-y-1" aria-label="主导航">
        <RouterLink
          v-for="item in primaryNavigation"
          :key="item.to"
          :to="item.to"
          class="group flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-medium text-ink-500 transition hover:bg-white/65 hover:text-ink-950 dark:text-ink-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
          active-class="!bg-white !text-ink-950 shadow-sm dark:!bg-white/[0.08] dark:!text-white"
        >
          <component
            :is="item.icon"
            class="size-[1.1rem] transition group-hover:scale-105"
          />
          {{ item.label }}
        </RouterLink>
      </nav>

      <div class="my-5 quiet-divider" />

      <div
        class="rounded-2xl bg-gradient-to-br from-memory-100/70 via-present-50/70 to-future-100/70 p-4 dark:from-memory-950/30 dark:via-present-950/20 dark:to-future-950/25"
      >
        <div
          class="flex items-center gap-2 text-xs font-semibold text-ink-700 dark:text-ink-200"
        >
          <Sparkles class="size-3.5 text-memory-500" />
          三段时间，一条故事
        </div>
        <p class="mt-2 text-xs leading-5 text-ink-500 dark:text-ink-400">
          未来会在某一天，成为值得重逢的过去。
        </p>
      </div>

      <div class="mt-auto space-y-2 pt-5">
        <RouterLink
          to="/settings"
          class="flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-medium text-ink-500 transition hover:bg-white/65 hover:text-ink-950 dark:text-ink-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
          active-class="!bg-white !text-ink-950 shadow-sm dark:!bg-white/[0.08] dark:!text-white"
        >
          <Settings class="size-[1.1rem]" />
          设置
        </RouterLink>

        <RouterLink
          to="/us"
          class="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/55 p-3 backdrop-blur transition hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.07]"
        >
          <span
            class="grid size-9 shrink-0 place-items-center rounded-xl bg-ink-950 text-sm font-semibold text-white dark:bg-white dark:text-ink-950"
          >
            {{ initials }}
          </span>
          <span class="min-w-0 flex-1">
            <span
              class="block truncate text-sm font-semibold text-ink-900 dark:text-white"
              >{{ userName }}</span
            >
            <span
              class="mt-0.5 block truncate text-xs text-ink-400 dark:text-ink-500"
              >{{ coupleName }}</span
            >
          </span>
          <CircleUserRound class="size-4 text-ink-300 dark:text-ink-600" />
        </RouterLink>
      </div>
    </aside>

    <div class="min-h-dvh lg:pl-64">
      <header
        class="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/65 bg-[#f8f6f2]/75 px-4 backdrop-blur-xl dark:border-white/10 dark:bg-ink-950/75 sm:px-6 lg:hidden"
      >
        <RouterLink to="/today" aria-label="打开今日首页">
          <BrandMark compact />
        </RouterLink>
        <p
          class="font-display text-base font-semibold tracking-[-0.02em] text-ink-950 dark:text-white"
        >
          {{ coupleName }}
        </p>
        <RouterLink
          to="/settings"
          class="grid size-10 place-items-center rounded-xl text-ink-500 transition hover:bg-white/70 hover:text-ink-950 dark:hover:bg-white/[0.06] dark:hover:text-white"
          aria-label="打开设置"
        >
          <Settings class="size-5" />
        </RouterLink>
      </header>

      <RouterView />
    </div>

    <nav
      class="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 items-end border-t border-white/70 bg-[#fbfaf7]/[0.92] px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-14px_35px_-28px_rgba(32,35,41,0.45)] backdrop-blur-2xl dark:border-white/10 dark:bg-ink-950/[0.92] lg:hidden"
      aria-label="移动端主导航"
    >
      <RouterLink
        v-for="item in mobileNavigation.slice(0, 2)"
        :key="item.to"
        :to="item.to"
        class="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium text-ink-400 transition dark:text-ink-500"
        active-class="!text-ink-950 dark:!text-white"
      >
        <component :is="item.icon" class="size-5" />
        {{ item.label }}
      </RouterLink>

      <button
        type="button"
        class="group -mt-7 flex min-h-16 flex-col items-center justify-end gap-1 text-[10px] font-semibold text-ink-600 dark:text-ink-300"
        aria-label="打开统一创建面板"
        @click="createOpen = true"
      >
        <span
          class="grid size-14 place-items-center rounded-[1.25rem] border-4 border-[#fbfaf7] bg-ink-950 text-white shadow-lg shadow-ink-950/20 transition group-active:scale-95 dark:border-ink-950 dark:bg-white dark:text-ink-950"
        >
          <Plus class="size-6 transition group-hover:rotate-90" />
        </span>
        创建
      </button>

      <RouterLink
        v-for="item in mobileNavigation.slice(2)"
        :key="item.to"
        :to="item.to"
        class="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium text-ink-400 transition dark:text-ink-500"
        active-class="!text-ink-950 dark:!text-white"
      >
        <component :is="item.icon" class="size-5" />
        {{ item.label }}
      </RouterLink>
    </nav>

    <CreatePanel v-model="createOpen" @select="handleCreate" />
  </div>
</template>
