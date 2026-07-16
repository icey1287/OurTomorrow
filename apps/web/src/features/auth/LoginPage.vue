<script setup lang="ts">
import {
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
} from "lucide-vue-next";
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import BaseButton from "@/shared/components/BaseButton.vue";
import { useSessionStore } from "@/shared/stores/session";

const route = useRoute();
const router = useRouter();
const session = useSessionStore();

const username = ref("");
const password = ref("");
const showPassword = ref(false);
const submitting = ref(false);

function safeRedirect(): string | null {
  const redirect = route.query.redirect;
  return typeof redirect === "string" &&
    redirect.startsWith("/") &&
    !redirect.startsWith("//")
    ? redirect
    : null;
}

async function submit() {
  if (submitting.value) return;
  submitting.value = true;

  try {
    const nextSession = await session.login({
      username: username.value.trim(),
      password: password.value,
    });
    await router.replace(
      safeRedirect() ?? (nextSession.couple ? "/today" : "/onboarding"),
    );
  } catch {
    // Store keeps the privacy-safe error message shown below.
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div
    class="grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16"
  >
    <section class="hidden lg:block">
      <p class="eyebrow">Private by design</p>
      <h1
        class="mt-4 max-w-xl font-display text-5xl font-semibold leading-[1.08] tracking-[-0.045em] text-ink-950 dark:text-white"
      >
        这里没有访客，<br />只有我们。
      </h1>
      <p class="mt-6 max-w-lg text-lg leading-8 text-ink-600 dark:text-ink-300">
        把愿望写进明天，在日常中一起实现，再让它成为某天会重新遇见的记录。
      </p>

      <div class="mt-10 grid max-w-xl grid-cols-3 gap-3">
        <div class="rounded-2xl bg-memory-100/65 p-4 dark:bg-memory-950/30">
          <span
            class="text-xs font-bold tracking-[0.16em] text-memory-700 dark:text-memory-300"
            >记录</span
          >
          <p class="mt-2 text-sm text-ink-600 dark:text-ink-300">收下过去</p>
        </div>
        <div class="rounded-2xl bg-present-100/65 p-4 dark:bg-present-950/30">
          <span
            class="text-xs font-bold tracking-[0.16em] text-present-700 dark:text-present-300"
            >日常</span
          >
          <p class="mt-2 text-sm text-ink-600 dark:text-ink-300">感知此刻</p>
        </div>
        <div class="rounded-2xl bg-future-100/65 p-4 dark:bg-future-950/30">
          <span
            class="text-xs font-bold tracking-[0.16em] text-future-700 dark:text-future-300"
            >明天</span
          >
          <p class="mt-2 text-sm text-ink-600 dark:text-ink-300">共同期待</p>
        </div>
      </div>
    </section>

    <section class="surface mx-auto w-full max-w-md p-6 sm:p-8">
      <div
        class="grid size-12 place-items-center rounded-2xl bg-ink-950 text-white shadow-lg shadow-ink-950/15 dark:bg-white dark:text-ink-950"
      >
        <KeyRound class="size-5" />
      </div>
      <p class="eyebrow mt-6">欢迎回来</p>
      <h1
        class="mt-2 font-display text-3xl font-semibold tracking-[-0.035em] text-ink-950 dark:text-white"
      >
        回到你们的空间
      </h1>
      <p
        class="mt-3 text-sm leading-6 text-ink-500 dark:text-ink-400 lg:hidden"
      >
        这里没有访客，只有我们。
      </p>

      <form class="mt-7 space-y-5" @submit.prevent="submit">
        <div>
          <label class="field-label" for="username">账号</label>
          <input
            id="username"
            v-model="username"
            class="field-input"
            name="username"
            autocomplete="username"
            inputmode="text"
            required
            placeholder="输入你的专属账号"
          />
        </div>

        <div>
          <label class="field-label" for="password">密码</label>
          <div class="relative">
            <input
              id="password"
              v-model="password"
              class="field-input pr-12"
              name="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              required
              placeholder="输入密码"
            />
            <button
              type="button"
              class="absolute inset-y-0 right-1 grid w-11 place-items-center rounded-xl text-ink-400 transition hover:text-ink-700 dark:hover:text-white"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              @click="showPassword = !showPassword"
            >
              <EyeOff v-if="showPassword" class="size-4" />
              <Eye v-else class="size-4" />
            </button>
          </div>
        </div>

        <div
          v-if="session.errorMessage"
          class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200"
          role="alert"
        >
          {{ session.errorMessage }}
        </div>

        <BaseButton type="submit" size="lg" block :loading="submitting">
          <LockKeyhole class="size-4" />
          安全进入
        </BaseButton>
      </form>

      <div class="quiet-divider my-6" />

      <div
        class="flex items-start gap-3 text-xs leading-5 text-ink-400 dark:text-ink-500"
      >
        <ShieldCheck class="mt-0.5 size-4 shrink-0" />
        <p>
          明天没有公开注册与公开主页。会话由安全 Cookie
          保存，私密内容不会写入浏览器长期令牌。
        </p>
      </div>
    </section>
  </div>
</template>
