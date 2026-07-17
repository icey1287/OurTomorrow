<script setup lang="ts">
import type { PlaceMapItem } from "@our-tomorrow/contracts";
import { CalendarDays, Heart, Images, ListChecks } from "lucide-vue-next";
import { useId } from "vue";

import PrivateMediaImage from "@/features/remember/PrivateMediaImage.vue";

const props = defineProps<{
  place: PlaceMapItem;
  timezone: string;
}>();

const memoriesHeadingId = useId();
const wishesHeadingId = useId();
const plansHeadingId = useId();

function formatInstant(value: string | null) {
  if (!value) return "时间待定";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: props.timezone,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function wishStatusLabel(status: PlaceMapItem["wishes"][number]["status"]) {
  return (
    {
      IDEA: "愿望",
      PLANNED: "已计划",
      IN_PROGRESS: "进行中",
      COMPLETED: "已完成",
      CONVERTED_TO_MEMORY: "已成为回忆",
    } as const
  )[status];
}

function planStatusLabel(status: PlaceMapItem["plans"][number]["status"]) {
  return (
    {
      DRAFT: "草稿",
      SCHEDULED: "已排期",
      IN_PROGRESS: "进行中",
      COMPLETED: "已完成",
      CANCELLED: "已取消",
    } as const
  )[status];
}
</script>

<template>
  <div class="grid gap-5 xl:grid-cols-3">
    <section :aria-labelledby="memoriesHeadingId">
      <h4
        :id="memoriesHeadingId"
        class="flex items-center gap-2 text-sm font-semibold text-ink-900 dark:text-white"
      >
        <Images class="size-4 text-memory-500" aria-hidden="true" />关联回忆
      </h4>
      <ul v-if="place.memories.length" class="mt-3 space-y-2">
        <li
          v-for="memory in place.memories.slice(0, 4)"
          :key="memory.id"
          class="flex min-h-16 items-center gap-3 rounded-2xl bg-white/60 p-2.5 dark:bg-white/[0.045]"
        >
          <PrivateMediaImage
            v-if="memory.coverMedia"
            :src="memory.coverMedia.thumbnailUrl"
            :alt="`${memory.title}的封面`"
            class="size-11 shrink-0 overflow-hidden rounded-xl"
          />
          <span
            v-else
            class="grid size-11 shrink-0 place-items-center rounded-xl bg-memory-100 text-memory-600 dark:bg-memory-900/35 dark:text-memory-200"
          >
            <Heart class="size-4" aria-hidden="true" />
          </span>
          <span class="min-w-0">
            <span
              class="block truncate text-sm font-semibold text-ink-800 dark:text-ink-100"
            >
              {{ memory.title }}
            </span>
            <span class="mt-0.5 block text-xs text-ink-500 dark:text-ink-400">
              {{ formatInstant(memory.happenedAt) }}
            </span>
          </span>
        </li>
      </ul>
      <p v-else class="mt-3 text-sm leading-6 text-ink-500 dark:text-ink-400">
        这里还没有关联回忆。
      </p>
    </section>

    <section :aria-labelledby="wishesHeadingId">
      <h4
        :id="wishesHeadingId"
        class="flex items-center gap-2 text-sm font-semibold text-ink-900 dark:text-white"
      >
        <Heart class="size-4 text-future-500" aria-hidden="true" />关联愿望
      </h4>
      <ul v-if="place.wishes.length" class="mt-3 space-y-2">
        <li
          v-for="wish in place.wishes.slice(0, 4)"
          :key="wish.id"
          class="rounded-2xl bg-white/60 px-3.5 py-3 dark:bg-white/[0.045]"
        >
          <p
            class="truncate text-sm font-semibold text-ink-800 dark:text-ink-100"
          >
            {{ wish.title }}
          </p>
          <p
            class="mt-1 flex items-center gap-1.5 text-xs text-ink-500 dark:text-ink-400"
          >
            <CalendarDays class="size-3.5" aria-hidden="true" />
            {{ wishStatusLabel(wish.status) }} ·
            {{ formatInstant(wish.plannedFor) }}
          </p>
        </li>
      </ul>
      <p v-else class="mt-3 text-sm leading-6 text-ink-500 dark:text-ink-400">
        这里还没有关联愿望。
      </p>
    </section>

    <section :aria-labelledby="plansHeadingId">
      <h4
        :id="plansHeadingId"
        class="flex items-center gap-2 text-sm font-semibold text-ink-900 dark:text-white"
      >
        <ListChecks
          class="size-4 text-present-500"
          aria-hidden="true"
        />关联计划
      </h4>
      <ul v-if="place.plans.length" class="mt-3 space-y-2">
        <li
          v-for="plan in place.plans.slice(0, 4)"
          :key="plan.id"
          class="rounded-2xl bg-white/60 px-3.5 py-3 dark:bg-white/[0.045]"
        >
          <p
            class="truncate text-sm font-semibold text-ink-800 dark:text-ink-100"
          >
            {{ plan.title }}
          </p>
          <p
            class="mt-1 flex items-center gap-1.5 text-xs text-ink-500 dark:text-ink-400"
          >
            <CalendarDays class="size-3.5" aria-hidden="true" />
            {{ planStatusLabel(plan.status) }} ·
            {{ formatInstant(plan.startsAt) }}
          </p>
        </li>
      </ul>
      <p v-else class="mt-3 text-sm leading-6 text-ink-500 dark:text-ink-400">
        这里还没有关联计划。
      </p>
    </section>
  </div>
</template>
