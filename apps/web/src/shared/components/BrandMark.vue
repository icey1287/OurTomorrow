<script setup lang="ts">
withDefaults(
  defineProps<{
    compact?: boolean;
    inverted?: boolean;
  }>(),
  {
    compact: false,
    inverted: false,
  },
);
</script>

<template>
  <div class="inline-flex items-center gap-3">
    <span
      class="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-[1.1rem] bg-ink-950 text-white shadow-lg shadow-ink-950/15 dark:bg-white dark:text-ink-950"
      aria-hidden="true"
    >
      <svg viewBox="0 0 48 48" class="size-8" fill="none">
        <path
          d="M10 31.5h28"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
        />
        <path
          d="M14 28V15.5M14 21h8.5M22.5 15.5V28"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M28.5 27.5c1.5-4.2 4.3-7.6 8.5-10.2"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
        />
        <circle cx="35.5" cy="13" r="3.2" fill="#f7b84b" />
      </svg>
    </span>

    <span v-if="!compact" class="min-w-0">
      <span
        class="block truncate font-display text-lg font-semibold leading-tight tracking-[-0.025em]"
        :class="inverted ? 'text-white' : 'text-ink-950 dark:text-white'"
      >
        我们的明天
      </span>
      <span
        class="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.18em]"
        :class="inverted ? 'text-white/55' : 'text-ink-400 dark:text-ink-500'"
      >
        OurTomorrow
      </span>
    </span>
  </div>
</template>
