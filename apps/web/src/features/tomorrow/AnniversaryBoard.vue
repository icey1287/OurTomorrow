<script setup lang="ts">
import type {
  AnniversaryDetail,
  AnniversarySummary,
  MediaAssetSummary,
} from "@our-tomorrow/contracts";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import {
  Bell,
  CalendarDays,
  Edit3,
  History,
  Plus,
  Trash2,
} from "lucide-vue-next";
import { computed, reactive, ref, watch } from "vue";

import PrivateMediaImage from "@/features/remember/PrivateMediaImage.vue";
import AnniversaryEditor, {
  type AnniversaryEditorSubmission,
} from "@/features/tomorrow/AnniversaryEditor.vue";
import TomorrowNotice from "@/features/tomorrow/TomorrowNotice.vue";
import TomorrowPanel from "@/features/tomorrow/TomorrowPanel.vue";
import {
  anniversaryTypeLabel,
  countdownLabel,
  formatInstant,
  formatLocalDate,
  formatMinuteOfDay,
  parseMinuteOfDay,
  roleIsCurrent,
} from "@/features/tomorrow/tomorrow-utils";
import { ApiClientError } from "@/shared/api/client";
import { stageFourApi } from "@/shared/api/stage-four";
import { stageTwoApi } from "@/shared/api/stage-two";
import AsyncState from "@/shared/components/AsyncState.vue";
import BaseButton from "@/shared/components/BaseButton.vue";
import SectionHeading from "@/shared/components/SectionHeading.vue";
import { useIdentityStore } from "@/shared/stores/identity";

const props = defineProps<{ requestCreate: boolean }>();
const emit = defineEmits<{ createConsumed: [] }>();

const identity = useIdentityStore();
const queryClient = useQueryClient();
const selectedId = ref<string | null>(null);
const editorOpen = ref(false);
const editing = ref<AnniversarySummary | null>(null);
const editorPending = ref(false);
const editorError = ref<string | null>(null);
const actionPending = ref<string | null>(null);
const actionError = ref<string | null>(null);
const notice = ref<string | null>(null);
const reminder = reactive({ daysBefore: 7, time: "09:00" });

watch(
  () => props.requestCreate,
  (requested) => {
    if (!requested) return;
    openCreate();
    emit("createConsumed");
  },
  { immediate: true },
);

watch(
  () => identity.role,
  () => {
    selectedId.value = null;
    editorOpen.value = false;
    editing.value = null;
    editorError.value = null;
    actionError.value = null;
    notice.value = null;
  },
);

const anniversariesQuery = useQuery({
  queryKey: computed(() => ["anniversaries", identity.role]),
  queryFn: stageFourApi.anniversaries,
  enabled: computed(() => Boolean(identity.role)),
});
const detailQuery = useQuery({
  queryKey: computed(() => ["anniversary", identity.role, selectedId.value]),
  queryFn: () => stageFourApi.anniversary(selectedId.value!),
  enabled: computed(() => Boolean(identity.role && selectedId.value)),
});
const occurrencesQuery = useQuery({
  queryKey: computed(() => [
    "anniversary-occurrences",
    identity.role,
    selectedId.value,
  ]),
  queryFn: () => stageFourApi.anniversaryOccurrences(selectedId.value!),
  enabled: computed(() => Boolean(identity.role && selectedId.value)),
});

const anniversaries = computed(() => anniversariesQuery.data.value ?? []);
const selected = computed(() => detailQuery.data.value ?? null);
const timezone = computed(() => identity.couple?.timezone ?? "Asia/Shanghai");
const listError = computed(() => {
  const error = anniversariesQuery.error.value;
  return error instanceof Error
    ? error.message
    : "重要日子暂时没有打开，请稍后再试。";
});

function isCurrent(role: "boy" | "girl") {
  return roleIsCurrent(role, identity.role);
}

function openCreate() {
  editing.value = null;
  editorOpen.value = true;
  editorError.value = null;
}

function openEdit() {
  if (!selected.value) return;
  editing.value = selected.value;
  editorOpen.value = true;
  editorError.value = null;
}

function closeEditor() {
  if (editorPending.value) return;
  editorOpen.value = false;
  editing.value = null;
  editorError.value = null;
}

function actionMessage(error: unknown, action: string) {
  if (
    error instanceof ApiClientError &&
    ["STATE_CONFLICT", "PRECONDITION_REQUIRED"].includes(error.code)
  ) {
    void detailQuery.refetch();
    void anniversariesQuery.refetch();
    return `这个日子刚刚在另一处变化，已刷新最新内容；请确认后再${action}。`;
  }
  return error instanceof Error ? error.message : `这个日子没有${action}成功。`;
}

async function refreshAnniversaries(role: "boy" | "girl") {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["anniversaries", role] }),
    queryClient.invalidateQueries({ queryKey: ["anniversary", role] }),
    queryClient.invalidateQueries({
      queryKey: ["anniversary-occurrences", role],
    }),
    queryClient.invalidateQueries({ queryKey: ["plans", role] }),
    queryClient.invalidateQueries({ queryKey: ["capsules", role] }),
    queryClient.invalidateQueries({ queryKey: ["upcoming", role] }),
    queryClient.invalidateQueries({ queryKey: ["today", role] }),
    queryClient.invalidateQueries({ queryKey: ["notifications", role] }),
  ]);
}

async function uploadBackground(file: File, role: "boy" | "girl") {
  if (!isCurrent(role)) return null;
  const intent = await stageTwoApi.createUploadIntent({
    originalName: file.name,
    mimeType: file.type as "image/jpeg" | "image/png" | "image/webp",
    size: file.size,
  });
  if (!isCurrent(role)) return null;
  await stageTwoApi.uploadBinary(intent.uploadUrl, file, file.type);
  if (!isCurrent(role)) return null;
  const asset = await stageTwoApi.completeUpload(intent.uploadId);
  return isCurrent(role) ? asset : null;
}

async function saveAnniversary(submission: AnniversaryEditorSubmission) {
  if (editorPending.value) return;
  const startRole = identity.role;
  if (!startRole) return;
  editorPending.value = true;
  editorError.value = null;
  let uploaded: MediaAssetSummary | null = null;
  let domainSaved = false;
  try {
    if (submission.backgroundFile) {
      uploaded = await uploadBackground(submission.backgroundFile, startRole);
      if (!uploaded || !isCurrent(startRole)) return;
    }
    let saved: AnniversarySummary;
    if (submission.mode === "create") {
      saved = await stageFourApi.createAnniversary(
        uploaded
          ? { ...submission.input, backgroundMediaId: uploaded.id }
          : submission.input,
      );
    } else {
      saved = await stageFourApi.updateAnniversary(
        submission.id,
        uploaded
          ? { ...submission.input, backgroundMediaId: uploaded.id }
          : submission.input,
      );
    }
    domainSaved = true;
    if (!isCurrent(startRole)) return;
    queryClient.setQueryData(["anniversary", startRole, saved.id], saved);
    selectedId.value = saved.id;
    editorOpen.value = false;
    editing.value = null;
    notice.value =
      submission.mode === "create"
        ? "重要日子已经加入倒数。"
        : "重要日子已经更新。";
    await refreshAnniversaries(startRole);
  } catch (error) {
    if (!isCurrent(startRole)) return;
    const outcomeUnknown =
      error instanceof ApiClientError &&
      (error.code === "NETWORK_ERROR" || error.status >= 500);
    if (uploaded && !domainSaved && !outcomeUnknown)
      await Promise.allSettled([stageTwoApi.deleteMedia(uploaded.id)]);
    editorError.value = actionMessage(error, "保存");
  } finally {
    editorPending.value = false;
  }
}

async function addReminder() {
  const anniversary = selected.value;
  const startRole = identity.role;
  const minuteOfDay = parseMinuteOfDay(reminder.time);
  if (!anniversary || !startRole || actionPending.value) return;
  if (
    !Number.isInteger(reminder.daysBefore) ||
    reminder.daysBefore < 0 ||
    reminder.daysBefore > 3650
  ) {
    actionError.value = "提前天数需要是 0 到 3650 之间的整数。";
    return;
  }
  if (minuteOfDay === null) {
    actionError.value = "请选择有效的提醒时间。";
    return;
  }
  actionPending.value = "reminder";
  actionError.value = null;
  try {
    await stageFourApi.createAnniversaryReminder(anniversary.id, {
      daysBefore: reminder.daysBefore,
      minuteOfDay,
      enabled: true,
    });
    if (!isCurrent(startRole)) return;
    notice.value = "提醒规则已经添加。";
    await refreshAnniversaries(startRole);
  } catch (error) {
    if (!isCurrent(startRole)) return;
    actionError.value = actionMessage(error, "添加提醒");
  } finally {
    actionPending.value = null;
  }
}

async function removeReminder(reminderId: string) {
  const anniversary = selected.value;
  const startRole = identity.role;
  if (!anniversary || !startRole || actionPending.value) return;
  actionPending.value = `reminder-${reminderId}`;
  actionError.value = null;
  try {
    await stageFourApi.deleteAnniversaryReminder(anniversary.id, reminderId);
    if (!isCurrent(startRole)) return;
    notice.value = "提醒规则已经移除。";
    await refreshAnniversaries(startRole);
  } catch (error) {
    if (!isCurrent(startRole)) return;
    actionError.value = actionMessage(error, "移除提醒");
  } finally {
    actionPending.value = null;
  }
}

async function deleteAnniversary() {
  const anniversary = selected.value;
  const startRole = identity.role;
  if (
    !anniversary ||
    !startRole ||
    actionPending.value ||
    !window.confirm("把这个重要日子移入回收站吗？")
  ) {
    return;
  }
  actionPending.value = "delete";
  actionError.value = null;
  try {
    await stageFourApi.deleteAnniversary(anniversary.id, anniversary.version);
    if (!isCurrent(startRole)) return;
    selectedId.value = null;
    notice.value = "重要日子已移入回收站。";
    await refreshAnniversaries(startRole);
  } catch (error) {
    if (!isCurrent(startRole)) return;
    actionError.value = actionMessage(error, "删除");
  } finally {
    actionPending.value = null;
  }
}
</script>

<template>
  <section aria-labelledby="anniversary-board-heading">
    <SectionHeading
      title="重要日子"
      description="倒数、每年重复、提前提醒，以及与往年回忆和今年计划的连接。"
    >
      <BaseButton size="sm" variant="secondary" @click="openCreate">
        <Plus class="size-4" />添加日子
      </BaseButton>
    </SectionHeading>

    <TomorrowNotice class="mt-4" :message="notice" @close="notice = null" />

    <AsyncState
      v-if="anniversariesQuery.isPending.value"
      class="mt-4"
      state="loading"
      title="正在计算最近的重要日子…"
    />
    <AsyncState
      v-else-if="anniversariesQuery.isError.value"
      class="mt-4"
      state="error"
      title="重要日子没有顺利打开"
      :message="listError"
      action-label="重新加载"
      @action="anniversariesQuery.refetch()"
    />
    <AsyncState
      v-else-if="anniversaries.length === 0"
      class="mt-4"
      state="empty"
      title="为下一次值得期待的日子，留一个倒数。"
      message="日期按你们空间的时区计算，闰日也有明确规则。"
      action-label="添加第一个重要日子"
      @action="openCreate"
    />
    <div v-else class="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <button
        v-for="anniversary in anniversaries"
        :key="anniversary.id"
        type="button"
        class="surface-interactive relative min-h-60 overflow-hidden p-5 text-left"
        @click="selectedId = anniversary.id"
      >
        <div v-if="anniversary.backgroundMedia" class="absolute inset-0">
          <PrivateMediaImage
            :src="anniversary.backgroundMedia.thumbnailUrl"
            :alt="anniversary.backgroundMedia.originalName"
            image-class="size-full object-cover opacity-20"
            :retryable="false"
          />
        </div>
        <div
          class="absolute inset-0 bg-gradient-to-br from-future-50/95 via-white/80 to-white/65 dark:from-future-950/85 dark:via-ink-950/82 dark:to-ink-950/75"
        />
        <div class="relative flex min-h-52 flex-col justify-between">
          <div class="flex items-start justify-between gap-3">
            <span
              class="grid size-10 place-items-center rounded-2xl bg-white/80 text-future-700 shadow-sm dark:bg-white/[0.08] dark:text-future-200"
            >
              <CalendarDays class="size-4" />
            </span>
            <span
              class="rounded-full bg-white/70 px-3 py-1 text-[11px] font-semibold text-ink-500 dark:bg-white/[0.07] dark:text-ink-300"
            >
              {{ anniversaryTypeLabel(anniversary.type) }}
            </span>
          </div>
          <div>
            <p class="eyebrow text-future-700 dark:text-future-300">
              {{ countdownLabel(anniversary.daysUntil) }}
            </p>
            <h3
              class="mt-2 font-display text-2xl font-semibold text-ink-950 dark:text-white"
            >
              {{ anniversary.title }}
            </h3>
            <p class="mt-2 text-sm text-ink-500 dark:text-ink-400">
              {{
                formatLocalDate(
                  anniversary.nextOccurrenceLocalDate || anniversary.date,
                )
              }}
              · {{ anniversary.repeat === "YEARLY" ? "每年" : "仅一次" }}
            </p>
          </div>
        </div>
      </button>
    </div>

    <TomorrowPanel
      :open="Boolean(selectedId) && !editorOpen"
      eyebrow="Anniversary · 重要日子"
      :title="selected?.title || '打开重要日子'"
      wide
      @close="selectedId = null"
    >
      <AsyncState v-if="detailQuery.isPending.value" state="loading" />
      <AsyncState
        v-else-if="detailQuery.isError.value || !selected"
        state="error"
        title="这个日子没有顺利打开"
        :message="
          detailQuery.error.value instanceof Error
            ? detailQuery.error.value.message
            : '请稍后再试。'
        "
        action-label="重新加载"
        @action="detailQuery.refetch()"
      />
      <div v-else class="space-y-6">
        <div class="grid gap-4 sm:grid-cols-[0.8fr_1.2fr]">
          <div
            class="rounded-3xl bg-future-50 p-5 text-center dark:bg-future-950/30"
          >
            <p class="eyebrow text-future-700 dark:text-future-300">
              距离下一次
            </p>
            <p
              class="mt-3 font-display text-4xl font-semibold text-ink-950 dark:text-white"
            >
              {{ selected.daysUntil ?? "—" }}
            </p>
            <p class="mt-1 text-sm text-ink-500 dark:text-ink-400">
              {{ selected.daysUntil === null ? "不再重复" : "天" }}
            </p>
            <p class="mt-4 text-xs text-ink-400">
              服务端按 {{ timezone }} 计算
            </p>
          </div>
          <div
            class="rounded-3xl border border-ink-100 p-5 dark:border-white/10"
          >
            <p class="text-sm font-semibold text-ink-800 dark:text-ink-100">
              {{ anniversaryTypeLabel(selected.type) }}
            </p>
            <p class="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400">
              原始日期 {{ formatLocalDate(selected.date) }}；下一次
              {{ formatLocalDate(selected.nextOccurrenceLocalDate) }}。
            </p>
            <p class="mt-2 text-xs text-ink-400">
              绝对时间：{{ formatInstant(selected.nextOccurrenceAt, timezone) }}
            </p>
          </div>
        </div>

        <section aria-labelledby="anniversary-reminders-heading">
          <h3
            id="anniversary-reminders-heading"
            class="flex items-center gap-2 font-display text-lg font-semibold text-ink-950 dark:text-white"
          >
            <Bell class="size-4" />提前提醒
          </h3>
          <div v-if="selected.reminders.length" class="mt-3 space-y-2">
            <div
              v-for="item in selected.reminders"
              :key="item.id"
              class="flex items-center justify-between gap-3 rounded-2xl border border-ink-100 px-4 py-3 dark:border-white/10"
            >
              <div>
                <p class="text-sm font-semibold text-ink-800 dark:text-ink-100">
                  提前 {{ item.daysBefore }} 天 ·
                  {{ formatMinuteOfDay(item.minuteOfDay) }}
                </p>
                <p class="mt-1 text-xs text-ink-400">
                  下次：{{ formatInstant(item.nextRunAt, timezone) }}
                </p>
              </div>
              <BaseButton
                size="sm"
                variant="ghost"
                :loading="actionPending === `reminder-${item.id}`"
                @click="removeReminder(item.id)"
                >移除</BaseButton
              >
            </div>
          </div>
          <form
            class="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
            @submit.prevent="addReminder"
          >
            <label>
              <span class="field-label">提前天数</span>
              <input
                v-model.number="reminder.daysBefore"
                class="field-input"
                type="number"
                min="0"
                max="3650"
              />
            </label>
            <label>
              <span class="field-label">当天时间</span>
              <input v-model="reminder.time" class="field-input" type="time" />
            </label>
            <BaseButton
              class="self-end"
              type="submit"
              variant="secondary"
              :loading="actionPending === 'reminder'"
              >添加提醒</BaseButton
            >
          </form>
        </section>

        <section aria-labelledby="anniversary-occurrences-heading">
          <h3
            id="anniversary-occurrences-heading"
            class="flex items-center gap-2 font-display text-lg font-semibold text-ink-950 dark:text-white"
          >
            <History class="size-4" />往年与未来
          </h3>
          <AsyncState
            v-if="occurrencesQuery.isPending.value"
            class="mt-3"
            state="loading"
          />
          <AsyncState
            v-else-if="occurrencesQuery.isError.value"
            class="mt-3"
            state="error"
            title="发生记录没有顺利打开"
            action-label="重试"
            @action="occurrencesQuery.refetch()"
          />
          <div
            v-else-if="occurrencesQuery.data.value?.length"
            class="mt-3 space-y-3"
          >
            <div
              v-for="occurrence in occurrencesQuery.data.value"
              :key="occurrence.localDate"
              class="rounded-2xl border border-ink-100 p-4 dark:border-white/10"
            >
              <div class="flex items-center justify-between gap-3">
                <p class="font-semibold text-ink-800 dark:text-ink-100">
                  {{ formatLocalDate(occurrence.localDate) }}
                </p>
                <span class="text-xs text-ink-400">{{
                  countdownLabel(occurrence.daysUntil)
                }}</span>
              </div>
              <p class="mt-2 text-sm text-ink-500 dark:text-ink-400">
                {{ occurrence.memories.length }} 段回忆 ·
                {{
                  occurrence.plan
                    ? `计划：${occurrence.plan.title}`
                    : "暂无今年计划"
                }}
              </p>
            </div>
          </div>
          <p v-else class="mt-3 text-sm text-ink-400">
            还没有关联往年回忆或未来计划。
          </p>
        </section>

        <p
          v-if="actionError"
          class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200"
          role="alert"
        >
          {{ actionError }}
        </p>
        <div
          class="flex flex-wrap gap-2 border-t border-ink-100 pt-5 dark:border-white/10"
        >
          <BaseButton size="sm" variant="secondary" @click="openEdit"
            ><Edit3 class="size-4" />编辑</BaseButton
          >
          <BaseButton
            size="sm"
            variant="danger"
            :loading="actionPending === 'delete'"
            @click="deleteAnniversary"
            ><Trash2 class="size-4" />移入回收站</BaseButton
          >
        </div>
      </div>
    </TomorrowPanel>

    <TomorrowPanel
      :open="editorOpen"
      eyebrow="Anniversary · 重要日子"
      :title="editing ? '编辑重要日子' : '添加一个值得期待的日子'"
      @close="closeEditor"
    >
      <AnniversaryEditor
        :anniversary="editing"
        :pending="editorPending"
        :error="editorError"
        @submit="saveAnniversary"
      />
    </TomorrowPanel>
  </section>
</template>
