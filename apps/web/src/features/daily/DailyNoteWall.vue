<script setup lang="ts">
import type {
  CreateNoteRequest,
  NoteConversionRequest,
  NoteType,
  NoteView,
  UpdateNoteRequest,
  VisibleNoteView,
} from "@our-tomorrow/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import {
  Clock3,
  ArrowRightLeft,
  Eye,
  EyeOff,
  LockKeyhole,
  Pencil,
  Pin,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-vue-next";
import { computed, reactive, ref, watch } from "vue";

import {
  addMinutesIso,
  dateTimeLocalToIso,
  formatInstant,
  NOTE_COLORS,
  NOTE_TYPES,
  noteColorClass,
  noteStatusLabel,
  noteTypeOption,
  toDateTimeLocalValue,
} from "@/features/daily/daily-utils";
import { ApiClientError } from "@/shared/api/client";
import { stageThreeApi } from "@/shared/api/stage-three";
import { stageFourApi } from "@/shared/api/stage-four";
import AsyncState from "@/shared/components/AsyncState.vue";
import BaseButton from "@/shared/components/BaseButton.vue";
import SectionHeading from "@/shared/components/SectionHeading.vue";
import SurfaceCard from "@/shared/components/SurfaceCard.vue";
import { useIdentityStore } from "@/shared/stores/identity";
import { operationKey } from "@/features/tomorrow/tomorrow-utils";

type NoteScope = "all" | "sent" | "received";
type NoteTiming = "now" | "scheduled";
type NoteExpiry = "never" | "day" | "three-days" | "custom";
type ConversionTarget = NoteConversionRequest["targetType"];

const identity = useIdentityStore();
const queryClient = useQueryClient();
const scope = ref<NoteScope>("all");
const composerOpen = ref(false);
const editingNote = ref<VisibleNoteView | null>(null);
const actionError = ref<string | null>(null);
const actionMessage = ref<string | null>(null);
const deletingId = ref<string | null>(null);
const viewingId = ref<string | null>(null);
const reactingKey = ref<string | null>(null);
const convertingNote = ref<VisibleNoteView | null>(null);
const conversionError = ref<string | null>(null);
const conversionForm = reactive({
  targetType: "WISH" as ConversionTarget,
  title: "",
  category: "CUSTOM" as
    | "TRAVEL"
    | "FOOD"
    | "LIFE"
    | "LEARNING"
    | "COMMEMORATION"
    | "FAMILY"
    | "PHOTOGRAPHY"
    | "ADVENTURE"
    | "CUSTOM",
  date: "",
  repeat: "YEARLY" as "NONE" | "YEARLY",
});

const form = reactive({
  type: "LOVE" as NoteType,
  content: "",
  color: "rose",
  icon: "💌",
  isPinned: false,
  keepAfterViewed: true,
  timing: "now" as NoteTiming,
  showAt: "",
  expiry: "never" as NoteExpiry,
  expiresAt: "",
});

const notesQuery = useQuery({
  queryKey: computed(() => ["notes", identity.role, scope.value]),
  queryFn: () => stageThreeApi.notes(scope.value),
  enabled: computed(() => Boolean(identity.role)),
});

const notes = computed(() => notesQuery.data.value?.items ?? []);
const timezone = computed(() => identity.couple?.timezone ?? "Asia/Shanghai");
const minimumSchedule = computed(() =>
  toDateTimeLocalValue(addMinutesIso(new Date(), 5)),
);
const notesError = computed(() => {
  const error = notesQuery.error.value;
  return error instanceof Error
    ? error.message
    : "便利贴墙暂时没有打开，请稍后再试。";
});

watch(
  () => form.type,
  (type) => {
    const option = noteTypeOption(type);
    form.icon = option.emoji;
    if (type === "SURPRISE" && form.timing !== "scheduled") {
      form.timing = "scheduled";
      form.showAt = toDateTimeLocalValue(addMinutesIso(new Date(), 24 * 60));
    }
  },
);

watch(
  () => identity.role,
  (role, previousRole) => {
    if (previousRole && role !== previousRole) {
      composerOpen.value = false;
      editingNote.value = null;
      convertingNote.value = null;
      conversionError.value = null;
    }
  },
);

function conflictMessage(error: unknown, action: string) {
  if (
    error instanceof ApiClientError &&
    (error.code === "STATE_CONFLICT" || error.code === "PRECONDITION_REQUIRED")
  ) {
    void queryClient.invalidateQueries({ queryKey: ["notes"] });
    return `这张便利贴刚刚在另一处发生变化，已刷新列表；请确认后重新${action}。`;
  }
  return error instanceof Error ? error.message : `便利贴没有${action}成功。`;
}

const saveMutation = useMutation({
  mutationFn: (input: {
    id?: string;
    create?: CreateNoteRequest;
    update?: UpdateNoteRequest;
  }) => {
    if (input.id && input.update) {
      return stageThreeApi.updateNote(input.id, input.update);
    }
    if (!input.create) throw new Error("便利贴内容不完整。");
    return stageThreeApi.createNote(input.create);
  },
  onSuccess: async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notes"] }),
      queryClient.invalidateQueries({ queryKey: ["today"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    ]);
  },
});

const deleteMutation = useMutation({
  mutationFn: ({ id, version }: { id: string; version: number }) =>
    stageThreeApi.deleteNote(id, version),
  onSuccess: async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notes"] }),
      queryClient.invalidateQueries({ queryKey: ["today"] }),
    ]);
  },
});

const viewMutation = useMutation({
  mutationFn: ({ id, version }: { id: string; version: number }) =>
    stageThreeApi.markNoteViewed(id, version),
  onSuccess: async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notes"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    ]);
  },
});

const reactionMutation = useMutation({
  mutationFn: ({
    id,
    emoji,
    remove,
  }: {
    id: string;
    emoji: string;
    remove: boolean;
  }) =>
    remove
      ? stageThreeApi.removeNoteReaction(id, { emoji })
      : stageThreeApi.setNoteReaction(id, { emoji }),
  onSuccess: async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notes"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    ]);
  },
});

const conversionMutation = useMutation({
  mutationFn: (input: {
    role: "boy" | "girl";
    noteId: string;
    request: NoteConversionRequest;
    key: string;
  }) => stageFourApi.convertNote(input.noteId, input.request, input.key),
  onSuccess: async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notes"] }),
      queryClient.invalidateQueries({ queryKey: ["wishes"] }),
      queryClient.invalidateQueries({ queryKey: ["wish-options"] }),
      queryClient.invalidateQueries({ queryKey: ["anniversaries"] }),
      queryClient.invalidateQueries({ queryKey: ["memories"] }),
      queryClient.invalidateQueries({ queryKey: ["today"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    ]);
  },
});

function openConversion(note: VisibleNoteView) {
  if (note.author.id !== identity.user?.id) return;
  convertingNote.value = note;
  conversionForm.targetType = "WISH";
  conversionForm.title = "";
  conversionForm.category = "CUSTOM";
  conversionForm.date = new Date().toISOString().slice(0, 10);
  conversionForm.repeat = "YEARLY";
  conversionError.value = null;
}

async function submitConversion() {
  const note = convertingNote.value;
  const role = identity.role;
  if (!note || !role || conversionMutation.isPending.value) return;
  const title = conversionForm.title.trim() || undefined;
  let request: NoteConversionRequest;
  if (conversionForm.targetType === "WISH") {
    request = {
      targetType: "WISH",
      ...(title ? { title } : {}),
      category: conversionForm.category,
    };
  } else if (conversionForm.targetType === "ANNIVERSARY") {
    if (!conversionForm.date) {
      conversionError.value = "请选择纪念日日期。";
      return;
    }
    request = {
      targetType: "ANNIVERSARY",
      ...(title ? { title } : {}),
      date: conversionForm.date,
      repeat: conversionForm.repeat,
    };
  } else {
    request = {
      targetType: "MEMORY",
      ...(title ? { title } : {}),
    };
  }

  conversionError.value = null;
  try {
    await conversionMutation.mutateAsync({
      role,
      noteId: note.id,
      request,
      key: operationKey(`note-to-${request.targetType.toLowerCase()}`),
    });
    if (identity.role !== role) return;
    convertingNote.value = null;
    actionMessage.value =
      request.targetType === "WISH"
        ? "这张便利贴已经放进明天清单。"
        : request.targetType === "ANNIVERSARY"
          ? "这张便利贴已经成为一个重要日子。"
          : "这张便利贴已经写进记录。";
  } catch (error) {
    conversionError.value = conflictMessage(error, "转换");
  }
}

function resetForm() {
  editingNote.value = null;
  form.type = "LOVE";
  form.content = "";
  form.color = "rose";
  form.icon = "💌";
  form.isPinned = false;
  form.keepAfterViewed = true;
  form.timing = "now";
  form.showAt = "";
  form.expiry = "never";
  form.expiresAt = "";
}

function openNewNote() {
  resetForm();
  composerOpen.value = true;
  actionError.value = null;
  actionMessage.value = null;
}

defineExpose({ openNewNote });

function openEditNote(note: NoteView) {
  if (note.isPlaceholder || !note.canEdit || !note.content) return;
  editingNote.value = note;
  form.type = note.type;
  form.content = note.content;
  form.color = note.color || "rose";
  form.icon = note.icon || noteTypeOption(note.type).emoji;
  form.isPinned = note.isPinned ?? false;
  form.keepAfterViewed = note.keepAfterViewed ?? true;
  form.timing = note.showAt ? "scheduled" : "now";
  form.showAt = note.showAt ? toDateTimeLocalValue(note.showAt) : "";
  form.expiry = note.expiresAt ? "custom" : "never";
  form.expiresAt = note.expiresAt ? toDateTimeLocalValue(note.expiresAt) : "";
  composerOpen.value = true;
  actionError.value = null;
  actionMessage.value = null;
}

function timingPayload() {
  const now = new Date();
  const showAt =
    form.timing === "scheduled" ? dateTimeLocalToIso(form.showAt) : null;
  if (form.timing === "scheduled") {
    if (!showAt) throw new Error("请选择便利贴揭晓时间。");
    if (new Date(showAt).valueOf() <= now.valueOf() + 30_000) {
      throw new Error("揭晓时间需要晚于现在。");
    }
  }

  const base = showAt ?? now.toISOString();
  let expiresAt: string | null = null;
  if (form.expiry === "day") expiresAt = addMinutesIso(base, 24 * 60);
  if (form.expiry === "three-days") {
    expiresAt = addMinutesIso(base, 3 * 24 * 60);
  }
  if (form.expiry === "custom") {
    expiresAt = dateTimeLocalToIso(form.expiresAt);
    if (!expiresAt) throw new Error("请选择便利贴失效时间。");
    if (new Date(expiresAt).valueOf() <= new Date(base).valueOf()) {
      throw new Error("失效时间需要晚于便利贴揭晓时间。");
    }
  }
  return { showAt, expiresAt };
}

async function saveNote(publish: boolean) {
  if (saveMutation.isPending.value) return;
  const content = form.content.trim();
  if (!content) {
    actionError.value = "请先写下便利贴内容。";
    return;
  }
  if (form.type === "SURPRISE" && form.timing !== "scheduled") {
    actionError.value = "隐藏惊喜必须设置未来的揭晓时间。";
    return;
  }

  actionError.value = null;
  actionMessage.value = null;
  try {
    const timing = timingPayload();
    const wasScheduled = form.timing === "scheduled";
    const fields = {
      type: form.type,
      content,
      color: form.color,
      icon: form.icon.trim() || noteTypeOption(form.type).emoji,
      isPinned: form.isPinned,
      keepAfterViewed: form.keepAfterViewed,
      showAt: timing.showAt,
      expiresAt: timing.expiresAt,
      publish,
    };
    const current = editingNote.value;
    if (current) {
      await saveMutation.mutateAsync({
        id: current.id,
        update: { ...fields, version: current.version },
      });
    } else {
      await saveMutation.mutateAsync({ create: fields });
    }
    composerOpen.value = false;
    resetForm();
    actionMessage.value = publish
      ? wasScheduled
        ? "便利贴已经收好，到设定时间才会向对方揭晓。"
        : "便利贴已经送到对方的墙上。"
      : "便利贴已保存为只有你能看到的草稿。";
  } catch (error) {
    actionError.value = conflictMessage(
      error,
      editingNote.value ? "保存" : "创建",
    );
  }
}

async function deleteNote(note: NoteView) {
  if (note.isPlaceholder || !note.canDelete || deletingId.value) return;
  const message =
    note.author.id === identity.user?.id
      ? "确定删除这张便利贴吗？删除后不会继续向对方显示。"
      : "确定把这张便利贴从你的墙上收起吗？";
  if (!window.confirm(message)) return;
  deletingId.value = note.id;
  actionError.value = null;
  actionMessage.value = null;
  try {
    await deleteMutation.mutateAsync({ id: note.id, version: note.version });
    actionMessage.value =
      note.author.id === identity.user?.id
        ? "便利贴已经删除。"
        : "便利贴已经从你的墙上收起。";
  } catch (error) {
    actionError.value = conflictMessage(error, "删除");
  } finally {
    deletingId.value = null;
  }
}

async function markViewed(note: NoteView) {
  if (note.isPlaceholder || viewingId.value) return;
  viewingId.value = note.id;
  actionError.value = null;
  actionMessage.value = null;
  try {
    await viewMutation.mutateAsync({ id: note.id, version: note.version });
    actionMessage.value = note.keepAfterViewed
      ? "已告诉对方：你看到了这张便利贴。"
      : "已告诉对方你看到了；这张阅后即消失的便利贴已收起。";
  } catch (error) {
    actionError.value = conflictMessage(error, "查看");
  } finally {
    viewingId.value = null;
  }
}

async function toggleReaction(note: NoteView, emoji: string) {
  if (note.isPlaceholder || reactingKey.value) return;
  const reaction = note.reactions?.find((item) => item.emoji === emoji);
  reactingKey.value = `${note.id}:${emoji}`;
  actionError.value = null;
  try {
    await reactionMutation.mutateAsync({
      id: note.id,
      emoji,
      remove: reaction?.reactedByMe ?? false,
    });
  } catch (error) {
    actionError.value = conflictMessage(error, "回应");
  } finally {
    reactingKey.value = null;
  }
}
</script>

<template>
  <section aria-labelledby="notes-heading">
    <SurfaceCard>
      <SectionHeading
        id="notes-heading"
        title="留给你 · 便利贴墙"
        description="现在送达，或挑一个未来的时刻，让一句话刚好出现。"
      >
        <BaseButton size="sm" @click="openNewNote">
          <Plus class="size-4" />新纸条
        </BaseButton>
      </SectionHeading>

      <div
        class="mt-5 flex gap-2 overflow-x-auto pb-1"
        role="tablist"
        aria-label="便利贴范围"
      >
        <button
          v-for="tab in [
            { value: 'all', label: '全部' },
            { value: 'received', label: '收到的' },
            { value: 'sent', label: '我留下的' },
          ] as const"
          :key="tab.value"
          type="button"
          role="tab"
          :aria-selected="scope === tab.value"
          class="shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition motion-reduce:transition-none"
          :class="
            scope === tab.value
              ? 'bg-ink-950 text-white dark:bg-white dark:text-ink-950'
              : 'bg-ink-100/80 text-ink-500 hover:text-ink-900 dark:bg-white/[0.06] dark:text-ink-400 dark:hover:text-white'
          "
          @click="scope = tab.value"
        >
          {{ tab.label }}
        </button>
      </div>

      <div
        v-if="actionError || actionMessage"
        class="mt-4 rounded-2xl px-4 py-3 text-sm leading-6"
        :class="
          actionError
            ? 'border border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200'
            : 'border border-present-200 bg-present-50 text-present-800 dark:border-present-900/55 dark:bg-present-950/30 dark:text-present-200'
        "
        :role="actionError ? 'alert' : 'status'"
      >
        {{ actionError || actionMessage }}
      </div>

      <div class="mt-5">
        <AsyncState
          v-if="notesQuery.isPending.value"
          state="loading"
          title="正在打开便利贴墙…"
        />
        <AsyncState
          v-else-if="notesQuery.isError.value"
          state="error"
          title="便利贴墙没有顺利打开"
          :message="notesError"
          action-label="重新加载"
          @action="notesQuery.refetch()"
        />
        <AsyncState
          v-else-if="notes.length === 0"
          state="empty"
          :title="
            scope === 'received'
              ? '还没有收到便利贴。'
              : scope === 'sent'
                ? '还没有留下便利贴。'
                : '给对方留一句此刻的话。'
          "
          message="想念、感谢、提醒或一个待沟通的话题，都可以轻轻放在这里。"
          action-label="写第一张"
          @action="openNewNote"
        />

        <div v-else class="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          <article
            v-for="note in notes"
            :key="note.id"
            class="relative flex min-h-60 flex-col rounded-3xl border p-5 shadow-sm"
            :class="
              note.isPlaceholder
                ? 'border-dashed border-future-300 bg-future-50/65 dark:border-future-800 dark:bg-future-950/20'
                : noteColorClass(note.color)
            "
          >
            <template v-if="note.isPlaceholder">
              <div class="flex items-start justify-between gap-3">
                <span
                  class="grid size-11 place-items-center rounded-2xl bg-future-100 text-future-700 dark:bg-future-900/45 dark:text-future-200"
                >
                  <LockKeyhole class="size-5" />
                </span>
                <span
                  class="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-future-700 dark:bg-white/[0.06] dark:text-future-200"
                >
                  隐藏惊喜
                </span>
              </div>
              <h3
                class="mt-5 font-display text-xl font-semibold text-ink-950 dark:text-white"
              >
                一份内容尚未揭晓
              </h3>
              <p class="mt-3 text-sm leading-6 text-ink-500 dark:text-ink-400">
                到了写下的时间，这份小惊喜才会出现。
              </p>
              <p
                class="mt-auto pt-5 text-xs font-semibold text-future-700 dark:text-future-300"
              >
                <Clock3 class="mr-1 inline size-3.5" />
                {{ formatInstant(note.showAt, timezone) }} 后可见
              </p>
            </template>

            <template v-else>
              <div class="flex items-start justify-between gap-3">
                <span class="text-2xl" aria-hidden="true">
                  {{ note.icon || noteTypeOption(note.type).emoji }}
                </span>
                <div class="flex flex-wrap justify-end gap-1.5">
                  <span
                    v-if="note.isPinned"
                    class="inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-ink-500 dark:bg-white/[0.07] dark:text-ink-300"
                  >
                    <Pin class="size-3" />置顶
                  </span>
                  <span
                    class="rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-ink-500 dark:bg-white/[0.07] dark:text-ink-300"
                  >
                    {{ noteStatusLabel(note.status) }}
                  </span>
                </div>
              </div>
              <p class="eyebrow mt-4">
                {{ noteTypeOption(note.type).label }} ·
                {{
                  note.author.id === identity.user?.id
                    ? "我留给对方"
                    : `来自 ${note.author.nicknameInRelationship || note.author.displayName}`
                }}
              </p>
              <p
                class="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-ink-800 dark:text-ink-100"
              >
                {{ note.content }}
              </p>

              <div class="mt-4 space-y-1 text-xs text-ink-400">
                <p v-if="note.status === 'DRAFT'">
                  <EyeOff
                    class="mr-1 inline size-3.5"
                  />只有你能看到；发送前仍可编辑
                </p>
                <p v-else-if="note.showAt && note.status === 'SCHEDULED'">
                  <Clock3 class="mr-1 inline size-3.5" />{{
                    formatInstant(note.showAt, timezone)
                  }}
                  准时揭晓
                </p>
                <p v-if="note.expiresAt">
                  <Clock3 class="mr-1 inline size-3.5" />{{
                    formatInstant(note.expiresAt, timezone)
                  }}
                  自动失效
                </p>
                <p v-if="!note.keepAfterViewed">
                  <EyeOff class="mr-1 inline size-3.5" />对方确认看完后即消失
                </p>
              </div>

              <div
                v-if="
                  note.author.id !== identity.user?.id &&
                  (note.status === 'VISIBLE' || note.status === 'VIEWED')
                "
                class="mt-5 flex flex-wrap gap-2"
                aria-label="回应便利贴"
              >
                <button
                  v-for="emoji in ['❤️', '🥰', '🫶', '🌷']"
                  :key="emoji"
                  type="button"
                  class="inline-flex min-h-9 items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition disabled:opacity-50 motion-reduce:transition-none"
                  :class="
                    note.reactions?.find((reaction) => reaction.emoji === emoji)
                      ?.reactedByMe
                      ? 'border-present-300 bg-present-100 dark:border-present-700 dark:bg-present-900/45'
                      : 'border-white/80 bg-white/55 hover:bg-white dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/10'
                  "
                  :disabled="Boolean(reactingKey)"
                  :aria-label="`${emoji} 回应${note.reactions?.find((reaction) => reaction.emoji === emoji)?.count ?? 0}次`"
                  @click="toggleReaction(note, emoji)"
                >
                  {{ emoji }}
                  <span
                    v-if="
                      (note.reactions?.find(
                        (reaction) => reaction.emoji === emoji,
                      )?.count ?? 0) > 0
                    "
                    class="text-xs font-semibold"
                  >
                    {{
                      note.reactions?.find(
                        (reaction) => reaction.emoji === emoji,
                      )?.count
                    }}
                  </span>
                </button>
              </div>

              <div class="mt-auto flex flex-wrap gap-2 pt-5">
                <BaseButton
                  v-if="
                    note.author.id !== identity.user?.id &&
                    note.status === 'VISIBLE'
                  "
                  size="sm"
                  variant="secondary"
                  :loading="viewingId === note.id"
                  @click="markViewed(note)"
                >
                  <Eye class="size-4" />{{
                    note.keepAfterViewed ? "告诉对方我看到了" : "看完并收起"
                  }}
                </BaseButton>
                <BaseButton
                  v-if="note.author.id === identity.user?.id"
                  size="sm"
                  variant="secondary"
                  @click="openConversion(note)"
                >
                  <ArrowRightLeft class="size-4" />转为…
                </BaseButton>
                <BaseButton
                  v-if="note.canEdit"
                  size="sm"
                  variant="ghost"
                  @click="openEditNote(note)"
                >
                  <Pencil class="size-4" />编辑
                </BaseButton>
                <BaseButton
                  v-if="note.canDelete"
                  size="sm"
                  variant="ghost"
                  :loading="deletingId === note.id"
                  @click="deleteNote(note)"
                >
                  <Trash2 class="size-4" />{{
                    note.author.id === identity.user?.id ? "删除" : "收起"
                  }}
                </BaseButton>
              </div>
            </template>
          </article>
        </div>
      </div>
    </SurfaceCard>

    <SurfaceCard
      v-if="convertingNote"
      class="mt-4"
      aria-labelledby="note-conversion-heading"
    >
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="eyebrow">跨时间转换</p>
          <h3
            id="note-conversion-heading"
            class="mt-2 font-display text-xl font-semibold text-ink-950 dark:text-white"
          >
            把这句话放到更合适的时间里
          </h3>
          <p class="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400">
            转换成功后，原便利贴会归档；同一张便利贴只会生成一个目标。
          </p>
        </div>
        <button
          type="button"
          class="grid size-9 place-items-center rounded-xl text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 motion-reduce:transition-none dark:hover:bg-white/[0.07] dark:hover:text-white"
          aria-label="关闭便利贴转换"
          @click="convertingNote = null"
        >
          <X class="size-4" />
        </button>
      </div>

      <blockquote
        class="mt-5 rounded-2xl bg-ink-50 px-4 py-3 text-sm leading-6 text-ink-700 dark:bg-white/[0.05] dark:text-ink-200"
      >
        {{ convertingNote.content }}
      </blockquote>

      <form class="mt-5 space-y-5" @submit.prevent="submitConversion">
        <fieldset>
          <legend class="field-label">转换为</legend>
          <div class="mt-2 grid gap-2 sm:grid-cols-3">
            <label
              v-for="option in [
                { value: 'WISH', label: '愿望', hint: '放进明天清单' },
                {
                  value: 'ANNIVERSARY',
                  label: '纪念日',
                  hint: '记住一个重要日子',
                },
                { value: 'MEMORY', label: '回忆', hint: '直接写进记录' },
              ] as const"
              :key="option.value"
              class="cursor-pointer rounded-2xl border p-3"
              :class="
                conversionForm.targetType === option.value
                  ? 'border-future-300 bg-future-50 dark:border-future-700 dark:bg-future-950/35'
                  : 'border-ink-200/80 bg-white/55 dark:border-white/10 dark:bg-white/[0.03]'
              "
            >
              <input
                v-model="conversionForm.targetType"
                type="radio"
                :value="option.value"
                class="sr-only"
              />
              <span class="block text-sm font-semibold">{{
                option.label
              }}</span>
              <span class="mt-1 block text-xs text-ink-400">{{
                option.hint
              }}</span>
            </label>
          </div>
        </fieldset>

        <label class="block">
          <span class="field-label"
            >标题 <span class="font-normal text-ink-400">可选</span></span
          >
          <input
            v-model="conversionForm.title"
            maxlength="200"
            class="field-input"
            placeholder="留空会从便利贴内容自动生成"
          />
        </label>

        <label v-if="conversionForm.targetType === 'WISH'" class="block">
          <span class="field-label">愿望分类</span>
          <select v-model="conversionForm.category" class="field-input py-3">
            <option value="CUSTOM">自定义</option>
            <option value="TRAVEL">旅行</option>
            <option value="FOOD">美食</option>
            <option value="LIFE">生活</option>
            <option value="LEARNING">学习</option>
            <option value="COMMEMORATION">纪念</option>
            <option value="FAMILY">家庭</option>
            <option value="PHOTOGRAPHY">摄影</option>
            <option value="ADVENTURE">小冒险</option>
          </select>
        </label>

        <div
          v-else-if="conversionForm.targetType === 'ANNIVERSARY'"
          class="grid gap-4 sm:grid-cols-2"
        >
          <label class="block">
            <span class="field-label">日期</span>
            <input
              v-model="conversionForm.date"
              type="date"
              required
              class="field-input"
            />
          </label>
          <label class="block">
            <span class="field-label">重复</span>
            <select v-model="conversionForm.repeat" class="field-input py-3">
              <option value="YEARLY">每年</option>
              <option value="NONE">仅这一次</option>
            </select>
          </label>
        </div>

        <p
          v-else
          class="rounded-2xl bg-memory-50 px-4 py-3 text-sm leading-6 text-memory-800 dark:bg-memory-950/30 dark:text-memory-200"
        >
          回忆会沿用便利贴写下的时间，之后可以在“记录”里继续补照片、地点和双方视角。
        </p>

        <p
          v-if="conversionError"
          class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200"
          role="alert"
        >
          {{ conversionError }}
        </p>
        <div class="flex flex-wrap gap-2">
          <BaseButton
            type="submit"
            :loading="conversionMutation.isPending.value"
          >
            <ArrowRightLeft class="size-4" />确认转换
          </BaseButton>
          <BaseButton
            type="button"
            variant="ghost"
            @click="convertingNote = null"
          >
            取消
          </BaseButton>
        </div>
      </form>
    </SurfaceCard>

    <SurfaceCard
      v-if="composerOpen"
      class="mt-4"
      aria-labelledby="note-composer-heading"
    >
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="eyebrow">{{ editingNote ? "编辑便利贴" : "留给对方" }}</p>
          <h3
            id="note-composer-heading"
            class="mt-2 font-display text-xl font-semibold text-ink-950 dark:text-white"
          >
            {{
              editingNote
                ? "在揭晓前，还可以慢慢修改。"
                : "写一句想让对方收到的话。"
            }}
          </h3>
        </div>
        <button
          type="button"
          class="grid size-9 place-items-center rounded-xl text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 motion-reduce:transition-none dark:hover:bg-white/[0.07] dark:hover:text-white"
          aria-label="关闭便利贴编辑"
          @click="composerOpen = false"
        >
          <X class="size-4" />
        </button>
      </div>

      <form class="mt-5 space-y-5" @submit.prevent="saveNote(true)">
        <fieldset>
          <legend class="text-sm font-semibold text-ink-800 dark:text-ink-100">
            类型
          </legend>
          <div class="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <button
              v-for="option in NOTE_TYPES"
              :key="option.value"
              type="button"
              class="rounded-2xl border p-3 text-left transition motion-reduce:transition-none"
              :class="
                form.type === option.value
                  ? 'border-present-300 bg-present-50 ring-2 ring-present-100 dark:border-present-700 dark:bg-present-950/35 dark:ring-present-900/40'
                  : 'border-ink-200/80 bg-white/55 hover:border-ink-300 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20'
              "
              @click="form.type = option.value"
            >
              <span class="text-lg">{{ option.emoji }}</span>
              <span
                class="ml-2 text-sm font-semibold text-ink-900 dark:text-white"
                >{{ option.label }}</span
              >
              <span class="mt-1 block text-xs leading-5 text-ink-400">{{
                option.description
              }}</span>
            </button>
          </div>
        </fieldset>

        <label class="block">
          <span class="field-label"
            >便利贴内容 <span class="text-red-500">*</span></span
          >
          <textarea
            v-model="form.content"
            rows="5"
            maxlength="4000"
            required
            class="field-input resize-y"
            placeholder="想念、感谢、提醒，或者一句晚点想聊的话…"
          />
          <span class="mt-1 block text-right text-xs text-ink-400"
            >{{ form.content.length }}/4000</span
          >
        </label>

        <div class="grid gap-5 lg:grid-cols-2">
          <fieldset>
            <legend
              class="text-sm font-semibold text-ink-800 dark:text-ink-100"
            >
              颜色
            </legend>
            <div class="mt-3 flex flex-wrap gap-3">
              <label
                v-for="color in NOTE_COLORS"
                :key="color.value"
                class="cursor-pointer"
              >
                <input
                  v-model="form.color"
                  type="radio"
                  :value="color.value"
                  class="sr-only"
                />
                <span
                  class="grid size-10 place-items-center rounded-full border-2 transition motion-reduce:transition-none"
                  :class="[
                    color.swatch,
                    form.color === color.value
                      ? 'border-ink-800 ring-2 ring-ink-200 dark:border-white dark:ring-white/20'
                      : 'border-transparent',
                  ]"
                  :title="color.label"
                >
                  <span class="sr-only">{{ color.label }}</span>
                </span>
              </label>
            </div>
          </fieldset>
          <label class="block">
            <span class="field-label"
              >图标 <span class="font-normal text-ink-400">可选</span></span
            >
            <input
              v-model="form.icon"
              maxlength="32"
              class="field-input"
              placeholder="💌"
            />
          </label>
        </div>

        <fieldset
          class="rounded-3xl border border-future-200 bg-future-50/50 p-4 dark:border-future-900/55 dark:bg-future-950/20"
        >
          <legend
            class="px-2 text-sm font-semibold text-ink-800 dark:text-ink-100"
          >
            什么时候让对方看到？
          </legend>
          <div class="mt-2 grid gap-3 sm:grid-cols-2">
            <label
              class="flex cursor-pointer items-start gap-3 rounded-2xl bg-white/65 p-4 dark:bg-white/[0.05]"
            >
              <input
                v-model="form.timing"
                type="radio"
                value="now"
                class="mt-1 size-4 accent-future-600"
                :disabled="form.type === 'SURPRISE'"
              />
              <span>
                <span
                  class="block text-sm font-semibold text-ink-900 dark:text-white"
                  >现在送达</span
                >
                <span class="mt-1 block text-xs leading-5 text-ink-400"
                  >发送后立即出现在对方墙上</span
                >
              </span>
            </label>
            <label
              class="flex cursor-pointer items-start gap-3 rounded-2xl bg-white/65 p-4 dark:bg-white/[0.05]"
            >
              <input
                v-model="form.timing"
                type="radio"
                value="scheduled"
                class="mt-1 size-4 accent-future-600"
              />
              <span>
                <span
                  class="block text-sm font-semibold text-ink-900 dark:text-white"
                  >定时揭晓</span
                >
                <span class="mt-1 block text-xs leading-5 text-ink-400"
                  >到了这个时间，再让对方看到</span
                >
              </span>
            </label>
          </div>
          <div v-if="form.timing === 'scheduled'" class="mt-4">
            <label class="block">
              <span class="field-label">揭晓时间（当前设备时区）</span>
              <input
                v-model="form.showAt"
                type="datetime-local"
                :min="minimumSchedule"
                required
                class="field-input"
              />
            </label>
            <p
              v-if="form.type === 'SURPRISE'"
              class="mt-3 flex items-start gap-2 rounded-2xl bg-future-100/80 px-4 py-3 text-xs leading-5 text-future-800 dark:bg-future-900/35 dark:text-future-200"
            >
              <LockKeyhole class="mt-0.5 size-4 shrink-0" />
              揭晓以前，对方只会看到约定的时间，不会提前看到正文。
            </p>
          </div>
        </fieldset>

        <div class="grid gap-4 md:grid-cols-2">
          <label class="block">
            <span class="field-label">自动失效</span>
            <select v-model="form.expiry" class="field-input">
              <option value="never">不自动失效</option>
              <option value="day">显示后 24 小时</option>
              <option value="three-days">显示后 3 天</option>
              <option value="custom">自定义时间</option>
            </select>
          </label>
          <label v-if="form.expiry === 'custom'" class="block">
            <span class="field-label">失效时间（当前设备时区）</span>
            <input
              v-model="form.expiresAt"
              type="datetime-local"
              class="field-input"
              required
            />
          </label>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <label
            class="flex min-h-12 items-center gap-3 rounded-2xl border border-ink-200/80 bg-white/55 px-4 py-3 text-sm text-ink-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-ink-200"
          >
            <input
              v-model="form.isPinned"
              type="checkbox"
              class="size-4 accent-present-600"
            />
            <Pin class="size-4 text-ink-400" />置顶在墙上
          </label>
          <label
            class="flex min-h-12 items-center gap-3 rounded-2xl border border-ink-200/80 bg-white/55 px-4 py-3 text-sm text-ink-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-ink-200"
          >
            <input
              v-model="form.keepAfterViewed"
              type="checkbox"
              class="size-4 accent-present-600"
            />
            <Eye class="size-4 text-ink-400" />阅后仍然保留
          </label>
        </div>
        <p
          v-if="!form.keepAfterViewed"
          class="text-xs leading-5 text-amber-700 dark:text-amber-300"
        >
          对方确认看完后，这张便利贴会立即归档并从墙上消失。
        </p>

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
          <BaseButton
            variant="secondary"
            :loading="saveMutation.isPending.value"
            @click="saveNote(false)"
          >
            保存草稿
          </BaseButton>
          <BaseButton type="submit" :loading="saveMutation.isPending.value">
            <Send class="size-4" />{{
              form.timing === "scheduled" ? "定时送达" : "发送给对方"
            }}
          </BaseButton>
        </div>
      </form>
    </SurfaceCard>
  </section>
</template>
