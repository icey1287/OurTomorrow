<script setup lang="ts">
import type { TouchEventKind } from "@our-tomorrow/contracts";
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { HeartHandshake, Sparkles } from "lucide-vue-next";
import { computed, ref } from "vue";

import { ApiClientError } from "@/shared/api/client";
import { stageSixApi } from "@/shared/api/stage-six";
import SectionHeading from "@/shared/components/SectionHeading.vue";
import SurfaceCard from "@/shared/components/SurfaceCard.vue";
import { useIdentityStore } from "@/shared/stores/identity";
import { useThemeStore } from "@/shared/stores/theme";

const identity = useIdentityStore();
const theme = useThemeStore();
const queryClient = useQueryClient();
const actionError = ref<string | null>(null);
const actionMessage = ref<string | null>(null);
const burstKey = ref(0);

const options: Array<{
  kind: TouchEventKind;
  emoji: string;
  label: string;
}> = [
  { kind: "HUG", emoji: "🫂", label: "抱抱" },
  { kind: "MISS_YOU", emoji: "💭", label: "想你" },
  { kind: "KISS", emoji: "💋", label: "亲一下" },
  { kind: "CHEER", emoji: "🌟", label: "给你加油" },
  { kind: "REST", emoji: "🌙", label: "记得休息" },
  { kind: "TELL_ME_WHEN_HOME", emoji: "🏠", label: "到家告诉我" },
  { kind: "I_AM_HERE", emoji: "🤍", label: "我在这里" },
];

const partnerName = computed(() => {
  const partner = identity.couple?.members.find(
    (member) => member.id !== identity.user?.id,
  );
  return partner?.nicknameInRelationship || partner?.displayName || "对方";
});

const sendMutation = useMutation({
  mutationFn: (kind: TouchEventKind) => stageSixApi.sendTouch({ kind }),
  onSuccess: async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      queryClient.invalidateQueries({ queryKey: ["today"] }),
    ]);
  },
});

async function send(kind: TouchEventKind, label: string) {
  if (sendMutation.isPending.value) return;
  actionError.value = null;
  actionMessage.value = null;
  try {
    await sendMutation.mutateAsync(kind);
    burstKey.value += 1;
    actionMessage.value = `“${label}”已经轻轻送到${partnerName.value}那里。`;
  } catch (error) {
    actionError.value =
      error instanceof ApiClientError && error.status === 429
        ? "刚刚的心意已经送出啦，留一点呼吸时间再发下一次。"
        : error instanceof Error
          ? error.message
          : "这次小信号没有送出去，请稍后再试。";
  }
}
</script>

<template>
  <section aria-labelledby="touch-signal-heading">
    <SurfaceCard tone="present" class="relative overflow-hidden">
      <div class="flex items-start justify-between gap-4">
        <SectionHeading
          id="touch-signal-heading"
          title="抱抱信号"
          :description="`不用展开一段聊天，只让${partnerName}知道这一刻你想到了 Ta。`"
        />
        <span
          :key="burstKey"
          class="grid size-11 shrink-0 place-items-center rounded-2xl bg-present-100 text-present-700 dark:bg-present-900/45 dark:text-present-200"
          :class="!theme.reduceMotion && burstKey > 0 ? 'touch-burst' : ''"
          aria-hidden="true"
        >
          <HeartHandshake class="size-5" />
        </span>
      </div>

      <div
        v-if="actionError || actionMessage"
        class="mt-4 rounded-2xl px-4 py-3 text-sm leading-6"
        :class="
          actionError
            ? 'border border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200'
            : 'border border-present-200 bg-present-50 text-present-800 dark:border-present-900/55 dark:bg-present-950/30 dark:text-present-200'
        "
        :role="actionError ? 'alert' : 'status'"
      >
        {{ actionError || actionMessage }}
      </div>

      <div class="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        <button
          v-for="option in options"
          :key="option.kind"
          type="button"
          class="group flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-ink-200/80 bg-white/65 px-2 py-3 text-center transition hover:-translate-y-0.5 hover:border-present-300 hover:bg-white motion-reduce:transform-none motion-reduce:transition-none dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-present-800 dark:hover:bg-white/[0.07]"
          :disabled="sendMutation.isPending.value"
          @click="send(option.kind, option.label)"
        >
          <span class="text-2xl" aria-hidden="true">{{ option.emoji }}</span>
          <span
            class="text-xs font-semibold leading-5 text-ink-700 group-hover:text-ink-950 dark:text-ink-300 dark:group-hover:text-white"
          >
            {{ option.label }}
          </span>
        </button>
      </div>

      <p class="mt-4 flex items-center gap-2 text-xs leading-5 text-ink-400">
        <Sparkles class="size-3.5 shrink-0" />
        每次只送一个固定心意；服务端会温柔限制频率，避免它变成刷屏聊天。
      </p>
      <p class="sr-only" aria-live="polite">
        {{ sendMutation.isPending.value ? "正在发送抱抱信号" : "" }}
      </p>
    </SurfaceCard>
  </section>
</template>

<style scoped>
@keyframes touch-burst {
  0% {
    transform: scale(1);
  }
  45% {
    transform: scale(1.13);
    box-shadow: 0 0 0 12px rgb(224 129 142 / 0.12);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 20px rgb(224 129 142 / 0);
  }
}

.touch-burst {
  animation: touch-burst 700ms ease-out both;
}
</style>
