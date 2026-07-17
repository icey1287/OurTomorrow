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
    现在没有网络，恢复连接后再回来看看。
  </div>
</template>
