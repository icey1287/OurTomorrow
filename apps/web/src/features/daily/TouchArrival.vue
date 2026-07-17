<script setup lang="ts">
import type { TouchEventKind } from "@our-tomorrow/contracts";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

import { usePwa } from "@/shared/pwa/pwa";
import { useThemeStore } from "@/shared/stores/theme";

const theme = useThemeStore();
const pwa = usePwa();
const kind = ref<TouchEventKind | null>(null);
let timer: number | null = null;

const copy: Record<TouchEventKind, { emoji: string; label: string }> = {
  HUG: { emoji: "🫂", label: "对方送来一个抱抱" },
  MISS_YOU: { emoji: "💭", label: "对方正在想你" },
  KISS: { emoji: "💋", label: "对方轻轻亲了你一下" },
  CHEER: { emoji: "🌟", label: "对方在为你加油" },
  REST: { emoji: "🌙", label: "对方提醒你记得休息" },
  TELL_ME_WHEN_HOME: { emoji: "🏠", label: "对方想知道你平安到家" },
  I_AM_HERE: { emoji: "🤍", label: "对方想告诉你：我在这里" },
};

const current = computed(() => (kind.value ? copy[kind.value] : null));

function clearArrival() {
  kind.value = null;
  if (timer !== null) window.clearTimeout(timer);
  timer = null;
}

function receive(event: Event) {
  if (!pwa.touchArrivalsEnabled.value) return;
  const detail = (event as CustomEvent<{ kind?: TouchEventKind }>).detail;
  if (!detail?.kind || !(detail.kind in copy)) return;
  kind.value = detail.kind;
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    kind.value = null;
    timer = null;
  }, 3_200);
}

watch(pwa.touchArrivalsEnabled, (enabled) => {
  if (!enabled) clearArrival();
});

onMounted(() => window.addEventListener("our-tomorrow:touch", receive));
onBeforeUnmount(() => {
  window.removeEventListener("our-tomorrow:touch", receive);
  clearArrival();
});
</script>

<template>
  <Transition name="touch-arrival" :css="!theme.reduceMotion">
    <div
      v-if="current"
      class="pointer-events-none fixed inset-x-4 top-20 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-present-200 bg-white/95 px-4 py-3 shadow-xl shadow-ink-950/10 backdrop-blur dark:border-present-900/60 dark:bg-ink-900/95"
      role="status"
      aria-live="polite"
    >
      <span
        class="grid size-10 shrink-0 place-items-center rounded-2xl bg-present-100 text-xl dark:bg-present-950/60"
        aria-hidden="true"
      >
        {{ current.emoji }}
      </span>
      <p class="text-sm font-semibold text-ink-900 dark:text-white">
        {{ current.label }}
      </p>
    </div>
  </Transition>
</template>

<style scoped>
.touch-arrival-enter-active,
.touch-arrival-leave-active {
  transition:
    opacity 220ms ease,
    transform 220ms ease;
}

.touch-arrival-enter-from,
.touch-arrival-leave-to {
  opacity: 0;
  transform: translateY(-0.75rem) scale(0.98);
}
</style>
