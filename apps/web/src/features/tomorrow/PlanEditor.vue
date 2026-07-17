<script setup lang="ts">
import type {
  AnniversarySummary,
  CreatePlanRequest,
  PlaceSummary,
  PlanSummary,
  UpdatePlanRequest,
  WishSummary,
} from "@our-tomorrow/contracts";
import { Check } from "lucide-vue-next";
import { reactive, ref, watch } from "vue";

import {
  fromDateTimeLocal,
  toDateTimeLocal,
} from "@/features/remember/remember-utils";
import {
  joinList,
  planUpdateRequest,
  splitList,
} from "@/features/tomorrow/tomorrow-utils";
import BaseButton from "@/shared/components/BaseButton.vue";

export type PlanEditorSubmission =
  | { mode: "create"; input: CreatePlanRequest }
  | { mode: "edit"; id: string; input: UpdatePlanRequest };

const props = defineProps<{
  plan: PlanSummary | null;
  wishes: WishSummary[];
  anniversaries: AnniversarySummary[];
  places: PlaceSummary[];
  timezone: string;
  pending: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  submit: [submission: PlanEditorSubmission];
}>();

const fields = reactive({
  title: "",
  wishId: "",
  anniversaryId: "",
  anniversaryOccurrenceDate: "",
  itinerary: "",
  preparations: "",
  participants: "",
  expectation: "",
  placeId: "",
  startsAt: "",
  endsAt: "",
  reminderAt: "",
});
const fieldErrors = ref<Record<string, string>>({});

function reset() {
  const plan = props.plan;
  fields.title = plan?.title ?? "";
  fields.wishId = plan?.wishId ?? "";
  fields.anniversaryId = plan?.anniversaryId ?? "";
  fields.anniversaryOccurrenceDate = plan?.anniversaryOccurrenceDate ?? "";
  fields.itinerary = plan?.itinerary ?? "";
  fields.preparations = joinList(plan?.preparations ?? []);
  fields.participants = joinList(plan?.participants ?? []);
  fields.expectation = plan?.expectation ?? "";
  fields.placeId = plan?.place?.id ?? "";
  fields.startsAt = plan?.startsAt
    ? toDateTimeLocal(plan.startsAt, props.timezone)
    : "";
  fields.endsAt = plan?.endsAt
    ? toDateTimeLocal(plan.endsAt, props.timezone)
    : "";
  fields.reminderAt = plan?.reminderAt
    ? toDateTimeLocal(plan.reminderAt, props.timezone)
    : "";
  fieldErrors.value = {};
}

watch(() => [props.plan?.id, props.plan?.version, props.timezone], reset, {
  immediate: true,
});

watch(
  () => fields.anniversaryId,
  (value) => {
    if (!value) fields.anniversaryOccurrenceDate = "";
  },
);

function parseInstant(value: string, field: string) {
  if (!value) return null;
  const parsed = fromDateTimeLocal(value, props.timezone);
  if (!parsed) fieldErrors.value[field] = "请选择有效的日期和时间。";
  return parsed;
}

function submit() {
  const errors: Record<string, string> = {};
  fieldErrors.value = errors;
  const title = fields.title.trim();
  if (!title) errors.title = "请写下计划标题。";
  const startsAt = parseInstant(fields.startsAt, "startsAt");
  const endsAt = parseInstant(fields.endsAt, "endsAt");
  const reminderAt = parseInstant(fields.reminderAt, "reminderAt");
  if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) {
    errors.endsAt = "结束时间需要晚于开始时间。";
  }
  if (reminderAt && startsAt && new Date(reminderAt) >= new Date(startsAt)) {
    errors.reminderAt = "提醒需要早于计划开始时间。";
  }
  if (Object.keys(errors).length) return;

  const common: CreatePlanRequest = {
    title,
    wishId: fields.wishId || null,
    anniversaryId: fields.anniversaryId || null,
    anniversaryOccurrenceDate:
      fields.anniversaryId && fields.anniversaryOccurrenceDate
        ? fields.anniversaryOccurrenceDate
        : null,
    itinerary: fields.itinerary.trim() || null,
    preparations: splitList(fields.preparations, 100),
    participants: splitList(fields.participants, 30),
    expectation: fields.expectation.trim() || null,
    placeId: fields.placeId || null,
    startsAt,
    endsAt,
    reminderAt,
  };
  if (props.plan) {
    emit("submit", {
      mode: "edit",
      id: props.plan.id,
      input: planUpdateRequest(props.plan, common),
    });
  } else {
    emit("submit", { mode: "create", input: common });
  }
}
</script>

<template>
  <form class="space-y-5" @submit.prevent="submit">
    <div>
      <label class="field-label" for="plan-editor-title">计划标题</label>
      <input
        id="plan-editor-title"
        v-model="fields.title"
        class="field-input"
        maxlength="200"
        required
        placeholder="比如：周末去植物园散步"
      />
      <p v-if="fieldErrors.title" class="mt-2 text-xs text-red-600">
        {{ fieldErrors.title }}
      </p>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <div>
        <label class="field-label" for="plan-editor-wish">关联愿望</label>
        <select
          id="plan-editor-wish"
          v-model="fields.wishId"
          class="field-input py-3"
          :disabled="Boolean(plan && plan.status !== 'DRAFT')"
        >
          <option value="">不关联愿望</option>
          <option v-for="wish in wishes" :key="wish.id" :value="wish.id">
            {{ wish.title }}
          </option>
        </select>
      </div>
      <div>
        <label class="field-label" for="plan-editor-anniversary"
          >关联纪念日</label
        >
        <select
          id="plan-editor-anniversary"
          v-model="fields.anniversaryId"
          class="field-input py-3"
        >
          <option value="">不关联纪念日</option>
          <option
            v-for="anniversary in anniversaries"
            :key="anniversary.id"
            :value="anniversary.id"
          >
            {{ anniversary.title }}
          </option>
        </select>
      </div>
    </div>

    <div v-if="fields.anniversaryId">
      <label class="field-label" for="plan-editor-occurrence"
        >对应哪一次纪念日</label
      >
      <input
        id="plan-editor-occurrence"
        v-model="fields.anniversaryOccurrenceDate"
        class="field-input"
        type="date"
      />
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <div>
        <label class="field-label" for="plan-editor-start">开始时间</label>
        <input
          id="plan-editor-start"
          v-model="fields.startsAt"
          class="field-input"
          type="datetime-local"
        />
        <p v-if="fieldErrors.startsAt" class="mt-2 text-xs text-red-600">
          {{ fieldErrors.startsAt }}
        </p>
      </div>
      <div>
        <label class="field-label" for="plan-editor-end">结束时间</label>
        <input
          id="plan-editor-end"
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
        <label class="field-label" for="plan-editor-reminder">提醒时间</label>
        <input
          id="plan-editor-reminder"
          v-model="fields.reminderAt"
          class="field-input"
          type="datetime-local"
          :disabled="plan?.status === 'IN_PROGRESS'"
        />
        <p
          v-if="plan?.status === 'IN_PROGRESS'"
          class="mt-2 text-xs text-ink-400"
        >
          进行中的计划保留原提醒，不再新增或修改。
        </p>
        <p v-if="fieldErrors.reminderAt" class="mt-2 text-xs text-red-600">
          {{ fieldErrors.reminderAt }}
        </p>
      </div>
      <div>
        <label class="field-label" for="plan-editor-place">地点</label>
        <select
          id="plan-editor-place"
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
      <label class="field-label" for="plan-editor-itinerary">轻量行程</label>
      <textarea
        id="plan-editor-itinerary"
        v-model="fields.itinerary"
        class="field-input min-h-28 resize-y"
        maxlength="20000"
        placeholder="写下刚刚好的安排。"
      />
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <div>
        <label class="field-label" for="plan-editor-preparations"
          >准备事项</label
        >
        <textarea
          id="plan-editor-preparations"
          v-model="fields.preparations"
          class="field-input min-h-24 resize-y"
          placeholder="每行一项"
        />
      </div>
      <div>
        <label class="field-label" for="plan-editor-participants">参与人</label>
        <textarea
          id="plan-editor-participants"
          v-model="fields.participants"
          class="field-input min-h-24 resize-y"
          placeholder="每行一个称呼"
        />
      </div>
    </div>

    <div>
      <label class="field-label" for="plan-editor-expectation">一句期待</label>
      <textarea
        id="plan-editor-expectation"
        v-model="fields.expectation"
        class="field-input min-h-24 resize-y"
        maxlength="4000"
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
      <Check class="size-4" />{{ plan ? "保存计划" : "创建计划草稿" }}
    </BaseButton>
  </form>
</template>
