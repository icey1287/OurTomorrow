<script setup lang="ts">
import {
  ArrowUpRight,
  CalendarHeart,
  Clock3,
  Heart,
  MessageCircleHeart,
  MoonStar,
  Sparkles,
  StickyNote,
  Sunrise,
} from "lucide-vue-next";
import { computed } from "vue";
import { RouterLink } from "vue-router";

import BaseButton from "@/shared/components/BaseButton.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import SectionHeading from "@/shared/components/SectionHeading.vue";
import SurfaceCard from "@/shared/components/SurfaceCard.vue";
import { useSessionStore } from "@/shared/stores/session";
import {
  relationshipDay,
  relationshipGreeting,
  relationshipTodayLabel,
} from "@/shared/utils/relationship-time";

const session = useSessionStore();

const now = new Date();
const timezone = computed(() => session.couple?.timezone ?? "Asia/Shanghai");
const greeting = computed(() => relationshipGreeting(now, timezone.value));
const todayLabel = computed(() => relationshipTodayLabel(now, timezone.value));

const members = computed(() => session.couple?.members ?? []);
const firstName = computed(
  () =>
    members.value[0]?.nicknameInRelationship ??
    members.value[0]?.displayName ??
    "你",
);
const secondName = computed(
  () =>
    members.value[1]?.nicknameInRelationship ??
    members.value[1]?.displayName ??
    "她 / 他",
);
const firstInitial = computed(() => firstName.value.slice(0, 1));
const secondInitial = computed(() => secondName.value.slice(0, 1));
const daysTogether = computed(() => {
  const startDate = session.couple?.startDate;
  if (!startDate) return null;

  return relationshipDay(startDate, timezone.value, now);
});
</script>

<template>
  <main class="page-shell">
    <PageHeader
      eyebrow="Today · 时间交汇处"
      :title="`${greeting}，今天也一起认真生活。`"
      :description="`${todayLabel}。不必追赶任何进度，只看看彼此正在经历什么。`"
    >
      <template #actions>
        <BaseButton variant="secondary" size="sm">
          <Sparkles class="size-4" />
          今日回顾
        </BaseButton>
      </template>
    </PageHeader>

    <section class="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
      <SurfaceCard class="relative min-h-72 overflow-hidden" :padded="false">
        <div
          class="absolute inset-0 bg-gradient-to-br from-memory-100/90 via-white/55 to-present-100/75 dark:from-memory-950/50 dark:via-ink-950/55 dark:to-present-950/45"
        />
        <div
          class="absolute -right-12 -top-20 size-72 rounded-full border-[52px] border-white/40 dark:border-white/[0.035]"
          aria-hidden="true"
        />
        <div class="relative flex min-h-72 flex-col justify-between p-6 sm:p-8">
          <div class="flex items-center justify-between gap-4">
            <div class="flex -space-x-3">
              <span
                class="grid size-12 place-items-center rounded-2xl border-2 border-white bg-memory-400 font-display text-lg font-semibold text-white shadow-sm dark:border-ink-900"
              >
                {{ firstInitial }}
              </span>
              <span
                class="grid size-12 place-items-center rounded-2xl border-2 border-white bg-present-500 font-display text-lg font-semibold text-white shadow-sm dark:border-ink-900"
              >
                {{ secondInitial }}
              </span>
            </div>
            <span
              class="rounded-full border border-white/70 bg-white/55 px-3 py-1.5 text-xs font-semibold text-ink-600 backdrop-blur dark:border-white/10 dark:bg-white/[0.06] dark:text-ink-300"
            >
              {{ session.couple?.timezone ?? "共同时间" }}
            </span>
          </div>

          <div class="mt-10">
            <p class="text-sm font-medium text-ink-500 dark:text-ink-300">
              {{ firstName }} 与 {{ secondName }}
            </p>
            <p
              class="mt-2 font-display text-4xl font-semibold leading-none tracking-[-0.05em] text-ink-950 dark:text-white sm:text-5xl"
            >
              <template v-if="daysTogether"
                >在一起第 {{ daysTogether }} 天</template
              >
              <template v-else>每一天，都在一起</template>
            </p>
            <p
              class="mt-4 max-w-xl text-sm leading-6 text-ink-600 dark:text-ink-300 sm:text-base"
            >
              {{
                session.couple?.signature ??
                "记录每个昨天，共度每个今天，奔赴所有明天。"
              }}
            </p>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard
        tone="present"
        class="flex min-h-72 flex-col justify-between"
      >
        <div>
          <div class="flex items-center justify-between">
            <span
              class="grid size-11 place-items-center rounded-2xl bg-present-100 text-present-700 dark:bg-present-900/45 dark:text-present-200"
            >
              <Heart class="size-5" />
            </span>
            <span
              class="rounded-full bg-white/70 px-3 py-1 text-xs text-ink-400 dark:bg-white/[0.06] dark:text-ink-500"
              >等待更新</span
            >
          </div>
          <p class="eyebrow mt-6">她 / 他的此刻</p>
          <h2
            class="mt-2 font-display text-2xl font-semibold text-ink-950 dark:text-white"
          >
            今天还没有设置状态
          </h2>
          <p class="mt-3 text-sm leading-6 text-ink-500 dark:text-ink-400">
            状态会自动失效，所以你看到的始终是此刻，而不是几天前。
          </p>
        </div>
        <RouterLink
          to="/daily"
          class="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-present-700 dark:text-present-300"
        >
          去日常看看
          <ArrowUpRight class="size-4" />
        </RouterLink>
      </SurfaceCard>
    </section>

    <section class="mt-5 grid gap-5 md:grid-cols-3">
      <RouterLink to="/remember" class="group block">
        <SurfaceCard tone="memory" interactive class="h-full">
          <div class="flex items-start justify-between">
            <span
              class="grid size-10 place-items-center rounded-2xl bg-memory-100 text-memory-700 dark:bg-memory-900/45 dark:text-memory-200"
            >
              <Clock3 class="size-4" />
            </span>
            <ArrowUpRight
              class="size-4 text-ink-300 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 dark:text-ink-600"
            />
          </div>
          <p class="eyebrow mt-5 text-memory-700 dark:text-memory-300">记录</p>
          <h2
            class="mt-2 font-display text-xl font-semibold text-ink-950 dark:text-white"
          >
            去年今日，等待重逢
          </h2>
          <p class="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400">
            旧故事会避开短期重复，安静地重新出现。
          </p>
        </SurfaceCard>
      </RouterLink>

      <RouterLink to="/daily" class="group block">
        <SurfaceCard tone="present" interactive class="h-full">
          <div class="flex items-start justify-between">
            <span
              class="grid size-10 place-items-center rounded-2xl bg-present-100 text-present-700 dark:bg-present-900/45 dark:text-present-200"
            >
              <StickyNote class="size-4" />
            </span>
            <ArrowUpRight
              class="size-4 text-ink-300 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 dark:text-ink-600"
            />
          </div>
          <p class="eyebrow mt-5 text-present-700 dark:text-present-300">
            日常
          </p>
          <h2
            class="mt-2 font-display text-xl font-semibold text-ink-950 dark:text-white"
          >
            给对方留一句此刻的话
          </h2>
          <p class="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400">
            一张便利贴，不需要成为一篇长日记。
          </p>
        </SurfaceCard>
      </RouterLink>

      <RouterLink to="/tomorrow" class="group block">
        <SurfaceCard tone="future" interactive class="h-full">
          <div class="flex items-start justify-between">
            <span
              class="grid size-10 place-items-center rounded-2xl bg-future-100 text-future-700 dark:bg-future-900/45 dark:text-future-200"
            >
              <Sunrise class="size-4" />
            </span>
            <ArrowUpRight
              class="size-4 text-ink-300 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 dark:text-ink-600"
            />
          </div>
          <p class="eyebrow mt-5 text-future-700 dark:text-future-300">明天</p>
          <h2
            class="mt-2 font-display text-xl font-semibold text-ink-950 dark:text-white"
          >
            把一个期待先放在这里
          </h2>
          <p class="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400">
            完成时，它会沿着时间线成为一段新回忆。
          </p>
        </SurfaceCard>
      </RouterLink>
    </section>

    <section class="mt-8">
      <SectionHeading
        title="今天值得留意"
        description="首页保持安静，只呈现最重要的几件事。"
      />
      <div class="mt-4 grid gap-4 lg:grid-cols-2">
        <SurfaceCard interactive>
          <div class="flex items-start gap-4">
            <span
              class="grid size-11 shrink-0 place-items-center rounded-2xl bg-memory-100 text-memory-700 dark:bg-memory-900/45 dark:text-memory-200"
            >
              <MessageCircleHeart class="size-5" />
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-3">
                <h3 class="font-semibold text-ink-950 dark:text-white">
                  今日交换日记
                </h3>
                <span class="text-xs text-ink-400">等待回答</span>
              </div>
              <p class="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400">
                今天什么时候，忽然想起了对方？
              </p>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard interactive>
          <div class="flex items-start gap-4">
            <span
              class="grid size-11 shrink-0 place-items-center rounded-2xl bg-future-100 text-future-700 dark:bg-future-900/45 dark:text-future-200"
            >
              <CalendarHeart class="size-5" />
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-3">
                <h3 class="font-semibold text-ink-950 dark:text-white">
                  最近的重要日子
                </h3>
                <span class="text-xs text-ink-400">尚未添加</span>
              </div>
              <p class="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400">
                添加纪念日后，倒数会在最合适的时候来到首页。
              </p>
            </div>
          </div>
        </SurfaceCard>
      </div>
    </section>

    <section class="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div
        v-for="item in [
          { label: '最新纸条', value: '静候一句话', icon: StickyNote },
          { label: '随机回忆', value: '等待第一段故事', icon: Sparkles },
          { label: '未完成愿望', value: '把期待写下来', icon: Sunrise },
          { label: '即将解锁', value: '还没到那一天', icon: MoonStar },
        ]"
        :key="item.label"
        class="rounded-2xl border border-white/70 bg-white/50 p-4 backdrop-blur dark:border-white/10 dark:bg-white/[0.03]"
      >
        <component
          :is="item.icon"
          class="size-4 text-ink-400 dark:text-ink-500"
        />
        <p class="mt-3 text-xs font-semibold text-ink-400 dark:text-ink-500">
          {{ item.label }}
        </p>
        <p class="mt-1 text-sm font-medium text-ink-800 dark:text-ink-200">
          {{ item.value }}
        </p>
      </div>
    </section>
  </main>
</template>
