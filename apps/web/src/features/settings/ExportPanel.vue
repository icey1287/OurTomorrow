<script setup lang="ts">
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import {
  Archive,
  Download,
  FileArchive,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-vue-next";
import { computed, ref } from "vue";

import {
  stageFiveApi,
  type ExportJobStatus,
  type ExportJobView,
} from "@/shared/api/stage-five";
import BaseButton from "@/shared/components/BaseButton.vue";
import SectionHeading from "@/shared/components/SectionHeading.vue";
import SurfaceCard from "@/shared/components/SurfaceCard.vue";
import { useIdentityStore } from "@/shared/stores/identity";

const identity = useIdentityStore();
const queryClient = useQueryClient();
const confirmed = ref(false);
const format = ref<"ZIP" | "JSON">("ZIP");
const creating = ref(false);
const activeAction = ref<string | null>(null);
const notice = ref<string | null>(null);
const errorMessage = ref<string | null>(null);

const exportsQuery = useQuery({
  queryKey: computed(() => ["exports", identity.role]),
  queryFn: stageFiveApi.exports,
  enabled: computed(() => Boolean(identity.role)),
});

const jobs = computed(() => exportsQuery.data.value ?? []);

const statusCopy: Record<ExportJobStatus, { label: string; classes: string }> =
  {
    QUEUED: {
      label: "等待生成",
      classes: "bg-ink-100 text-ink-600 dark:bg-white/[0.07] dark:text-ink-300",
    },
    RUNNING: {
      label: "正在生成",
      classes:
        "bg-future-100 text-future-700 dark:bg-future-950/50 dark:text-future-200",
    },
    READY: {
      label: "可以下载",
      classes:
        "bg-present-100 text-present-700 dark:bg-present-950/45 dark:text-present-200",
    },
    FAILED: {
      label: "生成失败",
      classes: "bg-red-100 text-red-700 dark:bg-red-950/45 dark:text-red-200",
    },
    EXPIRED: {
      label: "已经过期",
      classes: "bg-ink-100 text-ink-400 dark:bg-white/[0.05] dark:text-ink-500",
    },
  };

function formatTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(value: number | null) {
  if (value === null) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

async function refresh() {
  await exportsQuery.refetch();
}

async function createExport() {
  if (!confirmed.value || creating.value) return;
  creating.value = true;
  notice.value = null;
  errorMessage.value = null;
  try {
    const job = await stageFiveApi.createExport(
      format.value,
      crypto.randomUUID(),
    );
    confirmed.value = false;
    notice.value =
      job.status === "READY" ? "导出已经准备好，可以下载。" : "正在准备导出。";
    await queryClient.invalidateQueries({
      queryKey: ["exports", identity.role],
    });
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "导出没有创建成功。";
  } finally {
    creating.value = false;
  }
}

async function download(job: ExportJobView) {
  if (!job.downloadAvailable || activeAction.value) return;
  activeAction.value = `download:${job.id}`;
  notice.value = null;
  errorMessage.value = null;
  try {
    const blob = await stageFiveApi.downloadExport(job.id);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `our-tomorrow-${job.id}.${job.format.toLowerCase()}`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    notice.value = "导出已交给浏览器下载。请把文件保存在私密位置。";
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "导出没有下载成功。";
  } finally {
    activeAction.value = null;
  }
}

async function remove(job: ExportJobView) {
  if (
    activeAction.value ||
    !window.confirm("立即删除这份导出包吗？删除后需要重新生成。")
  ) {
    return;
  }
  activeAction.value = `delete:${job.id}`;
  notice.value = null;
  errorMessage.value = null;
  try {
    await stageFiveApi.deleteExport(job.id);
    notice.value = "导出包已经删除。";
    await queryClient.invalidateQueries({
      queryKey: ["exports", identity.role],
    });
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "导出包没有删除成功。";
  } finally {
    activeAction.value = null;
  }
}
</script>

<template>
  <SurfaceCard>
    <div class="flex items-start gap-3">
      <span
        class="grid size-10 shrink-0 place-items-center rounded-2xl bg-memory-100 text-memory-700 dark:bg-memory-900/45 dark:text-memory-200"
        ><Archive class="size-4"
      /></span>
      <SectionHeading
        title="完整数据导出"
        description="把你能查看的回忆、照片和资料打包下载；对方尚未揭晓的内容不会被带出。"
      >
        <BaseButton
          size="sm"
          variant="ghost"
          :loading="exportsQuery.isFetching.value"
          @click="refresh"
          ><RefreshCw class="size-4" />刷新</BaseButton
        >
      </SectionHeading>
    </div>

    <div
      class="mt-5 rounded-2xl border border-memory-200 bg-memory-50/60 p-4 dark:border-memory-900/55 dark:bg-memory-950/25"
    >
      <div class="flex items-start gap-3">
        <ShieldCheck
          class="mt-0.5 size-5 shrink-0 text-memory-700 dark:text-memory-300"
        />
        <div>
          <p class="text-sm font-semibold text-ink-900 dark:text-white">
            导出文件本身没有额外密码
          </p>
          <p class="mt-1 text-xs leading-5 text-ink-500 dark:text-ink-400">
            下载后请把它放在只有自己能打开的设备或加密位置。
          </p>
        </div>
      </div>
      <div
        class="mt-4 grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-center"
      >
        <label>
          <span class="field-label">导出格式</span>
          <select v-model="format" class="field-input py-3">
            <option value="ZIP">完整 ZIP（推荐）</option>
            <option value="JSON">仅结构化 JSON</option>
          </select>
        </label>
        <label
          class="flex items-start gap-3 rounded-xl border border-ink-200 bg-white/70 px-4 py-3 text-sm text-ink-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-ink-300"
        >
          <input v-model="confirmed" class="mt-1" type="checkbox" />
          <span>我确认现在要下载一份自己可以查看的私密资料。</span>
        </label>
        <BaseButton
          :loading="creating"
          :disabled="!confirmed"
          @click="createExport"
          ><FileArchive class="size-4" />生成导出</BaseButton
        >
      </div>
    </div>

    <p
      v-if="notice"
      class="mt-4 text-sm text-present-700 dark:text-present-300"
      role="status"
    >
      {{ notice }}
    </p>
    <p
      v-if="errorMessage"
      class="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200"
      role="alert"
    >
      {{ errorMessage }}
    </p>

    <div v-if="jobs.length" class="mt-5 space-y-3">
      <article
        v-for="job in jobs"
        :key="job.id"
        class="rounded-2xl border border-ink-200/80 bg-white/55 p-4 dark:border-white/10 dark:bg-white/[0.03]"
      >
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                :class="statusCopy[job.status].classes"
                >{{ statusCopy[job.status].label }}</span
              >
              <span class="text-xs font-semibold text-ink-400">
                {{ job.format }} · {{ formatBytes(job.fileSize) }}
              </span>
            </div>
            <p class="mt-3 text-sm font-semibold text-ink-900 dark:text-white">
              创建于 {{ formatTime(job.createdAt) }}
            </p>
            <p class="mt-1 text-xs leading-5 text-ink-400">
              过期时间：{{ formatTime(job.expiresAt) }}
            </p>
            <p v-if="job.failureMessage" class="mt-2 text-xs text-red-600">
              {{ job.failureMessage }}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <BaseButton
              size="sm"
              :disabled="!job.downloadAvailable"
              :loading="activeAction === `download:${job.id}`"
              @click="download(job)"
              ><Download class="size-4" />下载</BaseButton
            >
            <BaseButton
              size="sm"
              variant="ghost"
              :loading="activeAction === `delete:${job.id}`"
              @click="remove(job)"
              ><Trash2 class="size-4" />删除</BaseButton
            >
          </div>
        </div>
      </article>
    </div>
    <p v-else class="mt-5 text-sm leading-6 text-ink-400">
      你还没有创建过导出。
    </p>
  </SurfaceCard>
</template>
