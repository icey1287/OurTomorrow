<script setup lang="ts">
import type { MemoryCardSummary } from "@our-tomorrow/contracts";
import {
  Heart,
  MapPin,
  MessageCircle,
  Pin,
  Sparkles,
  UsersRound,
} from "lucide-vue-next";

import PrivateMediaImage from "@/features/remember/PrivateMediaImage.vue";
import { formatMemoryDate } from "@/features/remember/remember-utils";

defineProps<{ memory: MemoryCardSummary; timezone: string }>();
defineEmits<{ open: [] }>();
</script>

<template>
  <button
    type="button"
    class="surface-interactive group w-full overflow-hidden text-left"
    :aria-label="`打开回忆：${memory.title}`"
    @click="$emit('open')"
  >
    <div
      v-if="memory.coverMedia"
      class="aspect-[16/9] overflow-hidden sm:aspect-[2/1]"
    >
      <PrivateMediaImage
        :src="memory.coverMedia.thumbnailUrl"
        :alt="`${memory.title}的封面`"
        :retryable="false"
        image-class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
      />
    </div>

    <div class="p-5 sm:p-6">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <span
              v-if="memory.isPinned"
              class="inline-flex items-center gap-1 rounded-full bg-memory-100 px-2.5 py-1 text-[11px] font-bold text-memory-700 dark:bg-memory-950/55 dark:text-memory-200"
            >
              <Pin class="size-3" /> 置顶
            </span>
            <span
              v-if="memory.isFirstTime"
              class="inline-flex items-center gap-1 rounded-full bg-future-100 px-2.5 py-1 text-[11px] font-bold text-future-700 dark:bg-future-950/55 dark:text-future-200"
            >
              <Sparkles class="size-3" />
              {{ memory.firstTimeLabel || "第一次" }}
            </span>
            <span
              v-if="memory.status === 'DRAFT'"
              class="rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-bold text-ink-500 dark:bg-white/[0.07] dark:text-ink-300"
            >
              草稿
            </span>
          </div>
          <h3
            class="mt-3 font-display text-xl font-semibold leading-snug text-ink-950 transition group-hover:text-memory-700 dark:text-white dark:group-hover:text-memory-200"
          >
            {{ memory.title }}
          </h3>
          <p class="mt-2 text-xs font-semibold text-ink-400 dark:text-ink-500">
            {{ formatMemoryDate(memory.happenedAt, true, timezone) }}
          </p>
        </div>
        <span
          class="shrink-0 rounded-full bg-memory-50 px-2.5 py-1 text-xs font-bold text-memory-600 dark:bg-memory-950/40 dark:text-memory-300"
        >
          v{{ memory.version }}
        </span>
      </div>

      <p
        v-if="memory.excerpt"
        class="mt-4 line-clamp-3 text-sm leading-6 text-ink-600 dark:text-ink-300"
      >
        {{ memory.excerpt }}
      </p>

      <div v-if="memory.tags.length" class="mt-4 flex flex-wrap gap-2">
        <span
          v-for="tag in memory.tags"
          :key="tag.id"
          class="rounded-full border border-ink-200/80 bg-white/65 px-2.5 py-1 text-xs text-ink-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-ink-300"
        >
          # {{ tag.name }}
        </span>
      </div>

      <div
        class="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink-100 pt-4 text-xs font-semibold text-ink-400 dark:border-white/[0.07] dark:text-ink-500"
      >
        <span v-if="memory.place" class="inline-flex items-center gap-1.5">
          <MapPin class="size-3.5" /> {{ memory.place.name }}
        </span>
        <span class="inline-flex items-center gap-1.5">
          <UsersRound class="size-3.5" />
          {{ memory.perspectiveSubmittedCount }}/2 份视角
        </span>
        <span class="inline-flex items-center gap-1.5">
          <MessageCircle class="size-3.5" /> {{ memory.commentCount }}
        </span>
        <span
          v-if="memory.reactions.length"
          class="inline-flex items-center gap-1.5"
        >
          <Heart class="size-3.5" />
          {{
            memory.reactions
              .map((reaction) => `${reaction.emoji} ${reaction.count}`)
              .join(" · ")
          }}
        </span>
      </div>
    </div>
  </button>
</template>
