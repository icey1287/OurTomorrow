<script setup lang="ts">
import { RouterView } from "vue-router";

import PwaOfflineBanner from "@/shared/pwa/PwaOfflineBanner.vue";
</script>

<template>
  <div class="min-h-dvh">
    <PwaOfflineBanner />
    <RouterView />
  </div>
</template>
