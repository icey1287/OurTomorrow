<script setup lang="ts">
import { X } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";

import { stageThreeApi } from "@/shared/api/stage-three";

import { noteImageOrientation, type NoteImageOrientation } from "./note-image";

const props = withDefaults(
  defineProps<{
    noteId: string;
    alt: string;
    previewable?: boolean;
  }>(),
  { previewable: false },
);

const source = ref<string | null>(null);
const failed = ref(false);
const orientation = ref<NoteImageOrientation | null>(null);
const dimensions = ref<{ width: number; height: number } | null>(null);
const viewerOpen = ref(false);
const trigger = ref<HTMLElement | null>(null);
const viewerCloseButton = ref<HTMLButtonElement | null>(null);
let loadVersion = 0;

const imageStyle = computed(() =>
  dimensions.value
    ? {
        "--note-image-aspect": `${dimensions.value.width} / ${dimensions.value.height}`,
      }
    : undefined,
);

function closeViewer(restoreFocus = true) {
  if (!viewerOpen.value) return;
  viewerOpen.value = false;
  if (restoreFocus) void nextTick(() => trigger.value?.focus());
}

function releaseSource() {
  closeViewer(false);
  if (source.value) URL.revokeObjectURL(source.value);
  source.value = null;
  orientation.value = null;
  dimensions.value = null;
}

function handleImageError() {
  releaseSource();
  failed.value = true;
}

function handleImageLoad(event: Event) {
  const image = event.currentTarget as HTMLImageElement;
  if (!image.naturalWidth || !image.naturalHeight) return;
  dimensions.value = {
    width: image.naturalWidth,
    height: image.naturalHeight,
  };
  orientation.value = noteImageOrientation(
    image.naturalWidth,
    image.naturalHeight,
  );
}

function handleActivate(event: MouseEvent) {
  if (!props.previewable || !source.value) return;
  event.stopPropagation();
  viewerOpen.value = true;
  void nextTick(() => viewerCloseButton.value?.focus());
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
  <component
    :is="previewable ? 'button' : 'span'"
    ref="trigger"
    class="note-image"
    :class="{
      'is-ready': source && dimensions,
      'is-previewable': previewable,
    }"
    :type="previewable ? 'button' : undefined"
    :disabled="previewable ? !source : undefined"
    :aria-label="previewable ? `查看${alt}原图` : undefined"
    :data-orientation="orientation || 'loading'"
    :style="imageStyle"
    @click="handleActivate"
  >
    <img
      v-if="source"
      :src="source"
      :alt="alt"
      draggable="false"
      @load="handleImageLoad"
      @error="handleImageError"
    />
    <small v-else-if="failed">照片暂时没打开</small>
    <small v-else>正在显影…</small>
  </component>

  <Teleport to="body">
    <Transition name="photo-viewer-transition">
      <div
        v-if="viewerOpen && source"
        class="photo-viewer-backdrop"
        role="presentation"
        @click.self="closeViewer()"
      >
        <section
          class="photo-viewer"
          role="dialog"
          aria-modal="true"
          aria-label="照片原图"
          @keydown.esc.stop="closeViewer()"
        >
          <header>
            <div>
              <small>LOVE NOTE · ORIGINAL PHOTO</small>
              <strong>照片原图</strong>
            </div>
            <button
              ref="viewerCloseButton"
              type="button"
              aria-label="关闭照片原图"
              @click="closeViewer()"
            >
              <X class="size-5" aria-hidden="true" />
            </button>
          </header>

          <div class="photo-viewer-canvas">
            <img :src="source" :alt="`${alt}原图`" draggable="false" />
          </div>

          <p>按照片原比例完整显示 · 长按图片可以保存</p>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.note-image {
  position: relative;
  display: grid;
  width: 100%;
  min-width: 0;
  min-height: 132px;
  place-items: center;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: #eadfc9;
  padding: 0;
  color: #8a7060;
  font-family: "Kaiti SC", "STKaiti", serif;
  text-align: center;
}

.note-image.is-ready {
  min-height: 0;
  aspect-ratio: var(--note-image-aspect, 4 / 3);
}

button.note-image {
  appearance: none;
  cursor: zoom-in;
}

button.note-image:focus-visible {
  outline: 2px solid #a6534c;
  outline-offset: 3px;
}

.note-image img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.note-image small {
  font-size: 10px;
}

.photo-viewer-backdrop {
  position: fixed;
  z-index: 260;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgb(37 28 25 / 0.9);
  padding: max(14px, env(safe-area-inset-top)) 14px
    max(14px, env(safe-area-inset-bottom));
  backdrop-filter: blur(12px);
}

.photo-viewer {
  display: grid;
  width: min(100%, 620px);
  height: min(calc(100dvh - 28px), 900px);
  max-height: 100%;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
  border: 1px solid rgb(255 244 224 / 0.2);
  border-radius: 20px;
  background: #f4e8d1;
  box-shadow: 0 24px 70px rgb(0 0 0 / 0.36);
}

.photo-viewer header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 12px 10px 16px;
}

.photo-viewer header > div {
  display: grid;
  gap: 2px;
}

.photo-viewer header small {
  color: #a0524c;
  font-family: "Courier New", monospace;
  font-size: 7px;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.photo-viewer header strong {
  color: #49352c;
  font-family: "Songti SC", "Noto Serif SC", serif;
  font-size: 18px;
}

.photo-viewer header button {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgb(95 67 51 / 0.14);
  border-radius: 50%;
  background: rgb(255 250 239 / 0.72);
  color: #4f382e;
}

.photo-viewer header button:focus-visible {
  outline: 2px solid #a6534c;
  outline-offset: 2px;
}

.photo-viewer-canvas {
  display: grid;
  min-height: 0;
  place-items: center;
  overflow: hidden;
  background:
    linear-gradient(45deg, rgb(255 255 255 / 0.045) 25%, transparent 25%),
    linear-gradient(-45deg, rgb(255 255 255 / 0.045) 25%, transparent 25%),
    #2d2522;
  background-position:
    0 0,
    8px 8px;
  background-size: 16px 16px;
  overscroll-behavior: contain;
}

.photo-viewer-canvas img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  touch-action: pinch-zoom;
}

.photo-viewer > p {
  margin: 0;
  padding: 10px 14px 12px;
  color: #806a5c;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 10px;
  text-align: center;
}

.photo-viewer-transition-enter-active,
.photo-viewer-transition-leave-active {
  transition: opacity 180ms ease;
}

.photo-viewer-transition-enter-active .photo-viewer,
.photo-viewer-transition-leave-active .photo-viewer {
  transition:
    opacity 180ms ease,
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.photo-viewer-transition-enter-from,
.photo-viewer-transition-leave-to,
.photo-viewer-transition-enter-from .photo-viewer,
.photo-viewer-transition-leave-to .photo-viewer {
  opacity: 0;
}

.photo-viewer-transition-enter-from .photo-viewer {
  transform: translateY(10px) scale(0.97);
}

.photo-viewer-transition-leave-to .photo-viewer {
  transform: translateY(7px) scale(0.985);
}

@media (prefers-reduced-motion: reduce) {
  .photo-viewer-transition-enter-active,
  .photo-viewer-transition-leave-active,
  .photo-viewer-transition-enter-active .photo-viewer,
  .photo-viewer-transition-leave-active .photo-viewer {
    transition-duration: 1ms;
  }
}
</style>
