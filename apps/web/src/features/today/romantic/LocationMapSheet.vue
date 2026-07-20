<script setup lang="ts">
import type { CurrentStatusSummary } from "@our-tomorrow/contracts";
import { ExternalLink, LoaderCircle, MapPinned, X } from "lucide-vue-next";
import { computed, onBeforeUnmount, ref, watch } from "vue";

import { stageThreeApi } from "@/shared/api/stage-three";

import { romanticArt } from "./romantic-model";
import { useSheetBodyLock } from "./use-sheet-body-lock";

const props = defineProps<{
  open: boolean;
  status: CurrentStatusSummary | null;
  partnerName: string;
  timezone: string;
}>();

defineEmits<{ close: [] }>();

const mapUrl = ref<string | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);
const isOpen = computed(() => props.open);
let loadVersion = 0;

useSheetBodyLock(isOpen);

function releaseMap() {
  if (!mapUrl.value) return;
  URL.revokeObjectURL(mapUrl.value);
  mapUrl.value = null;
}

async function loadMap() {
  const status = props.status;
  const currentVersion = ++loadVersion;
  releaseMap();
  loadError.value = null;
  if (
    !props.open ||
    !status ||
    status.latitude === null ||
    status.longitude === null
  ) {
    return;
  }

  loading.value = true;
  try {
    const blob = await stageThreeApi.statusMapPreview(status.id);
    if (currentVersion !== loadVersion) return;
    mapUrl.value = URL.createObjectURL(blob);
  } catch (error) {
    if (currentVersion !== loadVersion) return;
    loadError.value =
      error instanceof Error ? error.message : "地图暂时没有打开。";
  } finally {
    if (currentVersion === loadVersion) loading.value = false;
  }
}

const amapUrl = computed(() => {
  const status = props.status;
  if (
    !status ||
    status.latitude === null ||
    status.longitude === null ||
    !status.location
  ) {
    return null;
  }
  const search = new URLSearchParams({
    position: `${status.longitude},${status.latitude}`,
    name: status.location,
    src: "OurTomorrow",
    coordinate: "gaode",
    callnative: "0",
  });
  return `https://uri.amap.com/marker?${search.toString()}`;
});

const updatedLabel = computed(() => {
  const value = props.status?.startsAt;
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: props.timezone,
  }).format(new Date(value));
});

watch(
  () => [props.open, props.status?.id] as const,
  () => void loadMap(),
  { immediate: true },
);

onBeforeUnmount(() => {
  loadVersion += 1;
  releaseMap();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="map-sheet">
      <div
        v-if="open"
        class="map-backdrop"
        role="presentation"
        @click.self="$emit('close')"
      >
        <section
          class="map-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="location-map-title"
          @keydown.esc="$emit('close')"
        >
          <div class="sheet-handle" aria-hidden="true" />

          <header>
            <div>
              <p>LIVE PLACE · AMAP</p>
              <h2 id="location-map-title">{{ partnerName }} 的此刻位置</h2>
            </div>
            <button
              type="button"
              aria-label="关闭位置地图"
              @click="$emit('close')"
            >
              <X class="size-5" />
            </button>
          </header>

          <div class="map-frame">
            <img v-if="mapUrl" :src="mapUrl" alt="高德地图位置预览" />
            <div v-else-if="loading" class="map-loading" role="status">
              <LoaderCircle class="size-5 animate-spin" />
              正在铺开地图…
            </div>
            <div v-else class="map-error" role="alert">
              {{ loadError || "这个位置暂时没有地图坐标。" }}
            </div>
            <img
              class="map-sticker"
              :src="romanticArt.statusLocation"
              alt=""
              aria-hidden="true"
            />
          </div>

          <article class="place-card">
            <MapPinned class="size-5" aria-hidden="true" />
            <div>
              <h3>{{ status?.location || "此刻位置" }}</h3>
              <p>{{ status?.locationAddress || "对方主动发送的位置" }}</p>
              <small>更新于 {{ updatedLabel }}</small>
            </div>
          </article>

          <a
            v-if="amapUrl"
            class="open-amap"
            :href="amapUrl"
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink class="size-4" />在高德地图中打开
          </a>

          <p class="privacy-note">
            这不是持续定位，只是对方最近一次主动贴上的位置。
          </p>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.map-backdrop {
  position: fixed;
  z-index: 160;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-top: 40px;
  background: rgb(54 40 35 / 0.44);
  backdrop-filter: blur(7px);
}

.map-sheet {
  position: relative;
  width: min(100%, 520px);
  max-height: calc(100dvh - 24px);
  overflow: auto;
  border: 1px solid rgb(106 77 58 / 0.2);
  border-radius: 28px 28px 0 0;
  background-color: #f8efdc;
  background-image: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 31px,
    rgb(105 127 128 / 0.08) 32px
  );
  padding: 10px 18px calc(25px + env(safe-area-inset-bottom));
  color: #44342a;
  box-shadow: 0 -24px 70px rgb(56 40 31 / 0.25);
}

.sheet-handle {
  width: 42px;
  height: 5px;
  margin: 0 auto 14px;
  border-radius: 999px;
  background: #765f4f;
  opacity: 0.22;
}

header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

header p {
  margin: 0;
  color: #a15951;
  font-family: "Courier New", monospace;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.14em;
}

header h2 {
  margin: 6px 0 0;
  font-family: "Songti SC", "Noto Serif SC", serif;
  font-size: 25px;
  letter-spacing: -0.04em;
}

header > button {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgb(91 65 50 / 0.12);
  border-radius: 50%;
  background: rgb(255 250 239 / 0.62);
}

.map-frame {
  position: relative;
  min-height: 230px;
  overflow: hidden;
  margin-top: 20px;
  border: 5px solid #fff8e8;
  background: #e8dfcf;
  box-shadow: 4px 5px 0 rgb(78 51 35 / 0.11);
  transform: rotate(-0.35deg);
}

.map-frame > img:first-child {
  width: 100%;
  min-height: 230px;
  object-fit: cover;
}

.map-loading,
.map-error {
  display: flex;
  min-height: 230px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 25px;
  color: #7c6556;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 12px;
  text-align: center;
}

.map-sticker {
  position: absolute;
  right: -9px;
  bottom: -10px;
  width: 74px;
  filter: drop-shadow(2px 4px 3px rgb(65 45 33 / 0.18));
}

.place-card {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 9px;
  margin-top: 18px;
  border: 1px solid rgb(105 73 53 / 0.16);
  background: rgb(255 249 235 / 0.7);
  padding: 13px 14px;
}

.place-card > svg {
  margin-top: 2px;
  color: #a6534c;
}

.place-card h3,
.place-card p,
.place-card small {
  margin: 0;
}

.place-card h3 {
  font-family: "Songti SC", "Noto Serif SC", serif;
  font-size: 17px;
}

.place-card p {
  margin-top: 4px;
  color: #745e50;
  font-size: 11px;
  line-height: 1.45;
}

.place-card small {
  display: block;
  margin-top: 5px;
  color: #9a7968;
  font-family: "Courier New", monospace;
  font-size: 8px;
}

.open-amap {
  display: flex;
  min-height: 50px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin-top: 15px;
  border: 1px solid rgb(74 50 37 / 0.24);
  border-radius: 3px;
  background: #a6534c;
  color: #fff8e9;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 13px;
  font-weight: 700;
}

.privacy-note {
  margin: 12px 0 0;
  color: #887062;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 10px;
  text-align: center;
}

.map-sheet-enter-active,
.map-sheet-leave-active {
  transition: opacity 180ms ease;
}

.map-sheet-enter-active .map-sheet,
.map-sheet-leave-active .map-sheet {
  transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
}

.map-sheet-enter-from,
.map-sheet-leave-to {
  opacity: 0;
}

.map-sheet-enter-from .map-sheet,
.map-sheet-leave-to .map-sheet {
  transform: translateY(45px);
}

@media (min-width: 640px) {
  .map-backdrop {
    align-items: center;
    padding: 24px;
  }

  .map-sheet {
    border-radius: 28px;
  }
}
</style>
