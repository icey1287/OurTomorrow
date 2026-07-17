<script setup lang="ts">
import type {
  MemoryDetail,
  PlaceSummary,
  TagSummary,
} from "@our-tomorrow/contracts";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/vue-query";
import {
  Camera,
  Filter,
  History,
  Landmark,
  MapPinned,
  Plus,
  Search,
  UsersRound,
  X,
} from "lucide-vue-next";
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";

import BlindBoxPanel from "@/features/remember/BlindBoxPanel.vue";
import FootprintMapPanel from "@/features/maps/FootprintMapPanel.vue";
import FirstTimeMuseum from "@/features/remember/FirstTimeMuseum.vue";
import MemoryCard from "@/features/remember/MemoryCard.vue";
import MemoryDetailPanel from "@/features/remember/MemoryDetailPanel.vue";
import MemoryEditor from "@/features/remember/MemoryEditor.vue";
import {
  groupMemoriesByMonth,
  yearInTimeZone,
} from "@/features/remember/remember-utils";
import { ApiClientError } from "@/shared/api/client";
import { stageTwoApi, type MemoryListFilters } from "@/shared/api/stage-two";
import AsyncState from "@/shared/components/AsyncState.vue";
import BaseButton from "@/shared/components/BaseButton.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import SectionHeading from "@/shared/components/SectionHeading.vue";
import SurfaceCard from "@/shared/components/SurfaceCard.vue";
import { useIdentityStore } from "@/shared/stores/identity";

const identity = useIdentityStore();
const route = useRoute();
const queryClient = useQueryClient();
const filtersOpen = ref(false);
const searchInput = ref("");
const searchQuery = ref("");
const selectedMemoryId = ref<string | null>(null);
const editorOpen = ref(false);
const editingMemory = ref<MemoryDetail | null>(null);
const pageMessage = ref<string | null>(null);
const viewMode = ref<"timeline" | "footprint" | "first-times">("timeline");
let searchTimer: ReturnType<typeof setTimeout> | null = null;

const filters = reactive({
  year: "",
  month: "",
  tagId: "",
  placeId: "",
  firstTime: "",
  perspectiveState: "",
});

watch(searchInput, (value) => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchQuery.value = value.trim();
  }, 320);
});

watch(
  () => filters.year,
  (year) => {
    if (!year) filters.month = "";
  },
);

watch(
  () => route.query.memory,
  (memoryId) => {
    if (typeof memoryId === "string" && memoryId) {
      selectedMemoryId.value = memoryId;
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
});

const normalizedFilters = computed<MemoryListFilters>(() => ({
  limit: 12,
  year: filters.year ? Number(filters.year) : null,
  month: filters.month ? Number(filters.month) : null,
  tagId: filters.tagId || null,
  placeId: filters.placeId || null,
  firstTime:
    filters.firstTime === "true"
      ? true
      : filters.firstTime === "false"
        ? false
        : null,
  perspectiveState:
    filters.perspectiveState === "complete" ||
    filters.perspectiveState === "incomplete"
      ? filters.perspectiveState
      : null,
  query: searchQuery.value || null,
}));

const tagsQuery = useQuery({
  queryKey: computed(() => ["tags", identity.role]),
  queryFn: stageTwoApi.tags,
});
const placesQuery = useQuery({
  queryKey: computed(() => ["places", identity.role]),
  queryFn: stageTwoApi.places,
});
const memoriesQuery = useInfiniteQuery({
  queryKey: computed(() => [
    "memories",
    identity.role,
    normalizedFilters.value,
  ]),
  queryFn: ({ pageParam }) =>
    stageTwoApi.memories({
      ...normalizedFilters.value,
      cursor: pageParam,
    }),
  initialPageParam: null as string | null,
  getNextPageParam: (lastPage) => lastPage.meta.nextCursor ?? undefined,
  enabled: computed(() => viewMode.value === "timeline"),
});
const firstTimesQuery = useInfiniteQuery({
  queryKey: computed(() => ["first-times", identity.role]),
  queryFn: ({ pageParam }) =>
    stageTwoApi.firstTimes({ limit: 12, cursor: pageParam }),
  initialPageParam: null as string | null,
  getNextPageParam: (lastPage) => lastPage.meta.nextCursor ?? undefined,
  enabled: computed(() => viewMode.value === "first-times"),
});

const tags = computed(() => tagsQuery.data.value ?? []);
const places = computed(() => placesQuery.data.value ?? []);
const timezone = computed(() => identity.couple?.timezone ?? "Asia/Shanghai");
const memories = computed(
  () => memoriesQuery.data.value?.pages.flatMap((page) => page.items) ?? [],
);
const firstTimeMemories = computed(
  () => firstTimesQuery.data.value?.pages.flatMap((page) => page.items) ?? [],
);
const timelineGroups = computed(() =>
  groupMemoriesByMonth(memories.value, timezone.value),
);
const appliedFilterCount = computed(
  () =>
    [
      filters.year,
      filters.month,
      filters.tagId,
      filters.placeId,
      filters.firstTime,
      filters.perspectiveState,
      searchQuery.value,
    ].filter(Boolean).length,
);
const yearOptions = computed(() => {
  const years = new Set<number>();
  const currentYear =
    yearInTimeZone(new Date(), timezone.value) ?? new Date().getUTCFullYear();
  const startYear = Number(identity.couple?.startDate.slice(0, 4));
  const minimum = Number.isFinite(startYear)
    ? Math.min(startYear, currentYear)
    : currentYear - 10;
  for (let year = currentYear; year >= minimum; year -= 1) years.add(year);
  for (const memory of memories.value) {
    const year = yearInTimeZone(memory.happenedAt, timezone.value);
    if (year !== null) years.add(year);
  }
  return [...years].sort((left, right) => right - left);
});
const listErrorMessage = computed(() => {
  const error = memoriesQuery.error.value;
  if (error instanceof ApiClientError) return error.message;
  return "回忆时间线暂时没有打开，请稍后再试。";
});
const museumErrorMessage = computed(() => {
  if (!firstTimesQuery.isError.value) return null;
  const error = firstTimesQuery.error.value;
  if (error instanceof ApiClientError) return error.message;
  return "第一次博物馆暂时没有打开，请稍后再试。";
});

function resetFilters() {
  filters.year = "";
  filters.month = "";
  filters.tagId = "";
  filters.placeId = "";
  filters.firstTime = "";
  filters.perspectiveState = "";
  searchInput.value = "";
  searchQuery.value = "";
}

function openNewMemory() {
  editingMemory.value = null;
  editorOpen.value = true;
  pageMessage.value = null;
}

function openEditor(memory: MemoryDetail) {
  selectedMemoryId.value = null;
  editingMemory.value = memory;
  editorOpen.value = true;
  pageMessage.value = null;
}

async function handleSaved(memory: MemoryDetail) {
  editorOpen.value = false;
  editingMemory.value = null;
  pageMessage.value = "回忆已经保存到两个人的时间线。";
  queryClient.setQueryData(["memory", identity.role, memory.id], memory);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["memories"] }),
    queryClient.invalidateQueries({ queryKey: ["first-times"] }),
    queryClient.invalidateQueries({ queryKey: ["memory-resurface"] }),
    queryClient.invalidateQueries({ queryKey: ["random-memory"] }),
    queryClient.invalidateQueries({ queryKey: ["today"] }),
  ]);
  selectedMemoryId.value = memory.id;
}

async function handleDeleted() {
  selectedMemoryId.value = null;
  pageMessage.value = "回忆已移入回收站。";
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["memories"] }),
    queryClient.invalidateQueries({ queryKey: ["first-times"] }),
    queryClient.invalidateQueries({ queryKey: ["memory-resurface"] }),
    queryClient.invalidateQueries({ queryKey: ["random-memory"] }),
    queryClient.invalidateQueries({ queryKey: ["today"] }),
  ]);
}

function handleChanged(memory: MemoryDetail) {
  queryClient.setQueryData(["memory", identity.role, memory.id], memory);
  void Promise.all([
    queryClient.invalidateQueries({ queryKey: ["memories"] }),
    queryClient.invalidateQueries({ queryKey: ["first-times"] }),
    queryClient.invalidateQueries({ queryKey: ["memory-resurface"] }),
  ]);
}

function addTag(tag: TagSummary) {
  queryClient.setQueryData<TagSummary[]>(
    ["tags", identity.role],
    (current = []) =>
      current.some((item) => item.id === tag.id) ? current : [...current, tag],
  );
}

function addPlace(place: PlaceSummary) {
  queryClient.setQueryData<PlaceSummary[]>(
    ["places", identity.role],
    (current = []) =>
      current.some((item) => item.id === place.id)
        ? current
        : [...current, place],
  );
}

function handleConflict() {
  void queryClient.invalidateQueries({ queryKey: ["memories"] });
  void queryClient.invalidateQueries({ queryKey: ["first-times"] });
}
</script>

<template>
  <main class="page-shell">
    <PageHeader
      eyebrow="Remember · 已经发生的过去"
      title="让旧故事，随时可以重新遇见。"
      description="按发生时间整理共同回忆；公共信息一起维护，各自的视角只由本人书写和提交。"
    >
      <template #actions>
        <BaseButton size="sm" @click="openNewMemory">
          <Plus class="size-4" />
          新回忆
        </BaseButton>
      </template>
    </PageHeader>

    <p
      v-if="pageMessage"
      class="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-present-200 bg-present-50 px-4 py-3 text-sm text-present-700 dark:border-present-900/60 dark:bg-present-950/30 dark:text-present-200"
      role="status"
    >
      {{ pageMessage }}
      <button type="button" aria-label="关闭提示" @click="pageMessage = null">
        <X class="size-4" />
      </button>
    </p>

    <nav
      class="mb-6 flex w-full rounded-2xl border border-ink-200 bg-white/70 p-1 shadow-sm dark:border-white/10 dark:bg-white/[0.045] sm:inline-flex sm:w-auto"
      aria-label="记录展示模式"
    >
      <button
        type="button"
        class="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition sm:flex-none sm:px-4"
        :class="
          viewMode === 'timeline'
            ? 'bg-ink-950 text-white shadow-sm dark:bg-white dark:text-ink-950'
            : 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white'
        "
        :aria-pressed="viewMode === 'timeline'"
        @click="viewMode = 'timeline'"
      >
        <History class="size-4" /> 回忆时间线
      </button>
      <button
        type="button"
        class="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition sm:flex-none sm:px-4"
        :class="
          viewMode === 'footprint'
            ? 'bg-ink-950 text-white shadow-sm dark:bg-white dark:text-ink-950'
            : 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white'
        "
        :aria-pressed="viewMode === 'footprint'"
        @click="viewMode = 'footprint'"
      >
        <MapPinned class="size-4" /> 足迹地图
      </button>
      <button
        type="button"
        class="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition sm:flex-none sm:px-4"
        :class="
          viewMode === 'first-times'
            ? 'bg-ink-950 text-white shadow-sm dark:bg-white dark:text-ink-950'
            : 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white'
        "
        :aria-pressed="viewMode === 'first-times'"
        @click="viewMode = 'first-times'"
      >
        <Landmark class="size-4" /> 第一次博物馆
      </button>
    </nav>

    <section
      v-if="viewMode === 'timeline'"
      class="mb-6 space-y-3"
      aria-label="回忆筛选"
    >
      <div class="flex flex-col gap-3 sm:flex-row">
        <label class="relative flex-1">
          <span class="sr-only">搜索回忆</span>
          <Search
            class="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-400"
          />
          <input
            v-model="searchInput"
            class="field-input pl-11"
            type="search"
            maxlength="100"
            placeholder="搜索标题、正文或地点"
          />
        </label>
        <BaseButton variant="secondary" @click="filtersOpen = !filtersOpen">
          <Filter class="size-4" />
          筛选
          <span
            v-if="appliedFilterCount"
            class="rounded-full bg-memory-100 px-2 py-0.5 text-xs text-memory-700 dark:bg-memory-950/60 dark:text-memory-200"
          >
            {{ appliedFilterCount }}
          </span>
        </BaseButton>
      </div>

      <SurfaceCard v-if="filtersOpen">
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label class="field-label" for="filter-year">年份</label>
            <select
              id="filter-year"
              v-model="filters.year"
              class="field-input py-3"
            >
              <option value="">全部年份</option>
              <option
                v-for="year in yearOptions"
                :key="year"
                :value="String(year)"
              >
                {{ year }} 年
              </option>
            </select>
          </div>
          <div>
            <label class="field-label" for="filter-month">月份</label>
            <select
              id="filter-month"
              v-model="filters.month"
              class="field-input py-3"
              :disabled="!filters.year"
            >
              <option value="">
                {{ filters.year ? "全部月份" : "请先选择年份" }}
              </option>
              <option v-for="month in 12" :key="month" :value="String(month)">
                {{ month }} 月
              </option>
            </select>
          </div>
          <div>
            <label class="field-label" for="filter-tag">标签</label>
            <select
              id="filter-tag"
              v-model="filters.tagId"
              class="field-input py-3"
              :disabled="tagsQuery.isPending.value"
            >
              <option value="">全部标签</option>
              <option v-for="tag in tags" :key="tag.id" :value="tag.id">
                # {{ tag.name }}
              </option>
            </select>
          </div>
          <div>
            <label class="field-label" for="filter-place">地点</label>
            <select
              id="filter-place"
              v-model="filters.placeId"
              class="field-input py-3"
              :disabled="placesQuery.isPending.value"
            >
              <option value="">全部地点</option>
              <option v-for="place in places" :key="place.id" :value="place.id">
                {{ place.name }}
              </option>
            </select>
          </div>
          <div>
            <label class="field-label" for="filter-first">第一次</label>
            <select
              id="filter-first"
              v-model="filters.firstTime"
              class="field-input py-3"
            >
              <option value="">全部回忆</option>
              <option value="true">只看第一次</option>
              <option value="false">排除第一次</option>
            </select>
          </div>
          <div>
            <label class="field-label" for="filter-perspective">双方视角</label>
            <select
              id="filter-perspective"
              v-model="filters.perspectiveState"
              class="field-input py-3"
            >
              <option value="">全部状态</option>
              <option value="complete">双方都已提交</option>
              <option value="incomplete">仍有视角未提交</option>
            </select>
          </div>
        </div>
        <div class="mt-5 flex justify-end">
          <BaseButton variant="ghost" size="sm" @click="resetFilters">
            <X class="size-4" /> 清除全部筛选
          </BaseButton>
        </div>
      </SurfaceCard>
    </section>

    <FootprintMapPanel v-if="viewMode === 'footprint'" />

    <section v-else class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <SurfaceCard>
        <FirstTimeMuseum
          v-if="viewMode === 'first-times'"
          :memories="firstTimeMemories"
          :timezone="timezone"
          :pending="firstTimesQuery.isPending.value"
          :error-message="museumErrorMessage"
          :has-more="Boolean(firstTimesQuery.hasNextPage.value)"
          :loading-more="firstTimesQuery.isFetchingNextPage.value"
          @open="selectedMemoryId = $event"
          @retry="firstTimesQuery.refetch()"
          @load-more="firstTimesQuery.fetchNextPage()"
          @create="openNewMemory"
        />

        <template v-else>
          <div class="flex items-center justify-between gap-4">
            <SectionHeading
              title="时光长河"
              :description="
                appliedFilterCount
                  ? '正在展示符合筛选条件的共同故事。'
                  : '按发生时间慢慢往回走。'
              "
            />
            <span
              class="shrink-0 rounded-full bg-memory-100 px-3 py-1 text-xs font-semibold text-memory-700 dark:bg-memory-950/45 dark:text-memory-200"
            >
              {{ memories.length }} 条已载入
            </span>
          </div>

          <div class="mt-6">
            <AsyncState
              v-if="memoriesQuery.isPending.value"
              state="loading"
              title="正在沿时间线找回故事…"
              message="发生时间、标签、地点与双方视角状态正在一起整理。"
            />
            <AsyncState
              v-else-if="memoriesQuery.isError.value"
              state="error"
              title="时间线暂时没有打开"
              :message="listErrorMessage"
              action-label="重新加载"
              @action="memoriesQuery.refetch()"
            />
            <AsyncState
              v-else-if="!memories.length"
              state="empty"
              :title="
                appliedFilterCount
                  ? '没有找到符合条件的回忆'
                  : '故事已经发生，只差被慢慢写下来。'
              "
              :message="
                appliedFilterCount
                  ? '换一组筛选，或清除条件看看完整时间线。'
                  : '第一条回忆可以只有一句话和一个日期，照片与另一个视角以后再补也没关系。'
              "
              :action-label="appliedFilterCount ? '清除筛选' : '写下第一条回忆'"
              @action="appliedFilterCount ? resetFilters() : openNewMemory()"
            />

            <div v-else class="space-y-9">
              <section v-for="group in timelineGroups" :key="group.key">
                <div class="mb-4 flex items-center gap-3">
                  <span
                    class="grid size-9 place-items-center rounded-2xl bg-memory-100 text-memory-700 dark:bg-memory-950/50 dark:text-memory-200"
                    ><History class="size-4"
                  /></span>
                  <h2
                    class="font-display text-xl font-semibold text-ink-950 dark:text-white"
                  >
                    {{ group.label }}
                  </h2>
                  <span class="text-xs font-semibold text-ink-400"
                    >{{ group.items.length }} 段</span
                  >
                </div>
                <div class="grid gap-4 lg:grid-cols-2">
                  <MemoryCard
                    v-for="memory in group.items"
                    :key="memory.id"
                    :memory="memory"
                    :timezone="timezone"
                    @open="selectedMemoryId = memory.id"
                  />
                </div>
              </section>

              <div
                v-if="memoriesQuery.hasNextPage.value"
                class="flex justify-center pt-1"
              >
                <BaseButton
                  variant="secondary"
                  :loading="memoriesQuery.isFetchingNextPage.value"
                  @click="memoriesQuery.fetchNextPage()"
                >
                  继续往前翻
                </BaseButton>
              </div>
              <p v-else class="text-center text-xs text-ink-400">
                已经走到这组时间线的最早处。
              </p>
            </div>
          </div>
        </template>
      </SurfaceCard>

      <aside class="space-y-5">
        <BlindBoxPanel :timezone="timezone" @open="selectedMemoryId = $event" />

        <SurfaceCard>
          <div class="flex items-center gap-3">
            <span
              class="grid size-9 place-items-center rounded-xl bg-present-100 text-present-700 dark:bg-present-950/50 dark:text-present-200"
              ><UsersRound class="size-4"
            /></span>
            <p class="text-sm font-semibold text-ink-900 dark:text-white">
              双方视角独立保存
            </p>
          </div>
          <p class="mt-3 text-sm leading-6 text-ink-500 dark:text-ink-400">
            共同故事一起维护；个人草稿提交前，对方只会知道它还没完成。
          </p>
        </SurfaceCard>

        <SurfaceCard>
          <div class="flex items-center gap-3">
            <span
              class="grid size-9 place-items-center rounded-xl bg-ink-100 text-ink-500 dark:bg-white/[0.07] dark:text-ink-300"
              ><Camera class="size-4"
            /></span>
            <div>
              <p class="text-sm font-semibold text-ink-900 dark:text-white">
                私密照片只对上传的人可见
              </p>
              <p class="mt-0.5 text-xs text-ink-400">
                重新编码 · 清理 EXIF · 私有缩略图
              </p>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <div class="flex items-center gap-3">
            <span
              class="grid size-9 place-items-center rounded-xl bg-future-100 text-future-700 dark:bg-future-950/50 dark:text-future-200"
              ><MapPinned class="size-4"
            /></span>
            <p class="text-sm font-semibold text-ink-900 dark:text-white">
              {{ places.length }} 个共同地点
            </p>
          </div>
          <p class="mt-3 text-sm leading-6 text-ink-500 dark:text-ink-400">
            这里只保存我们主动写下的地点，不会记录一路上的位置变化。
          </p>
        </SurfaceCard>
      </aside>
    </section>

    <MemoryDetailPanel
      v-if="selectedMemoryId"
      :memory-id="selectedMemoryId"
      :timezone="timezone"
      @close="selectedMemoryId = null"
      @edit="openEditor"
      @deleted="handleDeleted"
      @changed="handleChanged"
      @conflict="handleConflict"
    />

    <MemoryEditor
      v-if="editorOpen"
      :memory="editingMemory"
      :tags="tags"
      :places="places"
      :timezone="timezone"
      @close="editorOpen = false"
      @saved="handleSaved"
      @conflict="handleConflict"
      @tag-created="addTag"
      @place-created="addPlace"
    />
  </main>
</template>
