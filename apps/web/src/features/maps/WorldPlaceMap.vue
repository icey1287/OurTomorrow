<script setup lang="ts">
import type { PlaceMapItem } from "@our-tomorrow/contracts";
import { geoPath } from "d3-geo";
import type { LineString } from "geojson";
import {
  Crosshair,
  Images,
  MapPin,
  Minus,
  Plus,
  RotateCcw,
  X,
} from "lucide-vue-next";
import { computed, ref, useId } from "vue";

import PrivateMediaImage from "@/features/remember/PrivateMediaImage.vue";

import {
  administrativeLabelCoordinate,
  chinaProvinceFeatures,
  featureContainsCoordinate,
  featureBounds,
  featurePrimaryPolygonBounds,
  loadChinaCityFeatures,
  provinceLabelCoordinate,
  provinceContainingCoordinate,
  shortCityName,
  shortProvinceName,
  type ChinaCityFeature,
  type ChinaProvinceFeature,
} from "./geo-boundaries";
import {
  boundsAroundPoint,
  CHINA_BOUNDS,
  coordinateInBounds,
  createGeoProjection,
  expandGeoBounds,
  panGeoBounds,
  projectCoordinate,
  SOUTH_CHINA_SEA_BOUNDS,
  zoomGeoBounds,
  type GeoBounds,
  type GeoCoordinate,
  type MapProjection,
} from "./map-projection";

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
const svgId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
const oceanGradientId = `${svgId}-ocean`;
const paperPatternId = `${svgId}-paper`;
const markerShadowId = `${svgId}-marker-shadow`;
const width = 1000;
const height = 600;
const svgElement = ref<SVGSVGElement | null>(null);
const currentBounds = ref<GeoBounds>({ ...CHINA_BOUNDS });
const viewLabel = ref("中国");
const selectedProvinceAdcode = ref<number | string | null>(null);
const selectedCityAdcode = ref<number | string | null>(null);
const cityFeatures = ref<ChinaCityFeature[]>([]);
const photoPopupPlaceId = ref<string | null>(null);
const isDragging = ref(false);
let cityLoadVersion = 0;
let suppressMapClickUntil = 0;
let dragState:
  | {
      pointerId: number;
      startClientX: number;
      startClientY: number;
      startBounds: GeoBounds;
      projection: MapProjection;
      startGeo: [number, number];
      moved: boolean;
    }
  | undefined;

const projection = computed(() =>
  createGeoProjection(currentBounds.value, { width, height, padding: 38 }),
);

const selectedPlace = computed(
  () => props.places.find((place) => place.id === props.selectedId) ?? null,
);

const selectedCoordinate = computed<GeoCoordinate | null>(() => {
  const place = selectedPlace.value;
  if (!place || place.latitude === null || place.longitude === null)
    return null;
  return { latitude: place.latitude, longitude: place.longitude };
});

const markers = computed(() =>
  props.places.flatMap((place) => {
    if (place.latitude === null || place.longitude === null) return [];
    const coordinate = {
      latitude: place.latitude,
      longitude: place.longitude,
    };
    if (!coordinateInBounds(coordinate, currentBounds.value)) return [];
    const point = projectCoordinate(coordinate, projection.value);
    return [{ place, ...point }];
  }),
);

const photoPopupMarker = computed(
  () =>
    markers.value.find(
      (marker) => marker.place.id === photoPopupPlaceId.value,
    ) ?? null,
);

const photoPopupItems = computed(() => {
  const marker = photoPopupMarker.value;
  if (!marker) return [];
  const seen = new Set<string>();
  return marker.place.memories.flatMap((memory) =>
    [memory.coverMedia, ...memory.photos].flatMap((photo) => {
      if (!photo) return [];
      if (seen.has(photo.id)) return [];
      seen.add(photo.id);
      return [{ photo, memory }];
    }),
  );
});

const photoPopupStyle = computed(() => {
  const marker = photoPopupMarker.value;
  if (!marker) return {};
  const horizontal = (marker.x / width) * 100;
  const vertical = (marker.y / height) * 100;
  const above = marker.y > 260;
  return {
    left: `clamp(9rem, ${horizontal}%, calc(100% - 9rem))`,
    top: `${vertical}%`,
    transform: above
      ? "translate(-50%, calc(-100% - 1.25rem))"
      : "translate(-50%, 1.25rem)",
  };
});

const provinceShapes = computed(() => {
  const path = geoPath(projection.value);
  return chinaProvinceFeatures
    .filter((feature) => Boolean(feature.properties.name))
    .map((feature) => ({
      feature,
      path: path(feature) ?? "",
    }));
});

const southChinaSeaFeature =
  chinaProvinceFeatures.find((feature) => !feature.properties.name) ?? null;
const southChinaSeaPath = computed(() => {
  if (!southChinaSeaFeature) return "";
  const insetProjection = createGeoProjection(SOUTH_CHINA_SEA_BOUNDS, {
    width: 150,
    height: 160,
    padding: 7,
  });
  return geoPath(insetProjection)(southChinaSeaFeature) ?? "";
});

const cityShapes = computed(() => {
  if (cityFeatures.value.length === 0) return [];
  const path = geoPath(projection.value);
  return cityFeatures.value.map((feature) => ({
    feature,
    path: path(feature) ?? "",
  }));
});

const provinceLabelOffsets: Record<string, [number, number]> = {
  北京市: [-12, -8],
  天津市: [15, 5],
  上海市: [15, 2],
  香港特别行政区: [15, 10],
  澳门特别行政区: [-16, 11],
  江苏省: [-2, -7],
  浙江省: [4, 7],
};

const provinceLabels = computed(() => {
  if (
    cityFeatures.value.length > 0 ||
    currentBounds.value.east - currentBounds.value.west < 2.5
  ) {
    return [];
  }
  return chinaProvinceFeatures.flatMap((feature) => {
    const coordinate = provinceLabelCoordinate(feature);
    if (!coordinate || !coordinateInBounds(coordinate, currentBounds.value)) {
      return [];
    }
    const point = projectCoordinate(coordinate, projection.value);
    const offset = provinceLabelOffsets[feature.properties.name] ?? [0, 0];
    return [
      {
        adcode: feature.properties.adcode,
        name: shortProvinceName(feature.properties.name),
        x: point.x + offset[0],
        y: point.y + offset[1],
      },
    ];
  });
});

const cityLabels = computed(() => {
  if (
    cityFeatures.value.length === 0 ||
    currentBounds.value.east - currentBounds.value.west < 0.35
  ) {
    return [];
  }
  return cityFeatures.value.flatMap((feature) => {
    const coordinate = administrativeLabelCoordinate(feature);
    if (!coordinate || !coordinateInBounds(coordinate, currentBounds.value)) {
      return [];
    }
    const point = projectCoordinate(coordinate, projection.value);
    return [
      {
        adcode: feature.properties.adcode,
        name: shortCityName(feature.properties.name),
        x: point.x,
        y: point.y,
      },
    ];
  });
});

function tickStep(span: number): number {
  const candidates = [
    0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 20, 30, 45, 60,
  ];
  const target = span / 5;
  return candidates.find((candidate) => candidate >= target) ?? 90;
}

function ticksBetween(minimum: number, maximum: number): number[] {
  const step = tickStep(maximum - minimum);
  const values: number[] = [];
  for (
    let value = Math.ceil(minimum / step) * step;
    value < maximum;
    value += step
  ) {
    if (value > minimum + step * 0.08) values.push(Number(value.toFixed(6)));
  }
  return values.slice(0, 8);
}

function formatCoordinate(value: number, axis: "latitude" | "longitude") {
  const span =
    axis === "longitude"
      ? currentBounds.value.east - currentBounds.value.west
      : currentBounds.value.north - currentBounds.value.south;
  const digits = span < 1 ? 2 : span < 5 ? 1 : 0;
  if (Math.abs(value) < 10 ** -(digits + 1)) return "0°";
  const suffix =
    axis === "longitude" ? (value > 0 ? "E" : "W") : value > 0 ? "N" : "S";
  return `${Math.abs(value).toFixed(digits)}°${suffix}`;
}

const longitudeTicks = computed(() =>
  ticksBetween(currentBounds.value.west, currentBounds.value.east),
);
const latitudeTicks = computed(() =>
  ticksBetween(currentBounds.value.south, currentBounds.value.north),
);

const gridLines = computed(() => {
  const path = geoPath(projection.value);
  const lines: Array<{ key: string; path: string }> = [];
  for (const longitude of longitudeTicks.value) {
    const line: LineString = {
      type: "LineString",
      coordinates: [
        [longitude, currentBounds.value.south],
        [longitude, currentBounds.value.north],
      ],
    };
    lines.push({ key: `longitude-${longitude}`, path: path(line) ?? "" });
  }
  for (const latitude of latitudeTicks.value) {
    const line: LineString = {
      type: "LineString",
      coordinates: [
        [currentBounds.value.west, latitude],
        [currentBounds.value.east, latitude],
      ],
    };
    lines.push({ key: `latitude-${latitude}`, path: path(line) ?? "" });
  }
  return lines;
});

const longitudeLabels = computed(() =>
  longitudeTicks.value.flatMap((longitude) => {
    const point = projection.value([
      longitude,
      Math.max(currentBounds.value.south, -84.5),
    ]);
    if (!point) return [];
    return [
      {
        value: longitude,
        x: point[0],
        y: Math.min(height - 10, point[1] + 18),
      },
    ];
  }),
);

const latitudeLabels = computed(() =>
  latitudeTicks.value.flatMap((latitude) => {
    const point = projection.value([
      Math.max(currentBounds.value.west, -179.5),
      latitude,
    ]);
    if (!point) return [];
    return [
      {
        value: latitude,
        x: Math.max(10, point[0] + 8),
        y: point[1] - 5,
      },
    ];
  }),
);

const coordinateRangeLabel = computed(
  () =>
    `${formatCoordinate(currentBounds.value.west, "longitude")}–${formatCoordinate(currentBounds.value.east, "longitude")} · ${formatCoordinate(currentBounds.value.south, "latitude")}–${formatCoordinate(currentBounds.value.north, "latitude")}`,
);

const canZoomIn = computed(
  () => currentBounds.value.east - currentBounds.value.west > 0.07,
);
const canZoomOut = computed(
  () =>
    currentBounds.value.east - currentBounds.value.west <
    (CHINA_BOUNDS.east - CHINA_BOUNDS.west) * 0.98,
);
const isAtChinaHome = computed(
  () =>
    Math.abs(currentBounds.value.west - CHINA_BOUNDS.west) < 0.000001 &&
    Math.abs(currentBounds.value.south - CHINA_BOUNDS.south) < 0.000001 &&
    Math.abs(currentBounds.value.east - CHINA_BOUNDS.east) < 0.000001 &&
    Math.abs(currentBounds.value.north - CHINA_BOUNDS.north) < 0.000001 &&
    cityFeatures.value.length === 0,
);

function resetChina() {
  currentBounds.value = { ...CHINA_BOUNDS };
  viewLabel.value = "中国";
  selectedProvinceAdcode.value = null;
  selectedCityAdcode.value = null;
  cityFeatures.value = [];
  photoPopupPlaceId.value = null;
  cityLoadVersion += 1;
}

function zoomIn() {
  currentBounds.value = zoomGeoBounds(currentBounds.value, 0.62);
}

function zoomOut() {
  const chinaSpan = CHINA_BOUNDS.east - CHINA_BOUNDS.west;
  const expanded = zoomGeoBounds(currentBounds.value, 1.62);
  if (expanded.east - expanded.west >= chinaSpan * 0.82) {
    resetChina();
    return;
  }
  currentBounds.value = expanded;
}

async function showProvinceCities(feature: ChinaProvinceFeature) {
  const loadVersion = ++cityLoadVersion;
  const features = await loadChinaCityFeatures(feature.properties.adcode);
  if (
    loadVersion !== cityLoadVersion ||
    selectedProvinceAdcode.value !== feature.properties.adcode
  ) {
    return [];
  }
  cityFeatures.value = features;
  return features;
}

async function focusProvince(feature: ChinaProvinceFeature) {
  if (!feature.properties.name) return;
  photoPopupPlaceId.value = null;
  const provinceBounds =
    feature.properties.adcode === 460000
      ? featurePrimaryPolygonBounds(feature)
      : featureBounds(feature);
  let bounds = expandGeoBounds(provinceBounds, 1.18);
  const coordinate = provinceLabelCoordinate(feature);
  if (
    coordinate &&
    (bounds.east - bounds.west < 0.75 || bounds.north - bounds.south < 0.55)
  ) {
    bounds = boundsAroundPoint(coordinate, 0.75, 0.55);
  }
  currentBounds.value = bounds;
  viewLabel.value = feature.properties.name;
  selectedProvinceAdcode.value = feature.properties.adcode;
  selectedCityAdcode.value = null;
  cityFeatures.value = [];
  await showProvinceCities(feature);
}

function focusCity(feature: ChinaCityFeature) {
  if (Date.now() < suppressMapClickUntil) return;
  photoPopupPlaceId.value = null;
  currentBounds.value = expandGeoBounds(featureBounds(feature), 1.1);
  viewLabel.value = feature.properties.name;
  selectedCityAdcode.value = feature.properties.adcode;
}

async function focusSelectedPlace() {
  const coordinate = selectedCoordinate.value;
  const place = selectedPlace.value;
  if (!coordinate || !place) return;
  const province = provinceContainingCoordinate(coordinate);
  if (!province) {
    currentBounds.value = boundsAroundPoint(coordinate);
    viewLabel.value = `${place.name}附近`;
    selectedProvinceAdcode.value = null;
    selectedCityAdcode.value = null;
    cityFeatures.value = [];
    cityLoadVersion += 1;
    return;
  }

  selectedProvinceAdcode.value = province.properties.adcode;
  selectedCityAdcode.value = null;
  cityFeatures.value = [];
  const features = await showProvinceCities(province);
  const city = features.find((feature) =>
    featureContainsCoordinate(feature, coordinate),
  );
  if (city) {
    focusCity(city);
    return;
  }
  currentBounds.value = boundsAroundPoint(coordinate);
  viewLabel.value = `${place.name}附近`;
}

function selectMarker(placeId: string) {
  if (Date.now() < suppressMapClickUntil) return;
  photoPopupPlaceId.value =
    photoPopupPlaceId.value === placeId ? null : placeId;
  emit("select", placeId);
}

function selectPlaceFromList(placeId: string) {
  photoPopupPlaceId.value = placeId;
  emit("select", placeId);
}

function svgPointFromPointer(event: PointerEvent): [number, number] | null {
  const svg = svgElement.value;
  if (!svg) return null;
  const rectangle = svg.getBoundingClientRect();
  if (rectangle.width <= 0 || rectangle.height <= 0) return null;
  return [
    ((event.clientX - rectangle.left) / rectangle.width) * width,
    ((event.clientY - rectangle.top) / rectangle.height) * height,
  ];
}

function startDrag(event: PointerEvent) {
  if (event.button !== 0 || event.isPrimary === false) return;
  const point = svgPointFromPointer(event);
  if (!point) return;
  const startProjection = createGeoProjection(currentBounds.value, {
    width,
    height,
    padding: 38,
  });
  const startGeo = startProjection.invert?.(point);
  if (!startGeo) return;
  dragState = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startBounds: { ...currentBounds.value },
    projection: startProjection,
    startGeo,
    moved: false,
  };
}

function moveDrag(event: PointerEvent) {
  if (!dragState || dragState.pointerId !== event.pointerId) return;
  const distance = Math.hypot(
    event.clientX - dragState.startClientX,
    event.clientY - dragState.startClientY,
  );
  if (!dragState.moved && distance < 9) return;
  if (!dragState.moved) {
    dragState.moved = true;
    isDragging.value = true;
    photoPopupPlaceId.value = null;
    svgElement.value?.setPointerCapture(event.pointerId);
  }
  const point = svgPointFromPointer(event);
  const currentGeo = point ? dragState.projection.invert?.(point) : null;
  if (!currentGeo) return;
  currentBounds.value = panGeoBounds(
    dragState.startBounds,
    dragState.startGeo[0] - currentGeo[0],
    dragState.startGeo[1] - currentGeo[1],
  );
  event.preventDefault();
}

function endDrag(event: PointerEvent) {
  if (!dragState || dragState.pointerId !== event.pointerId) return;
  if (dragState.moved) suppressMapClickUntil = Date.now() + 250;
  if (svgElement.value?.hasPointerCapture(event.pointerId)) {
    svgElement.value.releasePointerCapture(event.pointerId);
  }
  dragState = undefined;
  isDragging.value = false;
}

function cancelDrag(event: PointerEvent) {
  if (!dragState || dragState.pointerId !== event.pointerId) return;
  dragState = undefined;
  isDragging.value = false;
}

function suppressClickAfterDrag(event: MouseEvent) {
  if (Date.now() >= suppressMapClickUntil) return;
  event.preventDefault();
  event.stopPropagation();
}

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
      class="relative overflow-hidden rounded-3xl border border-ink-200/80 bg-sky-50/65 shadow-inner dark:border-white/10 dark:bg-ink-950/55"
    >
      <div
        class="pointer-events-none absolute right-3 top-3 z-20 flex flex-wrap items-start justify-end gap-2 sm:right-4 sm:top-4"
      >
        <div class="pointer-events-auto flex items-center gap-2">
          <button
            v-if="selectedCoordinate"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/90 px-3 py-2 text-xs font-semibold text-ink-700 shadow-sm backdrop-blur transition hover:bg-white dark:border-white/15 dark:bg-ink-950/85 dark:text-ink-200 dark:hover:bg-ink-900"
            @click="focusSelectedPlace"
          >
            <Crosshair class="size-3.5" aria-hidden="true" />看附近
          </button>
          <div
            class="inline-flex rounded-full border border-white/80 bg-white/90 p-1 shadow-sm backdrop-blur dark:border-white/15 dark:bg-ink-950/85"
            aria-label="缩放地图"
          >
            <button
              type="button"
              class="grid size-8 place-items-center rounded-full text-ink-600 transition hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-35 dark:text-ink-300 dark:hover:bg-white/10"
              aria-label="缩小地图"
              :disabled="!canZoomOut"
              @click="zoomOut"
            >
              <Minus class="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="grid size-8 place-items-center rounded-full text-ink-600 transition hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-35 dark:text-ink-300 dark:hover:bg-white/10"
              aria-label="放大地图"
              :disabled="!canZoomIn"
              @click="zoomIn"
            >
              <Plus class="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <svg
        ref="svgElement"
        class="map-canvas block h-auto w-full"
        :class="{ 'is-dragging': isDragging }"
        viewBox="0 0 1000 600"
        role="img"
        :aria-labelledby="`${titleId} ${descriptionId}`"
        @pointerdown="startDrag"
        @pointermove="moveDrag"
        @pointerup="endDrag"
        @pointercancel="cancelDrag"
        @lostpointercapture="cancelDrag"
        @click.capture="suppressClickAfterDrag"
      >
        <title :id="titleId">我们的足迹地图</title>
        <desc :id="descriptionId">
          地点按照真实经纬度标在标准平面比例的中国地图上。点击省份可查看市界，点击地点可查看关联照片，也可以拖动和缩放地图。
        </desc>
        <defs>
          <linearGradient :id="oceanGradientId" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#eff9ff" />
            <stop offset="1" stop-color="#e7f2ef" />
          </linearGradient>
          <pattern
            :id="paperPatternId"
            width="32"
            height="32"
            patternUnits="userSpaceOnUse"
          >
            <path d="M2 7c8-2 15 1 28-3M-4 25c11-3 21 2 39-2" />
          </pattern>
          <filter
            :id="markerShadowId"
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
          height="600"
          :fill="`url(#${oceanGradientId})`"
        />
        <rect
          class="map-paper"
          width="1000"
          height="600"
          :fill="`url(#${paperPatternId})`"
        />

        <g class="map-grid" aria-hidden="true">
          <path v-for="line in gridLines" :key="line.key" :d="line.path" />
          <text
            v-for="label in longitudeLabels"
            :key="`longitude-label-${label.value}`"
            :x="label.x"
            :y="label.y"
            text-anchor="middle"
          >
            {{ formatCoordinate(label.value, "longitude") }}
          </text>
          <text
            v-for="label in latitudeLabels"
            :key="`latitude-label-${label.value}`"
            :x="label.x"
            :y="label.y"
          >
            {{ formatCoordinate(label.value, "latitude") }}
          </text>
        </g>

        <g v-if="provinceShapes.length" class="province-layer">
          <path
            v-for="shape in provinceShapes"
            :key="shape.feature.properties.adcode"
            :d="shape.path"
            class="province-shape"
            :class="{
              'is-selected':
                shape.feature.properties.adcode === selectedProvinceAdcode,
            }"
            @click="focusProvince(shape.feature)"
          >
            <title v-if="shape.feature.properties.name">
              {{ shape.feature.properties.name }} · 点一下放大
            </title>
          </path>
          <g class="province-labels" aria-hidden="true">
            <text
              v-for="label in provinceLabels"
              :key="label.adcode"
              :x="label.x"
              :y="label.y"
              text-anchor="middle"
            >
              {{ label.name }}
            </text>
          </g>
        </g>

        <g
          v-if="isAtChinaHome && southChinaSeaPath"
          class="south-sea-inset"
          transform="translate(818 402)"
          aria-hidden="true"
        >
          <rect width="154" height="170" rx="14" />
          <path :d="southChinaSeaPath" />
          <text x="77" y="158" text-anchor="middle">南海诸岛</text>
        </g>

        <g v-if="cityShapes.length" class="city-layer">
          <path
            v-for="shape in cityShapes"
            :key="shape.feature.properties.adcode"
            :d="shape.path"
            class="city-shape"
            :class="{
              'is-selected':
                shape.feature.properties.adcode === selectedCityAdcode,
            }"
            @click="focusCity(shape.feature)"
          >
            <title>{{ shape.feature.properties.name }} · 点一下放大</title>
          </path>
          <g class="city-labels" aria-hidden="true">
            <text
              v-for="label in cityLabels"
              :key="label.adcode"
              :x="label.x"
              :y="label.y"
              text-anchor="middle"
            >
              {{ label.name }}
            </text>
          </g>
        </g>

        <g aria-hidden="true">
          <g
            v-for="marker in markers"
            :key="marker.place.id"
            class="map-marker cursor-pointer"
            :class="[tone, marker.place.id === selectedId ? 'is-selected' : '']"
            :transform="`translate(${marker.x} ${marker.y})`"
            @click="selectMarker(marker.place.id)"
          >
            <circle class="marker-halo" r="17" />
            <circle
              class="marker-dot"
              r="7"
              :filter="`url(#${markerShadowId})`"
            />
            <text
              v-if="marker.place.id === selectedId"
              class="marker-label"
              x="0"
              y="-23"
              text-anchor="middle"
            >
              {{ marker.place.name }}
            </text>
          </g>
        </g>

        <g class="map-caption" aria-hidden="true">
          <text x="30" y="558">{{ viewLabel }}</text>
          <text x="30" y="579">{{ coordinateRangeLabel }}</text>
        </g>
      </svg>

      <aside
        v-if="photoPopupMarker"
        class="photo-popup absolute z-30 w-72 max-w-[calc(100%-1.5rem)] overflow-hidden rounded-3xl border border-white/80 bg-white/95 p-3 shadow-xl backdrop-blur-md dark:border-white/15 dark:bg-ink-950/95"
        :style="photoPopupStyle"
        :aria-label="`${photoPopupMarker.place.name}的关联照片`"
        @pointerdown.stop
        @click.stop
      >
        <div class="flex items-start justify-between gap-3 px-1 pb-2">
          <div class="min-w-0">
            <p
              class="truncate text-sm font-semibold text-ink-900 dark:text-white"
            >
              {{ photoPopupMarker.place.name }}
            </p>
            <p class="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
              {{
                photoPopupItems.length
                  ? "我们在这里留下的照片"
                  : "这里还没有关联照片"
              }}
            </p>
          </div>
          <button
            type="button"
            class="grid size-7 shrink-0 place-items-center rounded-full text-ink-500 transition hover:bg-ink-100 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-white/10 dark:hover:text-white"
            aria-label="关闭照片"
            @click="photoPopupPlaceId = null"
          >
            <X class="size-4" aria-hidden="true" />
          </button>
        </div>
        <div v-if="photoPopupItems.length" class="grid grid-cols-3 gap-1.5">
          <PrivateMediaImage
            v-for="item in photoPopupItems.slice(0, 6)"
            :key="item.photo.id"
            :src="item.photo.thumbnailUrl"
            :alt="`${item.memory.title}的照片`"
            image-class="h-full w-full object-cover"
            class="aspect-square overflow-hidden rounded-xl bg-memory-50 dark:bg-white/[0.04]"
          />
        </div>
        <div
          v-else
          class="grid min-h-24 place-items-center rounded-2xl bg-memory-50/80 text-memory-500 dark:bg-memory-950/30 dark:text-memory-300"
        >
          <Images class="size-6" aria-hidden="true" />
        </div>
      </aside>

      <button
        v-if="!isAtChinaHome"
        type="button"
        class="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/90 px-3 py-2 text-xs font-semibold text-ink-600 shadow-sm backdrop-blur transition hover:bg-white dark:border-white/15 dark:bg-ink-950/85 dark:text-ink-300 dark:hover:bg-ink-900 sm:bottom-4 sm:right-4"
        @click="resetChina"
      >
        <RotateCcw class="size-3.5" aria-hidden="true" />回到中国
      </button>
    </div>

    <div class="mt-4" role="group" :aria-label="listLabel">
      <p
        class="mb-2 flex items-center gap-2 text-xs font-semibold text-ink-500 dark:text-ink-400"
      >
        <MapPin class="size-3.5" aria-hidden="true" />
        点一个地点，地图上的位置也会跟着亮起来
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
            @click="selectPlaceFromList(place.id)"
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
.map-paper {
  opacity: 0.18;
}

.map-canvas {
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.map-canvas.is-dragging {
  cursor: grabbing;
}

.map-paper + .map-grid path,
.map-paper {
  pointer-events: none;
}

pattern path {
  fill: none;
  stroke: rgba(67, 100, 107, 0.11);
  stroke-linecap: round;
  stroke-width: 0.7;
}

.map-grid path {
  fill: none;
  stroke: rgba(78, 108, 117, 0.14);
  stroke-dasharray: 3 7;
  stroke-linecap: round;
  stroke-width: 1;
}

.map-grid text {
  fill: rgba(69, 95, 103, 0.6);
  font-size: 10px;
  font-weight: 600;
  paint-order: stroke;
  stroke: rgba(239, 249, 255, 0.9);
  stroke-width: 3px;
}

.province-shape {
  cursor: pointer;
  fill: rgba(255, 255, 255, 0.82);
  stroke: rgba(68, 93, 99, 0.34);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.45;
  vector-effect: non-scaling-stroke;
}

.province-shape:hover,
.province-shape.is-selected {
  fill: rgba(224, 238, 227, 0.96);
  stroke: rgba(69, 111, 83, 0.72);
  stroke-width: 2.2;
  outline: none;
}

.province-labels {
  pointer-events: none;
}

.province-labels text,
.city-labels text {
  fill: rgba(53, 75, 80, 0.78);
  font-size: 11px;
  font-weight: 600;
  paint-order: stroke;
  stroke: rgba(255, 255, 255, 0.88);
  stroke-linejoin: round;
  stroke-width: 3.5px;
}

.city-shape {
  cursor: pointer;
  fill: rgba(255, 255, 255, 0.28);
  stroke: rgba(62, 91, 98, 0.48);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
  vector-effect: non-scaling-stroke;
}

.city-shape:hover,
.city-shape.is-selected {
  fill: rgba(215, 235, 220, 0.72);
  stroke: rgba(58, 105, 75, 0.82);
  stroke-width: 2.2;
  outline: none;
}

.city-labels {
  pointer-events: none;
}

.south-sea-inset {
  pointer-events: none;
}

.south-sea-inset rect {
  fill: rgba(245, 251, 252, 0.9);
  stroke: rgba(68, 93, 99, 0.22);
  stroke-width: 1.2;
}

.south-sea-inset path {
  fill: rgba(255, 255, 255, 0.48);
  stroke: rgba(68, 93, 99, 0.46);
  stroke-dasharray: 2.5 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.2;
}

.south-sea-inset text {
  fill: rgba(53, 75, 80, 0.7);
  font-size: 10px;
  font-weight: 600;
}

.marker-halo {
  fill: rgba(224, 142, 171, 0.18);
  stroke: rgba(184, 87, 123, 0.26);
  stroke-width: 1;
}

.marker-dot {
  fill: #bc5f82;
  stroke: #fff;
  stroke-width: 3;
}

.marker-label {
  fill: #674251;
  font-size: 12px;
  font-weight: 700;
  paint-order: stroke;
  stroke: rgba(255, 255, 255, 0.96);
  stroke-linejoin: round;
  stroke-width: 5px;
}

.map-marker.future .marker-halo {
  fill: rgba(219, 154, 61, 0.2);
  stroke: rgba(180, 112, 24, 0.26);
}

.map-marker.future .marker-dot {
  fill: #cb8426;
}

.map-marker.future .marker-label {
  fill: #76511e;
}

.map-marker.is-selected .marker-halo {
  opacity: 0.95;
  transform: scale(1.18);
}

.map-marker.is-selected .marker-dot {
  stroke-width: 4;
}

.map-caption text:first-child {
  fill: rgba(39, 61, 66, 0.84);
  font-size: 15px;
  font-weight: 700;
}

.map-caption text:last-child {
  fill: rgba(65, 91, 97, 0.66);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

@media (prefers-reduced-motion: no-preference) {
  .marker-halo,
  .marker-dot,
  .province-shape,
  .city-shape {
    transition:
      transform 180ms ease,
      opacity 180ms ease,
      stroke-width 180ms ease,
      fill 180ms ease,
      stroke 180ms ease;
  }
}

:global(.dark) .province-shape,
:global(.dark) .city-shape {
  fill: rgba(255, 255, 255, 0.075);
  stroke: rgba(255, 255, 255, 0.18);
}

:global(.dark) .province-shape:hover,
:global(.dark) .province-shape.is-selected,
:global(.dark) .city-shape:hover,
:global(.dark) .city-shape.is-selected {
  fill: rgba(123, 166, 135, 0.2);
  stroke: rgba(164, 211, 176, 0.66);
}

:global(.dark) .province-labels text,
:global(.dark) .city-labels text,
:global(.dark) .marker-label {
  fill: rgba(255, 255, 255, 0.84);
  stroke: rgba(22, 35, 38, 0.94);
}

:global(.dark) .map-grid path {
  stroke: rgba(255, 255, 255, 0.09);
}

:global(.dark) .map-grid text {
  fill: rgba(255, 255, 255, 0.5);
  stroke: rgba(23, 35, 38, 0.92);
}

:global(.dark) .map-caption text:first-child {
  fill: rgba(255, 255, 255, 0.82);
}

:global(.dark) .map-caption text:last-child {
  fill: rgba(255, 255, 255, 0.5);
}

:global(.dark) .south-sea-inset rect {
  fill: rgba(22, 35, 38, 0.88);
  stroke: rgba(255, 255, 255, 0.15);
}

:global(.dark) .south-sea-inset path {
  fill: rgba(255, 255, 255, 0.06);
  stroke: rgba(255, 255, 255, 0.28);
}

:global(.dark) .south-sea-inset text {
  fill: rgba(255, 255, 255, 0.58);
}

:global(.dark) .map-ocean {
  fill: #172326;
}
</style>
