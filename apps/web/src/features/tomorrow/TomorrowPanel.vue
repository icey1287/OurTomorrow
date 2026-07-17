<script setup lang="ts">
import { X } from "lucide-vue-next";
import { nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";

let bodyLockCount = 0;
let bodyOverflowBeforeLocks = "";

function lockBody() {
  if (bodyLockCount === 0)
    bodyOverflowBeforeLocks = document.body.style.overflow;
  bodyLockCount += 1;
  document.body.style.overflow = "hidden";
}

function unlockBody() {
  bodyLockCount = Math.max(0, bodyLockCount - 1);
  if (bodyLockCount !== 0) return false;
  document.body.style.overflow = bodyOverflowBeforeLocks;
  return true;
}

const props = withDefaults(
  defineProps<{
    open: boolean;
    eyebrow: string;
    title: string;
    description?: string;
    wide?: boolean;
  }>(),
  { description: "", wide: false },
);

const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement | null>(null);
const titleId = useId();
let previouslyFocused: HTMLElement | null = null;
let bodyLocked = false;

function close() {
  emit("close");
}

function onKeydown(event: KeyboardEvent) {
  if (!props.open) return;
  if (event.key === "Escape") {
    close();
    return;
  }
  if (event.key !== "Tab" || !panel.value) return;
  const focusable = Array.from(
    panel.value.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
  if (focusable.length === 0) {
    event.preventDefault();
    panel.value.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      previouslyFocused = document.activeElement as HTMLElement | null;
      if (!bodyLocked) {
        lockBody();
        bodyLocked = true;
      }
      await nextTick();
      panel.value?.focus();
      return;
    }
    if (bodyLocked) {
      const fullyUnlocked = unlockBody();
      bodyLocked = false;
      if (fullyUnlocked) previouslyFocused?.focus();
    }
  },
  { immediate: true },
);

onMounted(() => document.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeydown);
  if (bodyLocked) unlockBody();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="panel">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-6"
        role="presentation"
        @mousedown.self="close"
      >
        <section
          ref="panel"
          data-panel
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          tabindex="-1"
          class="max-h-[94dvh] w-full overflow-y-auto rounded-t-[2rem] border border-white/80 bg-[#fbfaf7] shadow-2xl outline-none dark:border-white/10 dark:bg-ink-950 sm:rounded-[2rem]"
          :class="wide ? 'max-w-5xl' : 'max-w-2xl'"
        >
          <header
            class="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-ink-100 bg-[#fbfaf7]/95 px-5 py-5 backdrop-blur-xl dark:border-white/10 dark:bg-ink-950/95 sm:px-7"
          >
            <div>
              <p class="eyebrow text-future-700 dark:text-future-300">
                {{ eyebrow }}
              </p>
              <h2
                :id="titleId"
                class="mt-2 font-display text-2xl font-semibold text-ink-950 dark:text-white"
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
            <button
              type="button"
              class="grid size-10 shrink-0 place-items-center rounded-xl text-ink-400 transition hover:bg-ink-100 hover:text-ink-800 motion-reduce:transition-none dark:hover:bg-white/[0.07] dark:hover:text-white"
              aria-label="关闭面板"
              @click="close"
            >
              <X class="size-5" />
            </button>
          </header>
          <div class="px-5 py-6 sm:px-7 sm:py-7">
            <slot />
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
