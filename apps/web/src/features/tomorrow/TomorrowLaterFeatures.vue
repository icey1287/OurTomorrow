<script setup lang="ts">
import {
  ArrowRight,
  CheckCircle2,
  MapPinned,
  Send,
  Sparkles,
  Sunrise,
} from "lucide-vue-next";

import SurfaceCard from "@/shared/components/SurfaceCard.vue";
</script>

<template>
  <section aria-labelledby="tomorrow-later-heading">
    <h2 id="tomorrow-later-heading" class="sr-only">稍后开放的明天功能</h2>
    <div class="grid gap-5 lg:grid-cols-2">
      <SurfaceCard class="cursor-not-allowed opacity-70" aria-disabled="true">
        <div class="flex items-start justify-between gap-3">
          <span
            class="grid size-10 place-items-center rounded-2xl bg-present-100 text-present-700 dark:bg-present-900/45 dark:text-present-200"
            ><MapPinned class="size-4"
          /></span>
          <span
            class="rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-semibold text-ink-500 dark:bg-white/[0.06] dark:text-ink-400"
            >稍后开放</span
          >
        </div>
        <h3
          class="mt-5 font-display text-xl font-semibold text-ink-950 dark:text-white"
        >
          未来地图
        </h3>
        <p class="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400">
          想去、已计划、即将出发与共同足迹的地图闭环将在后续阶段开放。
        </p>
      </SurfaceCard>

      <SurfaceCard class="cursor-not-allowed opacity-70" aria-disabled="true">
        <div class="flex items-start justify-between gap-3">
          <span
            class="grid size-10 place-items-center rounded-2xl bg-memory-100 text-memory-700 dark:bg-memory-900/45 dark:text-memory-200"
            ><Send class="size-4"
          /></span>
          <span
            class="rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-semibold text-ink-500 dark:bg-white/[0.06] dark:text-ink-400"
            >稍后开放</span
          >
        </div>
        <h3
          class="mt-5 font-display text-xl font-semibold text-ink-950 dark:text-white"
        >
          未来来信
        </h3>
        <p class="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400">
          比时间胶囊更轻的定时来信仍保持禁用，不会伪装成已经可用的胶囊类型。
        </p>
      </SurfaceCard>
    </div>

    <div
      class="mt-5 rounded-3xl border border-future-200/70 bg-gradient-to-r from-future-50/80 via-white/65 to-memory-50/80 p-5 dark:border-future-800/35 dark:from-future-950/25 dark:via-white/[0.03] dark:to-memory-950/20 sm:p-6"
    >
      <div
        class="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="flex items-start gap-4">
          <span
            class="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-future-700 shadow-sm dark:bg-white/[0.08] dark:text-future-200"
            ><Sparkles class="size-5"
          /></span>
          <div>
            <div class="flex items-center gap-2">
              <h2
                class="font-display text-xl font-semibold text-ink-950 dark:text-white"
              >
                未来完成时
              </h2>
              <CheckCircle2 class="size-4 text-present-500" />
            </div>
            <p class="mt-1 text-sm leading-6 text-ink-500 dark:text-ink-400">
              愿望与已打开胶囊转为回忆时，会保留来源关系，形成从明天回到记录的完整闭环。
            </p>
          </div>
        </div>
        <div
          class="flex shrink-0 items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-ink-400"
        >
          <Sunrise class="size-4 text-future-500" /><ArrowRight
            class="size-4"
          /><Sparkles class="size-4 text-memory-500" />
        </div>
      </div>
    </div>
  </section>
</template>
