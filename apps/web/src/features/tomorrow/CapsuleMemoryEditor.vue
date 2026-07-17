<script setup lang="ts">
import type {
  CapsuleDetail,
  ConvertCapsuleToMemoryRequest,
  PlaceSummary,
} from "@our-tomorrow/contracts";
import { Sparkles } from "lucide-vue-next";
import { reactive, ref, watch } from "vue";

import {
  fromDateTimeLocal,
  toDateTimeLocal,
} from "@/features/remember/remember-utils";
import BaseButton from "@/shared/components/BaseButton.vue";

const props = defineProps<{
  capsule: CapsuleDetail;
  places: PlaceSummary[];
  timezone: string;
  pending: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  submit: [input: ConvertCapsuleToMemoryRequest];
}>();

const fields = reactive({
  title: "",
  content: "",
  happenedAt: "",
  placeId: "",
});
const fieldErrors = ref<Record<string, string>>({});

function defaultContent(capsule: CapsuleDetail) {
  return (
    capsule.messages
      ?.map(
        (message) =>
          `${message.author.nicknameInRelationship || message.author.displayName}\n${message.content}`,
      )
      .join("\n\n") ?? ""
  );
}

function reset() {
  fields.title = props.capsule.title;
  fields.content = defaultContent(props.capsule);
  fields.happenedAt = toDateTimeLocal(
    props.capsule.openedAt ?? new Date().toISOString(),
    props.timezone,
  );
  fields.placeId = "";
  fieldErrors.value = {};
}

watch(() => [props.capsule.id, props.capsule.version, props.timezone], reset, {
  immediate: true,
});

function submit() {
  const errors: Record<string, string> = {};
  const title = fields.title.trim();
  if (!title) errors.title = "请写下回忆标题。";
  const happenedAt = fromDateTimeLocal(fields.happenedAt, props.timezone);
  if (!happenedAt) errors.happenedAt = "请选择有效的发生时间。";
  fieldErrors.value = errors;
  if (!happenedAt || Object.keys(errors).length) return;
  emit("submit", {
    version: props.capsule.version,
    title,
    content: fields.content.trim() || null,
    happenedAt,
    placeId: fields.placeId || null,
    mediaIds: props.capsule.media?.map((asset) => asset.id) ?? [],
  });
}
</script>

<template>
  <form class="space-y-5" @submit.prevent="submit">
    <div
      class="rounded-2xl bg-memory-50 px-4 py-3 text-sm leading-6 text-memory-800 dark:bg-memory-950/30 dark:text-memory-200"
    >
      只有所有有资格打开这枚胶囊的成员都已明确打开后，才能把正文和附件写进共同回忆；来源胶囊仍可追溯。
    </div>
    <div>
      <label class="field-label" for="capsule-memory-title">回忆标题</label>
      <input
        id="capsule-memory-title"
        v-model="fields.title"
        class="field-input"
        maxlength="200"
        required
      />
      <p v-if="fieldErrors.title" class="mt-2 text-xs text-red-600">
        {{ fieldErrors.title }}
      </p>
    </div>
    <div class="grid gap-4 sm:grid-cols-2">
      <div>
        <label class="field-label" for="capsule-memory-time">发生时间</label>
        <input
          id="capsule-memory-time"
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
        <label class="field-label" for="capsule-memory-place">地点</label>
        <select
          id="capsule-memory-place"
          v-model="fields.placeId"
          class="field-input py-3"
        >
          <option value="">不关联地点</option>
          <option v-for="place in places" :key="place.id" :value="place.id">
            {{ place.name }}
          </option>
        </select>
      </div>
    </div>
    <div>
      <label class="field-label" for="capsule-memory-content">回忆正文</label>
      <textarea
        id="capsule-memory-content"
        v-model="fields.content"
        class="field-input min-h-48 resize-y"
        maxlength="20000"
      />
    </div>
    <p
      v-if="error"
      class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200"
      role="alert"
    >
      {{ error }}
    </p>
    <BaseButton type="submit" block :loading="pending">
      <Sparkles class="size-4" />转为一段回忆
    </BaseButton>
  </form>
</template>
