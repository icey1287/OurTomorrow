<script setup lang="ts">
import type { PlaceHistoryState, PlaceMapItem } from "@our-tomorrow/contracts";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { Home, MapPinned, Navigation, Sparkles } from "lucide-vue-next";
import { computed, ref, watch } from "vue";

import PlaceMapRelations from "@/features/maps/PlaceMapRelations.vue";
import WorldPlaceMap from "@/features/maps/WorldPlaceMap.vue";
import { ApiClientError } from "@/shared/api/client";
import { stageSixMapsApi } from "@/shared/api/stage-six-maps";
import AsyncState from "@/shared/components/AsyncState.vue";
import BaseButton from "@/shared/components/BaseButton.vue";
import SurfaceCard from "@/shared/components/SurfaceCard.vue";
import { useIdentityStore } from "@/shared/stores/identity";

const identity = useIdentityStore();
const queryClient = useQueryClient();
const selectedId = ref<string | null>(null);
const statusPending = ref<PlaceHistoryState | null>(null);
const statusError = ref<string | null>(null);
const notice = ref<string | null>(null);

const mapQuery = useQuery({
  queryKey: computed(() => ["places-map", identity.role]),
  queryFn: stageSixMapsApi.map,
  enabled: computed(() => Boolean(identity.role)),
});

const places = computed(() => mapQuery.data.value?.history ?? []);
const withoutCoordinates = computed(() =>
  (mapQuery.data.value?.withoutCoordinates ?? []).filter(
    (place) => place.historyState !== "UNVISITED",
  ),
);
const selected = computed<PlaceMapItem | null>(
  () => places.value.find((place) => place.id === selectedId.value) ?? null,
);
const timezone = computed(() => identity.couple?.timezone ?? "Asia/Shanghai");
const queryError = computed(() => {
  const error = mapQuery.error.value;
  return error instanceof Error
    ? error.message
    : "共同足迹暂时没有打开，请稍后再试。";
});

watch(
  places,
  (next) => {
    if (!next.some((place) => place.id === selectedId.value)) {
      selectedId.value = next[0]?.id ?? null;
    }
  },
  { immediate: true },
);

watch(
  () => identity.role,
  () => {
    selectedId.value = null;
    statusError.value = null;
    notice.value = null;
  },
);

function historyLabel(state: PlaceHistoryState) {
  return state === "LIVED"
    ? "一起住过"
    : state === "VISITED"
      ? "一起去过"
      : "未到访";
}

async function updateHistory(historyState: PlaceHistoryState) {
  const place = selected.value;
  const startRole = identity.role;
  if (!place || !startRole || statusPending.value) return;
  statusPending.value = historyState;
  statusError.value = null;
  notice.value = null;
  try {
    await stageSixMapsApi.updateStatus(place.id, {
      version: place.version,
      historyState,
    });
    if (identity.role !== startRole) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["places-map", startRole] }),
      queryClient.invalidateQueries({ queryKey: ["places", startRole] }),
    ]);
    notice.value =
      historyState === "LIVED" ? "已记为一起住过。" : "已记入共同足迹。";
  } catch (error) {
    if (identity.role !== startRole) return;
    statusError.value =
      error instanceof ApiClientError && error.code === "STATE_CONFLICT"
        ? "地点刚刚发生变化，已经刷新；请确认后再试。"
        : error instanceof Error
          ? error.message
          : "地点状态没有更新成功。";
    if (error instanceof ApiClientError && error.code === "STATE_CONFLICT") {
      await mapQuery.refetch();
    }
  } finally {
    if (identity.role === startRole) statusPending.value = null;
  }
}
</script>

<template>
  <section aria-labelledby="footprint-map-heading">
    <div
      class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
    >
      <div>
        <p
          class="text-xs font-bold uppercase tracking-[0.18em] text-memory-600 dark:text-memory-300"
        >
          Footprints · 我们走过的路
        </p>
        <h2
          id="footprint-map-heading"
          class="mt-2 font-display text-2xl font-semibold text-ink-950 dark:text-white"
        >
          我们一起走过的地方
        </h2>
        <p
          class="mt-2 max-w-2xl text-sm leading-6 text-ink-500 dark:text-ink-400"
        >
          把一起去过、住过的地方留在地图上，慢慢连成我们的足迹。
        </p>
      </div>
      <span
        class="inline-flex items-center gap-2 self-start rounded-full bg-memory-100 px-3 py-1.5 text-xs font-semibold text-memory-700 dark:bg-memory-900/35 dark:text-memory-200 sm:self-auto"
      >
        <MapPinned class="size-3.5" aria-hidden="true" />{{ places.length }}
        个地图足迹
      </span>
    </div>

    <SurfaceCard tone="memory">
      <AsyncState
        v-if="mapQuery.isPending.value"
        state="loading"
        title="正在展开共同足迹…"
      />
      <AsyncState
        v-else-if="mapQuery.isError.value"
        state="error"
        title="共同足迹暂时没有打开"
        :message="queryError"
        action-label="重试"
        @action="mapQuery.refetch()"
      />
      <AsyncState
        v-else-if="places.length === 0 && withoutCoordinates.length === 0"
        state="empty"
        title="地图上还没有共同足迹"
        message="在回忆或地点中主动填写经纬度后，它会出现在这里。"
      />
      <template v-else>
        <WorldPlaceMap
          :places="places"
          :selected-id="selectedId"
          tone="memory"
          list-label="共同足迹地点列表"
          @select="selectedId = $event"
        />

        <div
          v-if="withoutCoordinates.length"
          class="mt-5 rounded-2xl border border-dashed border-memory-200 bg-white/45 p-4 dark:border-memory-800/40 dark:bg-white/[0.025]"
        >
          <p
            class="flex items-center gap-2 text-sm font-semibold text-ink-800 dark:text-ink-100"
          >
            <Navigation class="size-4 text-memory-500" aria-hidden="true" />
            {{ withoutCoordinates.length }} 个足迹还没有坐标
          </p>
          <ul class="mt-2 flex flex-wrap gap-2" aria-label="尚未填写坐标的足迹">
            <li
              v-for="place in withoutCoordinates"
              :key="place.id"
              class="rounded-full bg-memory-100/80 px-3 py-1 text-xs text-memory-800 dark:bg-memory-900/35 dark:text-memory-200"
            >
              {{ place.name }}
            </li>
          </ul>
        </div>

        <div
          v-if="selected"
          class="mt-6 border-t border-ink-200/70 pt-6 dark:border-white/10"
        >
          <div
            class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p
                class="text-xs font-semibold text-memory-600 dark:text-memory-300"
              >
                {{ historyLabel(selected.historyState) }}
              </p>
              <h3
                class="mt-1 font-display text-xl font-semibold text-ink-950 dark:text-white"
              >
                {{ selected.name }}
              </h3>
              <p class="mt-1 text-sm text-ink-500 dark:text-ink-400">
                {{ selected.address || "还没有补充地址" }}
              </p>
            </div>
            <div class="flex flex-wrap gap-2" aria-label="更新足迹类型">
              <BaseButton
                size="sm"
                variant="secondary"
                :loading="statusPending === 'VISITED'"
                :disabled="
                  selected.historyState === 'VISITED' || Boolean(statusPending)
                "
                @click="updateHistory('VISITED')"
              >
                <Sparkles class="size-4" aria-hidden="true" />去过
              </BaseButton>
              <BaseButton
                size="sm"
                variant="secondary"
                :loading="statusPending === 'LIVED'"
                :disabled="
                  selected.historyState === 'LIVED' || Boolean(statusPending)
                "
                @click="updateHistory('LIVED')"
              >
                <Home class="size-4" aria-hidden="true" />住过
              </BaseButton>
            </div>
          </div>
          <p
            v-if="notice"
            class="mt-3 text-sm text-present-700 dark:text-present-300"
            role="status"
          >
            {{ notice }}
          </p>
          <p
            v-if="statusError"
            class="mt-3 text-sm text-red-600 dark:text-red-300"
            role="alert"
          >
            {{ statusError }}
          </p>
          <div class="mt-6">
            <PlaceMapRelations :place="selected" :timezone="timezone" />
          </div>
        </div>
      </template>
    </SurfaceCard>
  </section>
</template>
