<script setup lang="ts">
import type { DailyEntryTodayResponse } from "@our-tomorrow/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import {
  Check,
  Clock3,
  LockKeyhole,
  MessageCircleHeart,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-vue-next";
import { computed, ref, watch } from "vue";

import {
  dailyEntryStatusLabel,
  formatInstant,
  isDailyEntryEditable,
  isDailyEntryRevealed,
} from "@/features/daily/daily-utils";
import { ApiClientError } from "@/shared/api/client";
import { stageThreeApi } from "@/shared/api/stage-three";
import AsyncState from "@/shared/components/AsyncState.vue";
import BaseButton from "@/shared/components/BaseButton.vue";
import SurfaceCard from "@/shared/components/SurfaceCard.vue";
import { useIdentityStore } from "@/shared/stores/identity";

const identity = useIdentityStore();
const queryClient = useQueryClient();
const answer = ref("");
const answerDirty = ref(false);
const postscript = ref("");
const postscriptDirty = ref(false);
const actionError = ref<string | null>(null);
const actionMessage = ref<string | null>(null);
const submittingSequence = ref(false);

const diaryQuery = useQuery({
  queryKey: computed(() => ["daily-entry", identity.role, "today"]),
  queryFn: stageThreeApi.dailyEntryToday,
  enabled: computed(() => Boolean(identity.role)),
});

const entry = computed(() => diaryQuery.data.value ?? null);
const editable = computed(() =>
  isDailyEntryEditable(entry.value?.mine?.status),
);
const revealed = computed(() =>
  isDailyEntryRevealed(entry.value?.mine?.status),
);
const revealedPartner = computed(() => {
  const partner = entry.value?.partner;
  return partner && partner.submitted && "answer" in partner ? partner : null;
});
const partnerName = computed(() => {
  const userId = identity.user?.id;
  return (
    identity.couple?.members.find((member) => member.id !== userId)
      ?.nicknameInRelationship ||
    identity.couple?.members.find((member) => member.id !== userId)
      ?.displayName ||
    "对方"
  );
});
const diaryError = computed(() => {
  const error = diaryQuery.error.value;
  return error instanceof Error
    ? error.message
    : "今日交换日记暂时没有打开，请稍后再试。";
});
const hasUnsavedAnswer = computed(
  () => answer.value !== (entry.value?.mine?.answer ?? ""),
);

watch(
  () => diaryQuery.data.value,
  (data) => {
    if (!data) return;
    if (!answerDirty.value || !isDailyEntryEditable(data.mine?.status)) {
      answer.value = data.mine?.answer ?? "";
      answerDirty.value = false;
    }
    if (!postscriptDirty.value || data.mine?.status !== "REVEALED") {
      postscript.value = data.mine?.postscript ?? "";
      postscriptDirty.value = false;
    }
  },
  { immediate: true },
);

function isCurrentRole(role: "boy" | "girl") {
  return identity.role === role;
}

function cacheEntry(data: DailyEntryTodayResponse, role: "boy" | "girl") {
  if (!isCurrentRole(role)) return;
  queryClient.setQueryData(["daily-entry", role, "today"], data);
}

async function refreshRelated() {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["daily-entry"] }),
    queryClient.invalidateQueries({ queryKey: ["daily-calendar"] }),
    queryClient.invalidateQueries({ queryKey: ["today"] }),
    queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  ]);
}

function diaryMutationError(error: unknown, action: string) {
  if (
    error instanceof ApiClientError &&
    [
      "STATE_CONFLICT",
      "STATE_TRANSITION_INVALID",
      "CONTENT_LOCKED",
      "PRECONDITION_REQUIRED",
    ].includes(error.code)
  ) {
    void diaryQuery.refetch();
    return `日记状态刚刚发生变化，已重新读取服务端版本；你的本地文字仍保留，请确认后再${action}。`;
  }
  return error instanceof Error ? error.message : `日记没有${action}成功。`;
}

const saveMutation = useMutation({
  mutationFn: stageThreeApi.saveDailyEntry,
});

const submitMutation = useMutation({
  mutationFn: stageThreeApi.submitDailyEntry,
});

const postscriptMutation = useMutation({
  mutationFn: stageThreeApi.updateDailyEntryPostscript,
});

async function saveDraft() {
  if (!editable.value || saveMutation.isPending.value) return;
  const startRole = identity.role;
  if (!startRole) return;
  actionError.value = null;
  actionMessage.value = null;
  try {
    const data = await saveMutation.mutateAsync({
      answer: answer.value,
      ...(entry.value?.mine ? { version: entry.value.mine.version } : {}),
    });
    if (!isCurrentRole(startRole)) return;
    answerDirty.value = false;
    actionMessage.value = answer.value.trim()
      ? "答案已私密保存；提交前对方看不到正文。"
      : "空白草稿已保存。";
    cacheEntry(data, startRole);
    await queryClient.invalidateQueries({ queryKey: ["daily-calendar"] });
  } catch (error) {
    if (!isCurrentRole(startRole)) return;
    actionError.value = diaryMutationError(error, "保存");
  }
}

async function submitAnswer() {
  if (!editable.value || submittingSequence.value) return;
  if (!answer.value.trim()) {
    actionError.value = "写下一点内容后才能提交。";
    return;
  }
  const startRole = identity.role;
  if (!startRole) return;
  submittingSequence.value = true;
  actionError.value = null;
  actionMessage.value = null;
  try {
    let current = entry.value;
    if (!current?.mine || hasUnsavedAnswer.value) {
      current = await saveMutation.mutateAsync({
        answer: answer.value,
        ...(current?.mine ? { version: current.mine.version } : {}),
      });
      if (!isCurrentRole(startRole)) return;
      cacheEntry(current, startRole);
    }
    if (!current.mine) throw new Error("答案还没有保存，请重试。");
    if (!isCurrentRole(startRole)) return;
    const submitted = await submitMutation.mutateAsync({
      version: current.mine.version,
    });
    if (!isCurrentRole(startRole)) return;
    answerDirty.value = false;
    cacheEntry(submitted, startRole);
    actionMessage.value =
      submitted.status === "REVEALED"
        ? "两份答案已经同时揭晓。"
        : "答案已锁定提交。对方提交前，彼此都看不到正文。";
    await refreshRelated();
  } catch (error) {
    if (!isCurrentRole(startRole)) return;
    actionError.value = diaryMutationError(error, "提交");
  } finally {
    submittingSequence.value = false;
  }
}

async function savePostscript() {
  const mine = entry.value?.mine;
  if (
    !mine ||
    mine.status !== "REVEALED" ||
    postscriptMutation.isPending.value
  ) {
    return;
  }
  if (!postscript.value.trim()) {
    actionError.value = "附言不能为空。";
    return;
  }
  const startRole = identity.role;
  if (!startRole) return;
  actionError.value = null;
  actionMessage.value = null;
  try {
    const data = await postscriptMutation.mutateAsync({
      version: mine.version,
      postscript: postscript.value.trim(),
    });
    if (!isCurrentRole(startRole)) return;
    postscriptDirty.value = false;
    cacheEntry(data, startRole);
    actionMessage.value = "附言已经补充；揭晓后的正文仍保持锁定。";
    await refreshRelated();
  } catch (error) {
    if (!isCurrentRole(startRole)) return;
    actionError.value = diaryMutationError(error, "补充附言");
  }
}
</script>

<template>
  <section aria-labelledby="diary-heading">
    <SurfaceCard tone="future" class="relative overflow-hidden">
      <div class="relative">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <span
            class="grid size-11 place-items-center rounded-2xl bg-future-100 text-future-700 dark:bg-future-900/45 dark:text-future-200"
          >
            <MessageCircleHeart class="size-5" />
          </span>
          <span
            class="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 text-xs font-semibold text-ink-500 dark:bg-white/[0.06] dark:text-ink-400"
          >
            <LockKeyhole class="size-3.5" />双方提交前互不可见
          </span>
        </div>

        <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="eyebrow">今日交换日记</p>
            <h2
              id="diary-heading"
              class="mt-2 font-display text-2xl font-semibold leading-snug text-ink-950 dark:text-white"
            >
              {{ entry?.prompt.text || "今天，想和对方说些什么？" }}
            </h2>
          </div>
          <span
            v-if="entry"
            class="rounded-full bg-future-100 px-3 py-1.5 text-xs font-semibold text-future-800 dark:bg-future-900/45 dark:text-future-200"
          >
            {{ dailyEntryStatusLabel(entry.status) }}
          </span>
        </div>

        <div class="mt-5">
          <AsyncState
            v-if="diaryQuery.isPending.value"
            state="loading"
            title="正在取出今天的问题…"
          />
          <AsyncState
            v-else-if="diaryQuery.isError.value"
            state="error"
            title="交换日记没有顺利打开"
            :message="diaryError"
            action-label="重新加载"
            @action="diaryQuery.refetch()"
          />

          <template v-else-if="entry">
            <div
              v-if="actionError || actionMessage"
              class="mb-4 rounded-2xl px-4 py-3 text-sm leading-6"
              :class="
                actionError
                  ? 'border border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200'
                  : 'border border-future-200 bg-future-50 text-future-800 dark:border-future-900/55 dark:bg-future-950/30 dark:text-future-200'
              "
              :role="actionError ? 'alert' : 'status'"
            >
              {{ actionError || actionMessage }}
            </div>

            <div v-if="editable" class="space-y-4">
              <label class="block">
                <span class="field-label">我的答案</span>
                <textarea
                  v-model="answer"
                  rows="7"
                  maxlength="20000"
                  class="field-input resize-y bg-white/85 dark:bg-ink-950/55"
                  placeholder="不用写得完整，诚实地留下今天的这一刻就好…"
                  @input="answerDirty = true"
                />
                <span
                  class="mt-1 flex justify-between gap-3 text-xs text-ink-400"
                >
                  <span>{{
                    entry.mine ? "已建立私密草稿" : "还没有保存过"
                  }}</span>
                  <span>{{ answer.length }}/20000</span>
                </span>
              </label>
              <div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <BaseButton
                  variant="secondary"
                  :loading="saveMutation.isPending.value && !submittingSequence"
                  :disabled="!hasUnsavedAnswer && Boolean(entry.mine)"
                  @click="saveDraft"
                >
                  保存私密草稿
                </BaseButton>
                <BaseButton :loading="submittingSequence" @click="submitAnswer">
                  <Send class="size-4" />提交并锁定
                </BaseButton>
              </div>
              <p class="flex items-start gap-2 text-xs leading-5 text-ink-400">
                <LockKeyhole class="mt-0.5 size-3.5 shrink-0" />
                提交后不能修改正文；只有两个人都提交，服务端才会读取并同时返回彼此答案。
              </p>
            </div>

            <div
              v-else-if="!revealed"
              class="rounded-3xl border border-dashed border-future-300 bg-white/55 px-5 py-8 text-center dark:border-future-800 dark:bg-white/[0.03]"
            >
              <span
                class="mx-auto grid size-12 place-items-center rounded-2xl bg-future-100 text-future-700 dark:bg-future-900/45 dark:text-future-200"
              >
                <Clock3 class="size-5" />
              </span>
              <h3
                class="mt-4 font-display text-xl font-semibold text-ink-950 dark:text-white"
              >
                {{
                  entry.partner.submitted
                    ? "两份答案正在完成同时揭晓"
                    : `已提交，正在等待${partnerName}`
                }}
              </h3>
              <p
                class="mx-auto mt-2 max-w-lg text-sm leading-6 text-ink-500 dark:text-ink-400"
              >
                你的正文已经锁定。等待期间只显示“是否提交”，不会读取或下发任何一方的答案。
              </p>
              <div
                class="mt-5 rounded-2xl bg-white/70 p-4 text-left dark:bg-white/[0.05]"
              >
                <p class="text-xs font-semibold text-ink-400">我提交的答案</p>
                <p
                  class="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-700 dark:text-ink-200"
                >
                  {{ entry.mine?.answer }}
                </p>
              </div>
              <BaseButton
                class="mt-5"
                variant="secondary"
                size="sm"
                @click="diaryQuery.refetch()"
              >
                <RefreshCw class="size-4" />检查揭晓状态
              </BaseButton>
            </div>

            <div v-else class="space-y-4">
              <div
                class="flex items-center gap-2 rounded-2xl bg-future-100/75 px-4 py-3 text-sm font-semibold text-future-800 dark:bg-future-900/35 dark:text-future-200"
              >
                <Sparkles
                  class="size-4"
                />两份答案已在同一时刻揭晓，正文现在锁定。
              </div>
              <div class="grid gap-4 lg:grid-cols-2">
                <article
                  class="rounded-3xl border border-white/80 bg-white/70 p-5 dark:border-white/10 dark:bg-white/[0.04]"
                >
                  <p class="eyebrow">我的答案</p>
                  <p
                    class="mt-3 whitespace-pre-wrap text-sm leading-7 text-ink-800 dark:text-ink-100"
                  >
                    {{ entry.mine?.answer }}
                  </p>
                  <p
                    v-if="entry.mine?.postscript"
                    class="mt-4 border-t border-ink-200/70 pt-4 text-sm leading-6 text-ink-600 dark:border-white/10 dark:text-ink-300"
                  >
                    <span class="font-semibold">后来补充：</span
                    >{{ entry.mine.postscript }}
                  </p>
                  <p
                    v-if="entry.mine?.revealedAt"
                    class="mt-4 text-xs text-ink-400"
                  >
                    {{ formatInstant(entry.mine.revealedAt, entry.timezone) }}
                    揭晓
                  </p>
                </article>
                <article
                  class="rounded-3xl border border-present-200/80 bg-present-50/70 p-5 dark:border-present-900/50 dark:bg-present-950/20"
                >
                  <p class="eyebrow text-present-700 dark:text-present-300">
                    {{ partnerName }}的答案
                  </p>
                  <p
                    class="mt-3 whitespace-pre-wrap text-sm leading-7 text-ink-800 dark:text-ink-100"
                  >
                    {{ revealedPartner?.answer }}
                  </p>
                  <p
                    v-if="revealedPartner?.postscript"
                    class="mt-4 border-t border-present-200/70 pt-4 text-sm leading-6 text-ink-600 dark:border-present-900/50 dark:text-ink-300"
                  >
                    <span class="font-semibold">后来补充：</span
                    >{{ revealedPartner.postscript }}
                  </p>
                </article>
              </div>

              <div
                class="rounded-3xl border border-ink-200/80 bg-white/55 p-4 dark:border-white/10 dark:bg-white/[0.03]"
              >
                <label class="block">
                  <span class="field-label">补充一段附言</span>
                  <textarea
                    v-model="postscript"
                    rows="3"
                    maxlength="2000"
                    class="field-input resize-y"
                    placeholder="正文不会再改变，但可以补充揭晓后的想法…"
                    @input="postscriptDirty = true"
                  />
                  <span class="mt-1 block text-right text-xs text-ink-400"
                    >{{ postscript.length }}/2000</span
                  >
                </label>
                <div class="mt-3 flex justify-end">
                  <BaseButton
                    size="sm"
                    :loading="postscriptMutation.isPending.value"
                    :disabled="!postscriptDirty || !postscript.trim()"
                    @click="savePostscript"
                  >
                    <Check class="size-4" />保存附言
                  </BaseButton>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </SurfaceCard>
  </section>
</template>
