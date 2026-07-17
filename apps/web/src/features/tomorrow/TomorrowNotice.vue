<script setup lang="ts">
import { X } from "lucide-vue-next";

defineProps<{
  message: string | null;
  tone?: "success" | "error";
}>();

defineEmits<{ close: [] }>();
</script>

<template>
  <p
    v-if="message"
    class="flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm leading-6"
    :class="
      tone === 'error'
        ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200'
        : 'border-future-200 bg-future-50 text-future-800 dark:border-future-900/55 dark:bg-future-950/30 dark:text-future-200'
    "
    :role="tone === 'error' ? 'alert' : 'status'"
  >
    <span>{{ message }}</span>
    <button
      type="button"
      class="mt-0.5 shrink-0"
      aria-label="关闭提示"
      @click="$emit('close')"
    >
      <X class="size-4" />
    </button>
  </p>
</template>
