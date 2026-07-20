<script setup lang="ts">
import { WifiOff } from "lucide-vue-next";

import { usePwa } from "@/shared/pwa/pwa";

const pwa = usePwa();
</script>

<template>
  <div v-if="!pwa.isOnline.value" class="offline-ribbon" role="status">
    <WifiOff class="size-3.5" />
    现在没有网络，恢复连接后再回来看看。
  </div>
</template>

<style scoped>
.offline-ribbon {
  position: sticky;
  z-index: 90;
  top: 0;
  display: flex;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-bottom: 1px dashed rgb(105 74 55 / 0.2);
  background: #ead6ba;
  padding: 7px 14px;
  color: #795548;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 11px;
  font-weight: 700;
  box-shadow: 0 3px 8px rgb(70 45 31 / 0.07);
}
</style>
