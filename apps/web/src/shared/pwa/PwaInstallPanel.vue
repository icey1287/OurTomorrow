<script setup lang="ts">
import { CheckCircle2, Download, RefreshCw, WifiOff } from "lucide-vue-next";
import { ref } from "vue";

import { usePwa } from "@/shared/pwa/pwa";
import BaseButton from "@/shared/components/BaseButton.vue";
import SectionHeading from "@/shared/components/SectionHeading.vue";
import SurfaceCard from "@/shared/components/SurfaceCard.vue";

const pwa = usePwa();
const installing = ref(false);
const notice = ref<string | null>(null);

async function install() {
  if (installing.value) return;
  installing.value = true;
  notice.value = null;
  const outcome = await pwa.install();
  notice.value =
    outcome === "accepted"
      ? "安装请求已经交给系统。"
      : outcome === "dismissed"
        ? "这次没有安装，之后仍可再试。"
        : "当前浏览器会在满足条件时显示安装入口。";
  installing.value = false;
}
</script>

<template>
  <SurfaceCard>
    <div class="flex items-start gap-3">
      <span
        class="grid size-10 shrink-0 place-items-center rounded-2xl bg-present-100 text-present-700 dark:bg-present-950/45 dark:text-present-200"
      >
        <Download class="size-4" />
      </span>
      <SectionHeading
        title="安装到这台设备"
        description="PWA 只离线保存应用外壳。API、媒体、正文和导出始终实时从服务器读取，不进入离线缓存。"
      />
    </div>

    <div
      class="mt-5 flex flex-col gap-4 rounded-2xl border border-ink-200/80 bg-white/55 p-4 dark:border-white/10 dark:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="flex items-start gap-3">
        <CheckCircle2
          v-if="pwa.isInstalled.value"
          class="mt-0.5 size-5 text-present-600"
        />
        <WifiOff v-else class="mt-0.5 size-5 text-ink-400" />
        <div>
          <p class="text-sm font-semibold text-ink-900 dark:text-white">
            {{
              pwa.isInstalled.value
                ? "已作为应用运行"
                : pwa.canInstall.value
                  ? "可以安装"
                  : "等待浏览器提供安装入口"
            }}
          </p>
          <p class="mt-1 text-xs leading-5 text-ink-400">
            离线时可以打开界面，但任何私密数据都需要重新联网加载。
          </p>
        </div>
      </div>
      <BaseButton
        v-if="!pwa.isInstalled.value"
        size="sm"
        :disabled="!pwa.canInstall.value"
        :loading="installing"
        @click="install"
      >
        <RefreshCw v-if="!pwa.canInstall.value" class="size-4" />
        <Download v-else class="size-4" />安装明天
      </BaseButton>
    </div>
    <p v-if="notice" class="mt-4 text-sm text-present-700" role="status">
      {{ notice }}
    </p>
  </SurfaceCard>
</template>
