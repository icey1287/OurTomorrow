<script setup lang="ts">
import type {
  AnniversarySummary,
  CapsuleDetail,
  CreateCapsuleRequest,
  UpdateCapsuleRequest,
  WishSummary,
} from "@our-tomorrow/contracts";
import { Camera, Check, LockKeyhole } from "lucide-vue-next";
import { computed, reactive, ref, watch } from "vue";

import {
  fromDateTimeLocal,
  imageFileError,
  toDateTimeLocal,
} from "@/features/remember/remember-utils";
import {
  CAPSULE_TYPES,
  CAPSULE_UNLOCK_RULES,
} from "@/features/tomorrow/tomorrow-utils";
import BaseButton from "@/shared/components/BaseButton.vue";

export type CapsuleEditorSubmission =
  | {
      mode: "create";
      input: Omit<CreateCapsuleRequest, "mediaIds">;
      files: File[];
    }
  | {
      mode: "edit";
      id: string;
      input: Omit<UpdateCapsuleRequest, "mediaIds">;
      files: File[];
      removeExistingMedia: boolean;
    };

const props = defineProps<{
  capsule: CapsuleDetail | null;
  currentUserId: string | null;
  anniversaries: AnniversarySummary[];
  wishes: WishSummary[];
  timezone: string;
  pending: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  submit: [submission: CapsuleEditorSubmission];
}>();

const fields = reactive({
  title: "",
  type: "TO_PARTNER" as CreateCapsuleRequest["type"],
  unlockRule: "AT_TIME" as CreateCapsuleRequest["unlockRule"],
  unlockAt: "",
  anniversaryId: "",
  wishId: "",
  unlockCondition: "",
  requiresBothConfirmation: false,
  message: "",
  removeExistingMedia: false,
});
const files = ref<File[]>([]);
const fieldErrors = ref<Record<string, string>>({});

const isCreator = computed(
  () => !props.capsule || props.capsule.createdBy.id === props.currentUserId,
);
const availableTypes = computed(() =>
  CAPSULE_TYPES.filter((option) => option.value !== "FUTURE_LETTER"),
);

function reset() {
  const capsule = props.capsule;
  fields.title = capsule?.title ?? "";
  fields.type = capsule?.type ?? "TO_PARTNER";
  fields.unlockRule = capsule?.unlockRule ?? "AT_TIME";
  fields.unlockAt = capsule?.unlockAt
    ? toDateTimeLocal(capsule.unlockAt, props.timezone)
    : "";
  fields.anniversaryId = capsule?.anniversaryId ?? "";
  fields.wishId = capsule?.wishId ?? "";
  fields.unlockCondition = capsule?.unlockCondition ?? "";
  fields.requiresBothConfirmation = capsule?.requiresBothConfirmation ?? false;
  fields.message =
    capsule?.messages?.find(
      (message) => message.author.id === props.currentUserId,
    )?.content ?? "";
  fields.removeExistingMedia = false;
  files.value = [];
  fieldErrors.value = {};
}

watch(
  () => [
    props.capsule?.id,
    props.capsule?.version,
    props.currentUserId,
    props.timezone,
  ],
  reset,
  { immediate: true },
);

watch(
  () => fields.type,
  (type) => {
    if (type === "TO_SELF") fields.requiresBothConfirmation = false;
  },
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
      files: "一枚胶囊最多保存 30 张图片。",
    };
    return;
  }
  files.value = [...files.value, ...selected];
  fields.removeExistingMedia = false;
  fieldErrors.value = { ...fieldErrors.value, files: "" };
}

function submit() {
  const errors: Record<string, string> = {};
  const title = fields.title.trim();
  const message = fields.message.trim();
  if (!title && isCreator.value) errors.title = "请写下胶囊标题。";
  if (!message) errors.message = "胶囊正文不能为空。";

  let unlockAt: string | null = null;
  if (isCreator.value && fields.unlockRule === "AT_TIME") {
    unlockAt = fromDateTimeLocal(fields.unlockAt, props.timezone);
    if (!unlockAt) errors.unlockAt = "请选择有效的解锁时间。";
  }
  if (
    isCreator.value &&
    fields.unlockRule === "ANNIVERSARY" &&
    !fields.anniversaryId
  ) {
    errors.anniversaryId = "请选择关联纪念日。";
  }
  if (
    isCreator.value &&
    fields.unlockRule === "WISH_COMPLETION" &&
    !fields.wishId
  ) {
    errors.wishId = "请选择关联愿望。";
  }
  if (
    isCreator.value &&
    fields.unlockRule === "MANUAL_CONDITION" &&
    !fields.unlockCondition.trim()
  ) {
    errors.unlockCondition = "请写下可由双方明确判断的开启条件。";
  }
  fieldErrors.value = errors;
  if (Object.keys(errors).length) return;

  if (props.capsule && !isCreator.value) {
    emit("submit", {
      mode: "edit",
      id: props.capsule.id,
      input: { version: props.capsule.version, message },
      files: [],
      removeExistingMedia: false,
    });
    return;
  }

  const common = {
    title,
    type: fields.type,
    unlockRule: fields.unlockRule,
    unlockAt: fields.unlockRule === "AT_TIME" ? unlockAt : null,
    anniversaryId:
      fields.unlockRule === "ANNIVERSARY" ? fields.anniversaryId : null,
    wishId: fields.unlockRule === "WISH_COMPLETION" ? fields.wishId : null,
    unlockCondition:
      fields.unlockRule === "MANUAL_CONDITION"
        ? fields.unlockCondition.trim()
        : null,
    requiresBothConfirmation: fields.requiresBothConfirmation,
    message,
  } satisfies Omit<CreateCapsuleRequest, "mediaIds">;
  if (props.capsule) {
    emit("submit", {
      mode: "edit",
      id: props.capsule.id,
      input: { ...common, version: props.capsule.version },
      files: [...files.value],
      removeExistingMedia: fields.removeExistingMedia,
    });
  } else {
    emit("submit", {
      mode: "create",
      input: common,
      files: [...files.value],
    });
  }
}
</script>

<template>
  <form class="space-y-5" @submit.prevent="submit">
    <div
      v-if="capsule && !isCreator"
      class="rounded-2xl border border-future-200 bg-future-50 px-4 py-3 text-sm leading-6 text-future-800 dark:border-future-900/55 dark:bg-future-950/30 dark:text-future-200"
    >
      这是一枚共同胶囊。你只能补写自己的正文；标题、开启规则与附件仍由创建者维护。
    </div>

    <template v-if="isCreator">
      <div>
        <label class="field-label" for="capsule-editor-title">胶囊标题</label>
        <input
          id="capsule-editor-title"
          v-model="fields.title"
          class="field-input"
          maxlength="200"
          required
          placeholder="比如：写给五周年的我们"
        />
        <p v-if="fieldErrors.title" class="mt-2 text-xs text-red-600">
          {{ fieldErrors.title }}
        </p>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="field-label" for="capsule-editor-type">写给谁</label>
          <select
            id="capsule-editor-type"
            v-model="fields.type"
            class="field-input py-3"
          >
            <option
              v-for="option in availableTypes"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </div>
        <div>
          <label class="field-label" for="capsule-editor-rule">开启规则</label>
          <select
            id="capsule-editor-rule"
            v-model="fields.unlockRule"
            class="field-input py-3"
          >
            <option
              v-for="option in CAPSULE_UNLOCK_RULES"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </div>
      </div>

      <div v-if="fields.unlockRule === 'AT_TIME'">
        <label class="field-label" for="capsule-editor-unlock-at"
          >解锁时间</label
        >
        <input
          id="capsule-editor-unlock-at"
          v-model="fields.unlockAt"
          class="field-input"
          type="datetime-local"
          required
        />
        <p v-if="fieldErrors.unlockAt" class="mt-2 text-xs text-red-600">
          {{ fieldErrors.unlockAt }}
        </p>
      </div>
      <div v-else-if="fields.unlockRule === 'ANNIVERSARY'">
        <label class="field-label" for="capsule-editor-anniversary"
          >关联纪念日</label
        >
        <select
          id="capsule-editor-anniversary"
          v-model="fields.anniversaryId"
          class="field-input py-3"
        >
          <option value="">请选择</option>
          <option
            v-for="anniversary in anniversaries"
            :key="anniversary.id"
            :value="anniversary.id"
          >
            {{ anniversary.title }}
          </option>
        </select>
        <p v-if="fieldErrors.anniversaryId" class="mt-2 text-xs text-red-600">
          {{ fieldErrors.anniversaryId }}
        </p>
      </div>
      <div v-else-if="fields.unlockRule === 'WISH_COMPLETION'">
        <label class="field-label" for="capsule-editor-wish">关联愿望</label>
        <select
          id="capsule-editor-wish"
          v-model="fields.wishId"
          class="field-input py-3"
        >
          <option value="">请选择</option>
          <option v-for="wish in wishes" :key="wish.id" :value="wish.id">
            {{ wish.title }}
          </option>
        </select>
        <p v-if="fieldErrors.wishId" class="mt-2 text-xs text-red-600">
          {{ fieldErrors.wishId }}
        </p>
      </div>
      <div v-else>
        <label class="field-label" for="capsule-editor-condition"
          >开启条件</label
        >
        <textarea
          id="capsule-editor-condition"
          v-model="fields.unlockCondition"
          class="field-input min-h-24 resize-y"
          maxlength="500"
          placeholder="比如：我们一起搬进新家之后"
        />
        <p v-if="fieldErrors.unlockCondition" class="mt-2 text-xs text-red-600">
          {{ fieldErrors.unlockCondition }}
        </p>
      </div>

      <label
        class="flex items-start gap-3 rounded-2xl border border-ink-200 px-4 py-4 dark:border-white/10"
        :class="fields.type === 'TO_SELF' ? 'opacity-55' : ''"
      >
        <input
          v-model="fields.requiresBothConfirmation"
          class="mt-1"
          type="checkbox"
          :disabled="fields.type === 'TO_SELF'"
        />
        <span>
          <strong class="block text-sm text-ink-800 dark:text-ink-100"
            >需要两个人都确认</strong
          >
          <span
            class="mt-1 block text-xs leading-5 text-ink-500 dark:text-ink-400"
            >到期后先等待双方确认，再由每个人明确打开。</span
          >
        </span>
      </label>
    </template>

    <div>
      <label class="field-label" for="capsule-editor-message">{{
        capsule?.type === "JOINT" ? "我写下的正文" : "胶囊正文"
      }}</label>
      <textarea
        id="capsule-editor-message"
        v-model="fields.message"
        class="field-input min-h-48 resize-y"
        maxlength="100000"
        required
        placeholder="把现在想留给未来的话写下来。"
      />
      <p v-if="fieldErrors.message" class="mt-2 text-xs text-red-600">
        {{ fieldErrors.message }}
      </p>
    </div>

    <template v-if="isCreator">
      <label
        class="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-future-300 bg-future-50/70 px-4 py-4 text-sm font-semibold text-future-800 transition hover:border-future-400 motion-reduce:transition-none dark:border-future-800 dark:bg-future-950/30 dark:text-future-200"
      >
        <Camera class="size-5" />
        <span>{{
          files.length
            ? `已选择 ${files.length} 张图片`
            : "添加胶囊图片（可选）"
        }}</span>
        <input
          class="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          @change="chooseFiles"
        />
      </label>
      <label
        v-if="capsule?.media?.length"
        class="flex items-center gap-2 text-sm text-ink-500 dark:text-ink-400"
      >
        <input v-model="fields.removeExistingMedia" type="checkbox" />
        移除现有 {{ capsule.media.length }} 张图片
      </label>
      <p v-if="fieldErrors.files" class="text-xs text-red-600">
        {{ fieldErrors.files }}
      </p>
    </template>

    <div
      class="flex items-start gap-3 rounded-2xl bg-ink-50 px-4 py-3 text-xs leading-6 text-ink-500 dark:bg-white/[0.04] dark:text-ink-400"
    >
      <LockKeyhole class="mt-1 size-4 shrink-0" />
      封存后正文不可修改。未打开前，界面不会根据浏览器时间自行展示正文或启用打开按钮。
    </div>

    <p
      v-if="error"
      class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200"
      role="alert"
    >
      {{ error }}
    </p>

    <BaseButton type="submit" block :loading="pending">
      <Check class="size-4" />{{ capsule ? "保存胶囊草稿" : "创建胶囊草稿" }}
    </BaseButton>
  </form>
</template>
