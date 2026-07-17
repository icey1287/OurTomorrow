<script setup lang="ts">
import type { MemoryCardSummary } from "@our-tomorrow/contracts";
import { Landmark, Sparkles } from "lucide-vue-next";

import PrivateMediaImage from "@/features/remember/PrivateMediaImage.vue";
import { firstTimeSentence } from "@/features/remember/remember-utils";
import AsyncState from "@/shared/components/AsyncState.vue";
import BaseButton from "@/shared/components/BaseButton.vue";
import SectionHeading from "@/shared/components/SectionHeading.vue";

defineProps<{
  memories: MemoryCardSummary[];
  timezone: string;
  pending: boolean;
  errorMessage: string | null;
  hasMore: boolean;
  loadingMore: boolean;
}>();

defineEmits<{
  open: [memoryId: string];
  retry: [];
  loadMore: [];
  create: [];
}>();
</script>

<template>
  <div>
    <div class="flex flex-wrap items-start justify-between gap-4">
      <SectionHeading
        title="第一次博物馆"
        description="只陈列已经发布、真正发生过的共同第一次。"
      />
      <span
        class="inline-flex items-center gap-2 rounded-full bg-future-100 px-3 py-1.5 text-xs font-semibold text-future-700 dark:bg-future-950/55 dark:text-future-200"
      >
        <Landmark class="size-3.5" /> {{ memories.length }} 件藏品
      </span>
    </div>

    <div class="mt-6">
      <AsyncState
        v-if="pending"
        state="loading"
        title="正在布置第一次博物馆…"
        message="只会取回已经发布且发生时间不晚于今天的回忆。"
      />
      <AsyncState
        v-else-if="errorMessage"
        state="error"
        title="博物馆暂时没有打开"
        :message="errorMessage"
        action-label="重新加载"
        @action="$emit('retry')"
      />
      <AsyncState
        v-else-if="!memories.length"
        state="empty"
        title="第一件藏品还在等你们写下"
        message="创建或编辑回忆时标记为“第一次”，它就会来到这里。"
        action-label="写下一个第一次"
        @action="$emit('create')"
      />

      <div v-else>
        <div class="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          <button
            v-for="(memory, index) in memories"
            :key="memory.id"
            type="button"
            class="surface-interactive group overflow-hidden text-left"
            :aria-label="`打开第一次藏品：${memory.title}`"
            @click="$emit('open', memory.id)"
          >
            <div
              v-if="memory.coverMedia"
              class="aspect-[4/3] overflow-hidden bg-memory-100 dark:bg-memory-950/50"
            >
              <PrivateMediaImage
                :src="memory.coverMedia.thumbnailUrl"
                :alt="`${memory.title}的封面`"
                :retryable="false"
                image-class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]"
              />
            </div>
            <div
              v-else
              class="grid aspect-[4/3] place-items-center bg-gradient-to-br from-future-100 via-memory-50 to-present-100 dark:from-future-950/55 dark:via-memory-950/35 dark:to-present-950/45"
            >
              <span
                class="grid size-16 place-items-center rounded-[1.75rem] border border-white/60 bg-white/55 text-future-700 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/[0.06] dark:text-future-200"
              >
                <Sparkles class="size-7" />
              </span>
            </div>

            <div class="p-5">
              <div class="flex items-center justify-between gap-3">
                <span
                  class="text-[11px] font-bold uppercase tracking-[0.18em] text-future-600 dark:text-future-300"
                >
                  Exhibit {{ String(index + 1).padStart(2, "0") }}
                </span>
                <span class="text-xs font-semibold text-ink-400">
                  {{ memory.place?.name || "共同记忆" }}
                </span>
              </div>
              <p
                class="mt-4 font-display text-xl font-semibold leading-8 text-ink-950 transition group-hover:text-future-700 dark:text-white dark:group-hover:text-future-200"
              >
                {{ firstTimeSentence(memory, timezone) }}
              </p>
              <p
                v-if="memory.excerpt"
                class="mt-3 line-clamp-2 text-sm leading-6 text-ink-500 dark:text-ink-400"
              >
                {{ memory.excerpt }}
              </p>
            </div>
          </button>
        </div>

        <div v-if="hasMore" class="mt-6 flex justify-center">
          <BaseButton
            variant="secondary"
            :loading="loadingMore"
            @click="$emit('loadMore')"
          >
            继续参观
          </BaseButton>
        </div>
        <p v-else class="mt-6 text-center text-xs text-ink-400">
          今天的展厅已经参观完了。
        </p>
      </div>
    </div>
  </div>
</template>
