<script setup lang="ts">
import {
  BellRing,
  Clock3,
  HeartHandshake,
  LockKeyhole,
  MessageCircleHeart,
  Plus,
  Send,
  Sparkles,
  StickyNote,
  SunMedium,
} from "lucide-vue-next";
import { ref } from "vue";

import AsyncState from "@/shared/components/AsyncState.vue";
import BaseButton from "@/shared/components/BaseButton.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import SectionHeading from "@/shared/components/SectionHeading.vue";
import SurfaceCard from "@/shared/components/SurfaceCard.vue";

const selectedMood = ref<string | null>(null);
const moods = [
  { emoji: "☀️", label: "明亮" },
  { emoji: "🌿", label: "安心" },
  { emoji: "☁️", label: "疲惫" },
  { emoji: "🌧️", label: "低落" },
  { emoji: "✨", label: "期待" },
];
</script>

<template>
  <main class="page-shell">
    <PageHeader
      eyebrow="Daily · 正在发生的现在"
      title="不必写很多，也能让彼此被看见。"
      description="一句状态、一张纸条或一个心情，都能在几十秒内完成；没有签到压力，也不比较谁付出更多。"
    >
      <template #actions>
        <BaseButton size="sm">
          <Plus class="size-4" />
          留便利贴
        </BaseButton>
      </template>
    </PageHeader>

    <section class="grid gap-5 xl:grid-cols-2">
      <SurfaceCard tone="present" class="relative overflow-hidden">
        <div
          class="absolute -right-12 -top-12 size-40 rounded-full bg-present-200/45 blur-3xl dark:bg-present-700/10"
        />
        <div class="relative">
          <div class="flex items-start justify-between gap-4">
            <span
              class="grid size-11 place-items-center rounded-2xl bg-present-100 text-present-700 dark:bg-present-900/45 dark:text-present-200"
            >
              <SunMedium class="size-5" />
            </span>
            <span
              class="rounded-full bg-white/70 px-3 py-1 text-xs text-ink-400 dark:bg-white/[0.06] dark:text-ink-500"
              >自动失效</span
            >
          </div>
          <p class="eyebrow mt-6 text-present-700 dark:text-present-300">
            她 / 他的此刻
          </p>
          <h2
            class="mt-2 font-display text-2xl font-semibold text-ink-950 dark:text-white"
          >
            还没有更新状态
          </h2>
          <p class="mt-3 text-sm leading-6 text-ink-500 dark:text-ink-400">
            当对方留下近况，会显示心情、场景与预计持续时间。
          </p>
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="eyebrow">我的状态</p>
            <h2
              class="mt-2 font-display text-2xl font-semibold text-ink-950 dark:text-white"
            >
              现在的你，是什么状态？
            </h2>
          </div>
          <span
            class="grid size-10 place-items-center rounded-2xl bg-ink-100 text-ink-500 dark:bg-white/[0.07] dark:text-ink-300"
          >
            <Clock3 class="size-4" />
          </span>
        </div>
        <div class="mt-5 flex flex-wrap gap-2">
          <button
            v-for="status in [
              '忙碌中',
              '在路上',
              '有点累',
              '需要抱抱',
              '已经到家',
              '正在想你',
            ]"
            :key="status"
            type="button"
            class="rounded-full border border-ink-200 bg-white/60 px-3.5 py-2 text-xs font-semibold text-ink-600 transition hover:border-present-300 hover:bg-present-50 hover:text-present-800 dark:border-white/10 dark:bg-white/[0.04] dark:text-ink-300 dark:hover:border-present-800 dark:hover:bg-present-950/30 dark:hover:text-present-200"
          >
            {{ status }}
          </button>
        </div>
        <BaseButton class="mt-5" variant="secondary" size="sm"
          >自定义此刻</BaseButton
        >
      </SurfaceCard>
    </section>

    <section class="mt-5 grid gap-5 xl:grid-cols-[0.82fr_1.18fr]">
      <SurfaceCard class="flex flex-col">
        <div class="flex items-start justify-between gap-4">
          <span
            class="grid size-11 place-items-center rounded-2xl bg-future-100 text-future-700 dark:bg-future-900/45 dark:text-future-200"
          >
            <MessageCircleHeart class="size-5" />
          </span>
          <span
            class="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-3 py-1 text-xs font-semibold text-ink-500 dark:bg-white/[0.06] dark:text-ink-400"
          >
            <LockKeyhole class="size-3" />
            提交前互不可见
          </span>
        </div>
        <p class="eyebrow mt-6">今日交换日记</p>
        <h2
          class="mt-2 font-display text-2xl font-semibold leading-snug text-ink-950 dark:text-white"
        >
          今天什么时候，忽然想起了对方？
        </h2>
        <p class="mt-3 text-sm leading-6 text-ink-500 dark:text-ink-400">
          你们分别回答，等两份答案都提交后再同时揭晓。
        </p>
        <div class="mt-auto pt-6">
          <BaseButton block>
            写下我的答案
            <Send class="size-4" />
          </BaseButton>
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <SectionHeading
          title="留给你 · 便利贴墙"
          description="定时显示由服务端控制，不会只靠浏览器隐藏。"
        >
          <BaseButton variant="ghost" size="sm">
            <Plus class="size-4" />
            新纸条
          </BaseButton>
        </SectionHeading>
        <div class="mt-5">
          <AsyncState
            state="empty"
            title="给对方留一句此刻的话。"
            message="想念、感谢、提醒或一个待沟通的话题，都可以轻轻放在这里。"
          />
        </div>
      </SurfaceCard>
    </section>

    <section class="mt-5 grid gap-5 lg:grid-cols-2">
      <SurfaceCard>
        <div class="flex items-center justify-between gap-4">
          <SectionHeading
            title="今日心情"
            description="只记录感受，不为情绪打分。"
          />
          <Sparkles class="size-5 text-memory-500" />
        </div>
        <div class="mt-5 grid grid-cols-5 gap-2">
          <button
            v-for="mood in moods"
            :key="mood.label"
            type="button"
            class="flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border text-xs font-semibold transition"
            :class="
              selectedMood === mood.label
                ? 'border-present-300 bg-present-50 text-present-800 ring-2 ring-present-100 dark:border-present-700 dark:bg-present-950/35 dark:text-present-200 dark:ring-present-900/40'
                : 'border-ink-200/80 bg-white/55 text-ink-500 hover:border-ink-300 dark:border-white/10 dark:bg-white/[0.03] dark:text-ink-400 dark:hover:border-white/20'
            "
            @click="selectedMood = mood.label"
          >
            <span class="text-xl">{{ mood.emoji }}</span>
            {{ mood.label }}
          </button>
        </div>
      </SurfaceCard>

      <SurfaceCard tone="present">
        <div class="flex items-start justify-between">
          <span
            class="grid size-11 place-items-center rounded-2xl bg-present-100 text-present-700 dark:bg-present-900/45 dark:text-present-200"
          >
            <HeartHandshake class="size-5" />
          </span>
          <span class="text-xs text-ink-400">轻互动有冷却限制</span>
        </div>
        <h2
          class="mt-5 font-display text-xl font-semibold text-ink-950 dark:text-white"
        >
          想给对方一个小小信号？
        </h2>
        <div class="mt-4 flex flex-wrap gap-2">
          <button
            v-for="signal in [
              '抱抱一下',
              '想你了',
              '给你加油',
              '快去休息',
              '我在这里',
            ]"
            :key="signal"
            type="button"
            class="rounded-full bg-white/70 px-3.5 py-2 text-xs font-semibold text-ink-600 transition hover:bg-white hover:text-present-700 dark:bg-white/[0.06] dark:text-ink-300 dark:hover:bg-white/10 dark:hover:text-present-200"
          >
            {{ signal }}
          </button>
        </div>
      </SurfaceCard>
    </section>

    <section class="mt-5 grid gap-4 sm:grid-cols-3">
      <div
        v-for="item in [
          {
            label: '今日一件小事',
            text: '选一件很小的事一起完成',
            icon: BellRing,
          },
          { label: '日常碎片', text: '完成后留下一句话', icon: StickyNote },
          {
            label: '冷静信箱',
            text: '把需要时间的话先收好',
            icon: LockKeyhole,
          },
        ]"
        :key="item.label"
        class="surface-interactive p-4"
      >
        <component :is="item.icon" class="size-4 text-ink-400" />
        <p class="mt-3 text-sm font-semibold text-ink-900 dark:text-white">
          {{ item.label }}
        </p>
        <p class="mt-1 text-xs leading-5 text-ink-500 dark:text-ink-400">
          {{ item.text }}
        </p>
      </div>
    </section>
  </main>
</template>
