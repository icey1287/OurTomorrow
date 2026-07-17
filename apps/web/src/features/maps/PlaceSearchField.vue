<script setup lang="ts">
import type { PlaceSearchSuggestion } from "@our-tomorrow/contracts";
import { LoaderCircle, MapPin, Search } from "lucide-vue-next";
import { onBeforeUnmount, ref, useId, watch } from "vue";

import { stageSixMapsApi } from "@/shared/api/stage-six-maps";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    inputId?: string;
    placeholder?: string;
    disabled?: boolean;
    maxlength?: number;
  }>(),
  {
    placeholder: "搜索地点名称或地址",
    disabled: false,
    maxlength: 160,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  select: [place: PlaceSearchSuggestion];
}>();

const generatedId = useId();
const suggestionsId = `${generatedId}-suggestions`;
const suggestions = ref<PlaceSearchSuggestion[]>([]);
const searching = ref(false);
const searchError = ref<string | null>(null);
const open = ref(false);
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let searchSequence = 0;
let suppressValue: string | null = null;

function clearTimer() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = null;
}

watch(
  () => props.modelValue,
  (value) => {
    clearTimer();
    searchError.value = null;
    const sequence = ++searchSequence;
    if (value === suppressValue) {
      suppressValue = null;
      return;
    }
    const query = value.trim();
    if (query.length < 2) {
      suggestions.value = [];
      open.value = false;
      searching.value = false;
      return;
    }

    debounceTimer = setTimeout(async () => {
      searching.value = true;
      try {
        const result = await stageSixMapsApi.searchPlaces({ query, limit: 8 });
        if (sequence !== searchSequence) return;
        suggestions.value = result.items;
        open.value = result.items.length > 0;
        if (result.items.length === 0) {
          searchError.value = "没有找到合适地点，也可以继续手动填写。";
        }
      } catch (error) {
        if (sequence !== searchSequence) return;
        suggestions.value = [];
        open.value = false;
        searchError.value =
          error instanceof Error
            ? error.message
            : "地点搜索暂时不可用，也可以继续手动填写。";
      } finally {
        if (sequence === searchSequence) searching.value = false;
      }
    }, 300);
  },
);

function updateValue(event: Event) {
  emit("update:modelValue", (event.target as HTMLInputElement).value);
}

function choose(place: PlaceSearchSuggestion) {
  suppressValue = place.name;
  suggestions.value = [];
  open.value = false;
  searchError.value = null;
  emit("update:modelValue", place.name);
  emit("select", place);
}

function suggestionDescription(place: PlaceSearchSuggestion) {
  return [place.district, place.address].filter(Boolean).join(" · ");
}

function closeLater() {
  window.setTimeout(() => {
    open.value = false;
  }, 120);
}

onBeforeUnmount(() => {
  clearTimer();
  searchSequence += 1;
});
</script>

<template>
  <div class="relative">
    <div class="relative">
      <Search
        class="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400"
        aria-hidden="true"
      />
      <input
        :id="inputId"
        :value="modelValue"
        class="field-input pl-10 pr-10"
        type="search"
        autocomplete="off"
        :maxlength="maxlength"
        :placeholder="placeholder"
        :disabled="disabled"
        :aria-expanded="open"
        :aria-controls="suggestionsId"
        @input="updateValue"
        @focus="open = suggestions.length > 0"
        @blur="closeLater"
      />
      <LoaderCircle
        v-if="searching"
        class="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-present-500"
        aria-label="正在搜索地点"
      />
    </div>

    <div
      v-if="open && suggestions.length"
      :id="suggestionsId"
      class="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-ink-200 bg-white p-1.5 shadow-xl dark:border-white/10 dark:bg-ink-900"
      role="listbox"
    >
      <button
        v-for="place in suggestions"
        :key="place.id"
        type="button"
        class="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-ink-50 dark:hover:bg-white/[0.06]"
        role="option"
        @mousedown.prevent
        @click="choose(place)"
      >
        <MapPin
          class="mt-0.5 size-4 shrink-0 text-present-600 dark:text-present-300"
          aria-hidden="true"
        />
        <span class="min-w-0">
          <span
            class="block truncate text-sm font-semibold text-ink-900 dark:text-white"
          >
            {{ place.name }}
          </span>
          <span
            v-if="suggestionDescription(place)"
            class="mt-0.5 block line-clamp-2 text-xs leading-5 text-ink-400"
          >
            {{ suggestionDescription(place) }}
          </span>
        </span>
      </button>
      <p class="px-3 py-2 text-[11px] text-ink-400">地点由高德地图帮我们找到</p>
    </div>

    <p v-if="searchError" class="mt-2 text-xs leading-5 text-ink-400">
      {{ searchError }}
    </p>
  </div>
</template>
