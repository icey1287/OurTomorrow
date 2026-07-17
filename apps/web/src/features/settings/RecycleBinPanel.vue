<script setup lang="ts">
import type {
  RecycleBinItem,
  RecycleBinResourceType,
} from "@our-tomorrow/contracts";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { RefreshCw, RotateCcw, Trash2 } from "lucide-vue-next";
import { computed, ref } from "vue";

import { stageFiveApi } from "@/shared/api/stage-five";
import BaseButton from "@/shared/components/BaseButton.vue";
import SectionHeading from "@/shared/components/SectionHeading.vue";
import SurfaceCard from "@/shared/components/SurfaceCard.vue";
import { useIdentityStore } from "@/shared/stores/identity";

const identity = useIdentityStore();
const queryClient = useQueryClient();
const typeFilter = ref<"" | RecycleBinResourceType>("");
const activeAction = ref<string | null>(null);
const notice = ref<string | null>(null);
const errorMessage = ref<string | null>(null);

const recycleQuery = useQuery({
  queryKey: computed(() => [
    "recycle-bin",
    identity.role,
    typeFilter.value || null,
  ]),
  queryFn: () =>
    stageFiveApi.recycleBin({
      limit: 100,
      type: typeFilter.value || null,
    }),
  enabled: computed(() => Boolean(identity.role)),
});

const items = computed(() => recycleQuery.data.value?.items ?? []);

const resourceCopy: Record<RecycleBinResourceType, string> = {
  MEMORY: "回忆",
  NOTE: "便利贴",
  WISH: "愿望",
  PLAN: "计划",
  ANNIVERSARY: "纪念日",
  CAPSULE: "时间胶囊",
  PLACE: "地点",
  TAG: "标签",
  MEDIA: "未绑定媒体",
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function refresh() {
  await recycleQuery.refetch();
}

async function restore(item: RecycleBinItem) {
  if (activeAction.value) return;
  activeAction.value = `restore:${item.id}`;
  notice.value = null;
  errorMessage.value = null;
  try {
    await stageFiveApi.restoreRecycleBinItem(item.id);
    notice.value = `${resourceCopy[item.resourceType]}已经恢复。`;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["recycle-bin"] }),
      queryClient.invalidateQueries({ queryKey: ["memories"] }),
      queryClient.invalidateQueries({ queryKey: ["notes"] }),
      queryClient.invalidateQueries({ queryKey: ["wishes"] }),
      queryClient.invalidateQueries({ queryKey: ["plans"] }),
      queryClient.invalidateQueries({ queryKey: ["anniversaries"] }),
      queryClient.invalidateQueries({ queryKey: ["capsules"] }),
      queryClient.invalidateQueries({ queryKey: ["places"] }),
      queryClient.invalidateQueries({ queryKey: ["tags"] }),
      queryClient.invalidateQueries({ queryKey: ["today"] }),
    ]);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "内容没有恢复成功。";
  } finally {
    activeAction.value = null;
  }
}

async function requestPurge(item: RecycleBinItem) {
  if (
    activeAction.value ||
    !window.confirm(
      `申请永久删除这条${resourceCopy[item.resourceType]}吗？系统仍会等到保留期结束后再物理清理。`,
    )
  ) {
    return;
  }
  activeAction.value = `purge:${item.id}`;
  notice.value = null;
  errorMessage.value = null;
  try {
    await stageFiveApi.requestRecycleBinPurge(item.id);
    notice.value = "永久删除申请已经保存；在保留期结束前仍可恢复。";
    await queryClient.invalidateQueries({ queryKey: ["recycle-bin"] });
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "永久删除申请没有保存成功。";
  } finally {
    activeAction.value = null;
  }
}
</script>

<template>
  <SurfaceCard>
    <div class="flex items-start gap-3">
      <span
        class="grid size-10 shrink-0 place-items-center rounded-2xl bg-ink-100 text-ink-600 dark:bg-white/[0.07] dark:text-ink-300"
        ><Trash2 class="size-4"
      /></span>
      <SectionHeading
        title="回收站"
        description="删除内容先保留 30 天。恢复会还原必要的状态、关联和定时任务，不会只把 deletedAt 清空。"
      >
        <BaseButton
          size="sm"
          variant="ghost"
          :loading="recycleQuery.isFetching.value"
          @click="refresh"
          ><RefreshCw class="size-4" />刷新</BaseButton
        >
      </SectionHeading>
    </div>

    <label class="mt-5 block max-w-xs">
      <span class="field-label">内容类型</span>
      <select v-model="typeFilter" class="field-input py-3">
        <option value="">全部</option>
        <option
          v-for="(label, value) in resourceCopy"
          :key="value"
          :value="value"
        >
          {{ label }}
        </option>
      </select>
    </label>

    <p
      v-if="notice"
      class="mt-4 text-sm text-present-700 dark:text-present-300"
      role="status"
    >
      {{ notice }}
    </p>
    <p
      v-if="errorMessage || recycleQuery.isError.value"
      class="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200"
      role="alert"
    >
      {{
        errorMessage ||
        (recycleQuery.error.value instanceof Error
          ? recycleQuery.error.value.message
          : "回收站没有加载成功。")
      }}
    </p>

    <div v-if="items.length" class="mt-5 space-y-3">
      <article
        v-for="item in items"
        :key="item.id"
        class="rounded-2xl border border-ink-200/80 bg-white/55 p-4 dark:border-white/10 dark:bg-white/[0.03]"
      >
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-semibold text-ink-600 dark:bg-white/[0.07] dark:text-ink-300"
              >
                {{ resourceCopy[item.resourceType] }}
              </span>
              <span
                v-if="item.visibility === 'OWNER_ONLY'"
                class="rounded-full bg-future-50 px-2.5 py-1 text-[11px] font-semibold text-future-700 dark:bg-future-950/40 dark:text-future-200"
                >仅当前身份</span
              >
              <span
                v-if="item.status === 'PURGE_PENDING'"
                class="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 dark:bg-red-950/35 dark:text-red-200"
                >已申请永久删除</span
              >
            </div>
            <p class="mt-3 text-sm font-semibold text-ink-900 dark:text-white">
              删除于 {{ formatTime(item.deletedAt) }}
            </p>
            <p class="mt-1 text-xs leading-5 text-ink-400">
              保留至 {{ formatTime(item.retentionUntil) }} · 资源
              {{ item.resourceId.slice(0, 8) }}…
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <BaseButton
              size="sm"
              :loading="activeAction === `restore:${item.id}`"
              @click="restore(item)"
              ><RotateCcw class="size-4" />恢复</BaseButton
            >
            <BaseButton
              size="sm"
              variant="ghost"
              :loading="activeAction === `purge:${item.id}`"
              :disabled="item.status === 'PURGE_PENDING'"
              @click="requestPurge(item)"
              ><Trash2 class="size-4" />永久删除</BaseButton
            >
          </div>
        </div>
      </article>
    </div>
    <p v-else class="mt-5 text-sm leading-6 text-ink-400">
      这里现在是空的。删除内容后，仍有一段时间可以反悔。
    </p>
  </SurfaceCard>
</template>
