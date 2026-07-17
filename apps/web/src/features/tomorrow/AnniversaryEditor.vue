<script setup lang="ts">
import type {
  AnniversaryLeapDayRule,
  AnniversaryRepeat,
  AnniversarySummary,
  AnniversaryType,
  CreateAnniversaryRequest,
  UpdateAnniversaryRequest,
} from "@our-tomorrow/contracts";
import { Camera, Check } from "lucide-vue-next";
import { reactive, ref, watch } from "vue";

import { imageFileError } from "@/features/remember/remember-utils";
import { ANNIVERSARY_TYPES } from "@/features/tomorrow/tomorrow-utils";
import BaseButton from "@/shared/components/BaseButton.vue";

export type AnniversaryEditorSubmission =
  | {
      mode: "create";
      input: CreateAnniversaryRequest;
      backgroundFile: File | null;
    }
  | {
      mode: "edit";
      id: string;
      input: UpdateAnniversaryRequest;
      backgroundFile: File | null;
    };

const props = defineProps<{
  anniversary: AnniversarySummary | null;
  pending: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  submit: [submission: AnniversaryEditorSubmission];
}>();

const fields = reactive({
  title: "",
  type: "CUSTOM" as AnniversaryType,
  date: "",
  repeat: "YEARLY" as AnniversaryRepeat,
  leapDayRule: "FEBRUARY_28" as AnniversaryLeapDayRule,
  removeBackground: false,
});
const backgroundFile = ref<File | null>(null);
const fieldErrors = ref<Record<string, string>>({});

function reset() {
  const anniversary = props.anniversary;
  fields.title = anniversary?.title ?? "";
  fields.type = anniversary?.type ?? "CUSTOM";
  fields.date = anniversary?.date ?? "";
  fields.repeat = anniversary?.repeat ?? "YEARLY";
  fields.leapDayRule = anniversary?.leapDayRule ?? "FEBRUARY_28";
  fields.removeBackground = false;
  backgroundFile.value = null;
  fieldErrors.value = {};
}

watch(() => [props.anniversary?.id, props.anniversary?.version], reset, {
  immediate: true,
});

function chooseBackground(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  input.value = "";
  if (!file) return;
  const error = imageFileError(file);
  if (error) {
    fieldErrors.value = { ...fieldErrors.value, background: error };
    return;
  }
  backgroundFile.value = file;
  fields.removeBackground = false;
  fieldErrors.value = { ...fieldErrors.value, background: "" };
}

function submit() {
  const errors: Record<string, string> = {};
  const title = fields.title.trim();
  if (!title) errors.title = "请写下这个日子的名字。";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date)) {
    errors.date = "请选择有效日期。";
  }
  fieldErrors.value = errors;
  if (Object.keys(errors).length) return;

  const common = {
    title,
    type: fields.type,
    date: fields.date,
    repeat: fields.repeat,
    leapDayRule: fields.leapDayRule,
    ...(fields.removeBackground ? { backgroundMediaId: null } : {}),
  } satisfies CreateAnniversaryRequest;
  if (props.anniversary) {
    emit("submit", {
      mode: "edit",
      id: props.anniversary.id,
      input: { ...common, version: props.anniversary.version },
      backgroundFile: backgroundFile.value,
    });
  } else {
    emit("submit", {
      mode: "create",
      input: common,
      backgroundFile: backgroundFile.value,
    });
  }
}
</script>

<template>
  <form class="space-y-5" @submit.prevent="submit">
    <div>
      <label class="field-label" for="anniversary-editor-title">日子名称</label>
      <input
        id="anniversary-editor-title"
        v-model="fields.title"
        class="field-input"
        maxlength="200"
        required
        placeholder="比如：我们第一次见面的那天"
      />
      <p v-if="fieldErrors.title" class="mt-2 text-xs text-red-600">
        {{ fieldErrors.title }}
      </p>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <div>
        <label class="field-label" for="anniversary-editor-type">类型</label>
        <select
          id="anniversary-editor-type"
          v-model="fields.type"
          class="field-input py-3"
        >
          <option
            v-for="option in ANNIVERSARY_TYPES"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </div>
      <div>
        <label class="field-label" for="anniversary-editor-date">日期</label>
        <input
          id="anniversary-editor-date"
          v-model="fields.date"
          class="field-input"
          type="date"
          required
        />
        <p v-if="fieldErrors.date" class="mt-2 text-xs text-red-600">
          {{ fieldErrors.date }}
        </p>
      </div>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <div>
        <label class="field-label" for="anniversary-editor-repeat">重复</label>
        <select
          id="anniversary-editor-repeat"
          v-model="fields.repeat"
          class="field-input py-3"
        >
          <option value="YEARLY">每年重复</option>
          <option value="NONE">只发生一次</option>
        </select>
      </div>
      <div>
        <label class="field-label" for="anniversary-editor-leap"
          >2 月 29 日规则</label
        >
        <select
          id="anniversary-editor-leap"
          v-model="fields.leapDayRule"
          class="field-input py-3"
          :disabled="!fields.date.endsWith('-02-29')"
        >
          <option value="FEBRUARY_28">非闰年按 2 月 28 日</option>
          <option value="MARCH_1">非闰年按 3 月 1 日</option>
        </select>
      </div>
    </div>

    <label
      class="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-future-300 bg-future-50/70 px-4 py-4 text-sm font-semibold text-future-800 transition hover:border-future-400 motion-reduce:transition-none dark:border-future-800 dark:bg-future-950/30 dark:text-future-200"
    >
      <Camera class="size-5" />
      <span>{{
        backgroundFile ? backgroundFile.name : "选择倒数卡背景照片（可选）"
      }}</span>
      <input
        class="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        @change="chooseBackground"
      />
    </label>
    <label
      v-if="anniversary?.backgroundMedia"
      class="flex items-center gap-2 text-sm text-ink-500 dark:text-ink-400"
    >
      <input v-model="fields.removeBackground" type="checkbox" />
      移除当前背景照片
    </label>
    <p v-if="fieldErrors.background" class="text-xs text-red-600">
      {{ fieldErrors.background }}
    </p>

    <p
      v-if="error"
      class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200"
      role="alert"
    >
      {{ error }}
    </p>

    <BaseButton type="submit" block :loading="pending">
      <Check class="size-4" />{{
        anniversary ? "保存重要日子" : "添加重要日子"
      }}
    </BaseButton>
  </form>
</template>
