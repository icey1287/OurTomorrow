<script setup lang="ts">
import type { IdentityRole } from "@our-tomorrow/contracts";
import { ArrowRight, Heart, Sparkles } from "lucide-vue-next";
import { computed, nextTick, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import { resolveIdentityRoleFromName } from "@/features/identity/identity-name";
import BaseButton from "@/shared/components/BaseButton.vue";
import { useIdentityStore } from "@/shared/stores/identity";

const route = useRoute();
const router = useRouter();
const identity = useIdentityStore();
const nameInput = ref("");
const inputElement = ref<HTMLInputElement | null>(null);
const phase = ref<"entry" | "revealing">("entry");
const matchedRole = ref<IdentityRole | null>(null);
const formError = ref<string | null>(null);
const invalidAnimation = ref(false);

const matchedName = computed(() =>
  matchedRole.value === "girl" ? "示例用户乙" : "示例用户甲",
);
const welcomeMessage = computed(() =>
  matchedRole.value === "girl" ? "乙，欢迎回来" : "甲，欢迎回来",
);

function safeRedirect() {
  const redirect = route.query.redirect;
  return typeof redirect === "string" &&
    redirect.startsWith("/") &&
    !redirect.startsWith("//")
    ? redirect
    : "/today";
}

function waitForReveal() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 1_100));
}

async function showInvalidName() {
  formError.value = "要输入真名喔";
  invalidAnimation.value = false;
  await nextTick();
  invalidAnimation.value = true;
  inputElement.value?.focus();
  inputElement.value?.select();
}

async function submitName() {
  if (phase.value === "revealing") return;

  const role = resolveIdentityRoleFromName(nameInput.value);
  if (!role) {
    await showInvalidName();
    return;
  }

  formError.value = null;
  matchedRole.value = role;
  phase.value = "revealing";

  try {
    await Promise.all([identity.selectRole(role), waitForReveal()]);
    await router.replace(safeRedirect());
  } catch {
    phase.value = "entry";
    matchedRole.value = null;
  }
}
</script>

<template>
  <section
    class="login-card surface relative w-full max-w-2xl overflow-hidden p-6 sm:p-9"
    :class="{ 'login-card--revealing': phase === 'revealing' }"
  >
    <div class="login-glow login-glow--memory" aria-hidden="true" />
    <div class="login-glow login-glow--present" aria-hidden="true" />

    <form
      v-if="phase === 'entry'"
      class="relative mx-auto max-w-lg"
      novalidate
      @submit.prevent="submitName"
    >
      <div class="text-center">
        <span
          class="mx-auto grid size-14 place-items-center rounded-[1.35rem] bg-ink-950 text-white shadow-lg shadow-ink-950/15 dark:bg-white dark:text-ink-950"
          aria-hidden="true"
        >
          <Heart class="size-6" fill="currentColor" />
        </span>
        <p class="eyebrow mt-6">欢迎回到我们的明天</p>
        <h1
          class="mt-3 font-display text-3xl font-semibold tracking-[-0.04em] text-ink-950 dark:text-white sm:text-4xl"
        >
          输入你的名字
        </h1>
        <p
          class="mx-auto mt-3 max-w-md text-sm leading-6 text-ink-500 dark:text-ink-400"
        >
          名字会替你找到属于自己的那一边，然后带你回到我们的小世界。
        </p>
      </div>

      <div
        class="name-input-shell mt-8"
        :class="{ 'name-input-shell--invalid': invalidAnimation }"
        @animationend="invalidAnimation = false"
      >
        <label class="field-label" for="identity-name">你的名字</label>
        <input
          id="identity-name"
          ref="inputElement"
          v-model="nameInput"
          class="field-input !py-4 text-center !text-lg font-semibold tracking-[0.12em]"
          :class="{
            '!border-red-300 !ring-4 !ring-red-100 dark:!border-red-700 dark:!ring-red-950/45':
              formError,
          }"
          name="name"
          type="text"
          autocomplete="name"
          maxlength="10"
          placeholder="请输入你的真名"
          :aria-invalid="formError ? 'true' : undefined"
          :aria-describedby="formError ? 'identity-name-error' : undefined"
          autofocus
          @input="formError = null"
        />
      </div>

      <p
        v-if="formError"
        id="identity-name-error"
        class="mt-3 text-center text-sm font-semibold text-red-600 dark:text-red-300"
        role="alert"
      >
        {{ formError }}
      </p>

      <BaseButton class="mt-6" type="submit" size="lg" block>
        验证名字
        <ArrowRight class="size-4" aria-hidden="true" />
      </BaseButton>

      <p
        class="mt-4 text-center text-xs leading-5 text-ink-400 dark:text-ink-500"
      >
        只认得我们两个人的真名。
      </p>

      <p
        v-if="identity.errorMessage"
        class="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm leading-6 text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200"
        role="alert"
      >
        {{ identity.errorMessage }}
      </p>
    </form>

    <div
      v-else
      class="identity-reveal relative mx-auto flex min-h-[25rem] max-w-lg flex-col items-center justify-center text-center"
      role="status"
      aria-live="polite"
    >
      <div class="reveal-orbit" aria-hidden="true">
        <span class="reveal-spark reveal-spark--one" />
        <span class="reveal-spark reveal-spark--two" />
        <span class="reveal-spark reveal-spark--three" />
      </div>
      <span
        class="reveal-heart grid size-24 place-items-center rounded-[2rem] text-white shadow-float"
        :class="
          matchedRole === 'girl'
            ? 'bg-present-500 shadow-present-500/25'
            : 'bg-memory-500 shadow-memory-500/25'
        "
        aria-hidden="true"
      >
        <Sparkles class="size-10" />
      </span>
      <p class="eyebrow mt-8">认出你啦</p>
      <h1
        class="mt-3 font-display text-4xl font-semibold tracking-[-0.045em] text-ink-950 dark:text-white sm:text-5xl"
      >
        {{ matchedName }}
      </h1>
      <p class="mt-4 text-base font-medium text-ink-600 dark:text-ink-300">
        {{ welcomeMessage }}
      </p>
      <div
        class="mt-8 flex items-center gap-2 text-sm text-ink-400 dark:text-ink-500"
      >
        <span class="reveal-dot" aria-hidden="true" />
        正在打开我们的明天…
      </div>
    </div>
  </section>
</template>

<style scoped>
.login-card {
  isolation: isolate;
}

.login-glow {
  position: absolute;
  z-index: -1;
  width: 16rem;
  height: 16rem;
  border-radius: 9999px;
  filter: blur(70px);
  opacity: 0.22;
  pointer-events: none;
}

.login-glow--memory {
  top: -8rem;
  left: -7rem;
  background: #f7b84b;
}

.login-glow--present {
  right: -7rem;
  bottom: -8rem;
  background: #35a5ca;
}

.name-input-shell--invalid {
  animation: name-shake 420ms cubic-bezier(0.36, 0.07, 0.19, 0.97);
}

.identity-reveal {
  animation: reveal-in 680ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.reveal-heart {
  animation: heart-arrive 850ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.reveal-orbit {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 13rem;
  height: 13rem;
  margin: -8.5rem 0 0 -6.5rem;
  border: 1px solid rgb(120 130 145 / 0.14);
  border-radius: 9999px;
  animation: orbit-turn 6s linear infinite;
}

.reveal-spark {
  position: absolute;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 9999px;
  background: #f7b84b;
  box-shadow: 0 0 22px rgb(247 184 75 / 0.7);
}

.reveal-spark--one {
  top: 0.6rem;
  left: 4rem;
}

.reveal-spark--two {
  right: 0.9rem;
  bottom: 3.2rem;
  background: #35a5ca;
  box-shadow: 0 0 22px rgb(53 165 202 / 0.7);
}

.reveal-spark--three {
  bottom: 0.4rem;
  left: 3.4rem;
  width: 0.35rem;
  height: 0.35rem;
}

.reveal-dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 9999px;
  background: currentColor;
  animation: dot-pulse 900ms ease-in-out infinite alternate;
}

@keyframes name-shake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-8px);
  }
  50% {
    transform: translateX(7px);
  }
  75% {
    transform: translateX(-4px);
  }
}

@keyframes reveal-in {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes heart-arrive {
  0% {
    opacity: 0;
    transform: scale(0.5) rotate(-10deg);
  }
  65% {
    transform: scale(1.08) rotate(2deg);
  }
  100% {
    opacity: 1;
    transform: scale(1) rotate(0);
  }
}

@keyframes orbit-turn {
  to {
    transform: rotate(360deg);
  }
}

@keyframes dot-pulse {
  to {
    opacity: 0.25;
    transform: scale(0.75);
  }
}
</style>
