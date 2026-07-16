<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <div class="flex items-start justify-between gap-4">
    <div>
      <h2
        class="font-display text-xl font-semibold tracking-[-0.02em] text-ink-950 dark:text-white"
      >
        {{ title }}
      </h2>
      <p
        v-if="description"
        class="mt-1 text-sm leading-6 text-ink-500 dark:text-ink-400"
      >
        {{ description }}
      </p>
    </div>
    <slot />
  </div>
</template>
