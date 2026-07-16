<script setup lang="ts">
import type { IdentityRole } from "@our-tomorrow/contracts";
import { Mars, Venus } from "lucide-vue-next";
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import BaseButton from "@/shared/components/BaseButton.vue";
import { useIdentityStore } from "@/shared/stores/identity";

const route = useRoute();
const router = useRouter();
const identity = useIdentityStore();
const selecting = ref<IdentityRole | null>(null);

function safeRedirect() {
  const redirect = route.query.redirect;
  return typeof redirect === "string" &&
    redirect.startsWith("/") &&
    !redirect.startsWith("//")
    ? redirect
    : "/today";
}

async function select(role: IdentityRole) {
  if (selecting.value) return;
  selecting.value = role;

  try {
    await identity.selectRole(role);
    await router.replace(safeRedirect());
  } catch {
    // Store exposes the API-safe message below.
  } finally {
    selecting.value = null;
  }
}
</script>

<template>
  <section class="surface w-full max-w-2xl p-6 sm:p-9">
    <div class="mx-auto max-w-xl text-center">
      <p class="eyebrow">欢迎回到我们的明天</p>
      <h1
        class="mt-3 font-display text-3xl font-semibold tracking-[-0.04em] text-ink-950 dark:text-white sm:text-4xl"
      >
        请选择你是谁
      </h1>
      <p class="mt-3 text-sm leading-6 text-ink-500 dark:text-ink-400">
        这个选择只保存在当前浏览器，刷新后会自动恢复。
      </p>
    </div>

    <div class="mt-8 grid gap-4 sm:grid-cols-2">
      <BaseButton
        class="!min-h-36 !flex-col !rounded-3xl !bg-memory-500 !text-white hover:!bg-memory-600 dark:!bg-memory-500 dark:!text-white dark:hover:!bg-memory-400"
        :loading="selecting === 'boy'"
        :disabled="Boolean(selecting)"
        aria-label="选择我是男生"
        @click="select('boy')"
      >
        <Mars class="size-8" aria-hidden="true" />
        <span class="text-lg">我是男生</span>
      </BaseButton>

      <BaseButton
        class="!min-h-36 !flex-col !rounded-3xl !bg-present-500 !text-white hover:!bg-present-600 dark:!bg-present-500 dark:!text-white dark:hover:!bg-present-400"
        :loading="selecting === 'girl'"
        :disabled="Boolean(selecting)"
        aria-label="选择我是女生"
        @click="select('girl')"
      >
        <Venus class="size-8" aria-hidden="true" />
        <span class="text-lg">我是女生</span>
      </BaseButton>
    </div>

    <p
      v-if="identity.errorMessage"
      class="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm leading-6 text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200"
      role="alert"
    >
      {{ identity.errorMessage }}
    </p>
  </section>
</template>
