<script setup lang="ts">
import { CloudOff, LoaderCircle, Sparkles } from "lucide-vue-next";
import { computed } from "vue";

import BaseButton from "@/shared/components/BaseButton.vue";

const props = defineProps<{
  state: "loading" | "empty" | "error";
  title?: string;
  message?: string;
  actionLabel?: string;
}>();

defineEmits<{
  action: [];
}>();

const copy = computed(() => {
  if (props.state === "loading") {
    return {
      title: props.title ?? "正在轻轻打开…",
      message: props.message ?? "把属于你们的内容准备好。",
    };
  }

  if (props.state === "error") {
    return {
      title: props.title ?? "这次没有顺利打开",
      message: props.message ?? "可能只是短暂走神，稍后再试一次。",
    };
  }

  return {
    title: props.title ?? "这里还很安静",
    message: props.message ?? "第一段故事，会从你们写下的那一刻开始。",
  };
});
</script>

<template>
  <div
    class="grid min-h-52 place-items-center rounded-3xl border border-dashed border-ink-200/90 bg-white/45 px-6 py-10 text-center dark:border-white/10 dark:bg-white/[0.025]"
    role="status"
    :aria-live="state === 'error' ? 'assertive' : 'polite'"
  >
    <div class="max-w-sm">
      <span
        class="mx-auto grid size-12 place-items-center rounded-2xl bg-ink-100 text-ink-600 dark:bg-white/[0.07] dark:text-ink-300"
      >
        <LoaderCircle v-if="state === 'loading'" class="size-5 animate-spin" />
        <CloudOff v-else-if="state === 'error'" class="size-5" />
        <Sparkles v-else class="size-5" />
      </span>
      <h3
        class="mt-4 font-display text-lg font-semibold text-ink-950 dark:text-white"
      >
        {{ copy.title }}
      </h3>
      <p class="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400">
        {{ copy.message }}
      </p>
      <BaseButton
        v-if="actionLabel && state !== 'loading'"
        class="mt-5"
        variant="secondary"
        size="sm"
        @click="$emit('action')"
      >
        {{ actionLabel }}
      </BaseButton>
    </div>
  </div>
</template>
