<script setup lang="ts">
import { ImageOff, LoaderCircle } from "lucide-vue-next";
import { onBeforeUnmount, onMounted, ref, toRef } from "vue";

import { usePrivateMedia } from "@/shared/composables/use-private-media";

const props = withDefaults(
  defineProps<{
    src: string | null | undefined;
    alt: string;
    imageClass?: string;
    retryable?: boolean;
  }>(),
  { imageClass: "h-full w-full object-cover", retryable: true },
);

const host = ref<HTMLElement | null>(null);
const visible = ref(false);
let observer: IntersectionObserver | null = null;

const { objectUrl, isLoading, errorMessage, reload } = usePrivateMedia(
  toRef(props, "src"),
  visible,
);

onMounted(() => {
  if (!("IntersectionObserver" in window)) {
    visible.value = true;
    return;
  }
  observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      visible.value = true;
      observer?.disconnect();
      observer = null;
    },
    { rootMargin: "240px" },
  );
  if (host.value) observer.observe(host.value);
});

onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div ref="host" class="h-full w-full">
    <img
      v-if="objectUrl"
      :src="objectUrl"
      :alt="alt"
      :class="imageClass"
      loading="lazy"
      draggable="false"
    />
    <div
      v-else
      class="grid h-full min-h-32 w-full place-items-center bg-gradient-to-br from-memory-100 to-present-50 text-memory-500 dark:from-memory-950/60 dark:to-ink-900 dark:text-memory-300"
    >
      <LoaderCircle v-if="isLoading" class="size-5 animate-spin" />
      <button
        v-else-if="errorMessage && retryable"
        type="button"
        class="flex flex-col items-center gap-2 px-4 text-center text-xs font-semibold"
        :title="errorMessage"
        @click.stop="reload()"
      >
        <ImageOff class="size-5" />
        重新打开照片
      </button>
      <div
        v-else-if="errorMessage"
        class="flex flex-col items-center gap-2 px-4 text-center text-xs font-semibold"
        :title="errorMessage"
      >
        <ImageOff class="size-5" />
        照片暂时没有打开
      </div>
      <ImageOff v-else class="size-5 opacity-55" aria-hidden="true" />
    </div>
  </div>
</template>
