<script setup lang="ts">
import type {
  MemoryResurfaceTodayResponse,
  MemoryResurfaceView,
} from "@our-tomorrow/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { Gift, LockKeyhole, Sparkles, X } from "lucide-vue-next";
import { computed, ref, watch } from "vue";

import PrivateMediaImage from "@/features/remember/PrivateMediaImage.vue";
import {
  formatMemoryDate,
  memoryResurfaceReasonText,
} from "@/features/remember/remember-utils";
import { ApiClientError } from "@/shared/api/client";
import { stageTwoApi } from "@/shared/api/stage-two";
import BaseButton from "@/shared/components/BaseButton.vue";
import SurfaceCard from "@/shared/components/SurfaceCard.vue";
import { useIdentityStore } from "@/shared/stores/identity";

defineProps<{ timezone: string }>();
const emit = defineEmits<{ open: [memoryId: string] }>();

const identity = useIdentityStore();
const queryClient = useQueryClient();
const actionError = ref<string | null>(null);
const queryKey = computed(() => ["memory-resurface", identity.role, "today"]);

const todayQuery = useQuery({
  queryKey,
  queryFn: stageTwoApi.memoryResurfaceToday,
  enabled: computed(() => Boolean(identity.role)),
  retry: false,
});

const today = computed(() => todayQuery.data.value ?? null);
const box = computed(() => today.value?.box ?? null);
const reasonText = computed(() =>
  box.value ? memoryResurfaceReasonText(box.value.reason) : "",
);

function applyBox(nextBox: MemoryResurfaceView) {
  queryClient.setQueryData<MemoryResurfaceTodayResponse>(
    queryKey.value,
    (current) => ({
      serverNow: current?.serverNow ?? new Date().toISOString(),
      localDate: current?.localDate ?? nextBox.localDate,
      box: nextBox,
    }),
  );
}

function errorMessage(error: unknown) {
  return error instanceof ApiClientError
    ? error.message
    : "盲盒暂时没有顺利打开，请稍后再试。";
}

const openMutation = useMutation({
  mutationFn: (id: string) => stageTwoApi.openMemoryResurface(id),
  onMutate: () => {
    actionError.value = null;
  },
  onSuccess: applyBox,
  onError: (error) => {
    actionError.value = errorMessage(error);
  },
});

const dismissMutation = useMutation({
  mutationFn: (id: string) => stageTwoApi.dismissMemoryResurface(id),
  onMutate: () => {
    actionError.value = null;
  },
  onSuccess: applyBox,
  onError: (error) => {
    actionError.value = errorMessage(error);
  },
});

watch(
  () => identity.role,
  () => {
    actionError.value = null;
  },
);
</script>

<template>
  <SurfaceCard tone="memory" class="overflow-hidden">
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="eyebrow text-memory-700 dark:text-memory-300">每日一盒</p>
        <h2
          class="mt-2 font-display text-xl font-semibold text-ink-950 dark:text-white"
        >
          回忆盲盒
        </h2>
      </div>
      <button
        v-if="box && !box.dismissedAt"
        type="button"
        class="rounded-xl p-2 text-ink-400 transition hover:bg-white/70 hover:text-ink-700 dark:hover:bg-white/[0.07] dark:hover:text-white"
        aria-label="今天关闭回忆盲盒"
        :disabled="dismissMutation.isPending.value"
        @click="dismissMutation.mutate(box.id)"
      >
        <X class="size-4" />
      </button>
    </div>

    <p
      v-if="todayQuery.isPending.value"
      class="mt-5 text-sm leading-6 text-ink-500 dark:text-ink-400"
    >
      正在按你们的共同日期准备今天这一盒…
    </p>

    <div v-else-if="todayQuery.isError.value" class="mt-5">
      <p class="text-sm leading-6 text-red-600 dark:text-red-300">
        {{ errorMessage(todayQuery.error.value) }}
      </p>
      <BaseButton
        class="mt-4"
        size="sm"
        variant="secondary"
        @click="todayQuery.refetch()"
      >
        重新寻找
      </BaseButton>
    </div>

    <div v-else-if="!box" class="mt-5">
      <span
        class="grid size-12 place-items-center rounded-2xl bg-memory-100 text-memory-600 dark:bg-memory-950/55 dark:text-memory-200"
      >
        <Gift class="size-5" />
      </span>
      <p class="mt-4 text-sm leading-6 text-ink-500 dark:text-ink-400">
        已发布的过去还不够多。再留下一些故事后，盲盒会自然出现。
      </p>
    </div>

    <div v-else-if="box.dismissedAt" class="mt-5">
      <div
        class="grid min-h-36 place-items-center rounded-[1.75rem] border border-dashed border-memory-200 bg-white/45 px-5 text-center dark:border-memory-900/60 dark:bg-white/[0.025]"
      >
        <div>
          <Gift class="mx-auto size-6 text-memory-400" />
          <p class="mt-3 text-sm font-semibold text-ink-700 dark:text-ink-200">
            今天的盲盒已经轻轻合上
          </p>
          <p class="mt-1 text-xs text-ink-400">明天会按共同空间时区再见。</p>
        </div>
      </div>
    </div>

    <div v-else-if="!box.openedAt" class="mt-5">
      <div
        class="relative grid min-h-48 place-items-center overflow-hidden rounded-[2rem] bg-gradient-to-br from-memory-200 via-present-100 to-future-100 px-6 text-center dark:from-memory-950/80 dark:via-present-950/45 dark:to-future-950/55"
      >
        <span
          class="absolute -right-8 -top-10 size-32 rounded-full border-[24px] border-white/30 dark:border-white/[0.035]"
          aria-hidden="true"
        />
        <div class="relative">
          <span
            class="mx-auto grid size-16 place-items-center rounded-[1.75rem] border border-white/70 bg-white/60 text-memory-700 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/[0.07] dark:text-memory-200"
          >
            <LockKeyhole class="size-7" />
          </span>
          <p class="mt-4 text-sm font-semibold text-ink-800 dark:text-white">
            同一盒，正在等你们亲手打开
          </p>
          <p
            class="mx-auto mt-2 max-w-xs text-xs leading-5 text-ink-600 dark:text-ink-300"
          >
            {{ reasonText }} 打开前不会返回标题、封面、地点或正文。
          </p>
        </div>
      </div>
      <BaseButton
        class="mt-4"
        block
        :loading="openMutation.isPending.value"
        @click="openMutation.mutate(box.id)"
      >
        <Sparkles class="size-4" /> 显式打开今天的盲盒
      </BaseButton>
    </div>

    <div v-else-if="box.memory" class="mt-5">
      <button
        type="button"
        class="group w-full text-left"
        @click="emit('open', box.memory.id)"
      >
        <div
          v-if="box.memory.coverMedia"
          class="aspect-[16/10] overflow-hidden rounded-[1.75rem] bg-memory-100 dark:bg-memory-950/50"
        >
          <PrivateMediaImage
            :src="box.memory.coverMedia.thumbnailUrl"
            :alt="`${box.memory.title}的封面`"
            :retryable="false"
            image-class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]"
          />
        </div>
        <p
          class="mt-4 text-xs font-semibold text-memory-700 dark:text-memory-300"
        >
          {{ reasonText }}
        </p>
        <h3
          class="mt-2 font-display text-xl font-semibold leading-7 text-ink-950 transition group-hover:text-memory-700 dark:text-white dark:group-hover:text-memory-200"
        >
          {{ box.memory.title }}
        </h3>
        <p class="mt-2 text-xs font-semibold text-ink-400">
          {{ formatMemoryDate(box.memory.happenedAt, false, timezone) }}
        </p>
        <p
          v-if="box.memory.excerpt"
          class="mt-3 line-clamp-3 text-sm leading-6 text-ink-500 dark:text-ink-400"
        >
          {{ box.memory.excerpt }}
        </p>
      </button>
    </div>

    <p v-else class="mt-5 text-sm leading-6 text-ink-500 dark:text-ink-400">
      这段回忆刚刚发生了变化，今天不再展示它，明天会重新挑选。
    </p>

    <p
      v-if="actionError"
      class="mt-4 text-sm text-red-600 dark:text-red-300"
      role="alert"
    >
      {{ actionError }}
    </p>
  </SurfaceCard>
</template>
