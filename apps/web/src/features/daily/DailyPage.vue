<script setup lang="ts">
import { BellRing, Plus, Sparkles } from "lucide-vue-next";
import { ref } from "vue";

import CalmLetterPanel from "@/features/daily/CalmLetterPanel.vue";
import DailyMoodPanel from "@/features/daily/DailyMoodPanel.vue";
import DailyNoteWall from "@/features/daily/DailyNoteWall.vue";
import DailyStatusPanel from "@/features/daily/DailyStatusPanel.vue";
import ExchangeDiaryPanel from "@/features/daily/ExchangeDiaryPanel.vue";
import TouchSignalPanel from "@/features/daily/TouchSignalPanel.vue";
import BaseButton from "@/shared/components/BaseButton.vue";
import PageHeader from "@/shared/components/PageHeader.vue";

const noteWall = ref<InstanceType<typeof DailyNoteWall> | null>(null);

function goToNotes() {
  noteWall.value?.openNewNote();
  document.querySelector("#daily-notes")?.scrollIntoView({ block: "start" });
}

const laterFeatures = [
  {
    label: "今日一件小事",
    text: "选一件很小的事一起完成",
    icon: BellRing,
  },
];
</script>

<template>
  <main class="page-shell">
    <PageHeader
      eyebrow="Daily · 正在发生的现在"
      title="不必写很多，也能让彼此被看见。"
      description="一句状态、一张纸条或一个心情，都能在几十秒内完成；交换日记会守住双方提交前的私密边界。"
    >
      <template #actions>
        <BaseButton size="sm" @click="goToNotes">
          <Plus class="size-4" />留便利贴
        </BaseButton>
      </template>
    </PageHeader>

    <div class="space-y-5 sm:space-y-6">
      <DailyStatusPanel />
      <ExchangeDiaryPanel />
      <div id="daily-notes" class="scroll-mt-5">
        <DailyNoteWall ref="noteWall" />
      </div>
      <DailyMoodPanel />
      <TouchSignalPanel />
      <CalmLetterPanel />

      <section aria-labelledby="later-heading">
        <div class="mb-4 flex items-center gap-2">
          <Sparkles class="size-4 text-ink-400" />
          <h2
            id="later-heading"
            class="text-sm font-semibold text-ink-700 dark:text-ink-200"
          >
            更多轻互动
          </h2>
        </div>
        <div class="grid gap-4 sm:max-w-sm">
          <button
            v-for="item in laterFeatures"
            :key="item.label"
            type="button"
            disabled
            aria-disabled="true"
            class="surface cursor-not-allowed p-4 text-left opacity-70"
          >
            <div class="flex items-start justify-between gap-3">
              <component :is="item.icon" class="size-4 text-ink-400" />
              <span
                class="rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-semibold text-ink-500 dark:bg-white/[0.06] dark:text-ink-400"
              >
                稍后开放
              </span>
            </div>
            <p class="mt-3 text-sm font-semibold text-ink-900 dark:text-white">
              {{ item.label }}
            </p>
            <p class="mt-1 text-xs leading-5 text-ink-500 dark:text-ink-400">
              {{ item.text }}
            </p>
          </button>
        </div>
      </section>
    </div>
  </main>
</template>
