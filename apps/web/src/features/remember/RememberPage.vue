<script setup lang="ts">
import {
  CalendarDays,
  Camera,
  Filter,
  Images,
  Landmark,
  MapPinned,
  Plus,
  Search,
  Sparkles,
} from "lucide-vue-next";
import { ref } from "vue";

import AsyncState from "@/shared/components/AsyncState.vue";
import BaseButton from "@/shared/components/BaseButton.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import SectionHeading from "@/shared/components/SectionHeading.vue";
import SurfaceCard from "@/shared/components/SurfaceCard.vue";

const activeView = ref("timeline");

const views = [
  { id: "timeline", label: "时间线", icon: Landmark },
  { id: "calendar", label: "日历", icon: CalendarDays },
  { id: "album", label: "相册", icon: Images },
  { id: "footprints", label: "足迹", icon: MapPinned },
  { id: "firsts", label: "第一次", icon: Sparkles },
];
</script>

<template>
  <main class="page-shell">
    <PageHeader
      eyebrow="Remember · 已经发生的过去"
      title="让旧故事，随时可以重新遇见。"
      description="按发生时间而不是上传时间整理回忆；共同信息一起维护，各自的视角只由本人书写。"
    >
      <template #actions>
        <BaseButton size="sm">
          <Plus class="size-4" />
          新回忆
        </BaseButton>
      </template>
    </PageHeader>

    <div class="surface mb-5 overflow-x-auto p-1.5">
      <div
        class="flex min-w-max gap-1"
        role="tablist"
        aria-label="记录浏览方式"
      >
        <button
          v-for="view in views"
          :key="view.id"
          type="button"
          role="tab"
          :aria-selected="activeView === view.id"
          class="inline-flex min-h-10 items-center gap-2 rounded-2xl px-4 text-sm font-semibold transition"
          :class="
            activeView === view.id
              ? 'bg-ink-950 text-white shadow-sm dark:bg-white dark:text-ink-950'
              : 'text-ink-500 hover:bg-ink-100/70 hover:text-ink-950 dark:text-ink-400 dark:hover:bg-white/[0.06] dark:hover:text-white'
          "
          @click="activeView = view.id"
        >
          <component :is="view.icon" class="size-4" />
          {{ view.label }}
        </button>
      </div>
    </div>

    <div class="mb-6 flex flex-col gap-3 sm:flex-row">
      <label class="relative flex-1">
        <span class="sr-only">搜索回忆</span>
        <Search
          class="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-400"
        />
        <input
          class="field-input pl-11"
          type="search"
          placeholder="搜索标题、正文或地点"
        />
      </label>
      <BaseButton variant="secondary">
        <Filter class="size-4" />
        筛选
      </BaseButton>
    </div>

    <section
      v-if="activeView === 'timeline'"
      class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]"
    >
      <SurfaceCard>
        <div class="flex items-center justify-between gap-4">
          <SectionHeading
            title="时光长河"
            description="按月份与年份，慢慢往回走。"
          />
          <span
            class="rounded-full bg-memory-100 px-3 py-1 text-xs font-semibold text-memory-700 dark:bg-memory-950/45 dark:text-memory-200"
            >全部年份</span
          >
        </div>
        <div class="mt-5">
          <AsyncState
            state="empty"
            title="故事已经发生，只差被慢慢写下来。"
            message="第一条回忆可以只有一句话和一个日期，照片与另一个视角以后再补也没关系。"
            action-label="写下第一条回忆"
          />
        </div>
      </SurfaceCard>

      <div class="space-y-5">
        <SurfaceCard tone="memory">
          <span
            class="grid size-10 place-items-center rounded-2xl bg-memory-100 text-memory-700 dark:bg-memory-900/45 dark:text-memory-200"
          >
            <Sparkles class="size-4" />
          </span>
          <h2
            class="mt-5 font-display text-xl font-semibold text-ink-950 dark:text-white"
          >
            双人视角
          </h2>
          <p class="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400">
            公共故事一起维护，你们各自的感受则独立保存。另一份视角写好前，不会被催促。
          </p>
          <div class="mt-5 flex -space-x-2">
            <span
              class="grid size-9 place-items-center rounded-xl border-2 border-white bg-memory-400 text-xs font-bold text-white dark:border-ink-900"
              >甲</span
            >
            <span
              class="grid size-9 place-items-center rounded-xl border-2 border-white bg-present-500 text-xs font-bold text-white dark:border-ink-900"
              >乙</span
            >
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <div class="flex items-center gap-3">
            <span
              class="grid size-9 place-items-center rounded-xl bg-ink-100 text-ink-500 dark:bg-white/[0.07] dark:text-ink-300"
            >
              <Camera class="size-4" />
            </span>
            <div>
              <p class="text-sm font-semibold text-ink-900 dark:text-white">
                照片会被私密保存
              </p>
              <p class="mt-0.5 text-xs text-ink-400 dark:text-ink-500">
                短时签名地址 · 清理定位信息
              </p>
            </div>
          </div>
        </SurfaceCard>
      </div>
    </section>

    <SurfaceCard v-else>
      <AsyncState
        state="empty"
        :title="`${views.find((view) => view.id === activeView)?.label ?? '这里'}还在等待第一段内容`"
        message="当回忆逐渐丰富，这个视图会用同一套时间与隐私规则呈现它们。"
      />
    </SurfaceCard>
  </main>
</template>
