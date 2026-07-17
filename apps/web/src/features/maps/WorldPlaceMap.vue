<script setup lang="ts">
import type { PlaceMapItem } from "@our-tomorrow/contracts";
import { MapPin } from "lucide-vue-next";
import { computed, useId } from "vue";

import { projectWorldPoint } from "./map-projection";

const props = withDefaults(
  defineProps<{
    places: PlaceMapItem[];
    selectedId?: string | null;
    tone?: "memory" | "future";
    listLabel?: string;
  }>(),
  {
    selectedId: null,
    tone: "memory",
    listLabel: "地图地点列表",
  },
);

const emit = defineEmits<{
  select: [placeId: string];
}>();

const titleId = useId();
const descriptionId = useId();
const width = 1000;
const height = 500;

const markers = computed(() =>
  props.places.flatMap((place) => {
    if (place.latitude === null || place.longitude === null) return [];
    return [
      {
        place,
        ...projectWorldPoint(
          { latitude: place.latitude, longitude: place.longitude },
          { width, height, padding: 24 },
        ),
      },
    ];
  }),
);

function historyLabel(place: PlaceMapItem) {
  if (place.historyState === "LIVED") return "住过";
  if (place.historyState === "VISITED") return "去过";
  return "还没去过";
}

function futureLabel(place: PlaceMapItem) {
  return (
    {
      NONE: "没有未来安排",
      WANT_TO_GO: "想去",
      PLANNED: "已计划",
      DEPARTING: "即将出发",
      COMPLETED: "已完成",
    } as const
  )[place.futureState];
}
</script>

<template>
  <div>
    <div
      class="overflow-hidden rounded-3xl border border-ink-200/80 bg-sky-50/65 shadow-inner dark:border-white/10 dark:bg-ink-950/55"
    >
      <svg
        class="block h-auto w-full"
        viewBox="0 0 1000 500"
        role="img"
        :aria-labelledby="`${titleId} ${descriptionId}`"
      >
        <title :id="titleId">共同地点世界地图</title>
        <desc :id="descriptionId">
          这是装饰性地图视图。地图下方提供内容相同、可用键盘操作的地点列表。
        </desc>
        <defs>
          <linearGradient id="our-tomorrow-ocean" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#eff9ff" />
            <stop offset="1" stop-color="#e8f3f5" />
          </linearGradient>
          <filter
            id="our-tomorrow-marker-shadow"
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            <feDropShadow dx="0" dy="3" stdDeviation="4" flood-opacity="0.22" />
          </filter>
        </defs>
        <rect
          class="map-ocean"
          width="1000"
          height="500"
          fill="url(#our-tomorrow-ocean)"
        />

        <g class="map-grid" aria-hidden="true">
          <path
            v-for="x in [250, 500, 750]"
            :key="`x-${x}`"
            :d="`M${x} 0V500`"
          />
          <path
            v-for="y in [125, 250, 375]"
            :key="`y-${y}`"
            :d="`M0 ${y}H1000`"
          />
        </g>

        <!-- Deliberately simplified, repository-owned continent silhouettes. -->
        <g class="world-land" aria-hidden="true">
          <path
            d="M72 113 119 72l76-20 66 24 28 45-19 34-46 9-25 42-47 14-37-28-30-13-25-35Z"
          />
          <path d="m239 231 42 18 32 48-12 63-38 75-28-18-14-67-28-54 18-47Z" />
          <path
            d="m438 93 38-29 72 2 46 32 58-13 100 27 67 54-17 43-72 9-31 35-77-2-42-34-45 9-41-35-47-7-33-41Z"
          />
          <path d="m509 226 56 7 45 44 4 66-41 75-48-11-27-72-27-45Z" />
          <path d="m780 337 50-21 68 17 31 38-24 37-63 8-50-24Z" />
          <path d="m361 63 28-27 38 10-5 34-42 12Z" />
          <path d="m895 186 24-13 15 22-21 19Z" />
        </g>

        <g aria-hidden="true">
          <g
            v-for="marker in markers"
            :key="marker.place.id"
            class="map-marker cursor-pointer"
            :class="[tone, marker.place.id === selectedId ? 'is-selected' : '']"
            :transform="`translate(${marker.x} ${marker.y})`"
            @click="emit('select', marker.place.id)"
          >
            <circle class="marker-halo" r="16" />
            <circle
              class="marker-dot"
              r="7"
              filter="url(#our-tomorrow-marker-shadow)"
            />
          </g>
        </g>
      </svg>
    </div>

    <div class="mt-4" role="group" :aria-label="listLabel">
      <p
        class="mb-2 flex items-center gap-2 text-xs font-semibold text-ink-500 dark:text-ink-400"
      >
        <MapPin class="size-3.5" aria-hidden="true" />
        可用 Tab 键逐个选择地图地点
      </p>
      <ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="place in places" :key="place.id">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-700 focus-visible:ring-offset-2 dark:focus-visible:ring-white"
            :class="
              place.id === selectedId
                ? 'border-ink-400 bg-white text-ink-950 shadow-sm dark:border-white/30 dark:bg-white/10 dark:text-white'
                : 'border-ink-200/80 bg-white/55 text-ink-700 hover:border-ink-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.035] dark:text-ink-200 dark:hover:bg-white/[0.07]'
            "
            :aria-pressed="place.id === selectedId"
            @click="emit('select', place.id)"
          >
            <span class="min-w-0">
              <span class="block truncate font-semibold">{{ place.name }}</span>
              <span
                class="mt-0.5 block truncate text-xs text-ink-500 dark:text-ink-400"
              >
                {{ place.address || "未填写地址" }}
              </span>
            </span>
            <span
              class="shrink-0 text-[11px] font-semibold text-ink-500 dark:text-ink-400"
            >
              {{ tone === "future" ? futureLabel(place) : historyLabel(place) }}
            </span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.map-grid path {
  fill: none;
  stroke: rgba(94, 119, 128, 0.13);
  stroke-dasharray: 4 8;
  stroke-width: 1;
}

.world-land {
  fill: rgba(255, 255, 255, 0.82);
  stroke: rgba(76, 99, 105, 0.18);
  stroke-linejoin: round;
  stroke-width: 2;
}

.marker-halo {
  fill: rgba(224, 142, 171, 0.18);
  stroke: rgba(184, 87, 123, 0.22);
  stroke-width: 1;
}

.marker-dot {
  fill: #bc5f82;
  stroke: #fff;
  stroke-width: 3;
}

.map-marker.future .marker-halo {
  fill: rgba(219, 154, 61, 0.2);
  stroke: rgba(180, 112, 24, 0.22);
}

.map-marker.future .marker-dot {
  fill: #cb8426;
}

.map-marker.is-selected .marker-halo {
  opacity: 0.95;
  transform: scale(1.18);
}

.map-marker.is-selected .marker-dot {
  stroke-width: 4;
}

@media (prefers-reduced-motion: no-preference) {
  .marker-halo,
  .marker-dot {
    transition:
      transform 180ms ease,
      opacity 180ms ease,
      stroke-width 180ms ease;
  }
}

:global(.dark) .world-land {
  fill: rgba(255, 255, 255, 0.075);
  stroke: rgba(255, 255, 255, 0.12);
}

:global(.dark) .map-grid path {
  stroke: rgba(255, 255, 255, 0.08);
}

:global(.dark) .map-ocean {
  fill: #172326;
}
</style>
