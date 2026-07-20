<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";

import { stageThreeApi } from "@/shared/api/stage-three";

const props = defineProps<{
  noteId: string;
  alt: string;
}>();

const source = ref<string | null>(null);
const failed = ref(false);
let loadVersion = 0;

function releaseSource() {
  if (source.value) URL.revokeObjectURL(source.value);
  source.value = null;
}

function handleImageError() {
  releaseSource();
  failed.value = true;
}

watch(
  () => props.noteId,
  async (noteId) => {
    loadVersion += 1;
    const version = loadVersion;
    releaseSource();
    failed.value = false;
    try {
      const blob = await stageThreeApi.noteImage(noteId);
      if (version !== loadVersion) return;
      source.value = URL.createObjectURL(blob);
    } catch {
      if (version === loadVersion) failed.value = true;
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  loadVersion += 1;
  releaseSource();
});
</script>

<template>
  <span class="note-image">
    <img v-if="source" :src="source" :alt="alt" @error="handleImageError" />
    <small v-else-if="failed">照片暂时没打开</small>
    <small v-else>正在显影…</small>
  </span>
</template>

<style scoped>
.note-image {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  overflow: hidden;
  background: #eadfc9;
  color: #8a7060;
  font-family: "Kaiti SC", "STKaiti", serif;
}

.note-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.note-image small {
  font-size: 10px;
}
</style>
