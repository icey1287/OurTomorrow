<script setup lang="ts">
import {
  CalendarHeart,
  ChevronRight,
  Heart,
  Image,
  MapPinned,
  Sparkles,
  Sunrise,
} from "lucide-vue-next";
import { computed } from "vue";

import BaseButton from "@/shared/components/BaseButton.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import SectionHeading from "@/shared/components/SectionHeading.vue";
import SurfaceCard from "@/shared/components/SurfaceCard.vue";
import { useSessionStore } from "@/shared/stores/session";
import { relationshipDay } from "@/shared/utils/relationship-time";

const session = useSessionStore();
const members = computed(() => session.couple?.members ?? []);
const memberNames = computed(() =>
  [0, 1].map(
    (index) =>
      members.value[index]?.nicknameInRelationship ??
      members.value[index]?.displayName ??
      (index === 0 ? "你" : "另一半"),
  ),
);
const daysTogether = computed(() => {
  const startDate = session.couple?.startDate;
  if (!startDate) return "—";
  return String(
    relationshipDay(startDate, session.couple?.timezone ?? "Asia/Shanghai") ??
      1,
  );
});
</script>

<template>
  <main class="page-shell">
    <PageHeader
      eyebrow="Us · 两个人共同创作"
      title="我们，是所有时间线的主角。"
      description="这里用来回望共同走过的长度，而不是比较谁记录得更多、谁付出得更多。"
    >
      <template #actions>
        <BaseButton variant="secondary" size="sm">编辑我们的资料</BaseButton>
      </template>
    </PageHeader>

    <SurfaceCard class="relative overflow-hidden" :padded="false">
      <div
        class="absolute inset-0 bg-gradient-to-br from-memory-100/85 via-white/65 to-future-100/85 dark:from-memory-950/45 dark:via-ink-950/55 dark:to-future-950/40"
      />
      <div
        class="absolute -left-16 -top-20 size-72 rounded-full border-[54px] border-white/35 dark:border-white/[0.035]"
      />
      <div
        class="relative grid min-h-80 items-center gap-8 p-6 sm:p-9 lg:grid-cols-[1fr_auto]"
      >
        <div>
          <div class="flex -space-x-4">
            <span
              class="grid size-16 place-items-center rounded-[1.35rem] border-[3px] border-white bg-memory-400 font-display text-2xl font-semibold text-white shadow-md dark:border-ink-900"
            >
              {{ memberNames[0]?.slice(0, 1) }}
            </span>
            <span
              class="grid size-16 place-items-center rounded-[1.35rem] border-[3px] border-white bg-present-500 font-display text-2xl font-semibold text-white shadow-md dark:border-ink-900"
            >
              {{ memberNames[1]?.slice(0, 1) }}
            </span>
          </div>
          <p class="eyebrow mt-7">{{ session.couple?.name ?? "我们的明天" }}</p>
          <h1
            class="mt-2 font-display text-4xl font-semibold tracking-[-0.05em] text-ink-950 dark:text-white sm:text-5xl"
          >
            {{ memberNames[0] }} 与 {{ memberNames[1] }}
          </h1>
          <p
            class="mt-4 max-w-2xl text-sm leading-7 text-ink-600 dark:text-ink-300 sm:text-base"
          >
            {{
              session.couple?.signature ??
              "共同封面与关系签名，会把这一页变成只属于你们的首页。"
            }}
          </p>
        </div>

        <div
          class="rounded-3xl border border-white/75 bg-white/55 p-6 text-center backdrop-blur dark:border-white/10 dark:bg-white/[0.05] sm:min-w-56"
        >
          <Heart class="mx-auto size-5 text-memory-500" fill="currentColor" />
          <p
            class="mt-3 font-display text-5xl font-semibold tracking-[-0.06em] text-ink-950 dark:text-white"
          >
            {{ daysTogether }}
          </p>
          <p
            class="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-ink-400 dark:text-ink-500"
          >
            一起走过的天数
          </p>
        </div>
      </div>
    </SurfaceCard>

    <section class="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
      <SurfaceCard
        v-for="item in [
          {
            label: '共同回忆',
            value: '0',
            unit: '段',
            icon: Image,
            tone: 'text-memory-600 dark:text-memory-300',
          },
          {
            label: '完成愿望',
            value: '0',
            unit: '件',
            icon: Sunrise,
            tone: 'text-future-600 dark:text-future-300',
          },
          {
            label: '去过地方',
            value: '0',
            unit: '处',
            icon: MapPinned,
            tone: 'text-present-600 dark:text-present-300',
          },
          {
            label: '重要日子',
            value: '0',
            unit: '个',
            icon: CalendarHeart,
            tone: 'text-memory-600 dark:text-memory-300',
          },
        ]"
        :key="item.label"
      >
        <component :is="item.icon" class="size-4" :class="item.tone" />
        <p class="mt-5 text-xs font-semibold text-ink-400 dark:text-ink-500">
          {{ item.label }}
        </p>
        <p
          class="mt-1 font-display text-3xl font-semibold text-ink-950 dark:text-white"
        >
          {{ item.value }}
          <span class="text-sm font-sans font-medium text-ink-400">{{
            item.unit
          }}</span>
        </p>
      </SurfaceCard>
    </section>

    <section class="mt-8 grid gap-5 xl:grid-cols-[1fr_0.72fr]">
      <SurfaceCard>
        <SectionHeading
          title="重要日期"
          description="只展示共同记忆的坐标，不制造提醒压力。"
        >
          <BaseButton variant="ghost" size="sm">管理日期</BaseButton>
        </SectionHeading>
        <div
          class="mt-5 rounded-2xl border border-dashed border-ink-200 bg-ink-50/55 p-7 text-center dark:border-white/10 dark:bg-white/[0.025]"
        >
          <CalendarHeart
            class="mx-auto size-5 text-ink-300 dark:text-ink-600"
          />
          <p class="mt-3 text-sm font-semibold text-ink-700 dark:text-ink-200">
            还没有添加重要日期
          </p>
          <p class="mt-1 text-xs leading-5 text-ink-400 dark:text-ink-500">
            初见、纪念日、生日，或任何只属于你们的日子。
          </p>
        </div>
      </SurfaceCard>

      <SurfaceCard tone="memory" interactive class="group">
        <div class="flex items-start justify-between">
          <span
            class="grid size-11 place-items-center rounded-2xl bg-memory-100 text-memory-700 dark:bg-memory-900/45 dark:text-memory-200"
          >
            <Sparkles class="size-5" />
          </span>
          <ChevronRight
            class="size-5 text-ink-300 transition group-hover:translate-x-1 dark:text-ink-600"
          />
        </div>
        <p class="eyebrow mt-6 text-memory-700 dark:text-memory-300">
          年度回忆书
        </p>
        <h2
          class="mt-2 font-display text-2xl font-semibold text-ink-950 dark:text-white"
        >
          这一年，我们一起留下了什么？
        </h2>
        <p class="mt-3 text-sm leading-6 text-ink-500 dark:text-ink-400">
          年度照片、完成的愿望、去过的地方，以及写给下一年的一封信。
        </p>
      </SurfaceCard>
    </section>
  </main>
</template>
