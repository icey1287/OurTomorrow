<script setup lang="ts">
import { LockKeyhole } from "lucide-vue-next";
import { RouterLink, RouterView } from "vue-router";

import BrandMark from "@/shared/components/BrandMark.vue";
</script>

<template>
  <main class="relative min-h-dvh overflow-hidden">
    <div
      class="pointer-events-none absolute inset-0 bg-soft-grid bg-[size:32px_32px] [mask-image:linear-gradient(to_bottom,black,transparent_90%)]"
      aria-hidden="true"
    />
    <div
      class="pointer-events-none absolute -left-24 top-20 size-80 rounded-full bg-memory-200/30 blur-3xl dark:bg-memory-800/15"
      aria-hidden="true"
    />
    <div
      class="pointer-events-none absolute -right-28 bottom-8 size-96 rounded-full bg-present-200/35 blur-3xl dark:bg-present-800/15"
      aria-hidden="true"
    />

    <div
      class="relative mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-5 py-5 sm:px-8 sm:py-7 lg:px-12"
    >
      <header class="flex items-center justify-between">
        <RouterLink to="/login" aria-label="回到登录页">
          <BrandMark />
        </RouterLink>
        <span
          class="hidden items-center gap-2 rounded-full border border-white/70 bg-white/55 px-3.5 py-2 text-xs font-medium text-ink-500 backdrop-blur dark:border-white/10 dark:bg-white/[0.04] dark:text-ink-400 sm:inline-flex"
        >
          <LockKeyhole class="size-3.5" />
          这里没有访客，只有我们
        </span>
      </header>

      <div class="flex flex-1 items-center justify-center py-10 sm:py-14">
        <RouterView />
      </div>

      <footer
        class="text-center text-xs leading-5 text-ink-400 dark:text-ink-500"
      >
        记录每个昨天，共度每个今天，奔赴所有明天。
      </footer>
    </div>
  </main>
</template>
