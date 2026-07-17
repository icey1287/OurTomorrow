<script setup lang="ts">
import type {
  CompleteWishRequest,
  ConvertWishToMemoryRequest,
  CreateWishRequest,
  PlaceSummary,
  UpdateWishRequest,
  WishCategory,
  WishDetail,
  WishPlanRequest,
} from "@our-tomorrow/contracts";
import { Camera, Check, Sparkles } from "lucide-vue-next";
import { computed, reactive, ref, watch } from "vue";

import {
  fromDateTimeLocal,
  imageFileError,
  toDateTimeLocal,
} from "@/features/remember/remember-utils";
import {
  joinList,
  splitList,
  WISH_CATEGORIES,
} from "@/features/tomorrow/tomorrow-utils";
import BaseButton from "@/shared/components/BaseButton.vue";

export type WishEditorMode =
  "create" | "edit" | "plan" | "complete" | "convert";

export type WishEditorSubmission =
  | { mode: "create"; input: CreateWishRequest }
  | { mode: "edit"; id: string; input: UpdateWishRequest }
  | { mode: "plan"; id: string; input: WishPlanRequest }
  | {
      mode: "complete";
      id: string;
      input: Omit<CompleteWishRequest, "mediaIds">;
      files: File[];
    }
  | { mode: "convert"; id: string; input: ConvertWishToMemoryRequest };

const props = defineProps<{
  mode: WishEditorMode;
  wish: WishDetail | null;
  places: PlaceSummary[];
  timezone: string;
  pending: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  submit: [submission: WishEditorSubmission];
}>();

const fields = reactive({
  title: "",
  description: "",
  expectation: "",
  category: "CUSTOM" as WishCategory,
  placeId: "",
  itinerary: "",
  preparations: "",
  participants: "",
  startsAt: "",
  endsAt: "",
  reminderAt: "",
  completedAt: "",
  completionNote: "",
  memoryContent: "",
  happenedAt: "",
});
const files = ref<File[]>([]);
const fieldErrors = ref<Record<string, string>>({});

const submitLabel = computed(() => {
  if (props.mode === "create") return "写下愿望";
  if (props.mode === "edit") return "保存愿望";
  if (props.mode === "plan") return "保存并进入计划";
  if (props.mode === "complete") return "确认已经完成";
  return "转为一段回忆";
});

function reset() {
  const wish = props.wish;
  fields.title =
    props.mode === "plan"
      ? (wish?.plan?.title ?? wish?.title ?? "")
      : (wish?.title ?? "");
  fields.description = wish?.description ?? "";
  fields.expectation =
    props.mode === "plan"
      ? (wish?.plan?.expectation ?? wish?.expectation ?? "")
      : (wish?.expectation ?? "");
  fields.category = wish?.category ?? "CUSTOM";
  fields.placeId = wish?.plan?.place?.id ?? wish?.place?.id ?? "";
  fields.itinerary = wish?.plan?.itinerary ?? "";
  fields.preparations = joinList(wish?.plan?.preparations ?? []);
  fields.participants = joinList(wish?.plan?.participants ?? []);
  fields.startsAt = wish?.plan?.startsAt
    ? toDateTimeLocal(wish.plan.startsAt, props.timezone)
    : "";
  fields.endsAt = wish?.plan?.endsAt
    ? toDateTimeLocal(wish.plan.endsAt, props.timezone)
    : "";
  fields.reminderAt = wish?.plan?.reminderAt
    ? toDateTimeLocal(wish.plan.reminderAt, props.timezone)
    : "";
  fields.completedAt = toDateTimeLocal(
    wish?.completedAt ?? new Date().toISOString(),
    props.timezone,
  );
  fields.completionNote = wish?.completionNote ?? "";
  fields.memoryContent = wish?.completionNote ?? wish?.expectation ?? "";
  fields.happenedAt = toDateTimeLocal(
    wish?.completedAt ?? new Date().toISOString(),
    props.timezone,
  );
  files.value = [];
  fieldErrors.value = {};
}

watch(
  () => [props.mode, props.wish?.id, props.wish?.version, props.timezone],
  reset,
  { immediate: true },
);

function chooseFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const selected = [...(input.files ?? [])];
  input.value = "";
  for (const file of selected) {
    const error = imageFileError(file);
    if (error) {
      fieldErrors.value = { ...fieldErrors.value, files: error };
      return;
    }
  }
  if (files.value.length + selected.length > 30) {
    fieldErrors.value = {
      ...fieldErrors.value,
      files: "一次最多补充 30 张完成照片。",
    };
    return;
  }
  fieldErrors.value = { ...fieldErrors.value, files: "" };
  files.value = [...files.value, ...selected];
}

function instant(value: string, field: string) {
  if (!value) return null;
  const parsed = fromDateTimeLocal(value, props.timezone);
  if (!parsed) fieldErrors.value[field] = "请选择有效的日期和时间。";
  return parsed;
}

function submit() {
  const errors: Record<string, string> = {};
  fieldErrors.value = errors;
  const title = fields.title.trim();
  if (!title) errors.title = "请写下标题。";
  if (title.length > 200) errors.title = "标题不能超过 200 个字符。";

  if (props.mode === "create") {
    if (Object.keys(errors).length) return;
    emit("submit", {
      mode: "create",
      input: {
        title,
        description: fields.description.trim() || null,
        expectation: fields.expectation.trim() || null,
        category: fields.category,
        placeId: fields.placeId || null,
      },
    });
    return;
  }

  const wish = props.wish;
  if (!wish) return;

  if (props.mode === "edit") {
    if (Object.keys(errors).length) return;
    emit("submit", {
      mode: "edit",
      id: wish.id,
      input: {
        version: wish.version,
        title,
        description: fields.description.trim() || null,
        expectation: fields.expectation.trim() || null,
        category: fields.category,
        placeId: fields.placeId || null,
      },
    });
    return;
  }

  if (props.mode === "plan") {
    const startsAt = instant(fields.startsAt, "startsAt");
    const endsAt = instant(fields.endsAt, "endsAt");
    const reminderAt = instant(fields.reminderAt, "reminderAt");
    if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) {
      errors.endsAt = "结束时间需要晚于开始时间。";
    }
    if (Object.keys(errors).length) return;
    emit("submit", {
      mode: "plan",
      id: wish.id,
      input: {
        version: wish.version,
        title,
        itinerary: fields.itinerary.trim() || null,
        preparations: splitList(fields.preparations, 100),
        participants: splitList(fields.participants, 20),
        expectation: fields.expectation.trim() || null,
        placeId: fields.placeId || null,
        startsAt,
        endsAt,
        reminderAt,
      },
    });
    return;
  }

  if (props.mode === "complete") {
    const completedAt = instant(fields.completedAt, "completedAt");
    if (!completedAt) errors.completedAt = "请选择完成时间。";
    if (Object.keys(errors).length || !completedAt) return;
    emit("submit", {
      mode: "complete",
      id: wish.id,
      input: {
        version: wish.version,
        completedAt,
        completionNote: fields.completionNote.trim() || null,
      },
      files: [...files.value],
    });
    return;
  }

  const happenedAt = instant(fields.happenedAt, "happenedAt");
  if (!happenedAt) errors.happenedAt = "请选择回忆发生时间。";
  if (Object.keys(errors).length || !happenedAt) return;
  emit("submit", {
    mode: "convert",
    id: wish.id,
    input: {
      version: wish.version,
      title,
      content: fields.memoryContent.trim() || null,
      happenedAt,
      placeId: fields.placeId || null,
      mediaIds: wish.media.map((asset) => asset.id),
    },
  });
}
</script>

<template>
  <form class="space-y-5" @submit.prevent="submit">
    <div>
      <label class="field-label" for="wish-editor-title">
        {{
          mode === "plan"
            ? "计划标题"
            : mode === "convert"
              ? "回忆标题"
              : "愿望标题"
        }}
      </label>
      <input
        id="wish-editor-title"
        v-model="fields.title"
        class="field-input"
        maxlength="200"
        required
        :aria-invalid="Boolean(fieldErrors.title)"
        placeholder="比如：一起去看一次极光"
      />
      <p v-if="fieldErrors.title" class="mt-2 text-xs text-red-600">
        {{ fieldErrors.title }}
      </p>
    </div>

    <template v-if="mode === 'create' || mode === 'edit'">
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="field-label" for="wish-editor-category">分类</label>
          <select
            id="wish-editor-category"
            v-model="fields.category"
            class="field-input py-3"
          >
            <option
              v-for="option in WISH_CATEGORIES"
              :key="option.value"
              :value="option.value"
            >
              {{ option.emoji }} {{ option.label }}
            </option>
          </select>
        </div>
        <div>
          <label class="field-label" for="wish-editor-place"
            >地点（可选）</label
          >
          <select
            id="wish-editor-place"
            v-model="fields.placeId"
            class="field-input py-3"
          >
            <option value="">暂不关联地点</option>
            <option v-for="place in places" :key="place.id" :value="place.id">
              {{ place.name }}
            </option>
          </select>
        </div>
      </div>
      <div>
        <label class="field-label" for="wish-editor-description"
          >想做什么</label
        >
        <textarea
          id="wish-editor-description"
          v-model="fields.description"
          class="field-input min-h-28 resize-y"
          maxlength="50000"
          placeholder="不用写成任务，留下一点当时的念头就好。"
        />
      </div>
      <div>
        <label class="field-label" for="wish-editor-expectation"
          >一句期待</label
        >
        <textarea
          id="wish-editor-expectation"
          v-model="fields.expectation"
          class="field-input min-h-24 resize-y"
          maxlength="10000"
          placeholder="希望那一天，会是什么样子？"
        />
      </div>
    </template>

    <template v-else-if="mode === 'plan'">
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="field-label" for="wish-plan-start">开始时间</label>
          <input
            id="wish-plan-start"
            v-model="fields.startsAt"
            class="field-input"
            type="datetime-local"
          />
          <p v-if="fieldErrors.startsAt" class="mt-2 text-xs text-red-600">
            {{ fieldErrors.startsAt }}
          </p>
        </div>
        <div>
          <label class="field-label" for="wish-plan-end">结束时间</label>
          <input
            id="wish-plan-end"
            v-model="fields.endsAt"
            class="field-input"
            type="datetime-local"
          />
          <p v-if="fieldErrors.endsAt" class="mt-2 text-xs text-red-600">
            {{ fieldErrors.endsAt }}
          </p>
        </div>
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="field-label" for="wish-plan-reminder">提醒时间</label>
          <input
            id="wish-plan-reminder"
            v-model="fields.reminderAt"
            class="field-input"
            type="datetime-local"
          />
          <p v-if="fieldErrors.reminderAt" class="mt-2 text-xs text-red-600">
            {{ fieldErrors.reminderAt }}
          </p>
        </div>
        <div>
          <label class="field-label" for="wish-plan-place">地点</label>
          <select
            id="wish-plan-place"
            v-model="fields.placeId"
            class="field-input py-3"
          >
            <option value="">地点待定</option>
            <option v-for="place in places" :key="place.id" :value="place.id">
              {{ place.name }}
            </option>
          </select>
        </div>
      </div>
      <div>
        <label class="field-label" for="wish-plan-itinerary">轻量行程</label>
        <textarea
          id="wish-plan-itinerary"
          v-model="fields.itinerary"
          class="field-input min-h-28 resize-y"
          maxlength="50000"
          placeholder="写下大致安排，不需要变成复杂项目。"
        />
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="field-label" for="wish-plan-preparations"
            >准备事项</label
          >
          <textarea
            id="wish-plan-preparations"
            v-model="fields.preparations"
            class="field-input min-h-24 resize-y"
            placeholder="每行一项"
          />
        </div>
        <div>
          <label class="field-label" for="wish-plan-participants">参与人</label>
          <textarea
            id="wish-plan-participants"
            v-model="fields.participants"
            class="field-input min-h-24 resize-y"
            placeholder="每行一个称呼"
          />
        </div>
      </div>
      <div>
        <label class="field-label" for="wish-plan-expectation">一句期待</label>
        <textarea
          id="wish-plan-expectation"
          v-model="fields.expectation"
          class="field-input min-h-24 resize-y"
          maxlength="10000"
        />
      </div>
    </template>

    <template v-else-if="mode === 'complete'">
      <div>
        <label class="field-label" for="wish-completed-at">完成时间</label>
        <input
          id="wish-completed-at"
          v-model="fields.completedAt"
          class="field-input"
          type="datetime-local"
          required
        />
        <p v-if="fieldErrors.completedAt" class="mt-2 text-xs text-red-600">
          {{ fieldErrors.completedAt }}
        </p>
      </div>
      <div>
        <label class="field-label" for="wish-completion-note"
          >完成后的感受</label
        >
        <textarea
          id="wish-completion-note"
          v-model="fields.completionNote"
          class="field-input min-h-32 resize-y"
          maxlength="50000"
          placeholder="这件未来真的发生时，和想象中一样吗？"
        />
      </div>
      <label
        class="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-future-300 bg-future-50/70 px-4 py-4 text-sm font-semibold text-future-800 transition hover:border-future-400 motion-reduce:transition-none dark:border-future-800 dark:bg-future-950/30 dark:text-future-200"
      >
        <Camera class="size-5" />
        <span>{{
          files.length ? `已选择 ${files.length} 张照片` : "添加完成照片"
        }}</span>
        <input
          class="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          @change="chooseFiles"
        />
      </label>
      <p v-if="fieldErrors.files" class="text-xs text-red-600">
        {{ fieldErrors.files }}
      </p>
    </template>

    <template v-else>
      <div
        class="rounded-2xl bg-memory-50 px-4 py-3 text-sm leading-6 text-memory-800 dark:bg-memory-950/30 dark:text-memory-200"
      >
        标题、完成日期、地点和愿望照片会带入记录；转换成功后，来源愿望仍可追溯。
      </div>
      <div>
        <label class="field-label" for="wish-memory-time">发生时间</label>
        <input
          id="wish-memory-time"
          v-model="fields.happenedAt"
          class="field-input"
          type="datetime-local"
          required
        />
        <p v-if="fieldErrors.happenedAt" class="mt-2 text-xs text-red-600">
          {{ fieldErrors.happenedAt }}
        </p>
      </div>
      <div>
        <label class="field-label" for="wish-memory-place">地点</label>
        <select
          id="wish-memory-place"
          v-model="fields.placeId"
          class="field-input py-3"
        >
          <option value="">不关联地点</option>
          <option v-for="place in places" :key="place.id" :value="place.id">
            {{ place.name }}
          </option>
        </select>
      </div>
      <div>
        <label class="field-label" for="wish-memory-content">回忆正文</label>
        <textarea
          id="wish-memory-content"
          v-model="fields.memoryContent"
          class="field-input min-h-36 resize-y"
          maxlength="20000"
          placeholder="把期待和真正发生后的感受连在一起。"
        />
      </div>
    </template>

    <p
      v-if="error"
      class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200"
      role="alert"
    >
      {{ error }}
    </p>

    <BaseButton type="submit" block :loading="pending">
      <Sparkles v-if="mode === 'convert'" class="size-4" />
      <Check v-else class="size-4" />
      {{ submitLabel }}
    </BaseButton>
  </form>
</template>
