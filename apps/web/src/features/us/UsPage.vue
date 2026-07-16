<script setup lang="ts">
import type { UserSummary } from "@our-tomorrow/contracts";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import {
  CalendarHeart,
  Check,
  Heart,
  Pencil,
  UserRound,
  UsersRound,
  X,
} from "lucide-vue-next";
import { computed, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";

import { apiFieldErrors, ApiClientError } from "@/shared/api/client";
import { stageOneApi } from "@/shared/api/stage-one";
import BaseButton from "@/shared/components/BaseButton.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import SectionHeading from "@/shared/components/SectionHeading.vue";
import SurfaceCard from "@/shared/components/SurfaceCard.vue";
import { useIdentityStore } from "@/shared/stores/identity";
import {
  type FieldErrors,
  isValidTimezone,
  validateRequiredText,
} from "@/shared/utils/profile-validation";

type RelationshipField = "name" | "startDate" | "timezone" | "signature";

const route = useRoute();
const identity = useIdentityStore();
const queryClient = useQueryClient();
const todayQuery = useQuery({
  queryKey: ["today", identity.role],
  queryFn: stageOneApi.today,
});

const editing = ref(route.query.edit === "relationship");
const saving = ref(false);
const errors = ref<FieldErrors<RelationshipField>>({});
const requestError = ref<string | null>(null);
const savedMessage = ref<string | null>(null);
const form = reactive({
  name: "",
  startDate: "",
  timezone: "",
  signature: "",
});

const relationship = computed(
  () => todayQuery.data.value?.relationship ?? identity.couple,
);
const members = computed(() =>
  [...(relationship.value?.members ?? [])].sort(
    (left, right) => (left.slot ?? 99) - (right.slot ?? 99),
  ),
);
const daysTogether = computed(
  () => todayQuery.data.value?.relationship.daysTogether ?? null,
);

function memberName(member: UserSummary | undefined, fallback: string) {
  return member?.nicknameInRelationship ?? member?.displayName ?? fallback;
}

const memberNames = computed(() => [
  memberName(members.value[0], "你"),
  memberName(members.value[1], "另一半"),
]);

function resetForm() {
  const couple = identity.couple;
  if (!couple) return;
  form.name = couple.name;
  form.startDate = couple.startDate;
  form.timezone = couple.timezone;
  form.signature = couple.signature ?? "";
  errors.value = {};
  requestError.value = null;
}

function openEditor() {
  resetForm();
  editing.value = true;
  savedMessage.value = null;
}

function closeEditor() {
  editing.value = false;
  resetForm();
}

function validate() {
  const nextErrors: FieldErrors<RelationshipField> = {};
  const nameError = validateRequiredText(form.name, "空间名称", 120);
  if (nameError) nextErrors.name = nameError;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.startDate)) {
    nextErrors.startDate = "请选择恋爱开始日期。";
  }
  if (!form.timezone.trim()) {
    nextErrors.timezone = "请填写共同空间时区。";
  } else if (!isValidTimezone(form.timezone.trim())) {
    nextErrors.timezone = "请输入有效的 IANA 时区。";
  }
  if (form.signature.trim().length > 280) {
    nextErrors.signature = "关系签名不能超过 280 个字符。";
  }
  errors.value = nextErrors;
  return Object.keys(nextErrors).length === 0;
}

async function saveRelationship() {
  const couple = identity.couple;
  if (!couple || saving.value || !validate()) return;
  saving.value = true;
  requestError.value = null;
  savedMessage.value = null;

  try {
    await identity.updateCouple({
      version: couple.version,
      name: form.name.trim(),
      startDate: form.startDate,
      timezone: form.timezone.trim(),
      signature: form.signature.trim() || null,
    });
    await queryClient.invalidateQueries({ queryKey: ["today"] });
    editing.value = false;
    savedMessage.value = "共同资料已保存。";
  } catch (error) {
    if (error instanceof ApiClientError) {
      errors.value = { ...errors.value, ...apiFieldErrors(error) };
      requestError.value =
        error.code === "STATE_CONFLICT"
          ? "资料刚刚在另一处更新，请刷新页面后再修改。"
          : error.code === "VALIDATION_FAILED"
            ? "有些内容需要修改，请查看表单提示。"
            : error.message;
    } else {
      requestError.value = "共同资料没有保存成功，请稍后再试。";
    }
  } finally {
    saving.value = false;
  }
}

watch(
  () => todayQuery.data.value?.relationship,
  (nextRelationship) => {
    if (nextRelationship) identity.replaceCouple(nextRelationship);
  },
  { immediate: true },
);

watch(
  () => identity.couple?.version,
  () => {
    if (!editing.value || !form.name) resetForm();
  },
  { immediate: true },
);
</script>

<template>
  <main class="page-shell">
    <PageHeader
      eyebrow="Us · 两个人共同创作"
      title="我们，是所有时间线的主角。"
      description="这里记录共同关系资料，不比较谁记录得更多、谁付出得更多。"
    >
      <template #actions>
        <BaseButton
          v-if="!editing"
          variant="secondary"
          size="sm"
          @click="openEditor"
        >
          <Pencil class="size-4" />
          编辑共同资料
        </BaseButton>
      </template>
    </PageHeader>

    <p
      v-if="savedMessage"
      class="mb-5 rounded-2xl border border-present-200 bg-present-50 px-4 py-3 text-sm text-present-700 dark:border-present-900/60 dark:bg-present-950/30 dark:text-present-200"
      role="status"
    >
      {{ savedMessage }}
    </p>

    <SurfaceCard class="relative overflow-hidden" :padded="false">
      <div
        class="absolute inset-0 bg-gradient-to-br from-memory-100/85 via-white/65 to-future-100/85 dark:from-memory-950/45 dark:via-ink-950/55 dark:to-future-950/40"
      />
      <div
        class="absolute -left-16 -top-20 size-72 rounded-full border-[54px] border-white/35 dark:border-white/[0.035]"
        aria-hidden="true"
      />
      <div
        class="relative grid min-h-80 items-center gap-8 p-6 sm:p-9 lg:grid-cols-[1fr_auto]"
      >
        <div>
          <div class="flex -space-x-4">
            <span
              class="grid size-16 place-items-center rounded-[1.35rem] border-[3px] border-white bg-memory-400 font-display text-2xl font-semibold text-white shadow-md dark:border-ink-900"
              >{{ memberNames[0]?.slice(0, 1) }}</span
            >
            <span
              class="grid size-16 place-items-center rounded-[1.35rem] border-[3px] border-white bg-present-500 font-display text-2xl font-semibold text-white shadow-md dark:border-ink-900"
              >{{ memberNames[1]?.slice(0, 1) }}</span
            >
          </div>
          <p class="eyebrow mt-7">{{ relationship?.name }}</p>
          <h1
            class="mt-2 font-display text-4xl font-semibold tracking-[-0.05em] text-ink-950 dark:text-white sm:text-5xl"
          >
            {{ memberNames[0] }} 与 {{ memberNames[1] }}
          </h1>
          <p
            class="mt-4 max-w-2xl text-sm leading-7 text-ink-600 dark:text-ink-300 sm:text-base"
          >
            {{
              relationship?.signature ||
              "记录每个昨天，共度每个今天，奔赴所有明天。"
            }}
          </p>
        </div>

        <div
          class="rounded-3xl border border-white/75 bg-white/55 p-6 text-center backdrop-blur dark:border-white/10 dark:bg-white/[0.05] sm:min-w-56"
        >
          <Heart class="mx-auto size-5 text-memory-500" fill="currentColor" />
          <p
            class="mt-3 font-display text-5xl font-semibold tracking-[-0.06em] text-ink-950 dark:text-white"
          >
            {{ daysTogether ?? "—" }}
          </p>
          <p
            class="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-ink-400 dark:text-ink-500"
          >
            服务器计算的共同天数
          </p>
        </div>
      </div>
    </SurfaceCard>

    <section
      v-if="editing"
      class="mt-5"
      aria-labelledby="relationship-editor-title"
    >
      <SurfaceCard>
        <div class="flex items-start justify-between gap-4">
          <SectionHeading
            id="relationship-editor-title"
            title="编辑共同资料"
            description="日期与时区会影响服务器计算的共同天数。"
          />
          <button
            type="button"
            class="grid size-10 shrink-0 place-items-center rounded-xl text-ink-400 transition hover:bg-ink-100 hover:text-ink-800 dark:hover:bg-white/[0.06] dark:hover:text-white"
            aria-label="关闭编辑"
            @click="closeEditor"
          >
            <X class="size-5" />
          </button>
        </div>

        <form
          class="mt-6 space-y-5"
          novalidate
          @submit.prevent="saveRelationship"
        >
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="field-label" for="us-space-name">空间名称</label>
              <input
                id="us-space-name"
                v-model="form.name"
                class="field-input"
                maxlength="120"
                :aria-invalid="Boolean(errors.name)"
                :aria-describedby="
                  errors.name ? 'us-space-name-error' : undefined
                "
              />
              <p
                v-if="errors.name"
                id="us-space-name-error"
                class="mt-2 text-sm text-red-600 dark:text-red-300"
              >
                {{ errors.name }}
              </p>
            </div>
            <div>
              <label class="field-label" for="us-start-date"
                >恋爱开始日期</label
              >
              <input
                id="us-start-date"
                v-model="form.startDate"
                class="field-input"
                type="date"
                :aria-invalid="Boolean(errors.startDate)"
                :aria-describedby="
                  errors.startDate ? 'us-start-date-error' : undefined
                "
              />
              <p
                v-if="errors.startDate"
                id="us-start-date-error"
                class="mt-2 text-sm text-red-600 dark:text-red-300"
              >
                {{ errors.startDate }}
              </p>
            </div>
          </div>
          <div>
            <label class="field-label" for="us-timezone">共同空间时区</label>
            <input
              id="us-timezone"
              v-model="form.timezone"
              class="field-input"
              list="us-common-timezones"
              autocomplete="off"
              :aria-invalid="Boolean(errors.timezone)"
              :aria-describedby="
                errors.timezone ? 'us-timezone-error' : undefined
              "
            />
            <datalist id="us-common-timezones">
              <option value="Asia/Shanghai" />
              <option value="Asia/Hong_Kong" />
              <option value="Asia/Taipei" />
              <option value="Asia/Tokyo" />
              <option value="Europe/London" />
              <option value="America/Los_Angeles" />
            </datalist>
            <p
              v-if="errors.timezone"
              id="us-timezone-error"
              class="mt-2 text-sm text-red-600 dark:text-red-300"
            >
              {{ errors.timezone }}
            </p>
          </div>
          <div>
            <label class="field-label" for="us-signature"
              >关系签名
              <span class="font-normal text-ink-400">（可留空）</span></label
            >
            <textarea
              id="us-signature"
              v-model="form.signature"
              class="field-input min-h-28 resize-y"
              maxlength="280"
              :aria-invalid="Boolean(errors.signature)"
              :aria-describedby="
                errors.signature ? 'us-signature-error' : undefined
              "
            />
            <p
              v-if="errors.signature"
              id="us-signature-error"
              class="mt-2 text-sm text-red-600 dark:text-red-300"
            >
              {{ errors.signature }}
            </p>
          </div>
          <div
            v-if="requestError"
            class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200"
            role="alert"
          >
            {{ requestError }}
          </div>
          <div class="flex flex-wrap justify-end gap-3">
            <BaseButton variant="ghost" :disabled="saving" @click="closeEditor"
              >取消</BaseButton
            >
            <BaseButton type="submit" :loading="saving"
              ><Check class="size-4" />保存共同资料</BaseButton
            >
          </div>
        </form>
      </SurfaceCard>
    </section>

    <section class="mt-8 grid gap-5 lg:grid-cols-[1fr_0.8fr]">
      <SurfaceCard>
        <SectionHeading
          title="空间成员"
          description="男生与女生两个固定身份共同使用这个空间。"
        />
        <div class="mt-5 grid gap-3 sm:grid-cols-2">
          <article
            v-for="(member, index) in members"
            :key="member.id"
            class="rounded-2xl border border-ink-200/80 bg-white/55 p-4 dark:border-white/10 dark:bg-white/[0.03]"
          >
            <div class="flex items-center gap-3">
              <span
                class="grid size-11 place-items-center rounded-2xl text-sm font-semibold text-white"
                :class="index === 0 ? 'bg-memory-400' : 'bg-present-500'"
                >{{ memberName(member, "我").slice(0, 1) }}</span
              >
              <div class="min-w-0">
                <p class="truncate font-semibold text-ink-950 dark:text-white">
                  {{ memberName(member, "成员") }}
                </p>
                <p class="mt-1 truncate text-xs text-ink-400 dark:text-ink-500">
                  {{ member.role === "boy" ? "男生" : "女生" }} ·
                  {{ member.displayName }}
                </p>
              </div>
            </div>
          </article>
        </div>
      </SurfaceCard>

      <SurfaceCard tone="memory">
        <div class="flex items-start gap-4">
          <span
            class="grid size-11 shrink-0 place-items-center rounded-2xl bg-memory-100 text-memory-700 dark:bg-memory-900/45 dark:text-memory-200"
            ><CalendarHeart class="size-5"
          /></span>
          <div>
            <p class="eyebrow text-memory-700 dark:text-memory-300">关系坐标</p>
            <p class="mt-2 text-lg font-semibold text-ink-950 dark:text-white">
              {{ relationship?.startDate }}
            </p>
            <p class="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400">
              以 {{ relationship?.timezone }} 为共同空间时区。
            </p>
          </div>
        </div>
        <div class="quiet-divider my-5" />
        <div
          class="flex items-start gap-3 text-sm leading-6 text-ink-500 dark:text-ink-400"
        >
          <UsersRound class="mt-0.5 size-4 shrink-0" />
          <p>回忆数量、愿望与地点统计会在对应内容模块接入后由真实数据汇总。</p>
        </div>
      </SurfaceCard>
    </section>

    <p
      v-if="todayQuery.isError.value"
      class="mt-4 flex items-start gap-2 text-xs leading-5 text-ink-400 dark:text-ink-500"
      role="status"
    >
      <UserRound class="mt-0.5 size-3.5 shrink-0" />
      共同资料仍可使用；服务器共同天数暂时无法刷新。
    </p>
  </main>
</template>
