<script setup lang="ts">
import type { NoteImageUpload } from "@our-tomorrow/contracts";
import { ImagePlus, LoaderCircle, Trash2, X } from "lucide-vue-next";
import { computed, onBeforeUnmount, ref, watch } from "vue";

import { prepareNoteImage, type PreparedNoteImage } from "./note-image";
import {
  decorationAssetByKey,
  decorationOptions,
  romanticArt,
  type NoteDecorationKey,
} from "./romantic-model";
import { useSheetBodyLock } from "./use-sheet-body-lock";

const props = defineProps<{
  open: boolean;
  partnerName: string;
  submitting: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  close: [];
  send: [
    input: {
      content: string;
      decoration: NoteDecorationKey;
      image: NoteImageUpload | null;
    },
  ];
}>();

const content = ref("");
const decoration = ref<NoteDecorationKey>("peony");
const photo = ref<PreparedNoteImage | null>(null);
const photoInput = ref<HTMLInputElement | null>(null);
const processingPhoto = ref(false);
const localError = ref<string | null>(null);
const isOpen = computed(() => props.open);
let photoSelectionVersion = 0;

useSheetBodyLock(isOpen);

function releasePhoto() {
  if (photo.value) URL.revokeObjectURL(photo.value.previewUrl);
  photo.value = null;
}

watch(
  () => props.open,
  (open) => {
    photoSelectionVersion += 1;
    releasePhoto();
    processingPhoto.value = false;
    if (!open) return;
    content.value = "";
    decoration.value = "peony";
    localError.value = null;
  },
);

onBeforeUnmount(() => {
  photoSelectionVersion += 1;
  releasePhoto();
});

async function selectPhoto(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  processingPhoto.value = true;
  photoSelectionVersion += 1;
  const selectionVersion = photoSelectionVersion;
  localError.value = null;
  try {
    const prepared = await prepareNoteImage(file);
    if (selectionVersion !== photoSelectionVersion) {
      URL.revokeObjectURL(prepared.previewUrl);
      return;
    }
    releasePhoto();
    photo.value = prepared;
  } catch (error) {
    if (selectionVersion === photoSelectionVersion) {
      localError.value =
        error instanceof Error ? error.message : "这张照片暂时没有准备好。";
    }
  } finally {
    if (selectionVersion === photoSelectionVersion) {
      processingPhoto.value = false;
    }
  }
}

function removePhoto() {
  photoSelectionVersion += 1;
  releasePhoto();
  localError.value = null;
}

function submit() {
  if (processingPhoto.value) return;
  const message = content.value.trim();
  if (!message) {
    localError.value = "先写下一句话，再把它放进对方的手账。";
    return;
  }
  localError.value = null;
  emit("send", {
    content: message,
    decoration: decoration.value,
    image: photo.value?.upload ?? null,
  });
}
</script>

<template>
  <Teleport to="body">
    <Transition name="romantic-sheet">
      <div
        v-if="open"
        class="composer-backdrop"
        role="presentation"
        @click.self="$emit('close')"
      >
        <section
          class="composer-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="note-composer-title"
          @keydown.esc="$emit('close')"
        >
          <div class="sheet-handle" aria-hidden="true" />

          <header class="sheet-header">
            <div>
              <p>ONE NOTE · ONE DELIVERY</p>
              <h2 id="note-composer-title">写一张新便笺</h2>
            </div>
            <button
              type="button"
              aria-label="关闭留言编辑"
              @click="$emit('close')"
            >
              <X class="size-5" />
            </button>
          </header>

          <form @submit.prevent="submit">
            <div
              class="message-preview"
              :class="{ 'has-photo': photo }"
              aria-label="便笺预览"
            >
              <img
                v-if="photo"
                class="preview-photo"
                :src="photo.previewUrl"
                alt="待发送的照片"
              />
              <img
                class="preview-sticker"
                :src="decorationAssetByKey[decoration]"
                alt=""
                aria-hidden="true"
              />
              <p>{{ content || `给${partnerName}写一句今天的小事。` }}</p>
              <span>FOR {{ partnerName.toUpperCase() }} · TODAY</span>
            </div>

            <label class="message-field">
              <span>想说什么？</span>
              <textarea
                v-model="content"
                rows="5"
                maxlength="240"
                autofocus
                placeholder="想你了、到家告诉我，或者只是今天的一句悄悄话……"
              />
              <small>{{ content.length }}/240</small>
            </label>

            <div class="photo-field">
              <span>夹一张照片 <small>可不选</small></span>
              <input
                ref="photoInput"
                class="photo-input"
                type="file"
                accept="image/*"
                aria-label="从相册选择一张照片"
                @change="selectPhoto"
              />

              <button
                v-if="!photo"
                class="photo-picker"
                type="button"
                :disabled="processingPhoto"
                @click="photoInput?.click()"
              >
                <LoaderCircle
                  v-if="processingPhoto"
                  class="size-5 animate-spin"
                  aria-hidden="true"
                />
                <ImagePlus v-else class="size-5" aria-hidden="true" />
                <span>
                  <strong>{{
                    processingPhoto ? "正在把照片夹好…" : "从相册或相机选择"
                  }}</strong>
                  <small>发送前会自动压缩，只保留这一张</small>
                </span>
              </button>

              <div v-else class="selected-photo">
                <img :src="photo.previewUrl" alt="已选择的照片" />
                <span>
                  <strong>照片已经夹好</strong>
                  <small
                    >{{
                      Math.max(1, Math.round(photo.sizeBytes / 1024))
                    }}KB</small
                  >
                </span>
                <button
                  type="button"
                  aria-label="移除照片"
                  @click="removePhoto"
                >
                  <Trash2 class="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <fieldset>
              <legend>夹上一枚小贴纸</legend>
              <div class="decoration-row">
                <button
                  v-for="option in decorationOptions"
                  :key="option.key"
                  type="button"
                  :aria-label="option.label"
                  :class="{ selected: decoration === option.key }"
                  @click="decoration = option.key"
                >
                  <img :src="option.asset" alt="" aria-hidden="true" />
                </button>
              </div>
            </fieldset>

            <p v-if="localError || error" class="form-error" role="alert">
              {{ localError || error }}
            </p>

            <button
              class="primary-action message-action"
              type="submit"
              :disabled="submitting || processingPhoto"
            >
              <img :src="romanticArt.envelopeOpen" alt="" aria-hidden="true" />
              <span>{{ submitting ? "正在送去…" : "放进对方的手账" }}</span>
            </button>
          </form>

          <img
            class="sheet-corner-flower"
            :src="romanticArt.microLily"
            alt=""
            aria-hidden="true"
          />
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.composer-backdrop {
  position: fixed;
  z-index: 150;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-top: 42px;
  background: rgb(54 40 35 / 0.42);
  backdrop-filter: blur(6px);
}

.composer-sheet {
  position: relative;
  width: min(100%, 520px);
  max-height: calc(100dvh - 24px);
  overflow-x: hidden;
  overflow-y: auto;
  border: 1px solid rgb(106 77 58 / 0.2);
  border-radius: 28px 28px 0 0;
  background-color: #f8efdc;
  background-image:
    linear-gradient(
      90deg,
      transparent 29px,
      rgb(180 91 82 / 0.12) 30px,
      transparent 31px
    ),
    repeating-linear-gradient(
      0deg,
      transparent,
      transparent 31px,
      rgb(105 127 128 / 0.08) 32px
    );
  padding: 10px 20px calc(28px + env(safe-area-inset-bottom));
  color: #44342a;
  box-shadow: 0 -24px 70px rgb(56 40 31 / 0.25);
}

.composer-sheet::before {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.13'/%3E%3C/svg%3E");
  content: "";
  mix-blend-mode: multiply;
  opacity: 0.2;
}

.sheet-handle,
.sheet-header,
form {
  position: relative;
  z-index: 2;
}

.sheet-handle {
  width: 42px;
  height: 5px;
  margin: 0 auto 14px;
  border-radius: 999px;
  background: #765f4f;
  opacity: 0.22;
}

.sheet-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.sheet-header p {
  margin: 0;
  color: #a15951;
  font-family: "Courier New", monospace;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.14em;
}

.sheet-header h2 {
  margin: 7px 0 0;
  font-family: "Songti SC", "Noto Serif SC", serif;
  font-size: 27px;
  line-height: 1.2;
  letter-spacing: -0.04em;
}

.sheet-header > button {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgb(91 65 50 / 0.12);
  border-radius: 50%;
  background: rgb(255 250 239 / 0.62);
}

form {
  display: grid;
  gap: 21px;
  margin-top: 24px;
}

fieldset {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

legend,
.message-field > span,
.photo-field > span {
  display: block;
  margin-bottom: 10px;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 14px;
  font-weight: 700;
}

.message-preview {
  position: relative;
  min-height: 132px;
  overflow: hidden;
  border: 1px solid rgb(104 76 57 / 0.14);
  background: #fff9e9;
  padding: 28px 72px 26px 22px;
  box-shadow: 5px 6px 0 rgb(91 63 43 / 0.1);
  transform: rotate(-0.7deg);
}

.message-preview.has-photo {
  min-height: 304px;
  padding-top: 202px;
}

.preview-photo {
  position: absolute;
  top: 15px;
  left: 15px;
  width: calc(100% - 30px);
  height: 168px;
  border: 7px solid #fffdf5;
  object-fit: cover;
  box-shadow: 2px 4px 10px rgb(68 46 34 / 0.16);
  transform: rotate(0.6deg);
}

.message-preview::after {
  position: absolute;
  top: 0;
  right: 0;
  width: 34px;
  height: 34px;
  background: linear-gradient(225deg, #d8cbb1 49%, transparent 50%);
  content: "";
}

.preview-sticker {
  position: absolute;
  right: 8px;
  bottom: -2px;
  width: 68px;
  height: 82px;
  object-fit: contain;
  filter: drop-shadow(2px 4px 3px rgb(79 54 40 / 0.13));
  transform: rotate(5deg);
}

.message-preview p {
  margin: 0;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 16px;
  line-height: 1.75;
  white-space: pre-wrap;
}

.message-preview > span {
  position: absolute;
  bottom: 10px;
  left: 22px;
  color: #9c7c67;
  font-family: "Courier New", monospace;
  font-size: 7px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.message-field textarea {
  width: 100%;
  min-height: 124px;
  border: 1px solid rgb(112 80 58 / 0.14);
  outline: 0;
  background: rgb(255 251 240 / 0.72);
  padding: 14px;
  color: inherit;
  font-size: 14px;
  line-height: 1.75;
  resize: none;
  box-shadow: 3px 4px 0 rgb(90 61 43 / 0.07);
}

.message-field small {
  display: block;
  margin-top: 6px;
  color: #8e7563;
  font-family: "Courier New", monospace;
  font-size: 9px;
  text-align: right;
}

.photo-field {
  display: grid;
}

.photo-field > span small {
  color: currentColor;
  font-family: inherit;
  font-size: 10px;
  font-weight: 400;
  opacity: 0.5;
}

.photo-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.photo-picker,
.selected-photo {
  min-height: 70px;
  border: 1px dashed rgb(113 79 56 / 0.24);
  background: rgb(255 251 240 / 0.62);
  box-shadow: 3px 4px 0 rgb(90 61 43 / 0.07);
}

.photo-picker {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  color: #8e514a;
  text-align: left;
}

.photo-picker > span,
.selected-photo > span {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.photo-picker strong,
.selected-photo strong {
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 13px;
}

.photo-picker small,
.selected-photo small {
  color: #8d7565;
  font-size: 9px;
}

.photo-picker:disabled {
  cursor: wait;
  opacity: 0.65;
}

.selected-photo {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) 44px;
  align-items: center;
  gap: 11px;
  padding: 7px 8px;
}

.selected-photo > img {
  width: 58px;
  height: 54px;
  border: 3px solid #fffaf0;
  object-fit: cover;
  box-shadow: 1px 2px 5px rgb(68 46 34 / 0.14);
  transform: rotate(-1deg);
}

.selected-photo > button {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  color: #a34f48;
}

.decoration-row {
  display: grid;
  grid-template-columns: repeat(4, 56px);
  gap: 9px;
}

.decoration-row button {
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  border: 1px dashed rgb(113 79 56 / 0.22);
  border-radius: 50%;
  background: rgb(255 250 239 / 0.6);
}

.decoration-row button.selected {
  border-style: solid;
  border-color: #a95850;
  background: #eddbbf;
  box-shadow: 0 0 0 2px rgb(169 88 80 / 0.1);
}

.decoration-row img {
  width: 44px;
  height: 44px;
  object-fit: contain;
}

.form-error {
  margin: -6px 0 0;
  border-left: 3px solid #a6534c;
  background: rgb(166 83 76 / 0.08);
  padding: 9px 11px;
  color: #8d403b;
  font-size: 12px;
  line-height: 1.5;
}

.primary-action {
  display: flex;
  min-height: 62px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid rgb(74 50 37 / 0.25);
  border-radius: 3px;
  background: #a6534c;
  color: #fff8e9;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 15px;
  font-weight: 700;
  box-shadow: 4px 5px 0 rgb(77 51 35 / 0.17);
}

.primary-action img {
  width: 58px;
  height: 48px;
  object-fit: contain;
  filter: drop-shadow(1px 3px 3px rgb(66 39 32 / 0.15));
}

.primary-action:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.sheet-corner-flower {
  position: absolute;
  z-index: 1;
  right: -25px;
  bottom: 6px;
  width: 95px;
  pointer-events: none;
  opacity: 0.18;
  transform: rotate(-8deg);
}

.romantic-sheet-enter-active,
.romantic-sheet-leave-active {
  transition: opacity 180ms ease;
}

.romantic-sheet-enter-active .composer-sheet,
.romantic-sheet-leave-active .composer-sheet {
  transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
}

.romantic-sheet-enter-from,
.romantic-sheet-leave-to {
  opacity: 0;
}

.romantic-sheet-enter-from .composer-sheet,
.romantic-sheet-leave-to .composer-sheet {
  transform: translateY(45px);
}

@media (min-width: 640px) {
  .composer-backdrop {
    align-items: center;
    padding: 24px;
  }

  .composer-sheet {
    max-height: min(760px, calc(100dvh - 48px));
    border-radius: 28px;
  }
}
</style>
