<script setup lang="ts">
import type {
  CreateMemoryRequest,
  MediaAssetSummary,
  MemoryDetail,
  PlaceSummary,
  TagSummary,
} from "@our-tomorrow/contracts";
import {
  Camera,
  Check,
  MapPin,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-vue-next";
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";

import {
  fromDateTimeLocal,
  imageFileError,
  toDateTimeLocal,
} from "@/features/remember/remember-utils";
import { apiFieldErrors, ApiClientError } from "@/shared/api/client";
import { stageTwoApi } from "@/shared/api/stage-two";
import BaseButton from "@/shared/components/BaseButton.vue";

const props = defineProps<{
  memory: MemoryDetail | null;
  tags: TagSummary[];
  places: PlaceSummary[];
  timezone: string;
}>();

const emit = defineEmits<{
  close: [];
  saved: [memory: MemoryDetail];
  conflict: [];
  tagCreated: [tag: TagSummary];
  placeCreated: [place: PlaceSummary];
}>();

type MemoryForm = {
  title: string;
  content: string;
  happenedAt: string;
  placeId: string;
  mood: string;
  isFirstTime: boolean;
  firstTimeLabel: string;
  isPinned: boolean;
  status: "DRAFT" | "PUBLISHED";
  tagIds: string[];
};

const form = reactive<MemoryForm>({
  title: "",
  content: "",
  happenedAt: "",
  placeId: "",
  mood: "",
  isFirstTime: false,
  firstTimeLabel: "",
  isPinned: false,
  status: "PUBLISHED",
  tagIds: [],
});
const files = ref<File[]>([]);
const originalHappenedAtInput = ref("");
const saving = ref(false);
const uploadLabel = ref<string | null>(null);
const requestError = ref<string | null>(null);
const fieldErrors = ref<Record<string, string>>({});
const showNewTag = ref(false);
const showNewPlace = ref(false);
const newTagName = ref("");
const newPlaceName = ref("");
const creatingTag = ref(false);
const creatingPlace = ref(false);
const createdSharedMetadata = ref(false);
const pendingMediaBinding = ref<{
  memory: MemoryDetail;
  assets: MediaAssetSummary[];
} | null>(null);

const isEditing = computed(() => Boolean(props.memory));
const title = computed(() =>
  isEditing.value ? "编辑共同回忆" : "写下一段新回忆",
);

function freshHappenedAt() {
  return toDateTimeLocal(new Date().toISOString(), props.timezone);
}

function reset() {
  const memory = props.memory;
  form.title = memory?.title ?? "";
  form.content = memory?.content ?? "";
  form.happenedAt = memory
    ? toDateTimeLocal(memory.happenedAt, props.timezone)
    : freshHappenedAt();
  originalHappenedAtInput.value = form.happenedAt;
  form.placeId = memory?.place?.id ?? "";
  form.mood = memory?.mood ?? "";
  form.isFirstTime = memory?.isFirstTime ?? false;
  form.firstTimeLabel = memory?.firstTimeLabel ?? "";
  form.isPinned = memory?.isPinned ?? false;
  form.status = memory?.status === "DRAFT" ? "DRAFT" : "PUBLISHED";
  form.tagIds = memory?.tags.map((tag) => tag.id) ?? [];
  files.value = [];
  requestError.value = null;
  fieldErrors.value = {};
  uploadLabel.value = null;
  pendingMediaBinding.value = null;
  createdSharedMetadata.value = false;
}

watch(() => props.memory, reset, { immediate: true });
watch(
  () => form.status,
  (status) => {
    if (status !== "DRAFT") return;
    showNewTag.value = false;
    showNewPlace.value = false;
    newTagName.value = "";
    newPlaceName.value = "";
  },
);

function toggleTag(id: string) {
  form.tagIds = form.tagIds.includes(id)
    ? form.tagIds.filter((tagId) => tagId !== id)
    : [...form.tagIds, id];
}

function chooseFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const selected = [...(input.files ?? [])];
  input.value = "";
  requestError.value = null;

  for (const file of selected) {
    const error = imageFileError(file);
    if (error) {
      requestError.value = error;
      return;
    }
  }

  const existingCount = props.memory?.media.length ?? 0;
  if (existingCount + files.value.length + selected.length > 30) {
    requestError.value = "一段回忆最多保存 30 张图片。";
    return;
  }

  files.value = [...files.value, ...selected];
}

function validate() {
  const errors: Record<string, string> = {};
  const parsedHappenedAt = fromDateTimeLocal(form.happenedAt, props.timezone);
  const happenedAt =
    props.memory && form.happenedAt === originalHappenedAtInput.value
      ? props.memory.happenedAt
      : parsedHappenedAt;
  if (!form.title.trim()) errors.title = "请写下回忆标题。";
  else if (form.title.trim().length > 200)
    errors.title = "标题不能超过 200 个字符。";
  if (!parsedHappenedAt || !happenedAt)
    errors.happenedAt = "请选择有效的发生时间。";
  else if (new Date(happenedAt).valueOf() > Date.now())
    errors.happenedAt = "回忆的发生时间不能晚于现在。";
  if (form.content.length > 50_000)
    errors.content = "共同正文不能超过 50000 个字符。";
  if (form.mood.trim().length > 80) errors.mood = "心情不能超过 80 个字符。";
  if (form.firstTimeLabel.trim().length > 160)
    errors.firstTimeLabel = "第一次标签不能超过 160 个字符。";
  fieldErrors.value = errors;
  return Object.keys(errors).length === 0 && happenedAt ? happenedAt : null;
}

async function uploadFiles(
  selectedFiles: File[],
  onProgress: (assets: MediaAssetSummary[]) => void,
) {
  const assets: MediaAssetSummary[] = [];

  for (const [index, file] of selectedFiles.entries()) {
    uploadLabel.value = `正在私密处理第 ${index + 1}/${selectedFiles.length} 张图片…`;
    const intent = await stageTwoApi.createUploadIntent({
      originalName: file.name,
      mimeType: file.type as "image/jpeg" | "image/png" | "image/webp",
      size: file.size,
    });
    try {
      await stageTwoApi.uploadBinary(intent.uploadUrl, file, file.type);
      let asset: MediaAssetSummary;
      try {
        asset = await stageTwoApi.completeUpload(intent.uploadId);
      } catch (error) {
        if (
          error instanceof ApiClientError &&
          (error.code === "NETWORK_ERROR" || error.status >= 500)
        ) {
          asset = await stageTwoApi.completeUpload(intent.uploadId);
        } else {
          throw error;
        }
      }
      assets.push(asset);
      onProgress([...assets]);
    } catch (error) {
      await Promise.allSettled([stageTwoApi.deleteMedia(intent.uploadId)]);
      throw error;
    }
  }

  return assets;
}

async function save() {
  const happenedAt = validate();
  if (!happenedAt || saving.value) return;
  const snapshot = {
    title: form.title.trim(),
    content: form.content.trim() || null,
    happenedAt,
    placeId: form.placeId || null,
    mood: form.mood.trim() || null,
    isFirstTime: form.isFirstTime,
    firstTimeLabel:
      form.isFirstTime && form.firstTimeLabel.trim()
        ? form.firstTimeLabel.trim()
        : null,
    isPinned: form.isPinned,
    status: form.status,
    tagIds: [...form.tagIds],
    files: [...files.value],
  };
  saving.value = true;
  requestError.value = null;
  let uploaded: MediaAssetSummary[] = [];
  let sharedFieldsSaved = false;

  try {
    uploaded = await uploadFiles(snapshot.files, (assets) => {
      uploaded = assets;
    });
    const common = {
      title: snapshot.title,
      content: snapshot.content,
      happenedAt: snapshot.happenedAt,
      placeId: snapshot.placeId,
      mood: snapshot.mood,
      isFirstTime: snapshot.isFirstTime,
      firstTimeLabel: snapshot.firstTimeLabel,
      isPinned: snapshot.isPinned,
      tagIds: snapshot.tagIds,
    } satisfies Omit<
      CreateMemoryRequest,
      "status" | "mediaIds" | "coverMediaId"
    >;

    let saved: MemoryDetail;
    if (!props.memory) {
      saved = await stageTwoApi.createMemory({
        ...common,
        status: snapshot.status,
        mediaIds: uploaded.map((asset) => asset.id),
        coverMediaId: uploaded[0]?.id ?? null,
      });
      sharedFieldsSaved = true;
    } else {
      saved = await stageTwoApi.updateMemory(props.memory.id, {
        version: props.memory.version,
        ...common,
        status: snapshot.status,
      });
      sharedFieldsSaved = true;

      if (uploaded.length) {
        const mediaIds = [
          ...saved.media.map((item) => item.asset.id),
          ...uploaded.map((asset) => asset.id),
        ];
        try {
          saved = await stageTwoApi.bindMedia(saved.id, {
            version: saved.version,
            mediaIds,
            coverMediaId: saved.coverMedia?.id ?? uploaded[0]?.id ?? null,
          });
        } catch {
          pendingMediaBinding.value = { memory: saved, assets: uploaded };
          requestError.value =
            "共同文字已经保存，但照片关联在最后一步被中断。请继续完成照片，或放弃这些新照片后结束。";
          return;
        }
      }
    }

    emit("saved", saved);
  } catch (error) {
    if (!sharedFieldsSaved && uploaded.length > 0) {
      await Promise.allSettled(
        uploaded.map((asset) => stageTwoApi.deleteMedia(asset.id)),
      );
    }
    if (error instanceof ApiClientError) {
      fieldErrors.value = { ...fieldErrors.value, ...apiFieldErrors(error) };
      if (error.code === "STATE_CONFLICT") {
        requestError.value =
          "这段共同回忆刚刚在另一处更新。请重新载入最新内容后再修改。";
        emit("conflict");
      } else {
        requestError.value = error.message;
      }
    } else {
      requestError.value = "回忆没有保存成功，请稍后再试。";
    }
  } finally {
    saving.value = false;
    uploadLabel.value = null;
  }
}

async function retryMediaBinding() {
  const pending = pendingMediaBinding.value;
  if (!pending || saving.value) return;
  saving.value = true;
  requestError.value = null;
  uploadLabel.value = "正在继续完成照片关联…";
  try {
    const latest = await stageTwoApi.memory(pending.memory.id);
    const mediaIds = [
      ...latest.media.map((item) => item.asset.id),
      ...pending.assets.map((asset) => asset.id),
    ].filter((id, index, all) => all.indexOf(id) === index);
    const saved = await stageTwoApi.bindMedia(latest.id, {
      version: latest.version,
      mediaIds,
      coverMediaId: latest.coverMedia?.id ?? pending.assets[0]?.id ?? null,
    });
    pendingMediaBinding.value = null;
    emit("saved", saved);
  } catch (error) {
    requestError.value =
      error instanceof Error
        ? `照片仍未完成关联：${error.message}`
        : "照片仍未完成关联，请稍后再试。";
  } finally {
    saving.value = false;
    uploadLabel.value = null;
  }
}

async function abandonPendingMedia() {
  const pending = pendingMediaBinding.value;
  if (!pending || saving.value) return;
  saving.value = true;
  requestError.value = null;
  uploadLabel.value = "正在清理未关联照片…";
  try {
    let latest = await stageTwoApi.memory(pending.memory.id);
    const remaining = [...pending.assets];
    for (const asset of pending.assets) {
      if (latest.media.some((item) => item.asset.id === asset.id)) {
        latest = await stageTwoApi.detachMedia(
          latest.id,
          asset.id,
          latest.version,
        );
      }
      try {
        await stageTwoApi.deleteMedia(asset.id);
      } catch (error) {
        if (
          !(error instanceof ApiClientError) ||
          error.code !== "RESOURCE_NOT_FOUND"
        ) {
          throw error;
        }
      }
      remaining.splice(
        remaining.findIndex((item) => item.id === asset.id),
        1,
      );
      pendingMediaBinding.value = {
        memory: latest,
        assets: [...remaining],
      };
    }
    const saved = await stageTwoApi.memory(latest.id);
    pendingMediaBinding.value = null;
    emit("saved", saved);
  } catch (error) {
    requestError.value =
      error instanceof Error
        ? `未关联照片还没有清理完成：${error.message}`
        : "未关联照片还没有清理完成，请稍后再试。";
  } finally {
    saving.value = false;
    uploadLabel.value = null;
  }
}

function requestClose() {
  if (saving.value) return;
  if (pendingMediaBinding.value) {
    requestError.value =
      "共同文字已经保存。请先继续完成照片，或放弃这些新照片后再关闭。";
    return;
  }
  emit("close");
}

function guardPendingSave(event: BeforeUnloadEvent) {
  if (!saving.value && !pendingMediaBinding.value) return;
  event.preventDefault();
  event.returnValue = "";
}

onMounted(() => window.addEventListener("beforeunload", guardPendingSave));
onBeforeUnmount(() =>
  window.removeEventListener("beforeunload", guardPendingSave),
);

async function createTag() {
  if (form.status === "DRAFT") {
    requestError.value = "仅我可见的草稿不能新建共享标签。请发布后再创建。";
    return;
  }
  const name = newTagName.value.trim();
  if (!name || creatingTag.value) return;
  creatingTag.value = true;
  requestError.value = null;
  try {
    const tag = await stageTwoApi.createTag({ name, color: "#d97757" });
    form.status = "PUBLISHED";
    createdSharedMetadata.value = true;
    emit("tagCreated", tag);
    if (!form.tagIds.includes(tag.id)) form.tagIds = [...form.tagIds, tag.id];
    newTagName.value = "";
    showNewTag.value = false;
  } catch (error) {
    requestError.value =
      error instanceof Error ? error.message : "标签没有创建成功。";
  } finally {
    creatingTag.value = false;
  }
}

async function createPlace() {
  if (form.status === "DRAFT") {
    requestError.value = "仅我可见的草稿不能新建共享地点。请发布后再创建。";
    return;
  }
  const name = newPlaceName.value.trim();
  if (!name || creatingPlace.value) return;
  creatingPlace.value = true;
  requestError.value = null;
  try {
    const place = await stageTwoApi.createPlace({
      name,
      status: form.isFirstTime ? "FIRST_TIME" : "VISITED",
      firstVisitedAt: form.isFirstTime
        ? fromDateTimeLocal(form.happenedAt, props.timezone)
        : null,
    });
    form.status = "PUBLISHED";
    createdSharedMetadata.value = true;
    emit("placeCreated", place);
    form.placeId = place.id;
    newPlaceName.value = "";
    showNewPlace.value = false;
  } catch (error) {
    requestError.value =
      error instanceof Error ? error.message : "地点没有创建成功。";
  } finally {
    creatingPlace.value = false;
  }
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-5"
    role="presentation"
    @mousedown.self="requestClose"
  >
    <section
      class="max-h-[96dvh] w-full overflow-y-auto rounded-t-[2rem] border border-white/80 bg-[#f7f5f1] shadow-2xl dark:border-white/10 dark:bg-ink-950 sm:max-w-3xl sm:rounded-[2rem]"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
    >
      <header
        class="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-ink-100 bg-[#f7f5f1]/95 px-5 py-5 backdrop-blur dark:border-white/[0.07] dark:bg-ink-950/95 sm:px-7"
      >
        <div>
          <p class="eyebrow">共同故事</p>
          <h2
            class="mt-1 font-display text-2xl font-semibold text-ink-950 dark:text-white"
          >
            {{ title }}
          </h2>
        </div>
        <button
          type="button"
          class="grid size-10 shrink-0 place-items-center rounded-2xl text-ink-500 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-white/[0.07]"
          aria-label="关闭编辑器"
          :disabled="saving"
          @click="requestClose"
        >
          <X class="size-5" />
        </button>
      </header>

      <form class="space-y-6 px-5 py-6 sm:px-7" @submit.prevent="save">
        <div
          v-if="requestError"
          class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
          role="alert"
        >
          <p>{{ requestError }}</p>
          <div
            v-if="pendingMediaBinding"
            class="mt-3 flex flex-col gap-2 sm:flex-row"
          >
            <BaseButton size="sm" :loading="saving" @click="retryMediaBinding">
              继续完成照片
            </BaseButton>
            <BaseButton
              variant="secondary"
              size="sm"
              :disabled="saving"
              @click="abandonPendingMedia"
            >
              放弃新照片并结束
            </BaseButton>
          </div>
        </div>

        <fieldset
          class="contents"
          :disabled="saving || Boolean(pendingMediaBinding)"
        >
          <div>
            <label class="field-label" for="memory-title">回忆标题</label>
            <input
              id="memory-title"
              v-model="form.title"
              class="field-input"
              maxlength="200"
              placeholder="例如：第一次一起看海"
              autofocus
            />
            <p v-if="fieldErrors.title" class="mt-2 text-xs text-red-600">
              {{ fieldErrors.title }}
            </p>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="field-label" for="memory-happened-at"
                >发生时间</label
              >
              <input
                id="memory-happened-at"
                v-model="form.happenedAt"
                class="field-input"
                type="datetime-local"
                :max="freshHappenedAt()"
              />
              <p
                v-if="fieldErrors.happenedAt"
                class="mt-2 text-xs text-red-600"
              >
                {{ fieldErrors.happenedAt }}
              </p>
            </div>
            <div>
              <label class="field-label" for="memory-mood">共同心情</label>
              <input
                id="memory-mood"
                v-model="form.mood"
                class="field-input"
                maxlength="80"
                placeholder="轻松、惊喜、很想念…"
              />
            </div>
          </div>

          <div>
            <label class="field-label" for="memory-content">共同正文</label>
            <textarea
              id="memory-content"
              v-model="form.content"
              class="field-input min-h-40 resize-y"
              maxlength="50000"
              placeholder="写下两个人都能看见的故事。各自的感受可以在详情里单独补充。"
            />
            <div class="mt-2 flex justify-between gap-4 text-xs text-ink-400">
              <span v-if="fieldErrors.content" class="text-red-600">{{
                fieldErrors.content
              }}</span>
              <span v-else>支持先写一句话，以后继续补。</span>
              <span>{{ form.content.length }}/50000</span>
            </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <div class="mb-2 flex items-center justify-between gap-3">
                <label
                  class="text-sm font-semibold text-ink-700 dark:text-ink-200"
                  for="memory-place"
                >
                  <MapPin class="mr-1 inline size-4" /> 地点
                </label>
                <button
                  v-if="form.status !== 'DRAFT'"
                  type="button"
                  class="text-xs font-semibold text-present-700 dark:text-present-300"
                  @click="showNewPlace = !showNewPlace"
                >
                  + 快速创建
                </button>
              </div>
              <select
                id="memory-place"
                v-model="form.placeId"
                class="field-input"
              >
                <option value="">不关联地点</option>
                <option
                  v-for="place in places"
                  :key="place.id"
                  :value="place.id"
                >
                  {{ place.name }}
                </option>
              </select>
              <div v-if="showNewPlace" class="mt-3 flex gap-2">
                <input
                  v-model="newPlaceName"
                  class="field-input min-w-0 py-2.5"
                  maxlength="160"
                  placeholder="地点名称"
                  @keydown.enter.prevent="createPlace"
                />
                <BaseButton
                  size="sm"
                  :loading="creatingPlace"
                  :disabled="!newPlaceName.trim()"
                  @click="createPlace"
                >
                  <Check class="size-4" />
                </BaseButton>
              </div>
            </div>

            <div>
              <label class="field-label" for="memory-status">发布状态</label>
              <select
                id="memory-status"
                v-model="form.status"
                class="field-input"
                :disabled="creatingTag || creatingPlace"
              >
                <option value="PUBLISHED">两个人都能看见</option>
                <option
                  v-if="
                    (!isEditing || memory?.status === 'DRAFT') &&
                    !createdSharedMetadata
                  "
                  value="DRAFT"
                >
                  保存为仅我可见的草稿
                </option>
              </select>
              <p
                v-if="form.status === 'DRAFT'"
                class="mt-2 text-xs leading-5 text-ink-400"
              >
                草稿正文仅自己可见；新标签和新地点会等发布后再创建。
              </p>
              <p
                v-else-if="createdSharedMetadata"
                class="mt-2 text-xs leading-5 text-ink-400"
              >
                本次新建的标签或地点已经进入共同空间，因此不能再改为私密草稿。
              </p>
            </div>
          </div>

          <div
            class="rounded-3xl border border-memory-200/70 bg-memory-50/70 p-4 dark:border-memory-900/50 dark:bg-memory-950/25 sm:p-5"
          >
            <label class="flex cursor-pointer items-start gap-3">
              <input
                v-model="form.isFirstTime"
                type="checkbox"
                class="mt-1 size-4 rounded"
              />
              <span>
                <span
                  class="flex items-center gap-2 text-sm font-semibold text-ink-900 dark:text-white"
                >
                  <Sparkles class="size-4 text-memory-500" /> 这是我们的第一次
                </span>
                <span
                  class="mt-1 block text-xs leading-5 text-ink-500 dark:text-ink-400"
                >
                  可以写成“第一次一起旅行”“第一次看日出”。
                </span>
              </span>
            </label>
            <input
              v-if="form.isFirstTime"
              v-model="form.firstTimeLabel"
              class="field-input mt-4"
              maxlength="160"
              placeholder="这次第一次是什么？"
            />
          </div>

          <div>
            <div class="mb-3 flex items-center justify-between gap-3">
              <span class="text-sm font-semibold text-ink-700 dark:text-ink-200"
                >标签</span
              >
              <button
                v-if="form.status !== 'DRAFT'"
                type="button"
                class="text-xs font-semibold text-present-700 dark:text-present-300"
                @click="showNewTag = !showNewTag"
              >
                + 快速创建
              </button>
            </div>
            <div v-if="tags.length" class="flex flex-wrap gap-2">
              <button
                v-for="tag in tags"
                :key="tag.id"
                type="button"
                class="rounded-full border px-3 py-1.5 text-xs font-semibold transition"
                :class="
                  form.tagIds.includes(tag.id)
                    ? 'border-memory-400 bg-memory-100 text-memory-800 dark:border-memory-500 dark:bg-memory-950/50 dark:text-memory-100'
                    : 'border-ink-200 bg-white/60 text-ink-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-ink-300'
                "
                @click="toggleTag(tag.id)"
              >
                # {{ tag.name }}
              </button>
            </div>
            <p v-else class="text-xs text-ink-400">
              还没有标签，可以现在创建第一个。
            </p>
            <div v-if="showNewTag" class="mt-3 flex gap-2">
              <input
                v-model="newTagName"
                class="field-input min-w-0 py-2.5"
                maxlength="64"
                placeholder="新标签名"
                @keydown.enter.prevent="createTag"
              />
              <BaseButton
                size="sm"
                :loading="creatingTag"
                :disabled="!newTagName.trim()"
                @click="createTag"
              >
                <Plus class="size-4" />
              </BaseButton>
            </div>
          </div>

          <div>
            <div class="mb-3 flex items-center justify-between gap-3">
              <div>
                <span
                  class="text-sm font-semibold text-ink-700 dark:text-ink-200"
                  >私密照片</span
                >
                <p class="mt-1 text-xs text-ink-400">
                  JPEG、PNG 或 WebP；每张不超过 15 MB。服务端会重编码并清理
                  EXIF。
                </p>
              </div>
              <label
                class="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-xl border border-ink-200 bg-white/75 px-3.5 py-2 text-sm font-semibold text-ink-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
              >
                <Camera class="size-4" /> 选择照片
                <input
                  type="file"
                  class="sr-only"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  @change="chooseFiles"
                />
              </label>
            </div>
            <div v-if="files.length" class="space-y-2">
              <div
                v-for="(file, index) in files"
                :key="`${file.name}-${file.size}-${index}`"
                class="flex items-center justify-between gap-3 rounded-2xl bg-white/65 px-3 py-2 text-sm dark:bg-white/[0.04]"
              >
                <span class="min-w-0 truncate text-ink-600 dark:text-ink-300">{{
                  file.name
                }}</span>
                <button
                  type="button"
                  class="grid size-8 shrink-0 place-items-center rounded-xl text-ink-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                  :aria-label="`移除 ${file.name}`"
                  @click="
                    files = files.filter((_, fileIndex) => fileIndex !== index)
                  "
                >
                  <Trash2 class="size-4" />
                </button>
              </div>
            </div>
            <p v-if="memory?.media.length" class="mt-3 text-xs text-ink-400">
              已有
              {{ memory.media.length }}
              张照片；新照片会追加到相册。移除已有照片请在详情中操作。
            </p>
          </div>

          <label
            class="flex items-center gap-3 rounded-2xl border border-ink-200/80 bg-white/55 px-4 py-3 dark:border-white/10 dark:bg-white/[0.035]"
          >
            <input
              v-model="form.isPinned"
              type="checkbox"
              class="size-4 rounded"
            />
            <span class="text-sm font-semibold text-ink-700 dark:text-ink-200"
              >在时间线置顶这段回忆</span
            >
          </label>

          <footer
            class="sticky bottom-0 -mx-5 flex flex-col-reverse gap-3 border-t border-ink-100 bg-[#f7f5f1]/95 px-5 py-4 backdrop-blur dark:border-white/[0.07] dark:bg-ink-950/95 sm:-mx-7 sm:flex-row sm:justify-end sm:px-7"
          >
            <BaseButton
              variant="ghost"
              :disabled="saving"
              @click="requestClose"
            >
              取消
            </BaseButton>
            <BaseButton type="submit" :loading="saving">
              <Check class="size-4" />
              {{ uploadLabel || (isEditing ? "保存修改" : "保存回忆") }}
            </BaseButton>
          </footer>
        </fieldset>
      </form>
    </section>
  </div>
</template>
