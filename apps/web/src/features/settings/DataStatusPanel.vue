<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import {
  Activity,
  DatabaseBackup,
  HardDrive,
  RefreshCw,
  ShieldCheck,
} from "lucide-vue-next";
import { computed } from "vue";

import { stageFiveApi } from "@/shared/api/stage-five";
import BaseButton from "@/shared/components/BaseButton.vue";
import SectionHeading from "@/shared/components/SectionHeading.vue";
import SurfaceCard from "@/shared/components/SurfaceCard.vue";
import { useIdentityStore } from "@/shared/stores/identity";

const identity = useIdentityStore();
const statusQuery = useQuery({
  queryKey: computed(() => ["data-status", identity.role]),
  queryFn: stageFiveApi.dataStatus,
  enabled: computed(() => Boolean(identity.role)),
});

const status = computed(() => statusQuery.data.value ?? null);
const backupCopy = computed(() => {
  if (status.value?.backup.status === "HEALTHY") {
    return {
      label: "最近备份正常",
      classes:
        "bg-present-100 text-present-700 dark:bg-present-950/45 dark:text-present-200",
    };
  }
  if (status.value?.backup.status === "STALE") {
    return {
      label: "备份已过期",
      classes: "bg-red-100 text-red-700 dark:bg-red-950/45 dark:text-red-200",
    };
  }
  return {
    label: "尚无备份状态",
    classes: "bg-ink-100 text-ink-500 dark:bg-white/[0.07] dark:text-ink-300",
  };
});
const workerLabel = computed(() => {
  const value = status.value?.worker.status;
  if (value === "HEALTHY") return "Worker 正常";
  if (value === "STALE") return "Worker 心跳过期";
  if (value === "STOPPED") return "Worker 已停止";
  return "Worker 状态未知";
});

function formatTime(value: string | null | undefined) {
  if (!value) return "尚未记录";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(value: string | null | undefined) {
  if (!value) return "不可用";
  let bytes = Number(value);
  if (!Number.isFinite(bytes)) return "不可用";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unit = 0;
  while (bytes >= 1024 && unit < units.length - 1) {
    bytes /= 1024;
    unit += 1;
  }
  return `${bytes >= 10 || unit === 0 ? bytes.toFixed(0) : bytes.toFixed(1)} ${units[unit]}`;
}
</script>

<template>
  <SurfaceCard>
    <div class="flex items-start gap-3">
      <span
        class="grid size-10 shrink-0 place-items-center rounded-2xl bg-present-100 text-present-700 dark:bg-present-900/45 dark:text-present-200"
        ><ShieldCheck class="size-4"
      /></span>
      <SectionHeading
        title="数据与运行状态"
        description="这里只展示非敏感健康信息，不返回备份仓库、文件路径或部署凭据。"
      >
        <BaseButton
          size="sm"
          variant="ghost"
          :loading="statusQuery.isFetching.value"
          @click="statusQuery.refetch()"
          ><RefreshCw class="size-4" />刷新</BaseButton
        >
      </SectionHeading>
    </div>

    <p
      v-if="statusQuery.isError.value"
      class="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200"
      role="alert"
    >
      {{
        statusQuery.error.value instanceof Error
          ? statusQuery.error.value.message
          : "运行状态没有加载成功。"
      }}
    </p>

    <div v-else class="mt-5 grid gap-3 sm:grid-cols-2">
      <article
        class="rounded-2xl border border-ink-200/80 bg-white/55 p-4 dark:border-white/10 dark:bg-white/[0.03]"
      >
        <div class="flex items-center justify-between gap-3">
          <DatabaseBackup class="size-5 text-memory-600 dark:text-memory-300" />
          <span
            class="rounded-full px-2.5 py-1 text-[11px] font-semibold"
            :class="backupCopy.classes"
            >{{ backupCopy.label }}</span
          >
        </div>
        <p class="mt-4 text-sm font-semibold text-ink-900 dark:text-white">
          最近成功：{{ formatTime(status?.backup.lastSuccessAt) }}
        </p>
        <p class="mt-1 text-xs leading-5 text-ink-400">
          允许最大间隔
          {{ Math.round((status?.backup.maxAgeSeconds ?? 0) / 3600) }}
          小时
        </p>
      </article>

      <article
        class="rounded-2xl border border-ink-200/80 bg-white/55 p-4 dark:border-white/10 dark:bg-white/[0.03]"
      >
        <HardDrive class="size-5 text-present-600 dark:text-present-300" />
        <p class="mt-4 text-sm font-semibold text-ink-900 dark:text-white">
          私有媒体存储：{{ status?.storage.available ? "可用" : "不可用" }}
        </p>
        <p class="mt-1 text-xs leading-5 text-ink-400">
          可用空间 {{ formatBytes(status?.storage.freeBytes) }}
        </p>
      </article>

      <article
        class="rounded-2xl border border-ink-200/80 bg-white/55 p-4 dark:border-white/10 dark:bg-white/[0.03]"
      >
        <Activity class="size-5 text-future-600 dark:text-future-300" />
        <p class="mt-4 text-sm font-semibold text-ink-900 dark:text-white">
          {{ workerLabel }} · 持久任务
          {{ status?.queues.scheduledPending ?? 0 }}
          · 失败
          {{ status?.queues.scheduledFailed ?? 0 }}
        </p>
        <p class="mt-1 text-xs leading-5 text-ink-400">
          实时事件 {{ status?.queues.outboxPending ?? 0 }} · 失败
          {{ status?.queues.outboxFailed ?? 0 }}
        </p>
      </article>

      <article
        class="rounded-2xl border border-ink-200/80 bg-white/55 p-4 dark:border-white/10 dark:bg-white/[0.03]"
      >
        <ShieldCheck class="size-5 text-ink-500 dark:text-ink-300" />
        <p class="mt-4 text-sm font-semibold text-ink-900 dark:text-white">
          回收站保留 {{ status?.recycleBin.retentionDays ?? 30 }} 天
        </p>
        <p class="mt-1 text-xs leading-5 text-ink-400">
          导出包保留 {{ status?.exports.retentionDays ?? 7 }} 天，之后自动失效。
        </p>
      </article>
    </div>
  </SurfaceCard>
</template>
