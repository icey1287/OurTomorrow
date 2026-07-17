<script setup lang="ts">
import type {
  PlaceFutureState,
  PlaceMapItem,
  PlaceSearchSuggestion,
} from "@our-tomorrow/contracts";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import {
  CalendarCheck2,
  CheckCircle2,
  Heart,
  MapPinned,
  Navigation,
  Pencil,
  Plane,
  Plus,
  X,
} from "lucide-vue-next";
import { computed, reactive, ref, watch } from "vue";

import PlaceMapRelations from "@/features/maps/PlaceMapRelations.vue";
import PlaceSearchField from "@/features/maps/PlaceSearchField.vue";
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
const statusPending = ref<PlaceFutureState | null>(null);
const statusError = ref<string | null>(null);
const notice = ref<string | null>(null);
const editorOpen = ref(false);
const editingPlace = ref<PlaceMapItem | null>(null);
const editorPending = ref(false);
const editorError = ref<string | null>(null);
const placeForm = reactive({
  name: "",
  address: "",
  latitude: "",
  longitude: "",
});

const ACTIVE_STATES: PlaceFutureState[] = [
  "WANT_TO_GO",
  "PLANNED",
  "DEPARTING",
];

const mapQuery = useQuery({
  queryKey: computed(() => ["places-map", identity.role]),
  queryFn: stageSixMapsApi.map,
  enabled: computed(() => Boolean(identity.role)),
});

const places = computed(() => mapQuery.data.value?.future ?? []);
const withoutCoordinates = computed(() =>
  (mapQuery.data.value?.withoutCoordinates ?? []).filter((place) =>
    ACTIVE_STATES.includes(place.futureState),
  ),
);
const selected = computed<PlaceMapItem | null>(
  () => places.value.find((place) => place.id === selectedId.value) ?? null,
);
const reusableHistory = computed(() => {
  const futureIds = new Set(places.value.map(({ id }) => id));
  const map = mapQuery.data.value;
  const historical = [
    ...(map?.history ?? []),
    ...(map?.withoutCoordinates ?? []).filter(
      (place) => place.historyState !== "UNVISITED",
    ),
  ];
  return [
    ...new Map(historical.map((place) => [place.id, place])).values(),
  ].filter(
    (place) =>
      !futureIds.has(place.id) && !ACTIVE_STATES.includes(place.futureState),
  );
});
const timezone = computed(() => identity.couple?.timezone ?? "Asia/Shanghai");
const queryError = computed(() => {
  const error = mapQuery.error.value;
  return error instanceof Error
    ? error.message
    : "未来地图暂时没有打开，请稍后再试。";
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
    editorOpen.value = false;
    editingPlace.value = null;
    editorPending.value = false;
    editorError.value = null;
  },
);

function futureLabel(state: PlaceFutureState) {
  return (
    {
      NONE: "没有未来安排",
      WANT_TO_GO: "想去",
      PLANNED: "已计划",
      DEPARTING: "即将出发",
      COMPLETED: "已完成",
    } as const
  )[state];
}

function openCreate() {
  editingPlace.value = null;
  placeForm.name = "";
  placeForm.address = "";
  placeForm.latitude = "";
  placeForm.longitude = "";
  editorError.value = null;
  editorOpen.value = true;
}

function openEdit(place: PlaceMapItem) {
  editingPlace.value = place;
  placeForm.name = place.name;
  placeForm.address = place.address ?? "";
  placeForm.latitude = place.latitude?.toString() ?? "";
  placeForm.longitude = place.longitude?.toString() ?? "";
  editorError.value = null;
  editorOpen.value = true;
}

function closeEditor() {
  if (editorPending.value) return;
  editorOpen.value = false;
  editingPlace.value = null;
  editorError.value = null;
}

function parsedCoordinates(): {
  latitude: number | null;
  longitude: number | null;
} | null {
  const latitudeText = placeForm.latitude.trim();
  const longitudeText = placeForm.longitude.trim();
  if (!latitudeText && !longitudeText) {
    return { latitude: null, longitude: null };
  }
  if (!latitudeText || !longitudeText) {
    editorError.value = "纬度和经度需要一起填写，或一起留空。";
    return null;
  }
  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    editorError.value = "请输入有效坐标：纬度 -90～90，经度 -180～180。";
    return null;
  }
  return { latitude, longitude };
}

function selectSearchPlace(place: PlaceSearchSuggestion) {
  placeForm.name = place.name;
  placeForm.address =
    [place.district, place.address]
      .filter(
        (value, index, values): value is string =>
          Boolean(value) && values.indexOf(value) === index,
      )
      .join(" · ") || "";
  placeForm.latitude = String(place.latitude);
  placeForm.longitude = String(place.longitude);
  editorError.value = null;
}

async function savePlace() {
  const startRole = identity.role;
  if (!startRole || editorPending.value) return;
  const name = placeForm.name.trim();
  if (!name) {
    editorError.value = "请写下地点名称。";
    return;
  }
  if (name.length > 160 || placeForm.address.trim().length > 300) {
    editorError.value = "地点名称或地址太长了，请稍微精简。";
    return;
  }
  const coordinates = parsedCoordinates();
  if (!coordinates) return;
  editorPending.value = true;
  editorError.value = null;
  try {
    const editing = editingPlace.value;
    const saved = editing
      ? await stageSixMapsApi.updatePlace(editing.id, {
          version: editing.version,
          name,
          address: placeForm.address.trim() || null,
          ...coordinates,
        })
      : await stageSixMapsApi.createPlace({
          name,
          address: placeForm.address.trim() || null,
          ...coordinates,
          historyState: "UNVISITED",
          futureState: "WANT_TO_GO",
        });
    if (identity.role !== startRole) return;
    selectedId.value = saved.id;
    editorOpen.value = false;
    editingPlace.value = null;
    notice.value = editing
      ? `${saved.name} 的地图信息已更新。`
      : `${saved.name} 已加入未来地图。`;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["places-map", startRole] }),
      queryClient.invalidateQueries({ queryKey: ["places", startRole] }),
    ]);
  } catch (error) {
    if (identity.role !== startRole) return;
    editorError.value =
      error instanceof ApiClientError && error.code === "STATE_CONFLICT"
        ? "地点刚刚发生变化，请关闭后重新选择。"
        : error instanceof Error
          ? error.message
          : "地点没有保存成功。";
  } finally {
    if (identity.role === startRole) editorPending.value = false;
  }
}

async function updateFuture(
  futureState: PlaceFutureState,
  target?: PlaceMapItem,
) {
  const place = target ?? selected.value;
  const startRole = identity.role;
  if (!place || !startRole || statusPending.value) return;
  statusPending.value = futureState;
  statusError.value = null;
  notice.value = null;
  try {
    await stageSixMapsApi.updateStatus(place.id, {
      version: place.version,
      futureState,
    });
    if (identity.role !== startRole) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["places-map", startRole] }),
      queryClient.invalidateQueries({ queryKey: ["places", startRole] }),
      queryClient.invalidateQueries({ queryKey: ["wishes", startRole] }),
      queryClient.invalidateQueries({ queryKey: ["plans", startRole] }),
    ]);
    notice.value =
      futureState === "COMPLETED"
        ? `${place.name} 已完成，并自动进入共同足迹。`
        : `${place.name} 已更新为“${futureLabel(futureState)}”。`;
  } catch (error) {
    if (identity.role !== startRole) return;
    statusError.value =
      error instanceof ApiClientError && error.code === "STATE_CONFLICT"
        ? "地点刚刚发生变化，已经刷新；请确认后再试。"
        : error instanceof Error
          ? error.message
          : "未来地点没有更新成功。";
    if (error instanceof ApiClientError && error.code === "STATE_CONFLICT") {
      await mapQuery.refetch();
    }
  } finally {
    if (identity.role === startRole) statusPending.value = null;
  }
}
</script>

<template>
  <section aria-labelledby="future-map-heading">
    <div
      class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
    >
      <div>
        <p
          class="text-xs font-bold uppercase tracking-[0.18em] text-future-600 dark:text-future-300"
        >
          Future map · 下一站
        </p>
        <h2
          id="future-map-heading"
          class="mt-2 font-display text-2xl font-semibold text-ink-950 dark:text-white"
        >
          把想去的地方放在同一张地图上
        </h2>
        <p
          class="mt-2 max-w-2xl text-sm leading-6 text-ink-500 dark:text-ink-400"
        >
          从想去、已计划到即将出发；完成后地点会保留第一次到访时间，并进入共同足迹。
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2 self-start sm:self-auto">
        <span
          class="inline-flex items-center gap-2 rounded-full bg-future-100 px-3 py-1.5 text-xs font-semibold text-future-700 dark:bg-future-900/35 dark:text-future-200"
        >
          <MapPinned class="size-3.5" aria-hidden="true" />{{ places.length }}
          个未来坐标
        </span>
        <BaseButton size="sm" variant="secondary" @click="openCreate">
          <Plus class="size-4" aria-hidden="true" />添加下一站
        </BaseButton>
      </div>
    </div>

    <SurfaceCard tone="future">
      <p
        v-if="notice"
        class="mb-4 rounded-2xl bg-present-100/80 px-4 py-3 text-sm text-present-800 dark:bg-present-900/30 dark:text-present-200"
        role="status"
      >
        {{ notice }}
      </p>
      <form
        v-if="editorOpen"
        class="mb-5 rounded-3xl border border-future-200/80 bg-white/70 p-4 dark:border-future-800/40 dark:bg-white/[0.045] sm:p-5"
        @submit.prevent="savePlace"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3
              class="font-display text-lg font-semibold text-ink-950 dark:text-white"
            >
              {{ editingPlace ? "补充地点信息" : "主动添加一个下一站" }}
            </h3>
            <p class="mt-1 text-xs leading-5 text-ink-500 dark:text-ink-400">
              输入地点后选择最合适的结果，地址和坐标会自动填好。
            </p>
          </div>
          <button
            type="button"
            class="grid size-9 shrink-0 place-items-center rounded-xl text-ink-500 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-white/[0.07]"
            aria-label="关闭地点编辑"
            @click="closeEditor"
          >
            <X class="size-4" aria-hidden="true" />
          </button>
        </div>
        <div class="mt-4 grid gap-4 sm:grid-cols-2">
          <div class="text-sm font-medium text-ink-700 dark:text-ink-200">
            <label for="future-place-name">地点名称</label>
            <PlaceSearchField
              input-id="future-place-name"
              v-model="placeForm.name"
              class="mt-1.5"
              placeholder="例如：上海迪士尼"
              :disabled="editorPending"
              @select="selectSearchPlace"
            />
          </div>
          <label class="text-sm font-medium text-ink-700 dark:text-ink-200">
            地址（可选）
            <input
              v-model="placeForm.address"
              maxlength="300"
              class="mt-1.5 w-full rounded-2xl border border-ink-200 bg-white/85 px-3.5 py-2.5 text-ink-950 outline-none transition focus:border-future-400 focus:ring-2 focus:ring-future-200 dark:border-white/10 dark:bg-white/[0.06] dark:text-white dark:focus:border-future-500 dark:focus:ring-future-900"
              placeholder="城市、国家或更具体的地址"
            />
          </label>
          <label class="text-sm font-medium text-ink-700 dark:text-ink-200">
            纬度（可选）
            <input
              v-model="placeForm.latitude"
              inputmode="decimal"
              class="mt-1.5 w-full rounded-2xl border border-ink-200 bg-white/85 px-3.5 py-2.5 text-ink-950 outline-none transition focus:border-future-400 focus:ring-2 focus:ring-future-200 dark:border-white/10 dark:bg-white/[0.06] dark:text-white dark:focus:border-future-500 dark:focus:ring-future-900"
              placeholder="-90 ～ 90"
            />
          </label>
          <label class="text-sm font-medium text-ink-700 dark:text-ink-200">
            经度（可选）
            <input
              v-model="placeForm.longitude"
              inputmode="decimal"
              class="mt-1.5 w-full rounded-2xl border border-ink-200 bg-white/85 px-3.5 py-2.5 text-ink-950 outline-none transition focus:border-future-400 focus:ring-2 focus:ring-future-200 dark:border-white/10 dark:bg-white/[0.06] dark:text-white dark:focus:border-future-500 dark:focus:ring-future-900"
              placeholder="-180 ～ 180"
            />
          </label>
        </div>
        <p
          v-if="editorError"
          class="mt-3 text-sm text-red-600 dark:text-red-300"
          role="alert"
        >
          {{ editorError }}
        </p>
        <div class="mt-4 flex justify-end gap-2">
          <BaseButton
            type="button"
            size="sm"
            variant="ghost"
            :disabled="editorPending"
            @click="closeEditor"
          >
            取消
          </BaseButton>
          <BaseButton type="submit" size="sm" :loading="editorPending">
            {{ editingPlace ? "保存地点" : "加入未来地图" }}
          </BaseButton>
        </div>
      </form>
      <AsyncState
        v-if="mapQuery.isPending.value"
        state="loading"
        title="正在展开未来地图…"
      />
      <AsyncState
        v-else-if="mapQuery.isError.value"
        state="error"
        title="未来地图暂时没有打开"
        :message="queryError"
        action-label="重试"
        @action="mapQuery.refetch()"
      />
      <AsyncState
        v-else-if="
          places.length === 0 &&
          withoutCoordinates.length === 0 &&
          reusableHistory.length === 0
        "
        state="empty"
        title="地图上还没有下一站"
        message="给愿望或计划关联一个主动添加的地点，它就会来到这里。"
      />
      <template v-else>
        <WorldPlaceMap
          :places="places"
          :selected-id="selectedId"
          tone="future"
          list-label="未来地点列表"
          @select="selectedId = $event"
        />

        <div
          v-if="withoutCoordinates.length"
          class="mt-5 rounded-2xl border border-dashed border-future-200 bg-white/45 p-4 dark:border-future-800/40 dark:bg-white/[0.025]"
        >
          <p
            class="flex items-center gap-2 text-sm font-semibold text-ink-800 dark:text-ink-100"
          >
            <Navigation class="size-4 text-future-500" aria-hidden="true" />
            {{ withoutCoordinates.length }} 个下一站还没有坐标
          </p>
          <ul
            class="mt-2 flex flex-wrap gap-2"
            aria-label="尚未填写坐标的未来地点"
          >
            <li
              v-for="place in withoutCoordinates"
              :key="place.id"
              class="rounded-full bg-future-100/80 text-xs text-future-800 dark:bg-future-900/35 dark:text-future-200"
            >
              <button
                type="button"
                class="inline-flex items-center gap-1.5 px-3 py-1"
                @click="openEdit(place)"
              >
                {{ place.name }} · {{ futureLabel(place.futureState) }}
                <Pencil class="size-3" aria-hidden="true" />
              </button>
            </li>
          </ul>
        </div>

        <div
          v-if="reusableHistory.length"
          class="mt-5 rounded-2xl border border-memory-200/70 bg-memory-50/55 p-4 dark:border-memory-800/35 dark:bg-memory-950/20"
        >
          <p class="text-sm font-semibold text-ink-800 dark:text-ink-100">
            想再去一次的共同足迹
          </p>
          <ul
            class="mt-2 flex flex-wrap gap-2"
            aria-label="可以再次加入未来地图的足迹"
          >
            <li v-for="place in reusableHistory" :key="place.id">
              <button
                type="button"
                class="rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-memory-700 transition hover:bg-white disabled:opacity-55 dark:bg-white/[0.07] dark:text-memory-200 dark:hover:bg-white/10"
                :disabled="Boolean(statusPending)"
                @click="updateFuture('WANT_TO_GO', place)"
              >
                {{ place.name }} · 再次想去
              </button>
            </li>
          </ul>
        </div>

        <div
          v-if="selected"
          class="mt-6 border-t border-ink-200/70 pt-6 dark:border-white/10"
        >
          <div
            class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
          >
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <span
                  class="rounded-full bg-future-100 px-2.5 py-1 text-xs font-semibold text-future-700 dark:bg-future-900/35 dark:text-future-200"
                >
                  {{ futureLabel(selected.futureState) }}
                </span>
                <span
                  v-if="selected.historyState !== 'UNVISITED'"
                  class="rounded-full bg-memory-100 px-2.5 py-1 text-xs font-semibold text-memory-700 dark:bg-memory-900/35 dark:text-memory-200"
                >
                  也是共同足迹
                </span>
              </div>
              <h3
                class="mt-2 font-display text-xl font-semibold text-ink-950 dark:text-white"
              >
                {{ selected.name }}
              </h3>
              <p class="mt-1 text-sm text-ink-500 dark:text-ink-400">
                {{ selected.address || "还没有补充地址" }}
              </p>
              <button
                type="button"
                class="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-white"
                @click="openEdit(selected)"
              >
                <Pencil
                  class="size-3.5"
                  aria-hidden="true"
                />编辑名称、地址或坐标
              </button>
            </div>
            <div class="flex flex-wrap gap-2" aria-label="更新未来阶段">
              <BaseButton
                size="sm"
                variant="secondary"
                :loading="statusPending === 'WANT_TO_GO'"
                :disabled="
                  selected.futureState === 'WANT_TO_GO' ||
                  Boolean(statusPending)
                "
                @click="updateFuture('WANT_TO_GO')"
              >
                <Heart class="size-4" aria-hidden="true" />想去
              </BaseButton>
              <BaseButton
                size="sm"
                variant="secondary"
                :loading="statusPending === 'PLANNED'"
                :disabled="
                  selected.futureState === 'PLANNED' || Boolean(statusPending)
                "
                @click="updateFuture('PLANNED')"
              >
                <CalendarCheck2 class="size-4" aria-hidden="true" />已计划
              </BaseButton>
              <BaseButton
                size="sm"
                variant="secondary"
                :loading="statusPending === 'DEPARTING'"
                :disabled="
                  selected.futureState === 'DEPARTING' || Boolean(statusPending)
                "
                @click="updateFuture('DEPARTING')"
              >
                <Plane class="size-4" aria-hidden="true" />即将出发
              </BaseButton>
              <BaseButton
                size="sm"
                :loading="statusPending === 'COMPLETED'"
                :disabled="Boolean(statusPending)"
                @click="updateFuture('COMPLETED')"
              >
                <CheckCircle2 class="size-4" aria-hidden="true" />完成
              </BaseButton>
            </div>
          </div>
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
