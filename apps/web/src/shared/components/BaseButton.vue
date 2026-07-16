<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "sm" | "md" | "lg";
    type?: "button" | "submit" | "reset";
    loading?: boolean;
    disabled?: boolean;
    block?: boolean;
  }>(),
  {
    variant: "primary",
    size: "md",
    type: "button",
    loading: false,
    disabled: false,
    block: false,
  },
);

const classes = computed(() => [
  {
    primary:
      "bg-ink-950 text-white shadow-lg shadow-ink-950/15 hover:bg-ink-800 dark:bg-white dark:text-ink-950 dark:hover:bg-ink-100",
    secondary:
      "border border-ink-200 bg-white/75 text-ink-800 hover:border-ink-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-white dark:hover:bg-white/10",
    ghost:
      "text-ink-600 hover:bg-ink-100/80 hover:text-ink-950 dark:text-ink-300 dark:hover:bg-white/[0.07] dark:hover:text-white",
    danger:
      "bg-red-600 text-white shadow-lg shadow-red-700/15 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-400",
  }[props.variant],
  {
    sm: "min-h-9 rounded-xl px-3.5 py-2 text-sm",
    md: "min-h-11 rounded-2xl px-5 py-3 text-sm",
    lg: "min-h-[3.25rem] rounded-2xl px-6 py-3.5 text-base",
  }[props.size],
  props.block ? "w-full" : "",
]);
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    class="inline-flex items-center justify-center gap-2 font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-55"
    :class="classes"
  >
    <svg
      v-if="loading"
      class="size-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        class="opacity-25"
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        stroke-width="3"
      />
      <path
        class="opacity-80"
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
      />
    </svg>
    <slot />
  </button>
</template>
