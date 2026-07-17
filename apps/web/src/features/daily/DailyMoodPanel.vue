<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import {
  Eye,
  EyeOff,
  HeartHandshake,
  MessageCircleHeart,
  Send,
  Sparkles,
  Trash2,
} from "lucide-vue-next";
import { computed, ref, watch } from "vue";

import {
  localDateInTimeZone,
  localMonthInTimeZone,
  MOOD_OPTIONS,
} from "@/features/daily/daily-utils";
import { ApiClientError } from "@/shared/api/client";
import { stageThreeApi } from "@/shared/api/stage-three";
import AsyncState from "@/shared/components/AsyncState.vue";
import BaseButton from "@/shared/components/BaseButton.vue";
import SectionHeading from "@/shared/components/SectionHeading.vue";
import SurfaceCard from "@/shared/components/SurfaceCard.vue";
import { useIdentityStore } from "@/shared/stores/identity";

const identity = useIdentityStore();
const queryClient = useQueryClient();
const mood = ref("");
const note = ref("");
const visibleToPartner = ref(true);
const wantsResponse = ref(false);
const formDirty = ref(false);
const reply = ref("");
const replyDirty = ref(false);
const syncingForm = ref(false);
const actionError = ref<string | null>(null);
const actionMessage = ref<string | null>(null);

const timezone = computed(() => identity.couple?.timezone ?? "Asia/Shanghai");
const localDate = computed(() =>
  localDateInTimeZone(new Date(), timezone.value),
);
const month = computed(() => localMonthInTimeZone(new Date(), timezone.value));
const moodsQuery = useQuery({
  queryKey: computed(() => ["moods", identity.role, month.value]),
  queryFn: () => stageThreeApi.moods(month.value),
  enabled: computed(() => Boolean(identity.role)),
});

const mine = computed(
  () =>
    moodsQuery.data.value?.mine.find(
      (entry) => entry.entryDate === localDate.value,
    ) ?? null,
);
const partner = computed(
  () =>
    moodsQuery.data.value?.partner.find(
      (entry) => entry.entryDate === localDate.value,
    ) ?? null,
);
const partnerName = computed(
  () =>
    partner.value?.author.nicknameInRelationship ||
    partner.value?.author.displayName ||
    "对方",
);
const moodsError = computed(() => {
  const error = moodsQuery.error.value;
  return error instanceof Error
    ? error.message
    : "今日心情暂时没有打开，请稍后再试。";
});

watch(
  mine,
  (entry) => {
    if (formDirty.value) return;
    syncingForm.value = true;
    mood.value = entry?.mood ?? "";
    note.value = entry?.note ?? "";
    visibleToPartner.value = entry?.visibleToPartner ?? true;
    wantsResponse.value = entry?.wantsResponse ?? false;
    syncingForm.value = false;
  },
  { immediate: true },
);

watch(
  visibleToPartner,
  (visible) => {
    if (syncingForm.value) return;
    formDirty.value = true;
    if (!visible) wantsResponse.value = false;
  },
  { flush: "sync" },
);

watch(
  partner,
  (entry) => {
    if (!entry || replyDirty.value) return;
    reply.value = `看到你今天是「${entry.mood}」，我在这里。`;
  },
  { immediate: true },
);

function moodMutationError(error: unknown, action: string) {
  if (
    error instanceof ApiClientError &&
    (error.code === "STATE_CONFLICT" || error.code === "PRECONDITION_REQUIRED")
  ) {
    void moodsQuery.refetch();
    return `今日心情刚刚在另一处发生变化，已刷新服务端版本；请确认后重新${action}。`;
  }
  return error instanceof Error ? error.message : `今日心情没有${action}成功。`;
}

const saveMutation = useMutation({
  mutationFn: stageThreeApi.setMood,
  onSuccess: async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["moods"] }),
      queryClient.invalidateQueries({ queryKey: ["today"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    ]);
  },
});

const deleteMutation = useMutation({
  mutationFn: (version: number) => stageThreeApi.deleteMood(version),
  onSuccess: async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["moods"] }),
      queryClient.invalidateQueries({ queryKey: ["today"] }),
    ]);
  },
});

const replyMutation = useMutation({
  mutationFn: (content: string) =>
    stageThreeApi.createNote({
      type: "LOVE",
      content,
      color: "rose",
      icon: "🫶",
      keepAfterViewed: true,
      publish: true,
    }),
  onSuccess: async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notes"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      queryClient.invalidateQueries({ queryKey: ["today"] }),
    ]);
  },
});

function chooseMood(value: string) {
  mood.value = value;
  formDirty.value = true;
  actionError.value = null;
}

async function saveMood() {
  if (saveMutation.isPending.value) return;
  if (!mood.value.trim()) {
    actionError.value = "请选择或写下一个主心情。";
    return;
  }
  actionError.value = null;
  actionMessage.value = null;
  try {
    await saveMutation.mutateAsync({
      mood: mood.value.trim(),
      note: note.value.trim() || null,
      visibleToPartner: visibleToPartner.value,
      wantsResponse: visibleToPartner.value && wantsResponse.value,
      ...(mine.value ? { version: mine.value.version } : {}),
    });
    formDirty.value = false;
    actionMessage.value = visibleToPartner.value
      ? wantsResponse.value
        ? "今日心情已保存，也会让对方知道你希望得到回应。"
        : "今日心情已保存并向对方公开。"
      : "今日心情已私密保存，只有你能看到。";
  } catch (error) {
    actionError.value = moodMutationError(error, "保存");
  }
}

async function deleteMood() {
  if (!mine.value || deleteMutation.isPending.value) return;
  if (!window.confirm("确定删除今天的心情记录吗？")) return;
  actionError.value = null;
  actionMessage.value = null;
  try {
    await deleteMutation.mutateAsync(mine.value.version);
    mood.value = "";
    note.value = "";
    visibleToPartner.value = true;
    wantsResponse.value = false;
    formDirty.value = false;
    actionMessage.value = "今天的心情记录已删除。";
  } catch (error) {
    actionError.value = moodMutationError(error, "删除");
  }
}

async function sendReply() {
  if (!partner.value || replyMutation.isPending.value) return;
  const content = reply.value.trim();
  if (!content) {
    actionError.value = "写下一句回应后再发送。";
    return;
  }
  actionError.value = null;
  actionMessage.value = null;
  try {
    await replyMutation.mutateAsync(content);
    replyDirty.value = false;
    reply.value = `看到你今天是「${partner.value.mood}」，我在这里。`;
    actionMessage.value = "回应已作为一张便利贴送给对方。";
  } catch (error) {
    actionError.value = moodMutationError(error, "回应");
  }
}
</script>

<template>
  <section aria-labelledby="mood-heading">
    <div class="grid gap-4 xl:grid-cols-[1.12fr_0.88fr]">
      <SurfaceCard>
        <div class="flex items-center justify-between gap-4">
          <SectionHeading
            id="mood-heading"
            title="今日心情"
            description="只记录感受，不打分，也不比较谁更快乐。"
          />
          <Sparkles class="size-5 shrink-0 text-memory-500" />
        </div>

        <AsyncState
          v-if="moodsQuery.isPending.value"
          class="mt-5"
          state="loading"
          title="正在打开今天的心情…"
        />
        <AsyncState
          v-else-if="moodsQuery.isError.value"
          class="mt-5"
          state="error"
          title="今日心情没有顺利打开"
          :message="moodsError"
          action-label="重新加载"
          @action="moodsQuery.refetch()"
        />

        <form v-else class="mt-5 space-y-5" @submit.prevent="saveMood">
          <fieldset>
            <legend class="field-label">一个主心情</legend>
            <div class="grid grid-cols-3 gap-2 sm:grid-cols-6">
              <button
                v-for="option in MOOD_OPTIONS"
                :key="option.value"
                type="button"
                class="flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border text-xs font-semibold transition motion-reduce:transition-none"
                :class="
                  mood === option.value
                    ? 'border-present-300 bg-present-50 text-present-800 ring-2 ring-present-100 dark:border-present-700 dark:bg-present-950/35 dark:text-present-200 dark:ring-present-900/40'
                    : 'border-ink-200/80 bg-white/55 text-ink-500 hover:border-ink-300 dark:border-white/10 dark:bg-white/[0.03] dark:text-ink-400 dark:hover:border-white/20'
                "
                @click="chooseMood(option.value)"
              >
                <span class="text-xl">{{ option.emoji }}</span>
                {{ option.value }}
              </button>
            </div>
          </fieldset>

          <label class="block">
            <span class="field-label">或者写下自己的词</span>
            <input
              v-model="mood"
              maxlength="80"
              class="field-input"
              placeholder="例如：有点复杂，但还算平静"
              @input="formDirty = true"
            />
          </label>
          <label class="block">
            <span class="field-label"
              >一句说明 <span class="font-normal text-ink-400">可选</span></span
            >
            <textarea
              v-model="note"
              rows="3"
              maxlength="500"
              class="field-input resize-y"
              placeholder="不必解释得很完整，只写你愿意留下的部分。"
              @input="formDirty = true"
            />
            <span class="mt-1 block text-right text-xs text-ink-400"
              >{{ note.length }}/500</span
            >
          </label>

          <div class="grid gap-3 sm:grid-cols-2">
            <label
              class="flex min-h-12 items-center gap-3 rounded-2xl border border-ink-200/80 bg-white/55 px-4 py-3 text-sm text-ink-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-ink-200"
            >
              <input
                v-model="visibleToPartner"
                type="checkbox"
                class="size-4 accent-present-600"
              />
              <Eye v-if="visibleToPartner" class="size-4 text-ink-400" />
              <EyeOff v-else class="size-4 text-ink-400" />
              {{ visibleToPartner ? "向对方公开" : "只有我可见" }}
            </label>
            <label
              class="flex min-h-12 items-center gap-3 rounded-2xl border border-ink-200/80 bg-white/55 px-4 py-3 text-sm text-ink-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-ink-200"
              :class="!visibleToPartner ? 'opacity-50' : ''"
            >
              <input
                v-model="wantsResponse"
                type="checkbox"
                class="size-4 accent-present-600"
                :disabled="!visibleToPartner"
                @change="formDirty = true"
              />
              <MessageCircleHeart class="size-4 text-ink-400" />
              希望得到回应
            </label>
          </div>
          <p class="text-xs leading-5 text-ink-400">
            隐藏时，对方无法区分“未记录”和“私密记录”，也不会收到具体内容通知。
          </p>

          <div
            v-if="actionError || actionMessage"
            class="rounded-2xl px-4 py-3 text-sm leading-6"
            :class="
              actionError
                ? 'border border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200'
                : 'border border-present-200 bg-present-50 text-present-800 dark:border-present-900/55 dark:bg-present-950/30 dark:text-present-200'
            "
            :role="actionError ? 'alert' : 'status'"
          >
            {{ actionError || actionMessage }}
          </div>

          <div
            class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"
          >
            <BaseButton
              v-if="mine"
              variant="ghost"
              :loading="deleteMutation.isPending.value"
              @click="deleteMood"
            >
              <Trash2 class="size-4" />删除今日记录
            </BaseButton>
            <span v-else />
            <BaseButton type="submit" :loading="saveMutation.isPending.value">
              保存今日心情
            </BaseButton>
          </div>
        </form>
      </SurfaceCard>

      <SurfaceCard tone="present" class="flex flex-col">
        <div class="flex items-start justify-between gap-3">
          <span
            class="grid size-11 place-items-center rounded-2xl bg-present-100 text-present-700 dark:bg-present-900/45 dark:text-present-200"
          >
            <HeartHandshake class="size-5" />
          </span>
          <span
            v-if="partner?.wantsResponse"
            class="rounded-full bg-present-100 px-3 py-1.5 text-xs font-semibold text-present-800 dark:bg-present-900/45 dark:text-present-200"
          >
            希望得到回应
          </span>
        </div>

        <template v-if="moodsQuery.isPending.value">
          <p class="mt-5 text-sm text-ink-400">正在看看对方有没有公开心情…</p>
        </template>
        <template v-else-if="moodsQuery.isError.value">
          <p class="mt-5 text-sm leading-6 text-ink-500 dark:text-ink-400">
            对方的心情暂时也无法读取，重新加载后会一起恢复。
          </p>
        </template>
        <template v-else-if="partner">
          <p class="eyebrow mt-5">{{ partnerName }}的今日心情</p>
          <h3
            class="mt-2 font-display text-2xl font-semibold text-ink-950 dark:text-white"
          >
            {{ partner.mood }}
          </h3>
          <p
            v-if="partner.note"
            class="mt-3 whitespace-pre-wrap text-sm leading-7 text-ink-700 dark:text-ink-200"
          >
            {{ partner.note }}
          </p>

          <div class="mt-auto pt-6">
            <label class="block">
              <span class="field-label">留一句回应</span>
              <textarea
                v-model="reply"
                rows="3"
                maxlength="4000"
                class="field-input resize-y bg-white/75 dark:bg-ink-950/45"
                placeholder="告诉对方你看到了，也可以只是说“我在”。"
                @input="replyDirty = true"
              />
            </label>
            <p class="mt-2 text-xs leading-5 text-ink-400">
              回应会作为一张普通便利贴送达，不会公开给其他地方。
            </p>
            <BaseButton
              class="mt-4"
              block
              :loading="replyMutation.isPending.value"
              @click="sendReply"
            >
              <Send class="size-4" />发送回应
            </BaseButton>
          </div>
        </template>
        <template v-else>
          <p class="eyebrow mt-5">对方的今日心情</p>
          <h3
            class="mt-2 font-display text-xl font-semibold text-ink-950 dark:text-white"
          >
            今天还没有公开心情
          </h3>
          <p class="mt-3 text-sm leading-6 text-ink-500 dark:text-ink-400">
            这里不会透露对方是尚未记录，还是选择了只对自己可见。
          </p>
        </template>
      </SurfaceCard>
    </div>
  </section>
</template>
