<script setup lang="ts">
import type {
  CapsuleDetail,
  ConvertCapsuleToMemoryRequest,
  MediaAssetSummary,
} from "@our-tomorrow/contracts";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import {
  CheckCircle2,
  Edit3,
  LockKeyhole,
  MailOpen,
  MoonStar,
  Plus,
  Sparkles,
  Trash2,
  UsersRound,
} from "lucide-vue-next";
import { computed, ref, watch } from "vue";

import PrivateMediaImage from "@/features/remember/PrivateMediaImage.vue";
import CapsuleEditor, {
  type CapsuleEditorSubmission,
} from "@/features/tomorrow/CapsuleEditor.vue";
import CapsuleMemoryEditor from "@/features/tomorrow/CapsuleMemoryEditor.vue";
import TomorrowNotice from "@/features/tomorrow/TomorrowNotice.vue";
import TomorrowPanel from "@/features/tomorrow/TomorrowPanel.vue";
import {
  capsuleAvailableActions,
  capsuleStatusLabel,
  capsuleTypeLabel,
  capsuleUnlockRuleLabel,
  formatInstant,
  operationKey,
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
const editorMode = ref<"draft" | "convert" | null>(null);
const editing = ref<CapsuleDetail | null>(null);
const editorPending = ref(false);
const editorError = ref<string | null>(null);
const actionPending = ref<string | null>(null);
const actionError = ref<string | null>(null);
const notice = ref<string | null>(null);

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
    editorMode.value = null;
    editing.value = null;
    editorError.value = null;
    actionError.value = null;
    notice.value = null;
  },
);

const capsulesQuery = useQuery({
  queryKey: computed(() => ["capsules", identity.role]),
  queryFn: stageFourApi.capsules,
  enabled: computed(() => Boolean(identity.role)),
});
const detailQuery = useQuery({
  queryKey: computed(() => ["capsule", identity.role, selectedId.value]),
  queryFn: () => stageFourApi.capsule(selectedId.value!),
  enabled: computed(() => Boolean(identity.role && selectedId.value)),
});
const anniversariesQuery = useQuery({
  queryKey: computed(() => ["anniversaries", identity.role]),
  queryFn: stageFourApi.anniversaries,
  enabled: computed(() => Boolean(identity.role)),
});
const wishesQuery = useQuery({
  queryKey: computed(() => ["wish-options", identity.role]),
  queryFn: () => stageFourApi.wishes({ limit: 50 }),
  enabled: computed(() => Boolean(identity.role)),
});
const placesQuery = useQuery({
  queryKey: computed(() => ["places", identity.role]),
  queryFn: stageTwoApi.places,
  enabled: computed(() => Boolean(identity.role)),
});

const capsules = computed(() => capsulesQuery.data.value ?? []);
const selected = computed(() => detailQuery.data.value ?? null);
const selectedActions = computed(() =>
  selected.value ? capsuleAvailableActions(selected.value) : [],
);
const timezone = computed(() => identity.couple?.timezone ?? "Asia/Shanghai");
const listError = computed(() => {
  const error = capsulesQuery.error.value;
  return error instanceof Error
    ? error.message
    : "时间胶囊暂时没有打开，请稍后再试。";
});

function isCurrent(role: "boy" | "girl") {
  return roleIsCurrent(role, identity.role);
}

function openCreate() {
  editing.value = null;
  editorMode.value = "draft";
  editorError.value = null;
}

function openEdit() {
  if (!selectedActions.value.includes("edit")) return;
  editing.value = selected.value;
  editorMode.value = "draft";
  editorError.value = null;
}

function openConvert() {
  if (
    !selectedActions.value.includes("convert") ||
    !selected.value?.bodyAvailable
  )
    return;
  editing.value = selected.value;
  editorMode.value = "convert";
  editorError.value = null;
}

function closeEditor() {
  if (editorPending.value) return;
  editorMode.value = null;
  editing.value = null;
  editorError.value = null;
}

function actionMessage(error: unknown, action: string) {
  if (
    error instanceof ApiClientError &&
    [
      "STATE_CONFLICT",
      "STATE_TRANSITION_INVALID",
      "CONTENT_LOCKED",
      "PRECONDITION_REQUIRED",
    ].includes(error.code)
  ) {
    void detailQuery.refetch();
    void capsulesQuery.refetch();
    return `胶囊状态刚刚发生变化，已重新读取服务端结果；请确认后再${action}。`;
  }
  return error instanceof Error ? error.message : `胶囊没有${action}成功。`;
}

async function refreshCapsules(role: "boy" | "girl") {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["capsules", role] }),
    queryClient.invalidateQueries({ queryKey: ["upcoming", role] }),
    queryClient.invalidateQueries({ queryKey: ["today", role] }),
    queryClient.invalidateQueries({ queryKey: ["notifications", role] }),
    queryClient.invalidateQueries({ queryKey: ["memories", role] }),
  ]);
}

async function uploadFiles(files: File[], role: "boy" | "girl") {
  const assets: MediaAssetSummary[] = [];
  for (const file of files) {
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
    if (!isCurrent(role)) return null;
    assets.push(asset);
  }
  return assets;
}

async function saveCapsule(submission: CapsuleEditorSubmission) {
  if (editorPending.value) return;
  const startRole = identity.role;
  if (!startRole) return;
  editorPending.value = true;
  editorError.value = null;
  let uploaded: MediaAssetSummary[] = [];
  let domainSaved = false;
  try {
    const result = await uploadFiles(submission.files, startRole);
    if (!result || !isCurrent(startRole)) return;
    uploaded = result;
    let saved: CapsuleDetail;
    if (submission.mode === "create") {
      saved = await stageFourApi.createCapsule({
        ...submission.input,
        mediaIds: uploaded.map((asset) => asset.id),
      });
    } else {
      const existing = submission.removeExistingMedia
        ? []
        : (editing.value?.media?.map((asset) => asset.id) ?? []);
      saved = await stageFourApi.updateCapsule(submission.id, {
        ...submission.input,
        ...(submission.files.length || submission.removeExistingMedia
          ? {
              mediaIds: [
                ...new Set([...existing, ...uploaded.map((asset) => asset.id)]),
              ],
            }
          : {}),
      });
    }
    domainSaved = true;
    if (!isCurrent(startRole)) return;
    queryClient.setQueryData(["capsule", startRole, saved.id], saved);
    selectedId.value = saved.id;
    editorMode.value = null;
    editing.value = null;
    notice.value =
      submission.mode === "create"
        ? "胶囊草稿已经创建。"
        : "胶囊草稿已经保存。";
    await refreshCapsules(startRole);
  } catch (error) {
    if (!isCurrent(startRole)) return;
    const outcomeUnknown =
      error instanceof ApiClientError &&
      (error.code === "NETWORK_ERROR" || error.status >= 500);
    if (uploaded.length && !domainSaved && !outcomeUnknown) {
      await Promise.allSettled(
        uploaded.map((asset) => stageTwoApi.deleteMedia(asset.id)),
      );
    }
    editorError.value = actionMessage(error, "保存");
  } finally {
    editorPending.value = false;
  }
}

async function convertCapsule(input: ConvertCapsuleToMemoryRequest) {
  const capsule = selected.value;
  const startRole = identity.role;
  if (
    !capsule ||
    !startRole ||
    editorPending.value ||
    !selectedActions.value.includes("convert")
  )
    return;
  editorPending.value = true;
  editorError.value = null;
  try {
    await stageFourApi.convertCapsuleToMemory(
      capsule.id,
      input,
      operationKey("capsule-to-memory"),
    );
    if (!isCurrent(startRole)) return;
    const refreshed = await stageFourApi.capsule(capsule.id);
    if (!isCurrent(startRole)) return;
    queryClient.setQueryData(["capsule", startRole, capsule.id], refreshed);
    editorMode.value = null;
    editing.value = null;
    notice.value = "打开过的胶囊已经进入记录。";
    await refreshCapsules(startRole);
  } catch (error) {
    if (!isCurrent(startRole)) return;
    editorError.value = actionMessage(error, "转换");
  } finally {
    editorPending.value = false;
  }
}

async function runAction(
  action: "seal" | "condition" | "confirm" | "open" | "delete",
) {
  const capsule = selected.value;
  const startRole = identity.role;
  if (!capsule || !startRole || actionPending.value) return;
  if (action === "delete" && !window.confirm("把这枚胶囊草稿移入回收站吗？")) {
    return;
  }
  actionPending.value = action;
  actionError.value = null;
  try {
    let saved: CapsuleDetail | null = null;
    const input = { version: capsule.version };
    if (action === "seal") {
      if (!selectedActions.value.includes("seal")) return;
      saved = await stageFourApi.sealCapsule(capsule.id, input);
    } else if (action === "condition") {
      if (
        capsule.unlockRule !== "MANUAL_CONDITION" ||
        !["SEALED", "LOCKED"].includes(capsule.status)
      )
        return;
      saved = await stageFourApi.markCapsuleConditionMet(capsule.id, input);
    } else if (action === "confirm") {
      if (!selectedActions.value.includes("confirm")) return;
      saved = await stageFourApi.confirmCapsuleOpen(capsule.id, input);
    } else if (action === "open") {
      if (!selectedActions.value.includes("open")) return;
      saved = await stageFourApi.openCapsule(capsule.id, input);
    } else {
      await stageFourApi.deleteCapsule(capsule.id, capsule.version);
    }
    if (!isCurrent(startRole)) return;
    if (saved)
      queryClient.setQueryData(["capsule", startRole, capsule.id], saved);
    else selectedId.value = null;
    notice.value =
      action === "seal"
        ? "胶囊已经封存，正文从现在起不可修改。"
        : action === "condition"
          ? "条件已交给服务器核对，胶囊状态已经更新。"
          : action === "confirm"
            ? "你的开启确认已经记录。"
            : action === "open"
              ? "胶囊已经由你明确打开。"
              : "胶囊草稿已移入回收站。";
    await refreshCapsules(startRole);
  } catch (error) {
    if (!isCurrent(startRole)) return;
    actionError.value = actionMessage(
      error,
      action === "delete" ? "删除" : "更新",
    );
  } finally {
    actionPending.value = null;
  }
}
</script>

<template>
  <section aria-labelledby="capsule-board-heading">
    <SectionHeading
      title="时间胶囊"
      description="封存前可以慢慢写；封存后只由服务端决定何时可以确认、打开和转换。"
    >
      <BaseButton size="sm" variant="secondary" @click="openCreate">
        <Plus class="size-4" />新胶囊
      </BaseButton>
    </SectionHeading>

    <TomorrowNotice class="mt-4" :message="notice" @close="notice = null" />

    <AsyncState
      v-if="capsulesQuery.isPending.value"
      class="mt-4"
      state="loading"
      title="正在查看时间胶囊…"
    />
    <AsyncState
      v-else-if="capsulesQuery.isError.value"
      class="mt-4"
      state="error"
      title="时间胶囊没有顺利打开"
      :message="listError"
      action-label="重新加载"
      @action="capsulesQuery.refetch()"
    />
    <AsyncState
      v-else-if="capsules.length === 0"
      class="mt-4"
      state="empty"
      title="把需要时间的话，先温柔收好。"
      message="未到开启条件时，API 不返回正文和附件信息。"
      action-label="写第一枚胶囊"
      @action="openCreate"
    />
    <div v-else class="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <button
        v-for="capsule in capsules"
        :key="capsule.id"
        type="button"
        class="surface-interactive min-h-56 p-5 text-left"
        @click="selectedId = capsule.id"
      >
        <div class="flex items-start justify-between gap-3">
          <span
            class="grid size-11 place-items-center rounded-2xl bg-ink-950 text-white dark:bg-white dark:text-ink-950"
          >
            <MoonStar class="size-5" />
          </span>
          <span
            class="rounded-full bg-ink-100 px-3 py-1 text-[11px] font-semibold text-ink-500 dark:bg-white/[0.07] dark:text-ink-300"
          >
            {{ capsuleStatusLabel(capsule.status) }}
          </span>
        </div>
        <p class="eyebrow mt-5 text-future-700 dark:text-future-300">
          {{ capsuleTypeLabel(capsule.type) }}
        </p>
        <h3
          class="mt-2 font-display text-xl font-semibold text-ink-950 dark:text-white"
        >
          {{ capsule.title }}
        </h3>
        <p class="mt-3 text-sm leading-6 text-ink-500 dark:text-ink-400">
          {{ capsuleUnlockRuleLabel(capsule.unlockRule) }} ·
          {{ formatInstant(capsule.dueAt || capsule.unlockAt, timezone) }}
        </p>
        <div class="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold">
          <span
            v-if="capsule.canEdit"
            class="rounded-full bg-future-50 px-2.5 py-1 text-future-700 dark:bg-future-950/40 dark:text-future-200"
            >可编辑</span
          >
          <span
            v-if="capsule.canConfirm"
            class="rounded-full bg-present-50 px-2.5 py-1 text-present-700 dark:bg-present-950/40 dark:text-present-200"
            >待你确认</span
          >
          <span
            v-if="capsule.canOpen"
            class="rounded-full bg-memory-50 px-2.5 py-1 text-memory-700 dark:bg-memory-950/40 dark:text-memory-200"
            >可打开</span
          >
          <span
            v-if="capsule.bodyAvailable"
            class="rounded-full bg-ink-100 px-2.5 py-1 text-ink-600 dark:bg-white/[0.07] dark:text-ink-300"
            >正文已授权</span
          >
        </div>
      </button>
    </div>

    <TomorrowPanel
      :open="Boolean(selectedId) && !editorMode"
      eyebrow="Capsule · 时间胶囊"
      :title="selected?.title || '打开时间胶囊'"
      wide
      @close="selectedId = null"
    >
      <AsyncState v-if="detailQuery.isPending.value" state="loading" />
      <AsyncState
        v-else-if="detailQuery.isError.value || !selected"
        state="error"
        title="胶囊没有顺利打开"
        :message="
          detailQuery.error.value instanceof Error
            ? detailQuery.error.value.message
            : '请稍后再试。'
        "
        action-label="重新加载"
        @action="detailQuery.refetch()"
      />
      <div v-else class="space-y-6">
        <div class="flex flex-wrap gap-2">
          <span
            class="rounded-full bg-future-100 px-3 py-1.5 text-xs font-semibold text-future-800 dark:bg-future-950/50 dark:text-future-200"
            >{{ capsuleStatusLabel(selected.status) }}</span
          >
          <span
            class="rounded-full bg-ink-100 px-3 py-1.5 text-xs font-semibold text-ink-600 dark:bg-white/[0.07] dark:text-ink-300"
            >{{ capsuleTypeLabel(selected.type) }}</span
          >
          <span
            v-if="selected.requiresBothConfirmation"
            class="inline-flex items-center gap-1 rounded-full bg-present-50 px-3 py-1.5 text-xs font-semibold text-present-700 dark:bg-present-950/40 dark:text-present-200"
            ><UsersRound class="size-3.5" />双方确认</span
          >
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div
            class="rounded-2xl border border-ink-100 p-4 dark:border-white/10"
          >
            <p class="eyebrow">开启规则</p>
            <p
              class="mt-2 text-sm font-semibold text-ink-800 dark:text-ink-100"
            >
              {{ capsuleUnlockRuleLabel(selected.unlockRule) }}
            </p>
            <p class="mt-1 text-xs text-ink-400">
              {{ formatInstant(selected.dueAt || selected.unlockAt, timezone) }}
            </p>
          </div>
          <div
            class="rounded-2xl border border-ink-100 p-4 dark:border-white/10"
          >
            <p class="eyebrow">双方进度</p>
            <p
              class="mt-2 text-sm font-semibold text-ink-800 dark:text-ink-100"
            >
              {{ selected.confirmedMemberIds.length }} 人确认 ·
              {{ selected.openedMemberIds.length }} 人打开
            </p>
            <p class="mt-1 text-xs text-ink-400">这些状态全部来自 API。</p>
          </div>
        </div>

        <div
          v-if="!selected.bodyAvailable"
          class="grid min-h-56 place-items-center rounded-3xl border border-dashed border-ink-200 bg-ink-50/60 px-6 text-center dark:border-white/10 dark:bg-white/[0.025]"
        >
          <div class="max-w-sm">
            <span
              class="mx-auto grid size-12 place-items-center rounded-2xl bg-ink-950 text-white dark:bg-white dark:text-ink-950"
              ><LockKeyhole class="size-5"
            /></span>
            <h3
              class="mt-4 font-display text-lg font-semibold text-ink-950 dark:text-white"
            >
              正文仍由服务端保管
            </h3>
            <p class="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400">
              当前响应的 `bodyAvailable` 为
              false，因此页面不会渲染正文、长度、附件名或缩略图，也不会根据浏览器时间尝试提前开启。
            </p>
          </div>
        </div>
        <template v-else>
          <div v-if="selected.messages?.length" class="space-y-3">
            <article
              v-for="message in selected.messages"
              :key="message.author.id"
              class="rounded-3xl bg-future-50/70 p-5 dark:bg-future-950/25"
            >
              <p class="eyebrow text-future-700 dark:text-future-300">
                {{
                  message.author.nicknameInRelationship ||
                  message.author.displayName
                }}写下
              </p>
              <p
                class="mt-3 whitespace-pre-wrap text-sm leading-7 text-ink-700 dark:text-ink-200"
              >
                {{ message.content }}
              </p>
            </article>
          </div>
          <div
            v-if="selected.media?.length"
            class="grid grid-cols-2 gap-3 sm:grid-cols-3"
          >
            <div
              v-for="asset in selected.media"
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
        </template>

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
          <BaseButton
            v-if="selectedActions.includes('edit')"
            size="sm"
            variant="secondary"
            @click="openEdit"
            ><Edit3 class="size-4" />编辑草稿</BaseButton
          >
          <BaseButton
            v-if="selectedActions.includes('seal')"
            size="sm"
            :loading="actionPending === 'seal'"
            @click="runAction('seal')"
            ><LockKeyhole class="size-4" />封存胶囊</BaseButton
          >
          <BaseButton
            v-if="
              selected.unlockRule === 'MANUAL_CONDITION' &&
              ['SEALED', 'LOCKED'].includes(selected.status)
            "
            size="sm"
            variant="secondary"
            :loading="actionPending === 'condition'"
            @click="runAction('condition')"
            ><CheckCircle2 class="size-4" />条件已经满足</BaseButton
          >
          <BaseButton
            v-if="selectedActions.includes('confirm')"
            size="sm"
            :loading="actionPending === 'confirm'"
            @click="runAction('confirm')"
            ><CheckCircle2 class="size-4" />确认一起打开</BaseButton
          >
          <BaseButton
            v-if="selectedActions.includes('open')"
            size="sm"
            :loading="actionPending === 'open'"
            @click="runAction('open')"
            ><MailOpen class="size-4" />明确打开</BaseButton
          >
          <BaseButton
            v-if="selectedActions.includes('convert') && selected.bodyAvailable"
            size="sm"
            @click="openConvert"
            ><Sparkles class="size-4" />转为回忆</BaseButton
          >
          <BaseButton
            v-if="
              selectedActions.includes('edit') &&
              selected.createdBy.id === identity.user?.id
            "
            size="sm"
            variant="danger"
            :loading="actionPending === 'delete'"
            @click="runAction('delete')"
            ><Trash2 class="size-4" />移入回收站</BaseButton
          >
        </div>
      </div>
    </TomorrowPanel>

    <TomorrowPanel
      :open="editorMode === 'draft'"
      eyebrow="Capsule · 时间胶囊"
      :title="editing ? '编辑胶囊草稿' : '写一枚时间胶囊'"
      @close="closeEditor"
    >
      <CapsuleEditor
        :capsule="editing"
        :current-user-id="identity.user?.id ?? null"
        :anniversaries="anniversariesQuery.data.value ?? []"
        :wishes="wishesQuery.data.value?.items ?? []"
        :timezone="timezone"
        :pending="editorPending"
        :error="editorError"
        @submit="saveCapsule"
      />
    </TomorrowPanel>

    <TomorrowPanel
      :open="editorMode === 'convert' && Boolean(editing)"
      eyebrow="Future → Remember"
      title="把胶囊写进记录"
      @close="closeEditor"
    >
      <CapsuleMemoryEditor
        v-if="editing"
        :capsule="editing"
        :places="placesQuery.data.value ?? []"
        :timezone="timezone"
        :pending="editorPending"
        :error="editorError"
        @submit="convertCapsule"
      />
    </TomorrowPanel>
  </section>
</template>
