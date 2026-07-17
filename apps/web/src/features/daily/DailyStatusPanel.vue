<script setup lang="ts">
import type { CurrentStatusKind } from "@our-tomorrow/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { Clock3, MessageCircleHeart, RefreshCw, X } from "lucide-vue-next";
import { computed, reactive, ref } from "vue";

import {
  addMinutesIso,
  formatInstant,
  remainingStatusText,
  STATUS_OPTIONS,
  statusOption,
} from "@/features/daily/daily-utils";
import { ApiClientError } from "@/shared/api/client";
import { stageThreeApi } from "@/shared/api/stage-three";
import AsyncState from "@/shared/components/AsyncState.vue";
import BaseButton from "@/shared/components/BaseButton.vue";
import SurfaceCard from "@/shared/components/SurfaceCard.vue";
import { useIdentityStore } from "@/shared/stores/identity";

const identity = useIdentityStore();
const queryClient = useQueryClient();
const composerOpen = ref(false);
const actionError = ref<string | null>(null);
const actionMessage = ref<string | null>(null);
const form = reactive({
  kind: "BUSY" as CurrentStatusKind,
  customMessage: "",
  message: "",
  mood: "",
  scene: "",
  durationMinutes: 60,
  needsResponse: false,
});

const statusQuery = useQuery({
  queryKey: computed(() => ["statuses", identity.role]),
  queryFn: stageThreeApi.statuses,
  enabled: computed(() => Boolean(identity.role)),
  refetchInterval: 60_000,
});

const timezone = computed(() => identity.couple?.timezone ?? "Asia/Shanghai");
const mine = computed(() => statusQuery.data.value?.mine ?? null);
const partner = computed(() => statusQuery.data.value?.partner ?? null);
const statusError = computed(() => {
  const error = statusQuery.error.value;
  return error instanceof Error
    ? error.message
    : "此刻状态暂时没有打开，请稍后再试。";
});

function mutationError(error: unknown, action: string) {
  if (
    error instanceof ApiClientError &&
    (error.code === "STATE_CONFLICT" || error.code === "PRECONDITION_REQUIRED")
  ) {
    void queryClient.invalidateQueries({ queryKey: ["statuses"] });
    return `状态刚刚在另一处发生变化，已为你刷新；请确认后重新${action}。`;
  }
  return error instanceof Error ? error.message : `状态没有${action}成功。`;
}

const saveMutation = useMutation({
  mutationFn: stageThreeApi.setStatus,
  onSuccess: async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["statuses"] }),
      queryClient.invalidateQueries({ queryKey: ["today"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    ]);
  },
});

const clearMutation = useMutation({
  mutationFn: (version: number) => stageThreeApi.clearStatus(version),
  onSuccess: async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["statuses"] }),
      queryClient.invalidateQueries({ queryKey: ["today"] }),
    ]);
  },
});

function openComposer(kind: CurrentStatusKind = mine.value?.kind ?? "BUSY") {
  form.kind = kind;
  form.customMessage = kind === "CUSTOM" ? (mine.value?.message ?? "") : "";
  form.message = kind === "CUSTOM" ? "" : (mine.value?.message ?? "");
  form.mood = mine.value?.mood ?? "";
  form.scene = mine.value?.scene ?? "";
  form.needsResponse = mine.value?.needsResponse ?? false;
  composerOpen.value = true;
  actionError.value = null;
  actionMessage.value = null;
}

async function saveStatus() {
  if (saveMutation.isPending.value) return;
  const customMessage = form.customMessage.trim();
  if (form.kind === "CUSTOM" && !customMessage) {
    actionError.value = "自定义状态需要写下一句话。";
    return;
  }

  actionError.value = null;
  actionMessage.value = null;
  try {
    await saveMutation.mutateAsync({
      kind: form.kind,
      message:
        form.kind === "CUSTOM" ? customMessage : form.message.trim() || null,
      mood: form.mood.trim() || null,
      scene: form.scene.trim() || null,
      needsResponse: form.needsResponse,
      expiresAt: addMinutesIso(new Date(), form.durationMinutes),
      ...(mine.value ? { version: mine.value.version } : {}),
    });
    composerOpen.value = false;
    actionMessage.value = "此刻状态已更新，到了设定时间会自动结束。";
  } catch (error) {
    actionError.value = mutationError(error, "更新");
  }
}

async function clearStatus() {
  if (!mine.value || clearMutation.isPending.value) return;
  actionError.value = null;
  actionMessage.value = null;
  try {
    await clearMutation.mutateAsync(mine.value.version);
    composerOpen.value = false;
    actionMessage.value = "这张状态卡已经提前结束。";
  } catch (error) {
    actionError.value = mutationError(error, "结束");
  }
}
</script>

<template>
  <section aria-labelledby="status-heading">
    <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="eyebrow">此刻状态</p>
        <h2
          id="status-heading"
          class="mt-2 font-display text-2xl font-semibold text-ink-950 dark:text-white"
        >
          让对方知道，你正在经历怎样的现在。
        </h2>
      </div>
      <BaseButton size="sm" @click="openComposer()">
        {{ mine ? "更新我的状态" : "设置我的状态" }}
      </BaseButton>
    </div>

    <AsyncState
      v-if="statusQuery.isPending.value"
      state="loading"
      title="正在看看彼此的此刻…"
    />
    <AsyncState
      v-else-if="statusQuery.isError.value"
      state="error"
      title="此刻状态没有顺利打开"
      :message="statusError"
      action-label="重新加载"
      @action="statusQuery.refetch()"
    />

    <div v-else class="grid gap-4 lg:grid-cols-2">
      <SurfaceCard tone="present" class="relative overflow-hidden">
        <div
          class="absolute -right-12 -top-12 size-40 rounded-full bg-present-200/40 blur-3xl dark:bg-present-700/10"
        />
        <div class="relative">
          <div class="flex items-start justify-between gap-3">
            <span
              class="grid size-11 place-items-center rounded-2xl bg-present-100 text-xl dark:bg-present-900/45"
              aria-hidden="true"
            >
              {{ partner ? statusOption(partner.kind).emoji : "🌤️" }}
            </span>
            <span
              class="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-xs text-ink-500 dark:bg-white/[0.06] dark:text-ink-400"
            >
              <Clock3 class="size-3.5" />自动失效
            </span>
          </div>
          <p class="eyebrow mt-5 text-present-700 dark:text-present-300">
            {{
              partner?.author.nicknameInRelationship ||
              partner?.author.displayName ||
              "对方"
            }}的此刻
          </p>
          <template v-if="partner">
            <h3
              class="mt-2 font-display text-2xl font-semibold text-ink-950 dark:text-white"
            >
              {{ statusOption(partner.kind).label }}
            </h3>
            <p
              v-if="partner.message"
              class="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink-700 dark:text-ink-200"
            >
              {{ partner.message }}
            </p>
            <div
              class="mt-4 flex flex-wrap gap-2 text-xs text-ink-500 dark:text-ink-400"
            >
              <span
                v-if="partner.mood"
                class="rounded-full bg-white/70 px-3 py-1.5 dark:bg-white/[0.06]"
              >
                心情 · {{ partner.mood }}
              </span>
              <span
                v-if="partner.scene"
                class="rounded-full bg-white/70 px-3 py-1.5 dark:bg-white/[0.06]"
              >
                场景 · {{ partner.scene }}
              </span>
              <span
                v-if="partner.needsResponse"
                class="inline-flex items-center gap-1 rounded-full bg-present-100 px-3 py-1.5 font-semibold text-present-800 dark:bg-present-900/45 dark:text-present-200"
              >
                <MessageCircleHeart class="size-3.5" />希望得到回应
              </span>
            </div>
            <p class="mt-4 text-xs text-ink-400">
              {{
                remainingStatusText(
                  partner.expiresAt,
                  statusQuery.data.value?.serverNow ?? new Date(),
                )
              }}
              · 至 {{ formatInstant(partner.expiresAt, timezone) }}
            </p>
          </template>
          <div v-else class="py-3">
            <h3
              class="mt-2 font-display text-xl font-semibold text-ink-950 dark:text-white"
            >
              对方还没有更新状态
            </h3>
            <p class="mt-3 text-sm leading-6 text-ink-500 dark:text-ink-400">
              状态过期后也会回到这里，不会形成永久的压力或记录。
            </p>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <div class="flex items-start justify-between gap-3">
          <span
            class="grid size-11 place-items-center rounded-2xl bg-ink-100 text-xl dark:bg-white/[0.07]"
            aria-hidden="true"
          >
            {{ mine ? statusOption(mine.kind).emoji : "✍️" }}
          </span>
          <BaseButton
            v-if="mine"
            variant="ghost"
            size="sm"
            :loading="clearMutation.isPending.value"
            @click="clearStatus"
          >
            <X class="size-4" />提前结束
          </BaseButton>
        </div>
        <p class="eyebrow mt-5">我的状态</p>
        <template v-if="mine">
          <h3
            class="mt-2 font-display text-2xl font-semibold text-ink-950 dark:text-white"
          >
            {{ statusOption(mine.kind).label }}
          </h3>
          <p
            v-if="mine.message"
            class="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink-700 dark:text-ink-200"
          >
            {{ mine.message }}
          </p>
          <p class="mt-4 text-xs text-ink-400">
            {{
              remainingStatusText(
                mine.expiresAt,
                statusQuery.data.value?.serverNow ?? new Date(),
              )
            }}
          </p>
        </template>
        <template v-else>
          <h3
            class="mt-2 font-display text-xl font-semibold text-ink-950 dark:text-white"
          >
            现在的你，是什么状态？
          </h3>
          <p class="mt-3 text-sm leading-6 text-ink-500 dark:text-ink-400">
            选择一个预设，十几秒就能让对方安心一点。
          </p>
        </template>
      </SurfaceCard>
    </div>

    <div
      v-if="actionError || actionMessage"
      class="mt-3 rounded-2xl px-4 py-3 text-sm leading-6"
      :class="
        actionError
          ? 'border border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200'
          : 'border border-present-200 bg-present-50 text-present-800 dark:border-present-900/55 dark:bg-present-950/30 dark:text-present-200'
      "
      :role="actionError ? 'alert' : 'status'"
    >
      {{ actionError || actionMessage }}
    </div>

    <SurfaceCard
      v-if="composerOpen"
      class="mt-4"
      aria-labelledby="status-composer-heading"
    >
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="eyebrow">我的此刻</p>
          <h3
            id="status-composer-heading"
            class="mt-2 font-display text-xl font-semibold text-ink-950 dark:text-white"
          >
            选一个最接近的状态
          </h3>
        </div>
        <button
          type="button"
          class="grid size-9 place-items-center rounded-xl text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 motion-reduce:transition-none dark:hover:bg-white/[0.07] dark:hover:text-white"
          aria-label="关闭状态编辑"
          @click="composerOpen = false"
        >
          <X class="size-4" />
        </button>
      </div>

      <form class="mt-5 space-y-5" @submit.prevent="saveStatus">
        <fieldset>
          <legend class="text-sm font-semibold text-ink-800 dark:text-ink-100">
            状态
          </legend>
          <div class="mt-3 flex flex-wrap gap-2">
            <button
              v-for="option in STATUS_OPTIONS"
              :key="option.kind"
              type="button"
              class="rounded-full border px-3.5 py-2 text-xs font-semibold transition motion-reduce:transition-none"
              :class="
                form.kind === option.kind
                  ? 'border-present-300 bg-present-50 text-present-800 ring-2 ring-present-100 dark:border-present-700 dark:bg-present-950/35 dark:text-present-200 dark:ring-present-900/40'
                  : 'border-ink-200 bg-white/60 text-ink-600 hover:border-present-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-ink-300'
              "
              @click="form.kind = option.kind"
            >
              {{ option.emoji }} {{ option.label }}
            </button>
            <button
              type="button"
              class="rounded-full border px-3.5 py-2 text-xs font-semibold transition motion-reduce:transition-none"
              :class="
                form.kind === 'CUSTOM'
                  ? 'border-present-300 bg-present-50 text-present-800 ring-2 ring-present-100 dark:border-present-700 dark:bg-present-950/35 dark:text-present-200 dark:ring-present-900/40'
                  : 'border-ink-200 bg-white/60 text-ink-600 hover:border-present-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-ink-300'
              "
              @click="form.kind = 'CUSTOM'"
            >
              ✍️ 自定义
            </button>
          </div>
        </fieldset>

        <label v-if="form.kind === 'CUSTOM'" class="block">
          <span class="text-sm font-semibold text-ink-800 dark:text-ink-100"
            >自定义状态 <span class="text-red-500">*</span></span
          >
          <input
            v-model="form.customMessage"
            maxlength="280"
            required
            class="field-input mt-2"
            placeholder="例如：在专心赶一个小项目"
          />
        </label>
        <label v-else class="block">
          <span class="text-sm font-semibold text-ink-800 dark:text-ink-100"
            >补充一句 <span class="font-normal text-ink-400">可选</span></span
          >
          <input
            v-model="form.message"
            maxlength="280"
            class="field-input mt-2"
            placeholder="再说一点，让对方更懂你"
          />
        </label>

        <div class="grid gap-4 sm:grid-cols-2">
          <label class="block">
            <span class="text-sm font-semibold text-ink-800 dark:text-ink-100"
              >心情 <span class="font-normal text-ink-400">可选</span></span
            >
            <input
              v-model="form.mood"
              maxlength="80"
              class="field-input mt-2"
              placeholder="平静、疲惫、开心…"
            />
          </label>
          <label class="block">
            <span class="text-sm font-semibold text-ink-800 dark:text-ink-100"
              >所在场景 <span class="font-normal text-ink-400">可选</span></span
            >
            <input
              v-model="form.scene"
              maxlength="120"
              class="field-input mt-2"
              placeholder="公司、地铁、家里…"
            />
          </label>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <label class="block">
            <span class="text-sm font-semibold text-ink-800 dark:text-ink-100"
              >预计持续</span
            >
            <select
              v-model.number="form.durationMinutes"
              class="field-input mt-2"
            >
              <option :value="30">30 分钟</option>
              <option :value="60">1 小时</option>
              <option :value="120">2 小时</option>
              <option :value="240">4 小时</option>
              <option :value="480">8 小时</option>
            </select>
          </label>
          <label
            class="mt-auto flex min-h-11 items-center gap-3 rounded-2xl border border-ink-200/80 bg-white/55 px-4 py-3 text-sm text-ink-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-ink-200"
          >
            <input
              v-model="form.needsResponse"
              type="checkbox"
              class="size-4 accent-present-600"
            />
            希望对方回应我
          </label>
        </div>

        <p
          v-if="actionError"
          class="text-sm text-red-600 dark:text-red-300"
          role="alert"
        >
          {{ actionError }}
        </p>
        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <BaseButton variant="ghost" @click="composerOpen = false"
            >取消</BaseButton
          >
          <BaseButton type="submit" :loading="saveMutation.isPending.value">
            保存并开始计时
          </BaseButton>
        </div>
      </form>
    </SurfaceCard>
  </section>
</template>
