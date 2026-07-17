<script setup lang="ts">
import type {
  CalmLetterPurpose,
  CalmLetterStatus,
} from "@our-tomorrow/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import {
  Clock3,
  Eye,
  LockKeyhole,
  Mail,
  RefreshCw,
  Send,
} from "lucide-vue-next";
import { computed, ref } from "vue";

import { formatInstant } from "@/features/daily/daily-utils";
import { ApiClientError } from "@/shared/api/client";
import { stageSixApi } from "@/shared/api/stage-six";
import AsyncState from "@/shared/components/AsyncState.vue";
import BaseButton from "@/shared/components/BaseButton.vue";
import SectionHeading from "@/shared/components/SectionHeading.vue";
import SurfaceCard from "@/shared/components/SurfaceCard.vue";
import { useIdentityStore } from "@/shared/stores/identity";

const identity = useIdentityStore();
const queryClient = useQueryClient();
const purpose = ref<CalmLetterPurpose>("BE_HEARD");
const content = ref("");
const delayMinutes = ref(30);
const selectedId = ref<string | null>(null);
const actionError = ref<string | null>(null);
const actionMessage = ref<string | null>(null);

const purposeOptions: Array<{
  value: CalmLetterPurpose;
  label: string;
  description: string;
}> = [
  { value: "BE_HEARD", label: "希望被听见", description: "先完整说完感受" },
  {
    value: "DISCUSS_LATER",
    label: "晚点再讨论",
    description: "留到彼此都平静时",
  },
  {
    value: "SOLVE_TOGETHER",
    label: "想一起解决",
    description: "把问题放在我们对面",
  },
  { value: "NEED_SPACE", label: "需要一点空间", description: "说明暂时停一下" },
  {
    value: "READY_TO_OPEN",
    label: "已经准备好聊",
    description: "现在就可以打开",
  },
];

const delayOptions = [
  { value: 0, label: "现在可以打开" },
  { value: 30, label: "30 分钟后" },
  { value: 120, label: "2 小时后" },
  { value: 720, label: "12 小时后" },
  { value: 1_440, label: "明天此刻" },
];

const statusLabels: Record<CalmLetterStatus, string> = {
  LOCKED: "安静保管中",
  AVAILABLE: "可以打开",
  OPENED: "已经打开",
  ARCHIVED: "已收好",
};

const timezone = computed(() => identity.couple?.timezone ?? "Asia/Shanghai");
const lettersQuery = useQuery({
  queryKey: computed(() => ["calm-letters", identity.role]),
  queryFn: stageSixApi.calmLetters,
  enabled: computed(() => Boolean(identity.role)),
});

const selectedSummary = computed(
  () =>
    lettersQuery.data.value?.find((letter) => letter.id === selectedId.value) ??
    null,
);

const detailQuery = useQuery({
  queryKey: computed(() => ["calm-letter", identity.role, selectedId.value]),
  queryFn: () => stageSixApi.calmLetter(selectedId.value as string),
  enabled: computed(() => Boolean(identity.role && selectedId.value)),
});

const readableContent = computed(() => {
  const detail = detailQuery.data.value;
  return detail && "content" in detail ? detail.content : null;
});

const createMutation = useMutation({
  mutationFn: stageSixApi.createCalmLetter,
});

const openMutation = useMutation({
  mutationFn: ({ id, version }: { id: string; version: number }) =>
    stageSixApi.openCalmLetter(id, { version }),
});

async function refreshRelated() {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["calm-letters"] }),
    queryClient.invalidateQueries({ queryKey: ["calm-letter"] }),
    queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    queryClient.invalidateQueries({ queryKey: ["today"] }),
  ]);
}

function mutationMessage(error: unknown, action: string) {
  if (
    error instanceof ApiClientError &&
    ["STATE_CONFLICT", "CONTENT_LOCKED"].includes(error.code)
  ) {
    void refreshRelated();
    return error.code === "CONTENT_LOCKED"
      ? "还没到约定的时间，这封信依然锁着。"
      : `信件状态刚刚改变，已刷新后请再${action}。`;
  }
  return error instanceof Error ? error.message : `这封信没有${action}成功。`;
}

async function createLetter() {
  if (createMutation.isPending.value) return;
  const body = content.value.trim();
  if (!body) {
    actionError.value = "写下一点想被听见的话，再把它放进信箱。";
    return;
  }
  actionError.value = null;
  actionMessage.value = null;
  const unlockAt =
    delayMinutes.value === 0
      ? null
      : new Date(Date.now() + delayMinutes.value * 60_000).toISOString();
  try {
    const created = await createMutation.mutateAsync({
      purpose: purpose.value,
      content: body,
      unlockAt,
    });
    content.value = "";
    selectedId.value = created.id;
    actionMessage.value =
      created.status === "LOCKED"
        ? "信已经安静收好，到时间前对方读不到正文。"
        : "信已经送达；对方仍需亲自点开，正文才会出现。";
    await refreshRelated();
  } catch (error) {
    actionError.value = mutationMessage(error, "送出");
  }
}

async function openSelected() {
  const letter = selectedSummary.value;
  if (!letter || !letter.canOpen || openMutation.isPending.value) return;
  actionError.value = null;
  actionMessage.value = null;
  try {
    await openMutation.mutateAsync({ id: letter.id, version: letter.version });
    actionMessage.value = "你已经主动打开这封信。";
    await refreshRelated();
  } catch (error) {
    actionError.value = mutationMessage(error, "打开");
  }
}

function selectLetter(id: string) {
  selectedId.value = id;
  actionError.value = null;
  actionMessage.value = null;
}
</script>

<template>
  <section aria-labelledby="calm-letter-heading">
    <SurfaceCard tone="future">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <SectionHeading
          id="calm-letter-heading"
          title="冷静信箱"
          description="把需要时间的话先温柔收好。到期只代表可以打开，正文仍要收件人亲自确认。"
        />
        <span
          class="inline-flex items-center gap-2 rounded-full bg-future-100 px-3 py-1.5 text-xs font-semibold text-future-800 dark:bg-future-900/45 dark:text-future-200"
        >
          <LockKeyhole class="size-3.5" />按时开启
        </span>
      </div>

      <div
        v-if="actionError || actionMessage"
        class="mt-5 rounded-2xl px-4 py-3 text-sm leading-6"
        :class="
          actionError
            ? 'border border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200'
            : 'border border-future-200 bg-future-50 text-future-800 dark:border-future-900/55 dark:bg-future-950/30 dark:text-future-200'
        "
        :role="actionError ? 'alert' : 'status'"
      >
        {{ actionError || actionMessage }}
      </div>

      <div class="mt-6 grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
        <form
          class="rounded-3xl border border-white/80 bg-white/65 p-5 dark:border-white/10 dark:bg-white/[0.04]"
          @submit.prevent="createLetter"
        >
          <div class="flex items-center gap-3">
            <span
              class="grid size-10 place-items-center rounded-2xl bg-future-100 text-future-700 dark:bg-future-900/45 dark:text-future-200"
            >
              <Mail class="size-4" />
            </span>
            <div>
              <p class="font-semibold text-ink-900 dark:text-white">
                写一封先不急着回答的信
              </p>
              <p class="mt-1 text-xs text-ink-400">
                离开页面前记得写完，草稿不会自动保存。
              </p>
            </div>
          </div>

          <div
            class="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2"
          >
            <label class="block">
              <span class="field-label">这封信希望</span>
              <select v-model="purpose" class="field-input py-3">
                <option
                  v-for="option in purposeOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }} · {{ option.description }}
                </option>
              </select>
            </label>
            <label class="block">
              <span class="field-label">什么时候可打开</span>
              <select v-model.number="delayMinutes" class="field-input py-3">
                <option
                  v-for="option in delayOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>
          </div>

          <label class="mt-4 block">
            <span class="field-label">想说的话</span>
            <textarea
              v-model="content"
              rows="7"
              maxlength="20000"
              class="field-input resize-y bg-white/85 dark:bg-ink-950/55"
              placeholder="只写你真正想表达的部分，不必马上找到答案…"
            />
            <span class="mt-1 block text-right text-xs text-ink-400">
              {{ content.length }}/20000
            </span>
          </label>

          <BaseButton
            type="submit"
            class="mt-4"
            :loading="createMutation.isPending.value"
          >
            <Send class="size-4" />放进冷静信箱
          </BaseButton>
        </form>

        <div
          class="rounded-3xl border border-white/80 bg-white/65 p-5 dark:border-white/10 dark:bg-white/[0.04]"
        >
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="font-semibold text-ink-900 dark:text-white">
                两个人的信箱
              </p>
              <p class="mt-1 text-xs text-ink-400">
                列表永远只有时间与状态，不携带正文。
              </p>
            </div>
            <BaseButton
              size="sm"
              variant="ghost"
              :loading="lettersQuery.isFetching.value"
              @click="lettersQuery.refetch()"
            >
              <RefreshCw class="size-4" />刷新
            </BaseButton>
          </div>

          <AsyncState
            v-if="lettersQuery.isPending.value"
            class="mt-5"
            state="loading"
            title="正在查看信箱…"
          />
          <AsyncState
            v-else-if="lettersQuery.isError.value"
            class="mt-5"
            state="error"
            title="信箱暂时没有打开"
            :message="
              lettersQuery.error.value instanceof Error
                ? lettersQuery.error.value.message
                : '请稍后再试。'
            "
            action-label="重新加载"
            @action="lettersQuery.refetch()"
          />

          <div
            v-else-if="!lettersQuery.data.value?.length"
            class="mt-5 rounded-2xl border border-dashed border-ink-200 p-6 text-center text-sm text-ink-400 dark:border-white/10"
          >
            这里还没有信。需要一点时间的话，可以从左边开始写。
          </div>

          <div v-else class="mt-5 grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
            <div
              class="max-h-80 space-y-2 overflow-y-auto pr-1"
              role="group"
              aria-label="冷静信列表"
            >
              <button
                v-for="letter in lettersQuery.data.value"
                :key="letter.id"
                type="button"
                class="w-full rounded-2xl border p-3 text-left transition motion-reduce:transition-none"
                :class="
                  selectedId === letter.id
                    ? 'border-future-300 bg-future-50 dark:border-future-700 dark:bg-future-950/35'
                    : 'border-ink-200/80 bg-white/60 hover:border-ink-300 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20'
                "
                :aria-pressed="selectedId === letter.id"
                :aria-label="`${letter.direction === 'SENT' ? '我写的' : '写给我的'}，${statusLabels[letter.status]}，${formatInstant(letter.unlockAt || letter.sentAt, timezone)}`"
                @click="selectLetter(letter.id)"
              >
                <div class="flex items-start justify-between gap-2">
                  <span
                    class="text-xs font-semibold text-ink-800 dark:text-ink-200"
                  >
                    {{ letter.direction === "SENT" ? "我写的" : "写给我的" }}
                  </span>
                  <span class="text-[11px] text-ink-400">
                    {{ statusLabels[letter.status] }}
                  </span>
                </div>
                <p class="mt-2 flex items-center gap-1.5 text-xs text-ink-400">
                  <Clock3 class="size-3.5" />
                  {{
                    formatInstant(letter.unlockAt || letter.sentAt, timezone)
                  }}
                </p>
              </button>
            </div>

            <div
              class="min-h-56 rounded-2xl bg-ink-50/75 p-4 dark:bg-ink-950/45"
            >
              <p v-if="!selectedSummary" class="text-sm text-ink-400">
                选择一封信，看看它到了哪一个阶段。
              </p>
              <template v-else>
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p
                      class="text-xs font-semibold text-future-700 dark:text-future-200"
                    >
                      {{
                        selectedSummary.direction === "SENT"
                          ? "我写给对方"
                          : "对方写给我"
                      }}
                    </p>
                    <p
                      class="mt-1 text-sm font-semibold text-ink-900 dark:text-white"
                    >
                      {{ statusLabels[selectedSummary.status] }}
                    </p>
                  </div>
                  <LockKeyhole
                    v-if="!selectedSummary.bodyAvailable"
                    class="size-4 text-ink-400"
                  />
                  <Eye v-else class="size-4 text-future-600" />
                </div>

                <AsyncState
                  v-if="detailQuery.isPending.value"
                  class="mt-4"
                  state="loading"
                  title="正在打开这封信…"
                />
                <p
                  v-else-if="detailQuery.isError.value"
                  class="mt-4 text-sm leading-6 text-red-600 dark:text-red-300"
                  role="alert"
                >
                  {{
                    detailQuery.error.value instanceof Error
                      ? detailQuery.error.value.message
                      : "详情暂时没有打开。"
                  }}
                </p>
                <p
                  v-else-if="readableContent !== null"
                  class="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-ink-700 dark:text-ink-200"
                >
                  {{ readableContent }}
                </p>
                <div v-else class="mt-4 text-sm leading-6 text-ink-400">
                  <p v-if="selectedSummary.status === 'LOCKED'">
                    这封信还在安静等候，到了约定时间才会出现。
                  </p>
                  <p v-else-if="selectedSummary.canOpen">
                    时间已经到了，亲自点开后就能读到正文。
                  </p>
                  <p v-else>这封信暂时没有可以打开的正文。</p>
                </div>

                <BaseButton
                  v-if="selectedSummary.canOpen"
                  size="sm"
                  class="mt-4"
                  :loading="openMutation.isPending.value"
                  @click="openSelected"
                >
                  <Eye class="size-4" />我准备好打开了
                </BaseButton>
              </template>
            </div>
          </div>
        </div>
      </div>
    </SurfaceCard>
  </section>
</template>
