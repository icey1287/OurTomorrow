<script setup lang="ts">
import { CalendarHeart, Link2, MapPin, UsersRound } from "lucide-vue-next";
import { computed, ref } from "vue";

import BaseButton from "@/shared/components/BaseButton.vue";

type EntryMode = "create" | "join";

const mode = ref<EntryMode>("create");
const step = ref(1);
const yourNickname = ref("");
const partnerNickname = ref("");
const startDate = ref("");
const timezone = ref(
  Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
);
const inviteCode = ref("");

const progress = computed(() => `${Math.min(step.value, 3)}/3`);

function continueSetup() {
  step.value = Math.min(step.value + 1, 3);
}
</script>

<template>
  <section class="surface w-full max-w-3xl overflow-hidden">
    <div class="grid lg:grid-cols-[0.38fr_0.62fr]">
      <aside
        class="relative overflow-hidden bg-ink-950 p-6 text-white sm:p-8 dark:bg-black/35"
      >
        <div
          class="absolute -right-14 -top-12 size-44 rounded-full bg-future-400/25 blur-2xl"
        />
        <p
          class="relative text-xs font-bold uppercase tracking-[0.2em] text-white/50"
        >
          第一次来到明天
        </p>
        <h1
          class="relative mt-3 font-display text-3xl font-semibold leading-tight tracking-[-0.035em]"
        >
          为两个人，<br />建立一个空间。
        </h1>
        <p class="relative mt-4 text-sm leading-6 text-white/60">
          只有接受邀请的两个人，才能一起走进这里。
        </p>

        <ol class="relative mt-9 space-y-4 text-sm">
          <li
            v-for="item in [
              ['1', '写下彼此的称呼'],
              ['2', '确认共同开始的日期'],
              ['3', '邀请另一半加入'],
            ]"
            :key="item[0]"
            class="flex items-center gap-3"
            :class="Number(item[0]) <= step ? 'text-white' : 'text-white/35'"
          >
            <span
              class="grid size-7 place-items-center rounded-full border text-xs font-semibold"
              :class="
                Number(item[0]) <= step
                  ? 'border-white/70 bg-white/10'
                  : 'border-white/15'
              "
            >
              {{ item[0] }}
            </span>
            {{ item[1] }}
          </li>
        </ol>
      </aside>

      <div class="p-6 sm:p-8">
        <div class="flex items-center justify-between gap-4">
          <div
            class="inline-flex rounded-2xl bg-ink-100/75 p-1 dark:bg-white/[0.06]"
          >
            <button
              type="button"
              class="rounded-xl px-4 py-2 text-sm font-semibold transition"
              :class="
                mode === 'create'
                  ? 'bg-white text-ink-950 shadow-sm dark:bg-white/10 dark:text-white'
                  : 'text-ink-500 dark:text-ink-400'
              "
              @click="mode = 'create'"
            >
              创建空间
            </button>
            <button
              type="button"
              class="rounded-xl px-4 py-2 text-sm font-semibold transition"
              :class="
                mode === 'join'
                  ? 'bg-white text-ink-950 shadow-sm dark:bg-white/10 dark:text-white'
                  : 'text-ink-500 dark:text-ink-400'
              "
              @click="mode = 'join'"
            >
              接受邀请
            </button>
          </div>
          <span class="text-xs font-semibold text-ink-400 dark:text-ink-500">{{
            progress
          }}</span>
        </div>

        <div v-if="mode === 'join'" class="mt-8">
          <span
            class="grid size-11 place-items-center rounded-2xl bg-present-100 text-present-700 dark:bg-present-950/50 dark:text-present-200"
          >
            <Link2 class="size-5" />
          </span>
          <h2
            class="mt-5 font-display text-2xl font-semibold text-ink-950 dark:text-white"
          >
            带着邀请码走进来
          </h2>
          <p class="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400">
            邀请码仅能使用一次，也会在约定时间后自动失效。
          </p>
          <label class="field-label mt-6" for="invite-code">一次性邀请码</label>
          <input
            id="invite-code"
            v-model="inviteCode"
            class="field-input font-mono uppercase tracking-[0.22em]"
            autocomplete="one-time-code"
            maxlength="12"
            placeholder="MING-TIAN"
          />
          <BaseButton
            class="mt-5"
            size="lg"
            block
            :disabled="inviteCode.trim().length < 6"
          >
            确认并加入
          </BaseButton>
        </div>

        <form v-else class="mt-8" @submit.prevent="continueSetup">
          <div v-if="step === 1">
            <span
              class="grid size-11 place-items-center rounded-2xl bg-memory-100 text-memory-700 dark:bg-memory-950/50 dark:text-memory-200"
            >
              <UsersRound class="size-5" />
            </span>
            <h2
              class="mt-5 font-display text-2xl font-semibold text-ink-950 dark:text-white"
            >
              你们习惯怎样称呼彼此？
            </h2>
            <p class="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400">
              这些称呼会出现在今日首页和共同回忆里，之后随时可以修改。
            </p>
            <div class="mt-6 grid gap-4 sm:grid-cols-2">
              <div>
                <label class="field-label" for="your-nickname">你的称呼</label>
                <input
                  id="your-nickname"
                  v-model="yourNickname"
                  class="field-input"
                  required
                  placeholder="例如：甲"
                />
              </div>
              <div>
                <label class="field-label" for="partner-nickname"
                  >她 / 他的称呼</label
                >
                <input
                  id="partner-nickname"
                  v-model="partnerNickname"
                  class="field-input"
                  required
                  placeholder="例如：天"
                />
              </div>
            </div>
          </div>

          <div v-else-if="step === 2">
            <span
              class="grid size-11 place-items-center rounded-2xl bg-future-100 text-future-700 dark:bg-future-950/50 dark:text-future-200"
            >
              <CalendarHeart class="size-5" />
            </span>
            <h2
              class="mt-5 font-display text-2xl font-semibold text-ink-950 dark:text-white"
            >
              故事从哪一天开始？
            </h2>
            <p class="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400">
              日期计算始终以你们选择的时区为准，不让跨日悄悄改变纪念。
            </p>
            <div class="mt-6 space-y-4">
              <div>
                <label class="field-label" for="start-date">恋爱开始日期</label>
                <input
                  id="start-date"
                  v-model="startDate"
                  class="field-input"
                  type="date"
                  required
                />
              </div>
              <div>
                <label class="field-label" for="timezone">共同空间时区</label>
                <div class="relative">
                  <MapPin
                    class="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-400"
                  />
                  <input
                    id="timezone"
                    v-model="timezone"
                    class="field-input pl-11"
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          <div v-else>
            <span
              class="grid size-11 place-items-center rounded-2xl bg-present-100 text-present-700 dark:bg-present-950/50 dark:text-present-200"
            >
              <Link2 class="size-5" />
            </span>
            <h2
              class="mt-5 font-display text-2xl font-semibold text-ink-950 dark:text-white"
            >
              下一步，邀请另一半
            </h2>
            <p class="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400">
              保存后会生成一次性邀请码。等两个人都确认，这个空间才会完整亮起。
            </p>
            <div
              class="mt-6 rounded-2xl border border-dashed border-ink-200 bg-ink-50/70 p-5 text-sm dark:border-white/10 dark:bg-white/[0.03]"
            >
              <p class="font-semibold text-ink-800 dark:text-ink-100">
                {{ yourNickname || "你" }} ＆ {{ partnerNickname || "另一半" }}
              </p>
              <p class="mt-2 text-ink-500 dark:text-ink-400">
                {{ startDate || "等待选择开始日期" }} · {{ timezone }}
              </p>
            </div>
          </div>

          <div class="mt-8 flex items-center justify-between gap-3">
            <BaseButton v-if="step > 1" variant="ghost" @click="step -= 1"
              >上一步</BaseButton
            >
            <span v-else />
            <BaseButton type="submit" size="lg">
              {{ step === 3 ? "创建并生成邀请" : "继续" }}
            </BaseButton>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>
