<script setup lang="ts">
import type { TimeDimension } from "@our-tomorrow/contracts";
import type { Component } from "vue";
import {
  ArrowLeft,
  CalendarHeart,
  Camera,
  CloudSun,
  Feather,
  HeartHandshake,
  ImagePlus,
  Landmark,
  MessageSquareHeart,
  MoonStar,
  NotebookPen,
  Sparkles,
  Star,
  StickyNote,
  Sunrise,
  X,
} from "lucide-vue-next";
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

export interface CreateSelection {
  dimension: TimeDimension;
  type: string;
  routeName: "remember" | "daily" | "tomorrow";
  label: string;
}

interface DimensionOption {
  id: TimeDimension;
  title: string;
  description: string;
  icon: Component;
  tone: string;
  iconTone: string;
}

interface ActionOption {
  type: string;
  label: string;
  description: string;
  icon: Component;
}

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  select: [selection: CreateSelection];
}>();

const selectedDimension = ref<TimeDimension | null>(null);
const panel = ref<HTMLElement | null>(null);
let previousOverflow = "";
let previouslyFocused: HTMLElement | null = null;

const dimensions: DimensionOption[] = [
  {
    id: "remember",
    title: "记录一件过去",
    description: "把发生过的故事、照片与第一次好好收下。",
    icon: Landmark,
    tone: "border-memory-200/80 bg-memory-50/80 hover:border-memory-300 dark:border-memory-800/45 dark:bg-memory-950/25",
    iconTone:
      "bg-memory-100 text-memory-700 dark:bg-memory-900/45 dark:text-memory-200",
  },
  {
    id: "daily",
    title: "留下此刻",
    description: "一句话、一张纸条，或者今天真实的心情。",
    icon: CloudSun,
    tone: "border-present-200/80 bg-present-50/80 hover:border-present-300 dark:border-present-800/45 dark:bg-present-950/25",
    iconTone:
      "bg-present-100 text-present-700 dark:bg-present-900/45 dark:text-present-200",
  },
  {
    id: "tomorrow",
    title: "写给明天",
    description: "为尚未发生的期待，先留一个温柔的位置。",
    icon: Sunrise,
    tone: "border-future-200/80 bg-future-50/80 hover:border-future-300 dark:border-future-800/45 dark:bg-future-950/25",
    iconTone:
      "bg-future-100 text-future-700 dark:bg-future-900/45 dark:text-future-200",
  },
];

const actions: Record<TimeDimension, ActionOption[]> = {
  remember: [
    {
      type: "memory",
      label: "新回忆",
      description: "记录一个共同发生的故事",
      icon: ImagePlus,
    },
    {
      type: "first-time",
      label: "第一次",
      description: "收藏关系里的重要初次",
      icon: Star,
    },
    {
      type: "diary",
      label: "补写日记",
      description: "从某一天开始慢慢补写",
      icon: NotebookPen,
    },
    {
      type: "photos",
      label: "添加旧照片",
      description: "让一张照片带回当时",
      icon: Camera,
    },
  ],
  daily: [
    {
      type: "note",
      label: "便利贴",
      description: "留一句此刻想说的话",
      icon: StickyNote,
    },
    {
      type: "mood",
      label: "今日心情",
      description: "记下今天最真实的感受",
      icon: Sparkles,
    },
    {
      type: "status",
      label: "此刻状态",
      description: "让对方知道你正在做什么",
      icon: HeartHandshake,
    },
    {
      type: "exchange-diary",
      label: "交换日记",
      description: "回答今天只属于你们的问题",
      icon: MessageSquareHeart,
    },
  ],
  tomorrow: [
    {
      type: "wish",
      label: "新愿望",
      description: "写下一件想一起实现的事",
      icon: Sunrise,
    },
    {
      type: "plan",
      label: "新计划",
      description: "把期待变成轻量的安排",
      icon: Feather,
    },
    {
      type: "capsule",
      label: "时间胶囊",
      description: "把话封存到未来某一天",
      icon: MoonStar,
    },
    {
      type: "anniversary",
      label: "纪念日",
      description: "为重要的日子留出倒数",
      icon: CalendarHeart,
    },
  ],
};

function close() {
  emit("update:modelValue", false);
}

function chooseAction(action: ActionOption) {
  if (!selectedDimension.value) return;

  emit("select", {
    dimension: selectedDimension.value,
    type: action.type,
    routeName: selectedDimension.value,
    label: action.label,
  });
  close();
}

function onKeydown(event: KeyboardEvent) {
  if (!props.modelValue) return;
  if (event.key === "Escape") {
    close();
    return;
  }
  if (event.key !== "Tab" || !panel.value) return;

  const focusable = Array.from(
    panel.value.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("hidden"));
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
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      previouslyFocused =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      void nextTick(() => {
        panel.value?.querySelector<HTMLElement>("button")?.focus();
      });
      return;
    }

    document.body.style.overflow = previousOverflow;
    selectedDimension.value = null;
    const focusTarget = previouslyFocused;
    previouslyFocused = null;
    void nextTick(() => focusTarget?.focus());
  },
);

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  document.body.style.overflow = previousOverflow;
  previouslyFocused?.focus();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="panel">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-panel-title"
        @mousedown.self="close"
      >
        <section
          ref="panel"
          data-panel
          tabindex="-1"
          class="max-h-[92dvh] w-full overflow-y-auto rounded-t-[2rem] border border-white/70 bg-[#fbfaf7] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-float dark:border-white/10 dark:bg-ink-950 sm:max-w-2xl sm:rounded-[2rem] sm:p-7"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex min-w-0 items-start gap-3">
              <button
                v-if="selectedDimension"
                type="button"
                class="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl text-ink-500 transition hover:bg-ink-100 hover:text-ink-950 dark:hover:bg-white/[0.07] dark:hover:text-white"
                aria-label="返回选择时间"
                @click="selectedDimension = null"
              >
                <ArrowLeft class="size-4" />
              </button>
              <div>
                <p class="eyebrow">统一创建</p>
                <h2
                  id="create-panel-title"
                  class="mt-1 font-display text-2xl font-semibold tracking-[-0.03em] text-ink-950 dark:text-white"
                >
                  {{
                    selectedDimension ? "想留下些什么？" : "你想记录哪个时间？"
                  }}
                </h2>
                <p
                  class="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400"
                >
                  {{
                    selectedDimension
                      ? "选择一个入口，我们会把你带到刚好的位置。"
                      : "过去、此刻与未来，始终在同一条时间线上。"
                  }}
                </p>
              </div>
            </div>
            <button
              type="button"
              class="grid size-9 shrink-0 place-items-center rounded-xl text-ink-500 transition hover:bg-ink-100 hover:text-ink-950 dark:hover:bg-white/[0.07] dark:hover:text-white"
              aria-label="关闭创建面板"
              @click="close"
            >
              <X class="size-5" />
            </button>
          </div>

          <div v-if="!selectedDimension" class="mt-6 grid gap-3">
            <button
              v-for="dimension in dimensions"
              :key="dimension.id"
              type="button"
              class="group flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition duration-200 sm:p-5"
              :class="dimension.tone"
              @click="selectedDimension = dimension.id"
            >
              <span
                class="grid size-12 shrink-0 place-items-center rounded-2xl transition group-hover:scale-105"
                :class="dimension.iconTone"
              >
                <component :is="dimension.icon" class="size-5" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block font-semibold text-ink-950 dark:text-white">
                  {{ dimension.title }}
                </span>
                <span
                  class="mt-1 block text-sm leading-5 text-ink-500 dark:text-ink-400"
                >
                  {{ dimension.description }}
                </span>
              </span>
              <span
                class="text-xl text-ink-300 transition group-hover:translate-x-0.5 dark:text-ink-600"
                >→</span
              >
            </button>
          </div>

          <div v-else class="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              v-for="action in actions[selectedDimension]"
              :key="action.type"
              type="button"
              class="group flex items-start gap-3 rounded-2xl border border-ink-200/80 bg-white/65 p-4 text-left transition hover:-translate-y-0.5 hover:border-ink-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/20 dark:hover:bg-white/[0.07]"
              @click="chooseAction(action)"
            >
              <span
                class="grid size-10 shrink-0 place-items-center rounded-xl bg-ink-100 text-ink-600 transition group-hover:bg-ink-950 group-hover:text-white dark:bg-white/[0.07] dark:text-ink-300 dark:group-hover:bg-white dark:group-hover:text-ink-950"
              >
                <component :is="action.icon" class="size-4" />
              </span>
              <span>
                <span
                  class="block text-sm font-semibold text-ink-950 dark:text-white"
                >
                  {{ action.label }}
                </span>
                <span
                  class="mt-1 block text-xs leading-5 text-ink-500 dark:text-ink-400"
                >
                  {{ action.description }}
                </span>
              </span>
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
