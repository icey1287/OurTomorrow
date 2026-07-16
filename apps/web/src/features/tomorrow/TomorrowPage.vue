<script setup lang="ts">
import {
  ArrowRight,
  CalendarClock,
  CalendarHeart,
  CheckCircle2,
  ListTodo,
  MapPinned,
  MoonStar,
  Plus,
  Send,
  Sparkles,
  Sunrise,
} from "lucide-vue-next";

import AsyncState from "@/shared/components/AsyncState.vue";
import BaseButton from "@/shared/components/BaseButton.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import SectionHeading from "@/shared/components/SectionHeading.vue";
import SurfaceCard from "@/shared/components/SurfaceCard.vue";
</script>

<template>
  <main class="page-shell">
    <PageHeader
      eyebrow="Tomorrow · 尚未发生的未来"
      title="把期待写下来，让它有一天真的发生。"
      description="愿望、计划、纪念日和时间胶囊都遵循服务端时间；一件未来完成后，可以完整地回到记录。"
    >
      <template #actions>
        <BaseButton size="sm">
          <Plus class="size-4" />
          新愿望
        </BaseButton>
      </template>
    </PageHeader>

    <section class="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
      <SurfaceCard tone="future" class="relative min-h-72 overflow-hidden">
        <div
          class="absolute -right-16 -top-16 size-64 rounded-full border-[48px] border-future-200/45 dark:border-future-800/15"
        />
        <div class="relative flex min-h-60 flex-col justify-between">
          <div class="flex items-start justify-between gap-4">
            <span
              class="grid size-11 place-items-center rounded-2xl bg-future-100 text-future-700 dark:bg-future-900/45 dark:text-future-200"
            >
              <CalendarHeart class="size-5" />
            </span>
            <span
              class="rounded-full bg-white/65 px-3 py-1 text-xs text-ink-400 dark:bg-white/[0.06] dark:text-ink-500"
              >最近的倒数日</span
            >
          </div>

          <div class="mt-10">
            <p class="eyebrow text-future-700 dark:text-future-300">
              还没有重要日子
            </p>
            <h2
              class="mt-2 max-w-xl font-display text-3xl font-semibold tracking-[-0.04em] text-ink-950 dark:text-white sm:text-4xl"
            >
              为下一次值得期待的日子，留一个倒数。
            </h2>
            <BaseButton class="mt-5" variant="secondary" size="sm"
              >添加纪念日</BaseButton
            >
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard class="flex min-h-72 flex-col justify-between">
        <div>
          <div class="flex items-start justify-between">
            <span
              class="grid size-11 place-items-center rounded-2xl bg-ink-950 text-white dark:bg-white dark:text-ink-950"
            >
              <MoonStar class="size-5" />
            </span>
            <span
              class="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-3 py-1 text-xs font-semibold text-ink-500 dark:bg-white/[0.06] dark:text-ink-400"
            >
              <CalendarClock class="size-3" />
              服务端解锁
            </span>
          </div>
          <p class="eyebrow mt-6">时间胶囊</p>
          <h2
            class="mt-2 font-display text-2xl font-semibold text-ink-950 dark:text-white"
          >
            还没到那一天。
          </h2>
          <p class="mt-3 text-sm leading-6 text-ink-500 dark:text-ink-400">
            封存后正文不可修改，未到时间时 API 也不会返回内容。
          </p>
        </div>
        <button
          type="button"
          class="mt-6 inline-flex items-center gap-2 text-left text-sm font-semibold text-future-700 dark:text-future-300"
        >
          写一枚新胶囊
          <ArrowRight class="size-4" />
        </button>
      </SurfaceCard>
    </section>

    <section class="mt-8">
      <SectionHeading
        title="明天清单"
        description="不是打勾结束，而是让一件未来最终成为回忆。"
      >
        <div
          class="hidden items-center gap-1.5 rounded-full bg-white/55 p-1 dark:bg-white/[0.04] sm:flex"
        >
          <span
            v-for="state in ['想法', '已计划', '进行中', '已完成']"
            :key="state"
            class="rounded-full px-3 py-1.5 text-xs font-semibold"
            :class="
              state === '想法'
                ? 'bg-ink-950 text-white dark:bg-white dark:text-ink-950'
                : 'text-ink-400'
            "
          >
            {{ state }}
          </span>
        </div>
      </SectionHeading>

      <SurfaceCard class="mt-4">
        <AsyncState
          state="empty"
          title="把一个还没发生的期待，先放在这里。"
          message="它可以只是一家想去的店、一次散步，或一段很远的旅行。"
          action-label="写下第一个愿望"
        />
      </SurfaceCard>
    </section>

    <section class="mt-5 grid gap-5 lg:grid-cols-3">
      <SurfaceCard interactive>
        <span
          class="grid size-10 place-items-center rounded-2xl bg-future-100 text-future-700 dark:bg-future-900/45 dark:text-future-200"
        >
          <ListTodo class="size-4" />
        </span>
        <h2
          class="mt-5 font-display text-xl font-semibold text-ink-950 dark:text-white"
        >
          未来计划
        </h2>
        <p class="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400">
          时间、地点、准备事项与一句期待，保持刚好的轻量。
        </p>
      </SurfaceCard>

      <SurfaceCard interactive>
        <span
          class="grid size-10 place-items-center rounded-2xl bg-present-100 text-present-700 dark:bg-present-900/45 dark:text-present-200"
        >
          <MapPinned class="size-4" />
        </span>
        <h2
          class="mt-5 font-display text-xl font-semibold text-ink-950 dark:text-white"
        >
          未来地图
        </h2>
        <p class="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400">
          想去、已计划、即将出发，完成后自动移动到共同足迹。
        </p>
      </SurfaceCard>

      <SurfaceCard interactive>
        <span
          class="grid size-10 place-items-center rounded-2xl bg-memory-100 text-memory-700 dark:bg-memory-900/45 dark:text-memory-200"
        >
          <Send class="size-4" />
        </span>
        <h2
          class="mt-5 font-display text-xl font-semibold text-ink-950 dark:text-white"
        >
          未来来信
        </h2>
        <p class="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400">
          比胶囊更轻，在明早、下次见面或某个需要的时刻出现。
        </p>
      </SurfaceCard>
    </section>

    <section
      class="mt-5 rounded-3xl border border-future-200/70 bg-gradient-to-r from-future-50/80 via-white/65 to-memory-50/80 p-5 dark:border-future-800/35 dark:from-future-950/25 dark:via-white/[0.03] dark:to-memory-950/20 sm:p-6"
    >
      <div
        class="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="flex items-start gap-4">
          <span
            class="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-future-700 shadow-sm dark:bg-white/[0.08] dark:text-future-200"
          >
            <Sparkles class="size-5" />
          </span>
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
              愿望完成后，标题、期待、完成日期与照片会一起带入新回忆。
            </p>
          </div>
        </div>
        <div
          class="flex shrink-0 items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-ink-400"
        >
          <Sunrise class="size-4 text-future-500" />
          <ArrowRight class="size-4" />
          <Sparkles class="size-4 text-memory-500" />
        </div>
      </div>
    </section>
  </main>
</template>
