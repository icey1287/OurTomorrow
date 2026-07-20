<script setup lang="ts">
import { RouterView } from "vue-router";
</script>

<template>
  <RouterView v-slot="{ Component, route }">
    <Transition :name="route.meta.transitionName ?? 'page'">
      <component :is="Component" :key="route.path" />
    </Transition>
  </RouterView>
</template>
