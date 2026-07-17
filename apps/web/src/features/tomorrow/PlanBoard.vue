<script setup lang="ts">
import type { PlanStatus, PlanSummary } from "@our-tomorrow/contracts";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import {
  CalendarClock,
  CheckCircle2,
  CirclePlay,
  Edit3,
  MapPin,
  Plus,
  Trash2,
  XCircle,
} from "lucide-vue-next";
import { computed, ref, watch } from "vue";

import PlanEditor, {
  type PlanEditorSubmission,
} from "@/features/tomorrow/PlanEditor.vue";
import TomorrowNotice from "@/features/tomorrow/TomorrowNotice.vue";
import TomorrowPanel from "@/features/tomorrow/TomorrowPanel.vue";
import {
  formatInstant,
  PLAN_STATUSES,
  planStatusLabel,
  roleIsCurrent,
} from "@/features/tomorrow/tomorrow-utils";
import { ApiClientError } from "@/shared/api/client";
import { stageFourApi } from "@/shared/api/stage-four";
import { stageTwoApi } from "@/shared/api/stage-two";
import AsyncState from "@/shared/components/AsyncState.vue";
import BaseButton from "@/shared/components/BaseButton.vue";
import SectionHeading from "@/shared/components/SectionHeading.vue";
import SurfaceCard from "@/shared/components/SurfaceCard.vue";
import { useIdentityStore } from "@/shared/stores/identity";

const props = defineProps<{ requestCreate: boolean }>();
const emit = defineEmits<{ createConsumed: [] }>();

const identity = useIdentityStore();
const queryClient = useQueryClient();
const statusFilter = ref<"" | PlanStatus>("");
const selectedPlanId = ref<string | null>(null);
const editorOpen = ref(false);
const editingPlan = ref<PlanSummary | null>(null);
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
    selectedPlanId.value = null;
    editorOpen.value = false;
    editingPlan.value = null;
    editorError.value = null;
    actionError.value = null;
    notice.value = null;
  },
);

const plansQuery = useQuery({
  queryKey: computed(() => ["plans", identity.role, statusFilter.value]),
  queryFn: () => stageFourApi.plans({ status: statusFilter.value || null }),
  enabled: computed(() => Boolean(identity.role)),
});
const wishesQuery = useQuery({
  queryKey: computed(() => ["wish-options", identity.role]),
  queryFn: () => stageFourApi.wishes({ limit: 50 }),
  enabled: computed(() => Boolean(identity.role)),
});
const anniversariesQuery = useQuery({
  queryKey: computed(() => ["anniversaries", identity.role]),
  queryFn: stageFourApi.anniversaries,
  enabled: computed(() => Boolean(identity.role)),
});
const placesQuery = useQuery({
  queryKey: computed(() => ["places", identity.role]),
  queryFn: stageTwoApi.places,
  enabled: computed(() => Boolean(identity.role)),
});
const detailQuery = useQuery({
  queryKey: computed(() => ["plan", identity.role, selectedPlanId.value]),
  queryFn: () => stageFourApi.plan(selectedPlanId.value!),
  enabled: computed(() => Boolean(identity.role && selectedPlanId.value)),
});

const plans = computed(() => plansQuery.data.value ?? []);
const wishOptions = computed(
  () =>
    wishesQuery.data.value?.items.filter(
      (wish) =>
        (wish.status === "IDEA" && wish.plan === null) ||
        wish.id === editingPlan.value?.wishId,
    ) ?? [],
);
const selectedPlan = computed(() => detailQuery.data.value ?? null);
const timezone = computed(() => identity.couple?.timezone ?? "Asia/Shanghai");
const listError = computed(() => {
  const error = plansQuery.error.value;
  return error instanceof Error
    ? error.message
    : "未来计划暂时没有打开，请稍后再试。";
});

function isCurrent(role: "boy" | "girl") {
  return roleIsCurrent(role, identity.role);
}

function openCreate() {
  editingPlan.value = null;
  editorOpen.value = true;
  editorError.value = null;
}

function openEdit() {
  if (!selectedPlan.value) return;
  editingPlan.value = selectedPlan.value;
  editorOpen.value = true;
  editorError.value = null;
}

function closeEditor() {
  if (editorPending.value) return;
  editorOpen.value = false;
  editingPlan.value = null;
  editorError.value = null;
}

function actionMessage(error: unknown, action: string) {
  if (
    error instanceof ApiClientError &&
    ["STATE_CONFLICT", "STATE_TRANSITION_INVALID"].includes(error.code)
  ) {
    void detailQuery.refetch();
    void plansQuery.refetch();
    return `计划刚刚在另一处变化，已刷新最新状态；请确认后再${action}。`;
  }
  return error instanceof Error ? error.message : `计划没有${action}成功。`;
}

async function refreshPlans(role: "boy" | "girl") {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["plans", role] }),
    queryClient.invalidateQueries({ queryKey: ["wishes", role] }),
    queryClient.invalidateQueries({ queryKey: ["wish-options", role] }),
    queryClient.invalidateQueries({ queryKey: ["places-map", role] }),
    queryClient.invalidateQueries({ queryKey: ["places", role] }),
    queryClient.invalidateQueries({ queryKey: ["anniversaries", role] }),
    queryClient.invalidateQueries({ queryKey: ["capsules", role] }),
    queryClient.invalidateQueries({ queryKey: ["upcoming", role] }),
    queryClient.invalidateQueries({ queryKey: ["today", role] }),
    queryClient.invalidateQueries({ queryKey: ["notifications", role] }),
  ]);
}

async function savePlan(submission: PlanEditorSubmission) {
  if (editorPending.value) return;
  const startRole = identity.role;
  if (!startRole) return;
  editorPending.value = true;
  editorError.value = null;
  try {
    const saved =
      submission.mode === "create"
        ? await stageFourApi.createPlan(submission.input)
        : await stageFourApi.updatePlan(submission.id, submission.input);
    if (!isCurrent(startRole)) return;
    queryClient.setQueryData(["plan", startRole, saved.id], saved);
    selectedPlanId.value = saved.id;
    editorOpen.value = false;
    editingPlan.value = null;
    notice.value =
      submission.mode === "create" ? "计划草稿已经创建。" : "计划已经更新。";
    await refreshPlans(startRole);
  } catch (error) {
    if (!isCurrent(startRole)) return;
    editorError.value = actionMessage(error, "保存");
  } finally {
    editorPending.value = false;
  }
}

async function runAction(
  action: "schedule" | "start" | "complete" | "cancel" | "delete",
) {
  const plan = selectedPlan.value;
  const startRole = identity.role;
  if (!plan || !startRole || actionPending.value) return;
  if (action === "delete" && !window.confirm("把这个计划移入回收站吗？")) {
    return;
  }
  actionPending.value = action;
  actionError.value = null;
  try {
    let saved: PlanSummary | null = null;
    const input = { version: plan.version };
    if (action === "schedule") {
      saved = await stageFourApi.schedulePlan(plan.id, input);
    } else if (action === "start") {
      saved = await stageFourApi.startPlan(plan.id, input);
    } else if (action === "complete") {
      saved = await stageFourApi.completePlan(plan.id, input);
    } else if (action === "cancel") {
      saved = await stageFourApi.cancelPlan(plan.id, input);
    } else {
      await stageFourApi.deletePlan(plan.id, plan.version);
    }
    if (!isCurrent(startRole)) return;
    if (saved) queryClient.setQueryData(["plan", startRole, plan.id], saved);
    else selectedPlanId.value = null;
    notice.value =
      action === "schedule"
        ? "计划已经安排好。"
        : action === "start"
          ? "计划已经开始。"
          : action === "complete"
            ? "计划完成了。"
            : action === "cancel"
              ? "计划已经取消。"
              : "计划已移入回收站。";
    await refreshPlans(startRole);
  } catch (error) {
    if (!isCurrent(startRole)) return;
    actionError.value = actionMessage(error, "更新");
  } finally {
    actionPending.value = null;
  }
}
</script>

<template>
  <section aria-labelledby="plan-board-heading">
    <SectionHeading
      title="未来计划"
      description="时间、地点、准备事项和一句期待，保持刚好的轻量。"
    >
      <BaseButton size="sm" variant="secondary" @click="openCreate">
        <Plus class="size-4" />新计划
      </BaseButton>
    </SectionHeading>

    <TomorrowNotice class="mt-4" :message="notice" @close="notice = null" />

    <div class="mt-4 flex gap-2 overflow-x-auto pb-1">
      <button
        type="button"
        class="shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition motion-reduce:transition-none"
        :class="
          !statusFilter
            ? 'bg-ink-950 text-white dark:bg-white dark:text-ink-950'
            : 'bg-white/65 text-ink-500 dark:bg-white/[0.05] dark:text-ink-400'
        "
        @click="statusFilter = ''"
      >
        全部
      </button>
      <button
        v-for="option in PLAN_STATUSES"
        :key="option.value"
        type="button"
        class="shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition motion-reduce:transition-none"
        :class="
          statusFilter === option.value
            ? 'bg-ink-950 text-white dark:bg-white dark:text-ink-950'
            : 'bg-white/65 text-ink-500 dark:bg-white/[0.05] dark:text-ink-400'
        "
        @click="statusFilter = option.value"
      >
        {{ option.label }}
      </button>
    </div>

    <AsyncState
      v-if="plansQuery.isPending.value"
      class="mt-4"
      state="loading"
      title="正在整理未来计划…"
    />
    <AsyncState
      v-else-if="plansQuery.isError.value"
      class="mt-4"
      state="error"
      title="未来计划没有顺利打开"
      :message="listError"
      action-label="重新加载"
      @action="plansQuery.refetch()"
    />
    <AsyncState
      v-else-if="plans.length === 0"
      class="mt-4"
      state="empty"
      :title="statusFilter ? '这个状态下还没有计划。' : '还没有独立计划。'"
      message="可以先写成草稿，等时间合适再正式安排。"
      action-label="创建计划"
      @action="openCreate"
    />
    <div v-else class="mt-4 grid gap-4 md:grid-cols-2">
      <button
        v-for="plan in plans"
        :key="plan.id"
        type="button"
        class="surface-interactive p-5 text-left"
        @click="selectedPlanId = plan.id"
      >
        <div class="flex items-start justify-between gap-3">
          <span
            class="grid size-10 place-items-center rounded-2xl bg-future-100 text-future-700 dark:bg-future-950/55 dark:text-future-200"
          >
            <CalendarClock class="size-4" />
          </span>
          <span
            class="rounded-full bg-ink-100 px-3 py-1 text-[11px] font-semibold text-ink-500 dark:bg-white/[0.07] dark:text-ink-300"
          >
            {{ planStatusLabel(plan.status) }}
          </span>
        </div>
        <h3
          class="mt-4 font-display text-xl font-semibold text-ink-950 dark:text-white"
        >
          {{ plan.title }}
        </h3>
        <p
          class="mt-2 line-clamp-2 min-h-12 text-sm leading-6 text-ink-500 dark:text-ink-400"
        >
          {{
            plan.expectation || plan.itinerary || "安排还很轻，可以慢慢补充。"
          }}
        </p>
        <div class="mt-4 flex flex-wrap gap-3 text-xs text-ink-400">
          <span class="inline-flex items-center gap-1.5">
            <CalendarClock class="size-3.5" />{{
              formatInstant(plan.startsAt, timezone)
            }}
          </span>
          <span class="inline-flex items-center gap-1.5">
            <MapPin class="size-3.5" />{{ plan.place?.name || "地点待定" }}
          </span>
        </div>
      </button>
    </div>

    <TomorrowPanel
      :open="Boolean(selectedPlanId) && !editorOpen"
      eyebrow="Plan · 未来计划"
      :title="selectedPlan?.title || '打开计划'"
      @close="selectedPlanId = null"
    >
      <AsyncState v-if="detailQuery.isPending.value" state="loading" />
      <AsyncState
        v-else-if="detailQuery.isError.value || !selectedPlan"
        state="error"
        title="计划没有顺利打开"
        :message="
          detailQuery.error.value instanceof Error
            ? detailQuery.error.value.message
            : '请稍后再试。'
        "
        action-label="重新加载"
        @action="detailQuery.refetch()"
      />
      <div v-else class="space-y-5">
        <div class="flex flex-wrap gap-2">
          <span
            class="rounded-full bg-future-100 px-3 py-1.5 text-xs font-semibold text-future-800 dark:bg-future-950/50 dark:text-future-200"
          >
            {{ planStatusLabel(selectedPlan.status) }}
          </span>
          <span
            v-if="selectedPlan.wishId"
            class="rounded-full bg-memory-50 px-3 py-1.5 text-xs font-semibold text-memory-700 dark:bg-memory-950/40 dark:text-memory-200"
          >
            关联愿望
          </span>
          <span
            v-if="selectedPlan.anniversaryId"
            class="rounded-full bg-present-50 px-3 py-1.5 text-xs font-semibold text-present-700 dark:bg-present-950/40 dark:text-present-200"
          >
            关联纪念日
          </span>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <SurfaceCard :padded="false" class="p-4">
            <p class="eyebrow">开始</p>
            <p
              class="mt-2 text-sm font-semibold text-ink-800 dark:text-ink-100"
            >
              {{ formatInstant(selectedPlan.startsAt, timezone) }}
            </p>
          </SurfaceCard>
          <SurfaceCard :padded="false" class="p-4">
            <p class="eyebrow">提醒</p>
            <p
              class="mt-2 text-sm font-semibold text-ink-800 dark:text-ink-100"
            >
              {{ formatInstant(selectedPlan.reminderAt, timezone) }}
            </p>
          </SurfaceCard>
        </div>
        <div
          v-if="selectedPlan.itinerary"
          class="rounded-2xl bg-ink-50/80 p-4 dark:bg-white/[0.04]"
        >
          <p class="eyebrow">轻量行程</p>
          <p
            class="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-700 dark:text-ink-200"
          >
            {{ selectedPlan.itinerary }}
          </p>
        </div>
        <div
          v-if="selectedPlan.preparations.length"
          class="flex flex-wrap gap-2"
        >
          <span
            v-for="item in selectedPlan.preparations"
            :key="item"
            class="rounded-full bg-ink-100 px-3 py-1.5 text-xs text-ink-600 dark:bg-white/[0.07] dark:text-ink-300"
            >{{ item }}</span
          >
        </div>
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
            v-if="!['COMPLETED', 'CANCELLED'].includes(selectedPlan.status)"
            size="sm"
            variant="secondary"
            @click="openEdit"
          >
            <Edit3 class="size-4" />编辑
          </BaseButton>
          <BaseButton
            v-if="selectedPlan.status === 'DRAFT'"
            size="sm"
            :loading="actionPending === 'schedule'"
            @click="runAction('schedule')"
          >
            <CalendarClock class="size-4" />正式安排
          </BaseButton>
          <BaseButton
            v-if="selectedPlan.status === 'SCHEDULED'"
            size="sm"
            :loading="actionPending === 'start'"
            @click="runAction('start')"
          >
            <CirclePlay class="size-4" />开始计划
          </BaseButton>
          <BaseButton
            v-if="selectedPlan.status === 'IN_PROGRESS'"
            size="sm"
            :loading="actionPending === 'complete'"
            @click="runAction('complete')"
          >
            <CheckCircle2 class="size-4" />完成计划
          </BaseButton>
          <BaseButton
            v-if="!['COMPLETED', 'CANCELLED'].includes(selectedPlan.status)"
            size="sm"
            variant="ghost"
            :loading="actionPending === 'cancel'"
            @click="runAction('cancel')"
          >
            <XCircle class="size-4" />取消
          </BaseButton>
          <BaseButton
            size="sm"
            variant="danger"
            :loading="actionPending === 'delete'"
            @click="runAction('delete')"
          >
            <Trash2 class="size-4" />移入回收站
          </BaseButton>
        </div>
      </div>
    </TomorrowPanel>

    <TomorrowPanel
      :open="editorOpen"
      eyebrow="Plan · 未来计划"
      :title="editingPlan ? '编辑未来计划' : '写下一个轻量计划'"
      @close="closeEditor"
    >
      <PlanEditor
        :plan="editingPlan"
        :wishes="wishOptions"
        :anniversaries="anniversariesQuery.data.value ?? []"
        :places="placesQuery.data.value ?? []"
        :timezone="timezone"
        :pending="editorPending"
        :error="editorError"
        @submit="savePlan"
      />
    </TomorrowPanel>
  </section>
</template>
