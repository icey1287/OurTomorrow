<script setup lang="ts">
import type {
  MediaAssetSummary,
  WishCategory,
  WishDetail,
  WishStatus,
} from "@our-tomorrow/contracts";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/vue-query";
import {
  ArrowRight,
  CalendarClock,
  Filter,
  MapPin,
  Plus,
  Search,
  Sparkles,
} from "lucide-vue-next";
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";

import WishDetailView from "@/features/tomorrow/WishDetail.vue";
import WishEditor, {
  type WishEditorMode,
  type WishEditorSubmission,
} from "@/features/tomorrow/WishEditor.vue";
import TomorrowNotice from "@/features/tomorrow/TomorrowNotice.vue";
import TomorrowPanel from "@/features/tomorrow/TomorrowPanel.vue";
import {
  formatInstant,
  operationKey,
  roleIsCurrent,
  WISH_CATEGORIES,
  WISH_STATUSES,
  wishCategoryMeta,
  wishStatusLabel,
} from "@/features/tomorrow/tomorrow-utils";
import { ApiClientError } from "@/shared/api/client";
import { stageFourApi } from "@/shared/api/stage-four";
import { stageTwoApi } from "@/shared/api/stage-two";
import AsyncState from "@/shared/components/AsyncState.vue";
import BaseButton from "@/shared/components/BaseButton.vue";
import SectionHeading from "@/shared/components/SectionHeading.vue";
import SurfaceCard from "@/shared/components/SurfaceCard.vue";
import { useIdentityStore } from "@/shared/stores/identity";

const props = defineProps<{ requestCreate: boolean }>();
const emit = defineEmits<{ createConsumed: [] }>();

const identity = useIdentityStore();
const queryClient = useQueryClient();
const filtersOpen = ref(false);
const searchInput = ref("");
const searchQuery = ref("");
const selectedWishId = ref<string | null>(null);
const editorMode = ref<WishEditorMode | null>(null);
const editorWish = ref<WishDetail | null>(null);
const editorPending = ref(false);
const editorError = ref<string | null>(null);
const actionPending = ref<string | null>(null);
const actionError = ref<string | null>(null);
const notice = ref<string | null>(null);
let searchTimer: ReturnType<typeof setTimeout> | null = null;

const filters = reactive({
  status: "" as "" | WishStatus,
  category: "" as "" | WishCategory,
  placeId: "",
});

watch(searchInput, (value) => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchQuery.value = value.trim();
  }, 300);
});

watch(
  () => props.requestCreate,
  (requested) => {
    if (!requested) return;
    openCreate();
    emit("createConsumed");
  },
  { immediate: true },
);

watch(
  () => identity.role,
  () => {
    selectedWishId.value = null;
    editorMode.value = null;
    editorWish.value = null;
    editorError.value = null;
    actionError.value = null;
    notice.value = null;
  },
);

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
});

const normalizedFilters = computed(() => ({
  limit: 12,
  status: filters.status || null,
  category: filters.category || null,
  placeId: filters.placeId || null,
  query: searchQuery.value || null,
}));

const wishesQuery = useInfiniteQuery({
  queryKey: computed(() => ["wishes", identity.role, normalizedFilters.value]),
  queryFn: ({ pageParam }) =>
    stageFourApi.wishes({
      ...normalizedFilters.value,
      cursor: pageParam,
    }),
  initialPageParam: null as string | null,
  getNextPageParam: (lastPage) => lastPage.meta.nextCursor ?? undefined,
  enabled: computed(() => Boolean(identity.role)),
});

const placesQuery = useQuery({
  queryKey: computed(() => ["places", identity.role]),
  queryFn: stageTwoApi.places,
  enabled: computed(() => Boolean(identity.role)),
});

const detailQuery = useQuery({
  queryKey: computed(() => ["wish", identity.role, selectedWishId.value]),
  queryFn: () => stageFourApi.wish(selectedWishId.value!),
  enabled: computed(() => Boolean(identity.role && selectedWishId.value)),
});

const wishes = computed(
  () => wishesQuery.data.value?.pages.flatMap((page) => page.items) ?? [],
);
const places = computed(() => placesQuery.data.value ?? []);
const timezone = computed(() => identity.couple?.timezone ?? "Asia/Shanghai");
const selectedWish = computed(() => detailQuery.data.value ?? null);
const appliedFilterCount = computed(
  () =>
    [
      filters.status,
      filters.category,
      filters.placeId,
      searchQuery.value,
    ].filter(Boolean).length,
);
const listError = computed(() => {
  const error = wishesQuery.error.value;
  return error instanceof Error
    ? error.message
    : "愿望清单暂时没有打开，请稍后再试。";
});

function currentRole(startRole: "boy" | "girl") {
  return roleIsCurrent(startRole, identity.role);
}

function openCreate() {
  editorWish.value = null;
  editorMode.value = "create";
  editorError.value = null;
}

function openEditor(mode: WishEditorMode) {
  const wish = selectedWish.value;
  if (!wish) return;
  editorWish.value = wish;
  editorMode.value = mode;
  editorError.value = null;
}

function closeEditor() {
  if (editorPending.value) return;
  editorMode.value = null;
  editorWish.value = null;
  editorError.value = null;
}

function resetFilters() {
  filters.status = "";
  filters.category = "";
  filters.placeId = "";
  searchInput.value = "";
  searchQuery.value = "";
}

function conflictMessage(error: unknown, action: string) {
  if (
    error instanceof ApiClientError &&
    [
      "STATE_CONFLICT",
      "STATE_TRANSITION_INVALID",
      "PRECONDITION_REQUIRED",
      "CONTENT_LOCKED",
    ].includes(error.code)
  ) {
    void detailQuery.refetch();
    void queryClient.invalidateQueries({
      queryKey: ["wishes", identity.role],
    });
    return `愿望刚刚在另一处发生变化，已读取最新状态；请确认后再${action}。`;
  }
  return error instanceof Error ? error.message : `愿望没有${action}成功。`;
}

async function refreshWishDomain(role: "boy" | "girl") {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["wishes", role] }),
    queryClient.invalidateQueries({ queryKey: ["wish-options", role] }),
    queryClient.invalidateQueries({ queryKey: ["plans", role] }),
    queryClient.invalidateQueries({ queryKey: ["places-map", role] }),
    queryClient.invalidateQueries({ queryKey: ["places", role] }),
    queryClient.invalidateQueries({ queryKey: ["capsules", role] }),
    queryClient.invalidateQueries({ queryKey: ["memories", role] }),
    queryClient.invalidateQueries({ queryKey: ["upcoming", role] }),
    queryClient.invalidateQueries({ queryKey: ["today", role] }),
    queryClient.invalidateQueries({ queryKey: ["notifications", role] }),
  ]);
}

function cacheWish(wish: WishDetail, role: "boy" | "girl") {
  if (!currentRole(role)) return;
  queryClient.setQueryData(["wish", role, wish.id], wish);
}

async function uploadFiles(files: File[], role: "boy" | "girl") {
  const assets: MediaAssetSummary[] = [];
  for (const file of files) {
    if (!currentRole(role)) return null;
    const intent = await stageTwoApi.createUploadIntent({
      originalName: file.name,
      mimeType: file.type as "image/jpeg" | "image/png" | "image/webp",
      size: file.size,
    });
    if (!currentRole(role)) return null;
    await stageTwoApi.uploadBinary(intent.uploadUrl, file, file.type);
    if (!currentRole(role)) return null;
    const asset = await stageTwoApi.completeUpload(intent.uploadId);
    if (!currentRole(role)) return null;
    assets.push(asset);
  }
  return assets;
}

async function handleEditorSubmit(submission: WishEditorSubmission) {
  if (editorPending.value) return;
  const startRole = identity.role;
  if (!startRole) return;
  editorPending.value = true;
  editorError.value = null;
  let uploaded: MediaAssetSummary[] = [];
  let domainSaved = false;
  try {
    let saved: WishDetail;
    if (submission.mode === "create") {
      saved = await stageFourApi.createWish(submission.input);
    } else if (submission.mode === "edit") {
      saved = await stageFourApi.updateWish(submission.id, submission.input);
    } else if (submission.mode === "plan") {
      saved = await stageFourApi.planWish(submission.id, submission.input);
    } else if (submission.mode === "complete") {
      const result = await uploadFiles(submission.files, startRole);
      if (!result || !currentRole(startRole)) return;
      uploaded = result;
      const existing = editorWish.value?.media.map((asset) => asset.id) ?? [];
      saved = await stageFourApi.completeWish(submission.id, {
        ...submission.input,
        mediaIds: [
          ...new Set([...existing, ...uploaded.map((asset) => asset.id)]),
        ],
      });
    } else {
      if (!currentRole(startRole)) return;
      await stageFourApi.convertWishToMemory(
        submission.id,
        submission.input,
        operationKey("wish-to-memory"),
      );
      if (!currentRole(startRole)) return;
      const refreshed = await stageFourApi.wish(submission.id);
      if (!currentRole(startRole)) return;
      saved = refreshed;
    }
    domainSaved = true;
    if (!currentRole(startRole)) return;
    cacheWish(saved, startRole);
    selectedWishId.value = saved.id;
    editorMode.value = null;
    editorWish.value = null;
    notice.value =
      submission.mode === "convert"
        ? "这件未来已经完整地进入记录。"
        : submission.mode === "complete"
          ? "愿望已经完成；随时可以把它写进记录。"
          : "愿望已经保存。";
    await refreshWishDomain(startRole);
  } catch (error) {
    if (!currentRole(startRole)) return;
    const outcomeUnknown =
      error instanceof ApiClientError &&
      (error.code === "NETWORK_ERROR" || error.status >= 500);
    if (uploaded.length && !domainSaved && !outcomeUnknown) {
      await Promise.allSettled(
        uploaded.map((asset) => stageTwoApi.deleteMedia(asset.id)),
      );
    }
    editorError.value = conflictMessage(error, "保存");
  } finally {
    editorPending.value = false;
  }
}

async function runWishAction(
  action: "start" | "reopen" | "progress" | "delete",
  payload?: string | null,
) {
  const wish = selectedWish.value;
  const startRole = identity.role;
  if (!wish || !startRole || actionPending.value) return;
  if (
    action === "delete" &&
    !window.confirm("把这个愿望移入回收站吗？关联计划也会一起结束。")
  ) {
    return;
  }
  actionPending.value = action;
  actionError.value = null;
  try {
    let saved: WishDetail | null = null;
    if (action === "start") {
      saved = await stageFourApi.startWish(wish.id, {
        version: wish.version,
      });
    } else if (action === "reopen") {
      saved = await stageFourApi.reopenWish(wish.id, {
        version: wish.version,
        note: payload || null,
      });
    } else if (action === "progress") {
      await stageFourApi.addWishUpdate(wish.id, { note: payload ?? "" });
      if (!currentRole(startRole)) return;
      saved = await stageFourApi.wish(wish.id);
    } else {
      await stageFourApi.deleteWish(wish.id, wish.version);
    }
    if (!currentRole(startRole)) return;
    if (saved) cacheWish(saved, startRole);
    else selectedWishId.value = null;
    notice.value =
      action === "start"
        ? "愿望开始实现了。"
        : action === "reopen"
          ? "愿望已重新回到进行中。"
          : action === "progress"
            ? "这点进展已经留下。"
            : "愿望已移入回收站。";
    await refreshWishDomain(startRole);
  } catch (error) {
    if (!currentRole(startRole)) return;
    actionError.value = conflictMessage(
      error,
      action === "delete" ? "删除" : "更新",
    );
  } finally {
    actionPending.value = null;
  }
}
</script>

<template>
  <section aria-labelledby="wish-board-heading">
    <SectionHeading
      title="明天清单"
      description="从一个轻轻写下的想法，走到真正发生，再完整回到记录。"
    >
      <BaseButton size="sm" @click="openCreate">
        <Plus class="size-4" />新愿望
      </BaseButton>
    </SectionHeading>

    <TomorrowNotice class="mt-4" :message="notice" @close="notice = null" />

    <div class="mt-4 space-y-3">
      <div class="flex flex-col gap-3 sm:flex-row">
        <label class="relative flex-1">
          <span class="sr-only">搜索愿望</span>
          <Search
            class="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-400"
          />
          <input
            v-model="searchInput"
            class="field-input pl-11"
            type="search"
            maxlength="100"
            placeholder="搜索愿望标题和期待"
          />
        </label>
        <BaseButton variant="secondary" @click="filtersOpen = !filtersOpen">
          <Filter class="size-4" />筛选
          <span
            v-if="appliedFilterCount"
            class="rounded-full bg-future-100 px-2 py-0.5 text-xs text-future-700 dark:bg-future-950/60 dark:text-future-200"
          >
            {{ appliedFilterCount }}
          </span>
        </BaseButton>
      </div>
      <SurfaceCard v-if="filtersOpen">
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label class="field-label" for="wish-filter-status">状态</label>
            <select
              id="wish-filter-status"
              v-model="filters.status"
              class="field-input py-3"
            >
              <option value="">全部状态</option>
              <option
                v-for="option in WISH_STATUSES"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </div>
          <div>
            <label class="field-label" for="wish-filter-category">分类</label>
            <select
              id="wish-filter-category"
              v-model="filters.category"
              class="field-input py-3"
            >
              <option value="">全部分类</option>
              <option
                v-for="option in WISH_CATEGORIES"
                :key="option.value"
                :value="option.value"
              >
                {{ option.emoji }} {{ option.label }}
              </option>
            </select>
          </div>
          <div>
            <label class="field-label" for="wish-filter-place">地点</label>
            <select
              id="wish-filter-place"
              v-model="filters.placeId"
              class="field-input py-3"
            >
              <option value="">全部地点</option>
              <option v-for="place in places" :key="place.id" :value="place.id">
                {{ place.name }}
              </option>
            </select>
          </div>
        </div>
        <div class="mt-4 flex justify-end">
          <BaseButton variant="ghost" size="sm" @click="resetFilters">
            清除筛选
          </BaseButton>
        </div>
      </SurfaceCard>
    </div>

    <AsyncState
      v-if="wishesQuery.isPending.value"
      class="mt-4"
      state="loading"
      title="正在翻开明天清单…"
    />
    <AsyncState
      v-else-if="wishesQuery.isError.value"
      class="mt-4"
      state="error"
      title="愿望清单没有顺利打开"
      :message="listError"
      action-label="重新加载"
      @action="wishesQuery.refetch()"
    />
    <AsyncState
      v-else-if="wishes.length === 0"
      class="mt-4"
      state="empty"
      :title="
        appliedFilterCount
          ? '没有找到符合条件的愿望。'
          : '把一个还没发生的期待，先放在这里。'
      "
      :message="
        appliedFilterCount
          ? '试试换一个状态或分类。'
          : '它可以只是一家想去的店、一次散步，或一段很远的旅行。'
      "
      :action-label="appliedFilterCount ? '清除筛选' : '写下第一个愿望'"
      @action="appliedFilterCount ? resetFilters() : openCreate()"
    />
    <div v-else class="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <button
        v-for="wish in wishes"
        :key="wish.id"
        type="button"
        class="surface-interactive group p-5 text-left sm:p-6"
        @click="selectedWishId = wish.id"
      >
        <div class="flex items-start justify-between gap-3">
          <span
            class="grid size-11 place-items-center rounded-2xl bg-future-100 text-xl dark:bg-future-950/55"
          >
            {{ wishCategoryMeta(wish.category).emoji }}
          </span>
          <span
            class="rounded-full bg-ink-100 px-3 py-1 text-[11px] font-semibold text-ink-500 dark:bg-white/[0.07] dark:text-ink-300"
          >
            {{ wishStatusLabel(wish.status) }}
          </span>
        </div>
        <h3
          class="mt-5 font-display text-xl font-semibold text-ink-950 dark:text-white"
        >
          {{ wish.title }}
        </h3>
        <p
          class="mt-2 line-clamp-3 min-h-[3.75rem] text-sm leading-6 text-ink-500 dark:text-ink-400"
        >
          {{
            wish.expectation ||
            wish.description ||
            "这件未来还等着你们慢慢补全。"
          }}
        </p>
        <div
          class="mt-5 flex items-center justify-between gap-3 text-xs text-ink-400"
        >
          <span class="inline-flex min-w-0 items-center gap-1.5 truncate">
            <MapPin class="size-3.5 shrink-0" />
            {{ wish.place?.name || wish.plan?.place?.name || "地点待定" }}
          </span>
          <span class="inline-flex shrink-0 items-center gap-1.5">
            <CalendarClock class="size-3.5" />
            {{ formatInstant(wish.completedAt || wish.plannedFor, timezone) }}
          </span>
        </div>
        <span
          class="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-future-700 dark:text-future-300"
        >
          打开愿望<ArrowRight
            class="size-4 transition group-hover:translate-x-0.5 motion-reduce:transition-none"
          />
        </span>
      </button>
    </div>

    <div v-if="wishesQuery.hasNextPage.value" class="mt-5 text-center">
      <BaseButton
        variant="secondary"
        :loading="wishesQuery.isFetchingNextPage.value"
        @click="wishesQuery.fetchNextPage()"
      >
        加载更多愿望
      </BaseButton>
    </div>

    <TomorrowPanel
      :open="Boolean(selectedWishId) && !editorMode"
      eyebrow="Wish · 愿望"
      :title="selectedWish?.title || '打开愿望'"
      wide
      @close="selectedWishId = null"
    >
      <AsyncState
        v-if="detailQuery.isPending.value"
        state="loading"
        title="正在打开这个愿望…"
      />
      <AsyncState
        v-else-if="detailQuery.isError.value || !selectedWish"
        state="error"
        title="愿望没有顺利打开"
        :message="
          detailQuery.error.value instanceof Error
            ? detailQuery.error.value.message
            : '请稍后再试。'
        "
        action-label="重新加载"
        @action="detailQuery.refetch()"
      />
      <WishDetailView
        v-else
        :wish="selectedWish"
        :timezone="timezone"
        :pending-action="actionPending"
        :error="actionError"
        @edit="openEditor('edit')"
        @plan="openEditor('plan')"
        @complete="openEditor('complete')"
        @convert="openEditor('convert')"
        @start="runWishAction('start')"
        @reopen="runWishAction('reopen', $event)"
        @progress="runWishAction('progress', $event)"
        @delete="runWishAction('delete')"
      />
    </TomorrowPanel>

    <TomorrowPanel
      :open="Boolean(editorMode)"
      :eyebrow="editorMode === 'convert' ? 'Future → Remember' : 'Wish · 愿望'"
      :title="
        editorMode === 'create'
          ? '写下一件想一起实现的事'
          : editorMode === 'edit'
            ? '编辑愿望'
            : editorMode === 'plan'
              ? '把期待变成轻量计划'
              : editorMode === 'complete'
                ? '这件未来已经发生了'
                : '把它写进记录'
      "
      @close="closeEditor"
    >
      <WishEditor
        v-if="editorMode"
        :mode="editorMode"
        :wish="editorWish"
        :places="places"
        :timezone="timezone"
        :pending="editorPending"
        :error="editorError"
        @submit="handleEditorSubmit"
      />
    </TomorrowPanel>
  </section>
</template>
