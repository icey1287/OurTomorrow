<script setup lang="ts">
import { Compass } from "lucide-vue-next";
import { RouterLink } from "vue-router";
</script>

<template>
  <section class="surface w-full max-w-lg p-8 text-center sm:p-12">
    <span
      class="mx-auto grid size-14 place-items-center rounded-2xl bg-memory-100 text-memory-700 dark:bg-memory-950/45 dark:text-memory-200"
    >
      <Compass class="size-6" />
    </span>
    <p class="eyebrow mt-6">404 · 走远了一点</p>
    <h1
      class="mt-3 font-display text-3xl font-semibold tracking-[-0.035em] text-ink-950 dark:text-white"
    >
      这一页还没有被写下
    </h1>
    <p class="mt-3 text-sm leading-6 text-ink-500 dark:text-ink-400">
      没关系，沿着熟悉的路回去，你们的故事仍在那里。
    </p>
    <RouterLink
      to="/today"
      class="mt-7 inline-flex min-h-11 items-center justify-center rounded-2xl bg-ink-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink-800 dark:bg-white dark:text-ink-950"
    >
      回到今日
    </RouterLink>
  </section>
</template>
