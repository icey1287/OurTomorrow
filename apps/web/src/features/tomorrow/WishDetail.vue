<script setup lang="ts">
import type { WishDetail } from "@our-tomorrow/contracts";
import {
  CalendarClock,
  CheckCircle2,
  CirclePlay,
  Edit3,
  History,
  Image,
  MapPin,
  MessageCircleHeart,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-vue-next";
import { ref } from "vue";

import {
  formatInstant,
  planStatusLabel,
  wishCategoryMeta,
  wishStatusLabel,
} from "@/features/tomorrow/tomorrow-utils";
import BaseButton from "@/shared/components/BaseButton.vue";
import PrivateMediaImage from "@/features/remember/PrivateMediaImage.vue";

const props = defineProps<{
  wish: WishDetail;
  timezone: string;
  pendingAction: string | null;
  error: string | null;
}>();

const emit = defineEmits<{
  edit: [];
  plan: [];
  start: [];
  complete: [];
  reopen: [note: string | null];
  progress: [note: string];
  convert: [];
  delete: [];
}>();

const progress = ref("");
const reopenNote = ref("");

function addProgress() {
  const note = progress.value.trim();
  if (!note) return;
  emit("progress", note);
  progress.value = "";
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center gap-2">
      <span
        class="rounded-full bg-future-100 px-3 py-1.5 text-xs font-semibold text-future-800 dark:bg-future-950/50 dark:text-future-200"
      >
        {{ wishCategoryMeta(wish.category).emoji }}
        {{ wishCategoryMeta(wish.category).label }}
      </span>
      <span
        class="rounded-full bg-ink-100 px-3 py-1.5 text-xs font-semibold text-ink-600 dark:bg-white/[0.07] dark:text-ink-300"
      >
        {{ wishStatusLabel(wish.status) }}
      </span>
      <span
        v-if="wish.sourceNoteId"
        class="rounded-full bg-present-50 px-3 py-1.5 text-xs font-semibold text-present-700 dark:bg-present-950/35 dark:text-present-200"
      >
        来自便利贴
      </span>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <div
        class="rounded-2xl bg-ink-50/80 p-4 dark:bg-white/[0.04] sm:col-span-2"
      >
        <p class="eyebrow">最初写下的期待</p>
        <p
          class="mt-3 whitespace-pre-wrap text-sm leading-7 text-ink-700 dark:text-ink-200"
        >
          {{
            wish.description ||
            wish.expectation ||
            "只写下了标题，也已经足够开始。"
          }}
        </p>
        <p
          v-if="wish.description && wish.expectation"
          class="mt-3 whitespace-pre-wrap border-t border-ink-100 pt-3 text-sm leading-7 text-ink-600 dark:border-white/10 dark:text-ink-300"
        >
          {{ wish.expectation }}
        </p>
      </div>
      <div class="rounded-2xl border border-ink-100 p-4 dark:border-white/10">
        <p class="flex items-center gap-2 text-xs font-semibold text-ink-400">
          <MapPin class="size-3.5" />地点
        </p>
        <p class="mt-2 text-sm font-semibold text-ink-800 dark:text-ink-100">
          {{ wish.place?.name || wish.plan?.place?.name || "还没有决定" }}
        </p>
      </div>
      <div class="rounded-2xl border border-ink-100 p-4 dark:border-white/10">
        <p class="flex items-center gap-2 text-xs font-semibold text-ink-400">
          <CalendarClock class="size-3.5" />时间
        </p>
        <p class="mt-2 text-sm font-semibold text-ink-800 dark:text-ink-100">
          {{ formatInstant(wish.completedAt || wish.plannedFor, timezone) }}
        </p>
      </div>
    </div>

    <section v-if="wish.plan" aria-labelledby="wish-linked-plan">
      <h3
        id="wish-linked-plan"
        class="font-display text-lg font-semibold text-ink-950 dark:text-white"
      >
        关联计划
      </h3>
      <div
        class="mt-3 rounded-2xl border border-future-200 bg-future-50/60 p-4 dark:border-future-900/55 dark:bg-future-950/25"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="font-semibold text-ink-900 dark:text-white">
              {{ wish.plan.title }}
            </p>
            <p class="mt-1 text-xs text-ink-500 dark:text-ink-400">
              {{ formatInstant(wish.plan.startsAt, timezone) }}
            </p>
          </div>
          <span
            class="text-xs font-semibold text-future-700 dark:text-future-300"
          >
            {{ planStatusLabel(wish.plan.status) }}
          </span>
        </div>
        <p
          v-if="wish.plan.itinerary"
          class="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink-600 dark:text-ink-300"
        >
          {{ wish.plan.itinerary }}
        </p>
        <div
          v-if="wish.plan.preparations.length"
          class="mt-3 flex flex-wrap gap-2"
        >
          <span
            v-for="item in wish.plan.preparations"
            :key="item"
            class="rounded-full bg-white px-3 py-1 text-xs text-ink-600 dark:bg-white/[0.07] dark:text-ink-300"
          >
            {{ item }}
          </span>
        </div>
      </div>
    </section>

    <section v-if="wish.media.length" aria-labelledby="wish-completion-images">
      <h3
        id="wish-completion-images"
        class="flex items-center gap-2 font-display text-lg font-semibold text-ink-950 dark:text-white"
      >
        <Image class="size-4" />完成照片
      </h3>
      <div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div
          v-for="asset in wish.media"
          :key="asset.id"
          class="aspect-square overflow-hidden rounded-2xl bg-ink-100 dark:bg-white/[0.06]"
        >
          <PrivateMediaImage
            :src="asset.thumbnailUrl"
            :alt="asset.originalName"
            image-class="size-full object-cover"
          />
        </div>
      </div>
    </section>

    <section
      v-if="wish.status !== 'CONVERTED_TO_MEMORY'"
      aria-labelledby="wish-progress-heading"
    >
      <h3
        id="wish-progress-heading"
        class="flex items-center gap-2 font-display text-lg font-semibold text-ink-950 dark:text-white"
      >
        <MessageCircleHeart class="size-4" />留下一点进展
      </h3>
      <form
        class="mt-3 flex flex-col gap-3 sm:flex-row"
        @submit.prevent="addProgress"
      >
        <input
          v-model="progress"
          class="field-input flex-1"
          maxlength="10000"
          placeholder="比如：路线已经选好了"
        />
        <BaseButton
          type="submit"
          variant="secondary"
          :loading="pendingAction === 'progress'"
          :disabled="!progress.trim()"
        >
          添加进展
        </BaseButton>
      </form>
    </section>

    <section aria-labelledby="wish-history-heading">
      <h3
        id="wish-history-heading"
        class="flex items-center gap-2 font-display text-lg font-semibold text-ink-950 dark:text-white"
      >
        <History class="size-4" />一路发生的变化
      </h3>
      <div v-if="wish.updates.length" class="mt-3 space-y-3">
        <div
          v-for="update in wish.updates"
          :key="update.id"
          class="rounded-2xl border border-ink-100 px-4 py-3 dark:border-white/10"
        >
          <p class="text-sm text-ink-700 dark:text-ink-200">
            <strong>{{
              update.author.nicknameInRelationship || update.author.displayName
            }}</strong>
            <template v-if="update.fromStatus || update.toStatus">
              ·
              {{
                update.fromStatus ? wishStatusLabel(update.fromStatus) : "创建"
              }}
              →
              {{ update.toStatus ? wishStatusLabel(update.toStatus) : "更新" }}
            </template>
          </p>
          <p
            v-if="update.note"
            class="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink-500 dark:text-ink-400"
          >
            {{ update.note }}
          </p>
          <p class="mt-1 text-xs text-ink-400">
            {{ formatInstant(update.createdAt, timezone) }}
          </p>
        </div>
      </div>
      <p v-else class="mt-3 text-sm text-ink-400">还没有额外的进展。</p>
    </section>

    <p
      v-if="error"
      class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200"
      role="alert"
    >
      {{ error }}
    </p>

    <div
      class="flex flex-wrap gap-2 border-t border-ink-100 pt-5 dark:border-white/10"
    >
      <BaseButton
        v-if="wish.status !== 'CONVERTED_TO_MEMORY'"
        variant="secondary"
        size="sm"
        @click="$emit('edit')"
      >
        <Edit3 class="size-4" />编辑
      </BaseButton>
      <BaseButton
        v-if="wish.status === 'IDEA' && !wish.plan"
        size="sm"
        @click="$emit('plan')"
      >
        <CalendarClock class="size-4" />开始计划
      </BaseButton>
      <BaseButton
        v-else-if="wish.status === 'IDEA' && wish.plan"
        size="sm"
        variant="secondary"
        disabled
      >
        <CalendarClock class="size-4" />已有计划草稿，请在“未来计划”继续
      </BaseButton>
      <BaseButton
        v-if="wish.status === 'PLANNED'"
        size="sm"
        :loading="pendingAction === 'start'"
        @click="$emit('start')"
      >
        <CirclePlay class="size-4" />开始实现
      </BaseButton>
      <BaseButton
        v-if="wish.status === 'IN_PROGRESS'"
        size="sm"
        @click="$emit('complete')"
      >
        <CheckCircle2 class="size-4" />完成愿望
      </BaseButton>
      <BaseButton
        v-if="wish.status === 'COMPLETED'"
        size="sm"
        @click="$emit('convert')"
      >
        <Sparkles class="size-4" />转为回忆
      </BaseButton>
      <div
        v-if="wish.status === 'COMPLETED'"
        class="flex flex-1 flex-wrap gap-2"
      >
        <input
          v-model="reopenNote"
          class="field-input min-w-48 flex-1 py-2.5 text-sm"
          maxlength="10000"
          placeholder="重开的原因（可选）"
        />
        <BaseButton
          variant="ghost"
          size="sm"
          :loading="pendingAction === 'reopen'"
          @click="$emit('reopen', reopenNote.trim() || null)"
        >
          <RotateCcw class="size-4" />重新打开
        </BaseButton>
      </div>
      <BaseButton
        v-if="wish.status !== 'CONVERTED_TO_MEMORY'"
        variant="danger"
        size="sm"
        :loading="pendingAction === 'delete'"
        @click="$emit('delete')"
      >
        <Trash2 class="size-4" />移入回收站
      </BaseButton>
    </div>
  </div>
</template>
