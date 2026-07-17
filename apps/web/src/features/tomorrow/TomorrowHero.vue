<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import {
  ArrowRight,
  CalendarClock,
  CalendarHeart,
  LockKeyhole,
  MoonStar,
} from "lucide-vue-next";
import { computed } from "vue";

import {
  capsuleStatusLabel,
  countdownLabel,
  formatInstant,
  formatLocalDate,
} from "@/features/tomorrow/tomorrow-utils";
import { stageFourApi } from "@/shared/api/stage-four";
import AsyncState from "@/shared/components/AsyncState.vue";
import BaseButton from "@/shared/components/BaseButton.vue";
import SurfaceCard from "@/shared/components/SurfaceCard.vue";
import { useIdentityStore } from "@/shared/stores/identity";

const emit = defineEmits<{
  createAnniversary: [];
  createCapsule: [];
}>();

const identity = useIdentityStore();
const upcomingQuery = useQuery({
  queryKey: computed(() => ["upcoming", identity.role, 60]),
  queryFn: () => stageFourApi.upcoming(60),
  enabled: computed(() => Boolean(identity.role)),
});

const timezone = computed(() => identity.couple?.timezone ?? "Asia/Shanghai");
const anniversary = computed(
  () => upcomingQuery.data.value?.anniversaries[0] ?? null,
);
const capsule = computed(() => {
  const items = upcomingQuery.data.value?.capsules ?? [];
  return (
    items.find((item) => item.canOpen || item.canConfirm) ?? items[0] ?? null
  );
});
</script>

<template>
  <section
    aria-label="最近的未来"
    class="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]"
  >
    <SurfaceCard tone="future" class="relative min-h-72 overflow-hidden">
      <div
        class="absolute -right-16 -top-16 size-64 rounded-full border-[48px] border-future-200/45 dark:border-future-800/15"
      />
      <AsyncState
        v-if="upcomingQuery.isPending.value"
        state="loading"
        title="正在计算最近的倒数…"
      />
      <AsyncState
        v-else-if="upcomingQuery.isError.value"
        state="error"
        title="最近的未来没有顺利打开"
        :message="
          upcomingQuery.error.value instanceof Error
            ? upcomingQuery.error.value.message
            : '请稍后再试。'
        "
        action-label="重新加载"
        @action="upcomingQuery.refetch()"
      />
      <div v-else class="relative flex min-h-60 flex-col justify-between">
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
        <div v-if="anniversary" class="mt-10">
          <p class="eyebrow text-future-700 dark:text-future-300">
            {{ countdownLabel(anniversary.daysUntil) }}
          </p>
          <h2
            class="mt-2 max-w-xl font-display text-3xl font-semibold tracking-[-0.04em] text-ink-950 dark:text-white sm:text-4xl"
          >
            {{ anniversary.title }}
          </h2>
          <p class="mt-3 text-sm text-ink-500 dark:text-ink-400">
            {{
              formatLocalDate(
                anniversary.nextOccurrenceLocalDate || anniversary.date,
              )
            }}
          </p>
        </div>
        <div v-else class="mt-10">
          <p class="eyebrow text-future-700 dark:text-future-300">
            还没有重要日子
          </p>
          <h2
            class="mt-2 max-w-xl font-display text-3xl font-semibold tracking-[-0.04em] text-ink-950 dark:text-white sm:text-4xl"
          >
            为下一次值得期待的日子，留一个倒数。
          </h2>
          <BaseButton
            class="mt-5"
            variant="secondary"
            size="sm"
            @click="$emit('createAnniversary')"
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
            ><MoonStar class="size-5"
          /></span>
          <span
            class="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-3 py-1 text-xs font-semibold text-ink-500 dark:bg-white/[0.06] dark:text-ink-400"
            ><CalendarClock class="size-3" />到时开启</span
          >
        </div>
        <template v-if="capsule">
          <p class="eyebrow mt-6">{{ capsuleStatusLabel(capsule.status) }}</p>
          <h2
            class="mt-2 font-display text-2xl font-semibold text-ink-950 dark:text-white"
          >
            {{ capsule.title }}
          </h2>
          <p class="mt-3 text-sm leading-6 text-ink-500 dark:text-ink-400">
            {{
              formatInstant(capsule.dueAt || capsule.unlockAt, timezone)
            }}，到了约定的时刻就可以继续。
          </p>
          <div class="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold">
            <span
              v-if="capsule.canConfirm"
              class="rounded-full bg-present-50 px-2.5 py-1 text-present-700 dark:bg-present-950/40 dark:text-present-200"
              >待你确认</span
            >
            <span
              v-if="capsule.canOpen"
              class="rounded-full bg-memory-50 px-2.5 py-1 text-memory-700 dark:bg-memory-950/40 dark:text-memory-200"
              >可以打开</span
            >
            <span
              v-if="!capsule.bodyAvailable"
              class="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2.5 py-1 text-ink-500 dark:bg-white/[0.07] dark:text-ink-300"
              ><LockKeyhole class="size-3" />内容仍封存</span
            >
          </div>
        </template>
        <template v-else>
          <p class="eyebrow mt-6">时间胶囊</p>
          <h2
            class="mt-2 font-display text-2xl font-semibold text-ink-950 dark:text-white"
          >
            把现在的话，交给未来。
          </h2>
          <p class="mt-3 text-sm leading-6 text-ink-500 dark:text-ink-400">
            封存以后不能再修改，到了约定的那一天再一起打开。
          </p>
        </template>
      </div>
      <button
        type="button"
        class="mt-6 inline-flex items-center gap-2 text-left text-sm font-semibold text-future-700 dark:text-future-300"
        @click="$emit('createCapsule')"
      >
        写一枚新胶囊<ArrowRight class="size-4" />
      </button>
    </SurfaceCard>
  </section>
</template>
