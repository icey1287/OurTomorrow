<script setup lang="ts">
import type { UserSummary } from "@our-tomorrow/contracts";
import { useQuery } from "@tanstack/vue-query";
import {
  ArrowUpRight,
  Clock3,
  Heart,
  MessageCircleHeart,
  ShieldCheck,
  StickyNote,
  Sunrise,
} from "lucide-vue-next";
import { computed, watch } from "vue";
import { RouterLink } from "vue-router";

import { ApiClientError } from "@/shared/api/client";
import { stageOneApi } from "@/shared/api/stage-one";
import AsyncState from "@/shared/components/AsyncState.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import SectionHeading from "@/shared/components/SectionHeading.vue";
import SurfaceCard from "@/shared/components/SurfaceCard.vue";
import { useIdentityStore } from "@/shared/stores/identity";

const identity = useIdentityStore();
const todayQuery = useQuery({
  queryKey: ["today", identity.role],
  queryFn: stageOneApi.today,
});

const today = computed(() => todayQuery.data.value ?? null);
const relationship = computed(() => today.value?.relationship ?? null);
const members = computed(() =>
  [...(relationship.value?.members ?? [])].sort(
    (left, right) => (left.slot ?? 99) - (right.slot ?? 99),
  ),
);

function memberName(member: UserSummary | undefined, fallback: string) {
  return member?.nicknameInRelationship ?? member?.displayName ?? fallback;
}

const firstName = computed(() => memberName(members.value[0], "你"));
const secondName = computed(() => memberName(members.value[1], "另一半"));
const firstInitial = computed(() => firstName.value.trim().slice(0, 1) || "甲");
const secondInitial = computed(
  () => secondName.value.trim().slice(0, 1) || "乙",
);

const localDateLabel = computed(() => {
  const value = today.value?.localDate;
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;

  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "UTC",
  }).format(date);
});

const serverTimeLabel = computed(() => {
  const value = today.value?.serverNow;
  const timezone = relationship.value?.timezone;
  if (!value || !timezone) return "";

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
});

const randomMemoryDateLabel = computed(() => {
  const happenedAt = today.value?.randomMemory?.happenedAt;
  const timezone = relationship.value?.timezone;
  if (!happenedAt || !timezone) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: timezone,
  }).format(new Date(happenedAt));
});

const errorMessage = computed(() => {
  const error = todayQuery.error.value;
  if (error instanceof ApiClientError) {
    if (error.code === "IDENTITY_REQUIRED") {
      return "请返回登录页重新选择身份。";
    }
    return error.message;
  }
  return "今日内容暂时没有打开，请稍后再试。";
});

watch(
  () => today.value?.relationship,
  (nextRelationship) => {
    if (nextRelationship) identity.replaceCouple(nextRelationship);
  },
  { immediate: true },
);
</script>

<template>
  <main class="page-shell">
    <AsyncState
      v-if="todayQuery.isPending.value"
      state="loading"
      title="正在打开你们的今日…"
      message="关系日期和问候会按共同空间时区从服务器确认。"
    />

    <AsyncState
      v-else-if="todayQuery.isError.value"
      state="error"
      title="今日暂时没有顺利打开"
      :message="errorMessage"
      action-label="重新加载"
      @action="todayQuery.refetch()"
    />

    <template v-else-if="today && relationship">
      <PageHeader
        eyebrow="Today · 时间交汇处"
        :title="today.greeting"
        :description="`${localDateLabel}。关系日期与乙数由服务器按 ${relationship.timezone} 计算。`"
      />

      <section class="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <SurfaceCard class="relative min-h-72 overflow-hidden" :padded="false">
          <div
            class="absolute inset-0 bg-gradient-to-br from-memory-100/90 via-white/55 to-present-100/75 dark:from-memory-950/50 dark:via-ink-950/55 dark:to-present-950/45"
          />
          <div
            class="absolute -right-12 -top-20 size-72 rounded-full border-[52px] border-white/40 dark:border-white/[0.035]"
            aria-hidden="true"
          />
          <div
            class="relative flex min-h-72 flex-col justify-between p-6 sm:p-8"
          >
            <div class="flex flex-wrap items-center justify-between gap-4">
              <div
                class="flex -space-x-3"
                :aria-label="`${firstName}与${secondName}`"
              >
                <span
                  class="grid size-12 place-items-center rounded-2xl border-2 border-white bg-memory-400 font-display text-lg font-semibold text-white shadow-sm dark:border-ink-900"
                  >{{ firstInitial }}</span
                >
                <span
                  class="grid size-12 place-items-center rounded-2xl border-2 border-white bg-present-500 font-display text-lg font-semibold text-white shadow-sm dark:border-ink-900"
                  >{{ secondInitial }}</span
                >
              </div>
              <span
                class="rounded-full border border-white/70 bg-white/55 px-3 py-1.5 text-xs font-semibold text-ink-600 backdrop-blur dark:border-white/10 dark:bg-white/[0.06] dark:text-ink-300"
              >
                {{ relationship.timezone }} · {{ serverTimeLabel }}
              </span>
            </div>

            <div class="mt-10">
              <p class="text-sm font-medium text-ink-500 dark:text-ink-300">
                {{ firstName }} 与 {{ secondName }}
              </p>
              <p
                class="mt-2 font-display text-4xl font-semibold leading-none tracking-[-0.05em] text-ink-950 dark:text-white sm:text-5xl"
              >
                在一起第 {{ relationship.daysTogether }} 天
              </p>
              <p
                class="mt-4 max-w-xl text-sm leading-6 text-ink-600 dark:text-ink-300 sm:text-base"
              >
                {{
                  relationship.signature ||
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
                ><Heart class="size-5"
              /></span>
              <span
                class="rounded-full bg-white/70 px-3 py-1 text-xs text-ink-400 dark:bg-white/[0.06] dark:text-ink-500"
                >暂无状态</span
              >
            </div>
            <p class="eyebrow mt-6">另一半的此刻</p>
            <h2
              class="mt-2 font-display text-2xl font-semibold text-ink-950 dark:text-white"
            >
              今天还没有设置状态
            </h2>
            <p class="mt-3 text-sm leading-6 text-ink-500 dark:text-ink-400">
              此刻状态尚无内容。后续内容只会显示服务器判定仍然有效的状态。
            </p>
          </div>
          <RouterLink
            to="/daily"
            class="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-present-700 dark:text-present-300"
          >
            去日常看看 <ArrowUpRight class="size-4" />
          </RouterLink>
        </SurfaceCard>
      </section>

      <section class="mt-5 grid gap-5 md:grid-cols-3">
        <RouterLink to="/remember" class="group block">
          <SurfaceCard tone="memory" interactive class="h-full">
            <div class="flex items-start justify-between">
              <span
                class="grid size-10 place-items-center rounded-2xl bg-memory-100 text-memory-700 dark:bg-memory-900/45 dark:text-memory-200"
                ><Clock3 class="size-4"
              /></span>
              <ArrowUpRight
                class="size-4 text-ink-300 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 dark:text-ink-600"
              />
            </div>
            <p class="eyebrow mt-5 text-memory-700 dark:text-memory-300">
              记录
            </p>
            <h2
              class="mt-2 font-display text-xl font-semibold text-ink-950 dark:text-white"
            >
              从共同故事里重新遇见过去
            </h2>
            <p class="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400">
              这里会承接回忆时间线与服务器选出的随机回忆。
            </p>
          </SurfaceCard>
        </RouterLink>

        <RouterLink to="/daily" class="group block">
          <SurfaceCard tone="present" interactive class="h-full">
            <div class="flex items-start justify-between">
              <span
                class="grid size-10 place-items-center rounded-2xl bg-present-100 text-present-700 dark:bg-present-900/45 dark:text-present-200"
                ><StickyNote class="size-4"
              /></span>
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
              用很轻的方式留下此刻
            </h2>
            <p class="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400">
              便利贴、心情和交换日记会在这里汇入今日。
            </p>
          </SurfaceCard>
        </RouterLink>

        <RouterLink to="/tomorrow" class="group block">
          <SurfaceCard tone="future" interactive class="h-full">
            <div class="flex items-start justify-between">
              <span
                class="grid size-10 place-items-center rounded-2xl bg-future-100 text-future-700 dark:bg-future-900/45 dark:text-future-200"
                ><Sunrise class="size-4"
              /></span>
              <ArrowUpRight
                class="size-4 text-ink-300 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 dark:text-ink-600"
              />
            </div>
            <p class="eyebrow mt-5 text-future-700 dark:text-future-300">
              明天
            </p>
            <h2
              class="mt-2 font-display text-xl font-semibold text-ink-950 dark:text-white"
            >
              把共同期待写进未来
            </h2>
            <p class="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400">
              愿望、计划与胶囊会在到达正确状态后出现在今日。
            </p>
          </SurfaceCard>
        </RouterLink>
      </section>

      <section class="mt-8">
        <SectionHeading
          title="今天值得留意"
          description="首页只呈现服务器确认可见的内容；尚无内容时保持安静。"
        />
        <div class="mt-4 grid gap-4 lg:grid-cols-2">
          <RouterLink
            v-if="today.randomMemory"
            :to="{
              path: '/remember',
              query: { memory: today.randomMemory.id },
            }"
            class="group block"
          >
            <SurfaceCard tone="memory" interactive class="h-full">
              <div class="flex items-start gap-4">
                <span
                  class="grid size-11 shrink-0 place-items-center rounded-2xl bg-memory-100 text-memory-700 dark:bg-memory-900/45 dark:text-memory-200"
                  ><Clock3 class="size-5"
                /></span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center justify-between gap-3">
                    <p class="eyebrow text-memory-700 dark:text-memory-300">
                      随机旧回忆 · {{ randomMemoryDateLabel }}
                    </p>
                    <ArrowUpRight
                      class="size-4 shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 dark:text-ink-600"
                    />
                  </div>
                  <h3
                    class="mt-2 font-display text-xl font-semibold text-ink-950 dark:text-white"
                  >
                    {{ today.randomMemory.title }}
                  </h3>
                  <p
                    class="mt-2 line-clamp-2 text-sm leading-6 text-ink-500 dark:text-ink-400"
                  >
                    {{
                      today.randomMemory.excerpt ||
                      "这段共同故事，今天又轻轻回到了你们面前。"
                    }}
                  </p>
                </div>
              </div>
            </SurfaceCard>
          </RouterLink>

          <SurfaceCard v-else>
            <div class="flex items-start gap-4">
              <span
                class="grid size-11 shrink-0 place-items-center rounded-2xl bg-present-100 text-present-700 dark:bg-present-900/45 dark:text-present-200"
                ><MessageCircleHeart class="size-5"
              /></span>
              <div class="min-w-0 flex-1">
                <h3 class="font-semibold text-ink-950 dark:text-white">
                  今日交换日记
                </h3>
                <p
                  class="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400"
                >
                  今天还没有可展示的交换日记状态。
                </p>
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <div class="flex items-start gap-4">
              <span
                class="grid size-11 shrink-0 place-items-center rounded-2xl bg-memory-100 text-memory-700 dark:bg-memory-900/45 dark:text-memory-200"
                ><ShieldCheck class="size-5"
              /></span>
              <div class="min-w-0 flex-1">
                <h3 class="font-semibold text-ink-950 dark:text-white">
                  来自服务器的共同时间
                </h3>
                <p
                  class="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400"
                >
                  本页生成于
                  {{
                    serverTimeLabel
                  }}，浏览器时间不会改变关系天数或受限内容状态。
                </p>
              </div>
            </div>
          </SurfaceCard>
        </div>
      </section>
    </template>
  </main>
</template>
