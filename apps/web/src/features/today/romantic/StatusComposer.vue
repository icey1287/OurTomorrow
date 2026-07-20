<script setup lang="ts">
import type {
  CurrentStatusKind,
  CurrentStatusSummary,
} from "@our-tomorrow/contracts";
import { MapPin, Trash2, X } from "lucide-vue-next";
import { computed, ref, watch } from "vue";

import {
  romanticArt,
  statusOptions,
  statusPresentation,
  type RomanticStatusKey,
} from "./romantic-model";
import { useSheetBodyLock } from "./use-sheet-body-lock";

const props = defineProps<{
  open: boolean;
  current: CurrentStatusSummary | null;
  submitting: boolean;
  clearing: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  close: [];
  save: [input: { kind: CurrentStatusKind; location: string; message: string }];
  clear: [];
}>();

const selectedKey = ref<RomanticStatusKey>("sunny");
const location = ref("");
const message = ref("");
const localError = ref<string | null>(null);
const quickLocations = ["在家", "公司", "学校", "路上", "外面"];
const isOpen = computed(() => props.open);

useSheetBodyLock(isOpen);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    selectedKey.value = props.current
      ? statusPresentation(props.current.kind).key
      : "sunny";
    location.value = props.current?.location ?? "";
    message.value = props.current?.message ?? "";
    localError.value = null;
  },
);

const selectedOption = computed(
  () =>
    statusOptions.find((option) => option.key === selectedKey.value) ??
    statusOptions[0]!,
);

function submit() {
  const nextLocation = location.value.trim();
  if (!nextLocation) {
    localError.value = "留一个大概位置吧，比如“在家”或“回家路上”。";
    return;
  }
  localError.value = null;
  emit("save", {
    kind: selectedOption.value.kind,
    location: nextLocation,
    message: message.value.trim(),
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
          aria-labelledby="status-composer-title"
          @keydown.esc="$emit('close')"
        >
          <div class="sheet-handle" aria-hidden="true" />

          <header class="sheet-header">
            <div>
              <p>MY MOMENT · STATUS &amp; PLACE</p>
              <h2 id="status-composer-title">换一张此刻贴纸</h2>
            </div>
            <button
              type="button"
              aria-label="关闭状态编辑"
              @click="$emit('close')"
            >
              <X class="size-5" />
            </button>
          </header>

          <form @submit.prevent="submit">
            <fieldset>
              <legend>现在的你，更像哪一枚？</legend>
              <div class="status-grid">
                <button
                  v-for="option in statusOptions"
                  :key="option.key"
                  type="button"
                  :class="{ selected: selectedKey === option.key }"
                  @click="selectedKey = option.key"
                >
                  <span class="sticker-window">
                    <img :src="option.asset" alt="" aria-hidden="true" />
                  </span>
                  {{ option.label }}
                </button>
              </div>
            </fieldset>

            <fieldset>
              <legend>你在哪里？</legend>
              <label class="location-card">
                <img
                  class="location-sticker"
                  :src="romanticArt.statusLocation"
                  alt=""
                  aria-hidden="true"
                />
                <input
                  v-model="location"
                  maxlength="160"
                  autocomplete="off"
                  placeholder="写一个大概位置就好"
                  aria-label="当前位置"
                />
                <MapPin class="size-4" aria-hidden="true" />
              </label>
              <div class="location-row" aria-label="常用位置">
                <button
                  v-for="item in quickLocations"
                  :key="item"
                  type="button"
                  :class="{ selected: location === item }"
                  @click="location = item"
                >
                  {{ item }}
                </button>
              </div>
            </fieldset>

            <label class="note-field">
              <span>顺手留一句 <small>可不写</small></span>
              <input
                v-model="message"
                maxlength="120"
                placeholder="忙完就来找你，或者只是说一声想你"
              />
              <small>{{ message.length }}/120</small>
            </label>

            <p v-if="localError || error" class="form-error" role="alert">
              {{ localError || error }}
            </p>

            <p class="expiry-note">这张贴纸会在 6 小时后自动收进手账。</p>

            <button class="primary-action" type="submit" :disabled="submitting">
              {{ submitting ? "正在贴好…" : "贴上我的此刻" }}
            </button>

            <button
              v-if="current"
              class="clear-action"
              type="button"
              :disabled="clearing"
              @click="$emit('clear')"
            >
              <Trash2 class="size-3.5" />
              {{ clearing ? "正在收起…" : "暂时收起这张状态" }}
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
.note-field > span {
  display: block;
  margin-bottom: 10px;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 14px;
  font-weight: 700;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.status-grid > button {
  display: grid;
  min-height: 94px;
  place-items: center;
  gap: 2px;
  border: 1px solid rgb(112 80 58 / 0.13);
  border-radius: 4px;
  background: rgb(255 251 240 / 0.72);
  padding: 6px 4px 8px;
  color: #5b4638;
  font-size: 10px;
  font-weight: 700;
  box-shadow: 2px 3px 0 rgb(90 61 43 / 0.07);
  transition:
    transform 150ms ease,
    border-color 150ms ease;
}

.status-grid > button:nth-child(2n) {
  transform: rotate(0.6deg);
}

.status-grid > button.selected {
  border-color: #a7564e;
  background: #fff5e7;
  box-shadow:
    0 0 0 2px rgb(167 86 78 / 0.11),
    3px 4px 0 rgb(90 61 43 / 0.1);
  transform: translateY(-2px) rotate(-0.5deg);
}

.sticker-window {
  display: grid;
  width: 66px;
  height: 60px;
  place-items: center;
}

.sticker-window img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(1px 3px 3px rgb(69 48 35 / 0.12));
}

.location-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  min-height: 50px;
  align-items: center;
  gap: 9px;
  border: 1px solid rgb(112 80 58 / 0.15);
  background: rgb(255 251 240 / 0.72);
  padding: 0 13px;
  box-shadow: 3px 4px 0 rgb(90 61 43 / 0.07);
}

.location-sticker {
  width: 30px;
  height: 30px;
  object-fit: contain;
}

.location-card input,
.note-field input {
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
}

.location-card input {
  height: 48px;
  font-size: 13px;
}

.location-row {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 10px;
}

.location-row button {
  min-height: 34px;
  border: 1px dashed rgb(117 82 58 / 0.2);
  border-radius: 999px;
  background: rgb(255 250 239 / 0.52);
  padding: 0 12px;
  color: #705344;
  font-size: 11px;
  font-weight: 700;
}

.location-row button.selected {
  border-style: solid;
  border-color: #a95850;
  background: #eddbbf;
}

.note-field small {
  color: currentColor;
  font-family: inherit;
  font-size: 10px;
  font-weight: 400;
  opacity: 0.48;
}

.note-field input {
  width: 100%;
  min-height: 48px;
  border-bottom: 1px solid rgb(105 77 59 / 0.26);
  padding: 0 4px;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 15px;
}

.note-field > small {
  display: block;
  margin-top: 5px;
  text-align: right;
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

.expiry-note {
  margin: -9px 0 0;
  color: #8e7563;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 11px;
  text-align: center;
}

.primary-action {
  min-height: 54px;
  border: 1px solid rgb(74 50 37 / 0.25);
  border-radius: 3px;
  background: #513a2d;
  color: #fff8e9;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 15px;
  font-weight: 700;
  box-shadow: 4px 5px 0 rgb(77 51 35 / 0.17);
}

.primary-action:disabled,
.clear-action:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.clear-action {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 0;
  background: transparent;
  color: #8a6c5b;
  font-size: 11px;
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
    max-height: min(840px, calc(100dvh - 48px));
    border-radius: 28px;
  }
}
</style>
