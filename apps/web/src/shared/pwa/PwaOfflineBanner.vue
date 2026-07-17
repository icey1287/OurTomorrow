<script setup lang="ts">
import { WifiOff } from "lucide-vue-next";

import { usePwa } from "@/shared/pwa/pwa";

const pwa = usePwa();
</script>

<template>
  <div
    v-if="!pwa.isOnline.value"
    class="sticky top-16 z-20 flex items-center justify-center gap-2 border-b border-memory-200 bg-memory-50 px-4 py-2 text-xs font-semibold text-memory-800 dark:border-memory-900/60 dark:bg-memory-950/70 dark:text-memory-200 lg:top-0"
    role="status"
  >
    <WifiOff class="size-3.5" />
    当前离线；私密内容不会从缓存展示，恢复网络后会自动重新连接。
  </div>
</template>
