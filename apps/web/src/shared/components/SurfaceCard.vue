<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    tone?: "neutral" | "memory" | "present" | "future";
    interactive?: boolean;
    padded?: boolean;
  }>(),
  {
    tone: "neutral",
    interactive: false,
    padded: true,
  },
);

const toneClass = computed(
  () =>
    ({
      neutral: "",
      memory:
        "bg-gradient-to-br from-memory-50/95 via-white/85 to-white/70 dark:from-memory-950/35 dark:via-ink-950/65 dark:to-ink-950/55",
      present:
        "bg-gradient-to-br from-present-50/95 via-white/85 to-white/70 dark:from-present-950/35 dark:via-ink-950/65 dark:to-ink-950/55",
      future:
        "bg-gradient-to-br from-future-50/95 via-white/85 to-white/70 dark:from-future-950/35 dark:via-ink-950/65 dark:to-ink-950/55",
    })[props.tone],
);
</script>

<template>
  <section
    :class="[
      interactive ? 'surface-interactive' : 'surface',
      padded ? 'p-5 sm:p-6' : '',
      toneClass,
    ]"
  >
    <slot />
  </section>
</template>
