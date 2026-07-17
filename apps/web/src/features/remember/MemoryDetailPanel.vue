<script setup lang="ts">
import type {
  MediaAssetSummary,
  MemoryDetail,
  MemoryPerspectiveView,
  MemoryRevision,
} from "@our-tomorrow/contracts";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import {
  Check,
  Clock3,
  History,
  MapPin,
  MessageCircle,
  Pencil,
  Send,
  Sparkles,
  Trash2,
  UsersRound,
  X,
} from "lucide-vue-next";
import { computed, ref, watch } from "vue";

import PrivateMediaImage from "@/features/remember/PrivateMediaImage.vue";
import { formatMemoryDate } from "@/features/remember/remember-utils";
import { ApiClientError } from "@/shared/api/client";
import { stageTwoApi } from "@/shared/api/stage-two";
import AsyncState from "@/shared/components/AsyncState.vue";
import BaseButton from "@/shared/components/BaseButton.vue";
import { useIdentityStore } from "@/shared/stores/identity";

const props = defineProps<{ memoryId: string; timezone: string }>();
const emit = defineEmits<{
  close: [];
  edit: [memory: MemoryDetail];
  deleted: [id: string];
  changed: [memory: MemoryDetail];
  conflict: [];
}>();

const identity = useIdentityStore();
const queryClient = useQueryClient();
const detailQuery = useQuery({
  queryKey: computed(() => ["memory", identity.role, props.memoryId]),
  queryFn: () => stageTwoApi.memory(props.memoryId),
});
const showRevisions = ref(false);
const revisionsQuery = useQuery({
  queryKey: computed(() => ["memory-revisions", identity.role, props.memoryId]),
  queryFn: () => stageTwoApi.revisions(props.memoryId),
  enabled: computed(() => showRevisions.value),
});

const perspectiveContent = ref("");
const perspectiveMood = ref("");
const perspectiveDirty = ref(false);
const perspectiveSaving = ref(false);
const comment = ref("");
const commentSaving = ref(false);
const pendingReaction = ref<string | null>(null);
const deleting = ref(false);
const pendingMediaId = ref<string | null>(null);
const pendingCommentId = ref<string | null>(null);
const actionError = ref<string | null>(null);
const actionMessage = ref<string | null>(null);
const previewAsset = ref<MediaAssetSummary | null>(null);
const conflictDetected = ref(false);

const memory = computed(() => detailQuery.data.value ?? null);
const ownPerspective = computed(() =>
  memory.value?.perspectives.find(
    (perspective) =>
      perspective.editable || perspective.author.id === identity.user?.id,
  ),
);
const partnerPerspective = computed(() =>
  memory.value?.perspectives.find(
    (perspective) => perspective.author.id !== identity.user?.id,
  ),
);
const ownPerspectiveSubmitted = computed(
  () => ownPerspective.value?.state === "SUBMITTED",
);
const reactions = ["❤️", "🥰", "😂", "😭", "✨"];

watch(
  ownPerspective,
  (perspective) => {
    if (perspectiveDirty.value) return;
    perspectiveContent.value = perspective?.content ?? "";
    perspectiveMood.value = perspective?.mood ?? "";
  },
  { immediate: true },
);

function showError(error: unknown, fallback: string) {
  if (error instanceof ApiClientError && error.code === "STATE_CONFLICT") {
    conflictDetected.value = true;
    actionError.value =
      "内容刚刚在另一处变化，已为你保留输入。请重新载入后再提交。";
    emit("conflict");
    return;
  }
  conflictDetected.value = false;
  actionError.value = error instanceof Error ? error.message : fallback;
}

async function reloadAfterConflict() {
  conflictDetected.value = false;
  actionError.value = null;
  await refresh();
  actionMessage.value = "已载入最新版本，你刚才的视角输入仍然保留。";
}

async function refresh() {
  const result = await detailQuery.refetch();
  if (result.data) {
    emit("changed", result.data);
    await queryClient.invalidateQueries({ queryKey: ["memories"] });
  }
  return result.data;
}

async function savePerspective(submit: boolean) {
  if (!perspectiveContent.value.trim() || perspectiveSaving.value) return;
  perspectiveSaving.value = true;
  actionError.value = null;
  actionMessage.value = null;

  try {
    const current = ownPerspective.value;
    const saved = await stageTwoApi.savePerspective(props.memoryId, {
      ...(current?.version ? { version: current.version } : {}),
      content: perspectiveContent.value.trim(),
      mood: perspectiveMood.value.trim() || null,
    });
    if (submit) {
      if (!saved.version) throw new Error("视角版本缺失，请重新打开后再试。");
      await stageTwoApi.submitPerspective(props.memoryId, {
        version: saved.version,
      });
      actionMessage.value = "你的视角已经提交给另一半。";
    } else {
      actionMessage.value = ownPerspectiveSubmitted.value
        ? "已提交视角的修改已经保存，另一半会看到最新内容。"
        : "你的视角草稿已保存，提交前只有你能看见。";
    }
    perspectiveDirty.value = false;
    await refresh();
  } catch (error) {
    showError(error, "视角没有保存成功，请稍后再试。");
  } finally {
    perspectiveSaving.value = false;
  }
}

async function addComment() {
  if (!comment.value.trim() || commentSaving.value) return;
  commentSaving.value = true;
  actionError.value = null;
  try {
    await stageTwoApi.addComment(props.memoryId, {
      content: comment.value.trim(),
    });
    comment.value = "";
    await refresh();
  } catch (error) {
    showError(error, "评论没有发出去，请稍后再试。");
  } finally {
    commentSaving.value = false;
  }
}

async function deleteComment(commentId: string) {
  if (pendingCommentId.value) return;
  pendingCommentId.value = commentId;
  actionError.value = null;
  try {
    await stageTwoApi.deleteComment(props.memoryId, commentId);
    await refresh();
  } catch (error) {
    showError(error, "评论没有删除成功。请稍后再试。");
  } finally {
    pendingCommentId.value = null;
  }
}

async function toggleReaction(emoji: string) {
  if (pendingReaction.value) return;
  pendingReaction.value = emoji;
  actionError.value = null;
  try {
    const reacted =
      memory.value?.reactions.find((reaction) => reaction.emoji === emoji)
        ?.reactedByMe ?? false;
    if (reacted) await stageTwoApi.removeReaction(props.memoryId, emoji);
    else await stageTwoApi.setReaction(props.memoryId, emoji);
    await refresh();
  } catch (error) {
    showError(error, "回应没有保存成功。请稍后再试。");
  } finally {
    pendingReaction.value = null;
  }
}

async function detachMedia(mediaId: string) {
  const current = memory.value;
  if (!current || pendingMediaId.value) return;
  if (!window.confirm("从这段回忆中移除这张照片？原文件不会立即物理删除。"))
    return;
  pendingMediaId.value = mediaId;
  actionError.value = null;
  try {
    const next = await stageTwoApi.detachMedia(
      current.id,
      mediaId,
      current.version,
    );
    queryClient.setQueryData(["memory", identity.role, props.memoryId], next);
    emit("changed", next);
    await queryClient.invalidateQueries({ queryKey: ["memories"] });
  } catch (error) {
    showError(error, "照片没有从回忆中移除。请稍后再试。");
  } finally {
    pendingMediaId.value = null;
  }
}

async function deleteMemory() {
  const current = memory.value;
  if (!current || deleting.value) return;
  if (!window.confirm("把这段回忆移入回收站？它不会被立即物理删除。")) return;
  deleting.value = true;
  actionError.value = null;
  try {
    await stageTwoApi.deleteMemory(current.id, current.version);
    await queryClient.invalidateQueries({ queryKey: ["memories"] });
    emit("deleted", current.id);
  } catch (error) {
    showError(error, "回忆没有删除成功。请稍后再试。");
  } finally {
    deleting.value = false;
  }
}

function revisionSummary(revision: MemoryRevision) {
  const labels: Record<string, string> = {
    title: "标题",
    content: "共同正文",
    happenedAt: "发生时间",
    placeId: "地点",
    mood: "共同心情",
    isFirstTime: "第一次标记",
    firstTimeLabel: "第一次名称",
    isPinned: "置顶状态",
    status: "发布状态",
    tagIds: "标签",
  };
  return Object.keys(revision.changes)
    .map((field) => labels[field] ?? field)
    .join("、");
}

function perspectiveStateLabel(perspective: MemoryPerspectiveView | undefined) {
  if (!perspective || perspective.state === "EMPTY") return "还没有写";
  if (perspective.state === "DRAFT") return "草稿，仅本人可见";
  return "已提交";
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex justify-end bg-ink-950/45 backdrop-blur-sm"
    role="presentation"
    @mousedown.self="$emit('close')"
  >
    <section
      class="h-full w-full overflow-y-auto border-l border-white/80 bg-[#f7f5f1] shadow-2xl dark:border-white/10 dark:bg-ink-950 sm:max-w-3xl"
      role="dialog"
      aria-modal="true"
      aria-label="回忆详情"
    >
      <header
        class="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-ink-100 bg-[#f7f5f1]/95 px-4 py-4 backdrop-blur dark:border-white/[0.07] dark:bg-ink-950/95 sm:px-7"
      >
        <button
          type="button"
          class="inline-flex min-h-10 items-center gap-2 rounded-2xl px-3 text-sm font-semibold text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-white/[0.07]"
          @click="$emit('close')"
        >
          <X class="size-4" /> 关闭
        </button>
        <div v-if="memory" class="flex items-center gap-2">
          <BaseButton
            variant="secondary"
            size="sm"
            @click="$emit('edit', memory)"
          >
            <Pencil class="size-4" /> 编辑
          </BaseButton>
          <BaseButton
            variant="danger"
            size="sm"
            :loading="deleting"
            @click="deleteMemory"
          >
            <Trash2 class="size-4" />
            <span class="hidden sm:inline">删除</span>
          </BaseButton>
        </div>
      </header>

      <div class="px-4 py-6 sm:px-7 sm:py-8">
        <AsyncState
          v-if="detailQuery.isPending.value"
          state="loading"
          title="正在打开这段回忆…"
          message="共同正文、双方视角与私密照片正在一起准备。"
        />
        <AsyncState
          v-else-if="detailQuery.isError.value"
          state="error"
          title="这段回忆暂时没有打开"
          :message="
            detailQuery.error.value instanceof Error
              ? detailQuery.error.value.message
              : '请稍后再试。'
          "
          action-label="重新加载"
          @action="detailQuery.refetch()"
        />

        <article v-else-if="memory" class="space-y-7">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <span
                v-if="memory.isFirstTime"
                class="inline-flex items-center gap-1 rounded-full bg-future-100 px-3 py-1 text-xs font-bold text-future-700 dark:bg-future-950/50 dark:text-future-200"
              >
                <Sparkles class="size-3.5" />
                {{ memory.firstTimeLabel || "我们的第一次" }}
              </span>
              <span
                v-if="memory.status !== 'PUBLISHED'"
                class="rounded-full bg-ink-100 px-3 py-1 text-xs font-bold text-ink-500 dark:bg-white/[0.07] dark:text-ink-300"
              >
                {{ memory.status === "DRAFT" ? "仅我可见的草稿" : "已归档" }}
              </span>
            </div>
            <h1
              class="mt-4 font-display text-3xl font-semibold leading-tight tracking-[-0.035em] text-ink-950 dark:text-white sm:text-4xl"
            >
              {{ memory.title }}
            </h1>
            <div
              class="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-ink-500 dark:text-ink-400"
            >
              <span class="inline-flex items-center gap-1.5"
                ><Clock3 class="size-4" />
                {{ formatMemoryDate(memory.happenedAt, true, timezone) }}</span
              >
              <span v-if="memory.place" class="inline-flex items-center gap-1.5"
                ><MapPin class="size-4" /> {{ memory.place.name }}</span
              >
              <span v-if="memory.mood">心情：{{ memory.mood }}</span>
            </div>
          </div>

          <div
            v-if="memory.media.length"
            class="grid grid-cols-2 gap-3 sm:grid-cols-3"
          >
            <figure
              v-for="item in memory.media"
              :key="item.asset.id"
              class="group relative aspect-square overflow-hidden rounded-3xl bg-ink-100 dark:bg-ink-900"
            >
              <button
                type="button"
                class="block size-full"
                :aria-label="`查看 ${item.asset.originalName}`"
                @click="previewAsset = item.asset"
              >
                <PrivateMediaImage
                  :src="item.asset.thumbnailUrl"
                  :alt="item.asset.originalName"
                  :retryable="false"
                />
              </button>
              <button
                type="button"
                class="absolute right-2 top-2 grid size-9 place-items-center rounded-xl bg-ink-950/65 text-white opacity-100 backdrop-blur sm:opacity-0 sm:transition sm:group-hover:opacity-100"
                :disabled="Boolean(pendingMediaId)"
                :aria-label="`从回忆中移除 ${item.asset.originalName}`"
                @click="detachMedia(item.asset.id)"
              >
                <Trash2 class="size-4" />
              </button>
            </figure>
          </div>

          <div
            class="rounded-3xl border border-ink-200/80 bg-white/70 p-5 dark:border-white/10 dark:bg-white/[0.035] sm:p-6"
          >
            <p
              class="whitespace-pre-wrap text-sm leading-7 text-ink-700 dark:text-ink-200 sm:text-base"
            >
              {{ memory.content || "这段共同故事暂时还没有正文。" }}
            </p>
            <div v-if="memory.tags.length" class="mt-5 flex flex-wrap gap-2">
              <span
                v-for="tag in memory.tags"
                :key="tag.id"
                class="rounded-full bg-memory-100 px-3 py-1.5 text-xs font-semibold text-memory-700 dark:bg-memory-950/45 dark:text-memory-200"
              >
                # {{ tag.name }}
              </span>
            </div>
          </div>

          <section aria-labelledby="perspectives-title">
            <div class="flex items-center gap-3">
              <span
                class="grid size-10 place-items-center rounded-2xl bg-memory-100 text-memory-700 dark:bg-memory-950/50 dark:text-memory-200"
                ><UsersRound class="size-4"
              /></span>
              <div>
                <h2
                  id="perspectives-title"
                  class="font-display text-xl font-semibold text-ink-950 dark:text-white"
                >
                  两个人的视角
                </h2>
                <p class="mt-0.5 text-xs text-ink-400">
                  草稿只有作者本人可见，提交后才分享。
                </p>
              </div>
            </div>

            <div class="mt-4 grid gap-4 sm:grid-cols-2">
              <div
                class="rounded-3xl border border-memory-200/70 bg-memory-50/65 p-5 dark:border-memory-900/50 dark:bg-memory-950/25"
              >
                <div class="flex items-center justify-between gap-3">
                  <p class="font-semibold text-ink-900 dark:text-white">
                    我的视角
                  </p>
                  <span
                    class="text-xs font-semibold text-memory-600 dark:text-memory-300"
                    >{{ perspectiveStateLabel(ownPerspective) }}</span
                  >
                </div>
                <p
                  v-if="ownPerspectiveSubmitted"
                  class="mt-3 text-xs leading-5 text-memory-700 dark:text-memory-200"
                >
                  这份视角已经分享；继续修改会直接更新另一半看到的内容。
                </p>
                <textarea
                  v-model="perspectiveContent"
                  class="field-input mt-4 min-h-32 resize-y"
                  maxlength="50000"
                  placeholder="只写属于你的感受…"
                  @input="perspectiveDirty = true"
                />
                <input
                  v-model="perspectiveMood"
                  class="field-input mt-3 py-2.5"
                  maxlength="80"
                  placeholder="我的心情（可选）"
                  @input="perspectiveDirty = true"
                />
                <div class="mt-3 flex flex-col gap-2 sm:flex-row">
                  <BaseButton
                    variant="secondary"
                    size="sm"
                    :loading="perspectiveSaving"
                    :disabled="!perspectiveContent.trim()"
                    @click="savePerspective(false)"
                  >
                    <Check class="size-4" />
                    {{ ownPerspectiveSubmitted ? "保存视角修改" : "保存草稿" }}
                  </BaseButton>
                  <BaseButton
                    v-if="!ownPerspectiveSubmitted"
                    size="sm"
                    :loading="perspectiveSaving"
                    :disabled="!perspectiveContent.trim()"
                    @click="savePerspective(true)"
                  >
                    <Send class="size-4" /> 提交视角
                  </BaseButton>
                </div>
              </div>

              <div
                class="rounded-3xl border border-present-200/70 bg-present-50/65 p-5 dark:border-present-900/50 dark:bg-present-950/25"
              >
                <div class="flex items-center justify-between gap-3">
                  <p class="font-semibold text-ink-900 dark:text-white">
                    {{
                      partnerPerspective?.author.displayName || "另一半"
                    }}的视角
                  </p>
                  <span
                    class="text-xs font-semibold text-present-600 dark:text-present-300"
                    >{{ perspectiveStateLabel(partnerPerspective) }}</span
                  >
                </div>
                <p
                  v-if="
                    partnerPerspective?.state === 'SUBMITTED' &&
                    partnerPerspective.content
                  "
                  class="mt-4 whitespace-pre-wrap text-sm leading-6 text-ink-700 dark:text-ink-200"
                >
                  {{ partnerPerspective.content }}
                </p>
                <p
                  v-else
                  class="mt-4 text-sm leading-6 text-ink-500 dark:text-ink-400"
                >
                  {{
                    partnerPerspective?.state === "DRAFT"
                      ? "对方正在写自己的草稿，提交前不会展示内容。"
                      : "另一份视角还在等待自然发生。"
                  }}
                </p>
                <p
                  v-if="
                    partnerPerspective?.state === 'SUBMITTED' &&
                    partnerPerspective.mood
                  "
                  class="mt-3 text-xs text-ink-500"
                >
                  当时的心情：{{ partnerPerspective.mood }}
                </p>
              </div>
            </div>
          </section>

          <section
            class="rounded-3xl border border-ink-200/80 bg-white/65 p-5 dark:border-white/10 dark:bg-white/[0.035] sm:p-6"
          >
            <h2
              class="font-display text-xl font-semibold text-ink-950 dark:text-white"
            >
              给这段回忆一个回应
            </h2>
            <div class="mt-4 flex flex-wrap gap-2">
              <button
                v-for="emoji in reactions"
                :key="emoji"
                type="button"
                class="inline-flex min-h-11 items-center gap-2 rounded-2xl border px-3.5 text-lg transition disabled:opacity-50"
                :class="
                  memory.reactions.find((reaction) => reaction.emoji === emoji)
                    ?.reactedByMe
                    ? 'border-memory-400 bg-memory-100 dark:border-memory-500 dark:bg-memory-950/50'
                    : 'border-ink-200 bg-white/70 dark:border-white/10 dark:bg-white/[0.04]'
                "
                :disabled="Boolean(pendingReaction)"
                @click="toggleReaction(emoji)"
              >
                {{ emoji }}
                <span
                  class="text-xs font-bold text-ink-500 dark:text-ink-300"
                  >{{
                    memory.reactions.find(
                      (reaction) => reaction.emoji === emoji,
                    )?.count ?? 0
                  }}</span
                >
              </button>
            </div>
          </section>

          <section aria-labelledby="comments-title">
            <div class="flex items-center gap-3">
              <span
                class="grid size-10 place-items-center rounded-2xl bg-present-100 text-present-700 dark:bg-present-950/50 dark:text-present-200"
                ><MessageCircle class="size-4"
              /></span>
              <div>
                <h2
                  id="comments-title"
                  class="font-display text-xl font-semibold text-ink-950 dark:text-white"
                >
                  一起聊聊
                </h2>
                <p class="mt-0.5 text-xs text-ink-400">
                  {{ memory.comments.length }} 条评论
                </p>
              </div>
            </div>
            <form
              class="mt-4 flex items-end gap-2"
              @submit.prevent="addComment"
            >
              <textarea
                v-model="comment"
                class="field-input min-h-12 flex-1 resize-y py-3"
                maxlength="5000"
                rows="1"
                placeholder="写一句想说的话…"
              />
              <BaseButton
                type="submit"
                size="sm"
                aria-label="发送评论"
                :loading="commentSaving"
                :disabled="!comment.trim()"
                ><Send class="size-4" /><span class="hidden sm:inline"
                  >发送</span
                ></BaseButton
              >
            </form>
            <div v-if="memory.comments.length" class="mt-5 space-y-3">
              <article
                v-for="item in memory.comments"
                :key="item.id"
                class="rounded-2xl bg-white/70 p-4 dark:bg-white/[0.04]"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p
                      class="text-sm font-semibold text-ink-900 dark:text-white"
                    >
                      {{ item.author.displayName }}
                    </p>
                    <p class="mt-1 text-xs text-ink-400">
                      {{ formatMemoryDate(item.createdAt, true, timezone) }}
                    </p>
                  </div>
                  <button
                    v-if="item.canDelete"
                    type="button"
                    class="grid size-8 place-items-center rounded-xl text-ink-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                    :disabled="Boolean(pendingCommentId)"
                    aria-label="删除评论"
                    @click="deleteComment(item.id)"
                  >
                    <Trash2 class="size-4" />
                  </button>
                </div>
                <p
                  class="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink-700 dark:text-ink-200"
                >
                  {{ item.content }}
                </p>
              </article>
            </div>
            <p
              v-else
              class="mt-5 rounded-2xl border border-dashed border-ink-200 px-4 py-6 text-center text-sm text-ink-400 dark:border-white/10"
            >
              还没有评论，第一句就从这里开始。
            </p>
          </section>

          <section>
            <button
              type="button"
              class="inline-flex items-center gap-2 text-sm font-semibold text-ink-600 dark:text-ink-300"
              @click="showRevisions = !showRevisions"
            >
              <History class="size-4" />
              {{ showRevisions ? "收起修改历史" : "查看修改历史" }}
            </button>
            <div v-if="showRevisions" class="mt-4">
              <AsyncState
                v-if="revisionsQuery.isPending.value"
                state="loading"
                title="正在整理修改历史…"
              />
              <AsyncState
                v-else-if="revisionsQuery.isError.value"
                state="error"
                title="修改历史暂时没有打开"
                action-label="重试"
                @action="revisionsQuery.refetch()"
              />
              <div
                v-else-if="revisionsQuery.data.value?.length"
                class="space-y-3"
              >
                <div
                  v-for="revision in revisionsQuery.data.value"
                  :key="revision.version"
                  class="rounded-2xl border border-ink-200/80 bg-white/55 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]"
                >
                  <div
                    class="flex flex-wrap items-center justify-between gap-2"
                  >
                    <p
                      class="text-sm font-semibold text-ink-800 dark:text-ink-100"
                    >
                      v{{ revision.version }} ·
                      {{ revision.author.displayName }}
                    </p>
                    <p class="text-xs text-ink-400">
                      {{ formatMemoryDate(revision.createdAt, true, timezone) }}
                    </p>
                  </div>
                  <p class="mt-2 text-xs text-ink-500 dark:text-ink-400">
                    修改了：{{ revisionSummary(revision) || "共同内容" }}
                  </p>
                </div>
              </div>
              <p v-else class="text-sm text-ink-400">
                还没有可展示的修改记录。
              </p>
            </div>
          </section>

          <p
            v-if="actionMessage"
            class="rounded-2xl border border-present-200 bg-present-50 px-4 py-3 text-sm text-present-700 dark:border-present-900/60 dark:bg-present-950/30 dark:text-present-200"
            role="status"
          >
            {{ actionMessage }}
          </p>
          <p
            v-if="actionError"
            class="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200 sm:flex-row sm:items-center sm:justify-between"
            role="alert"
          >
            <span>{{ actionError }}</span>
            <button
              v-if="conflictDetected"
              type="button"
              class="shrink-0 font-semibold underline underline-offset-4"
              @click="reloadAfterConflict"
            >
              重新载入最新内容
            </button>
          </p>
        </article>
      </div>
    </section>

    <div
      v-if="previewAsset"
      class="fixed inset-0 z-[60] grid place-items-center bg-ink-950/90 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      :aria-label="`查看 ${previewAsset.originalName}`"
      @mousedown.self="previewAsset = null"
    >
      <button
        type="button"
        class="absolute right-4 top-4 grid size-11 place-items-center rounded-2xl bg-white/10 text-white backdrop-blur hover:bg-white/20"
        aria-label="关闭照片预览"
        @click="previewAsset = null"
      >
        <X class="size-5" />
      </button>
      <div class="max-h-full max-w-5xl overflow-hidden rounded-3xl">
        <PrivateMediaImage
          :src="previewAsset.url"
          :alt="previewAsset.originalName"
          image-class="max-h-[88dvh] max-w-full object-contain"
        />
      </div>
    </div>
  </div>
</template>
