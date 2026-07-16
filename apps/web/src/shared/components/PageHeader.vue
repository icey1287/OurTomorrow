<script setup lang="ts">
defineProps<{
  eyebrow: string;
  title: string;
  description: string;
}>();
</script>

<template>
  <header
    class="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between"
  >
    <div class="max-w-3xl">
      <p class="eyebrow">{{ eyebrow }}</p>
      <h1 class="page-title mt-2">{{ title }}</h1>
      <p
        class="mt-3 max-w-2xl text-sm leading-7 text-ink-600 dark:text-ink-300 sm:text-base"
      >
        {{ description }}
      </p>
    </div>
    <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
