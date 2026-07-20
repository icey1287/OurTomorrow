<script setup lang="ts">
import type { IdentityRole } from "@our-tomorrow/contracts";
import { ArrowRight, Feather } from "lucide-vue-next";
import { computed, nextTick, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import { resolveIdentityRoleFromName } from "@/features/identity/identity-name";
import {
  butterflyDown,
  butterflyOpenFrame,
  butterflyUp,
  coupleEmblem,
  microHearts,
  microLily,
  microRibbon,
  microWashi,
  pinkPetal,
  springFloralCorner,
} from "@/shared/assets/romantic";
import { useIdentityStore } from "@/shared/stores/identity";

type IdentityPhase = "entry" | "revealing" | "opening";

const route = useRoute();
const router = useRouter();
const identity = useIdentityStore();
const nameInput = ref("");
const inputElement = ref<HTMLInputElement | null>(null);
const phase = ref<IdentityPhase>("entry");
const matchedRole = ref<IdentityRole | null>(null);
const formError = ref<string | null>(null);
const invalidAnimation = ref(false);

const matchedName = computed(() =>
  matchedRole.value === "girl" ? "示例用户乙" : "示例用户甲",
);
const matchedShortName = computed(() =>
  matchedRole.value === "girl" ? "乙" : "甲",
);

const petals = [
  { left: "9%", delay: "-2s", duration: "12s", size: "15px" },
  { left: "34%", delay: "-7s", duration: "15s", size: "11px" },
  { left: "68%", delay: "-4s", duration: "13s", size: "14px" },
  { left: "88%", delay: "-10s", duration: "17s", size: "10px" },
];

function safeRedirect() {
  const redirect = route.query.redirect;
  return typeof redirect === "string" &&
    redirect.startsWith("/") &&
    !redirect.startsWith("//")
    ? redirect
    : "/today";
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) =>
    window.setTimeout(resolve, milliseconds),
  );
}

async function showInvalidName() {
  formError.value = "这本手账只认得我们两个人的真名。";
  invalidAnimation.value = false;
  await nextTick();
  invalidAnimation.value = true;
  inputElement.value?.focus();
  inputElement.value?.select();
}

async function submitName() {
  if (phase.value !== "entry") return;

  const role = resolveIdentityRoleFromName(nameInput.value);
  if (!role) {
    await showInvalidName();
    return;
  }

  formError.value = null;
  matchedRole.value = role;
  phase.value = "revealing";

  try {
    await Promise.all([identity.selectRole(role), wait(1_850)]);
    phase.value = "opening";
    await wait(720);
    await router.replace(safeRedirect());
  } catch {
    phase.value = "entry";
    matchedRole.value = null;
  }
}
</script>

<template>
  <main class="identity-journal" :class="`identity-journal--${phase}`">
    <div class="paper-grain" aria-hidden="true" />

    <div class="book-spine" aria-hidden="true">
      <span v-for="index in 7" :key="index" />
    </div>

    <div class="petal-field" aria-hidden="true">
      <img
        v-for="(petal, index) in petals"
        :key="index"
        :src="pinkPetal"
        alt=""
        :style="{
          left: petal.left,
          width: petal.size,
          animationDelay: petal.delay,
          animationDuration: petal.duration,
        }"
      />
    </div>

    <img
      class="floral-corner"
      :src="springFloralCorner"
      alt=""
      aria-hidden="true"
    />

    <section class="identity-sheet">
      <header class="identity-heading">
        <p>OUR TOMORROW · PRIVATE JOURNAL</p>
        <div class="heading-line">
          <span />
          <img :src="microHearts" alt="" aria-hidden="true" />
          <span />
        </div>
      </header>

      <form
        v-if="phase === 'entry'"
        class="name-form"
        novalidate
        @submit.prevent="submitName"
      >
        <div class="welcome-seal" aria-hidden="true">
          <img :src="coupleEmblem" alt="" />
          <span><b>甲</b><i>&amp;</i><b>乙</b></span>
        </div>

        <div class="welcome-copy">
          <small>PAGE ONE · WHO IS HERE?</small>
          <h1>写下你的名字</h1>
          <p>让这本只属于两个人的手账，认出今天翻开它的是谁。</p>
        </div>

        <label
          class="name-paper"
          :class="{ 'name-paper--invalid': invalidAnimation }"
          @animationend="invalidAnimation = false"
        >
          <img :src="microWashi" alt="" aria-hidden="true" />
          <span>你的真名</span>
          <input
            ref="inputElement"
            v-model="nameInput"
            name="name"
            type="text"
            autocomplete="name"
            maxlength="10"
            placeholder="在这里落笔"
            :aria-invalid="formError ? 'true' : undefined"
            :aria-describedby="formError ? 'identity-name-error' : undefined"
            autofocus
            @input="formError = null"
          />
          <Feather class="size-5" aria-hidden="true" />
        </label>

        <p
          v-if="formError"
          id="identity-name-error"
          class="form-error"
          role="alert"
        >
          {{ formError }}
        </p>

        <p v-if="identity.errorMessage" class="request-error" role="alert">
          {{ identity.errorMessage }}
        </p>

        <button class="open-journal-button" type="submit">
          <span>
            <small>BEGIN OUR PAGE</small>
            <strong>翻开我们的手账</strong>
          </span>
          <ArrowRight class="size-5" aria-hidden="true" />
        </button>

        <p class="privacy-note">没有访客，也没有第三个人。</p>
      </form>

      <section v-else class="identity-reveal" role="status" aria-live="polite">
        <img
          class="reveal-ribbon"
          :src="microRibbon"
          alt=""
          aria-hidden="true"
        />

        <div class="reveal-emblem" aria-hidden="true">
          <span class="emblem-halo" />
          <img :src="coupleEmblem" alt="" />
          <span class="emblem-names">
            <b>{{ matchedShortName }}</b
            ><i>&amp;</i><b>{{ matchedRole === "girl" ? "甲" : "乙" }}</b>
          </span>
        </div>

        <div class="winged-guide" aria-hidden="true">
          <img class="wing wing-up" :src="butterflyUp" alt="" />
          <img class="wing wing-open" :src="butterflyOpenFrame" alt="" />
          <img class="wing wing-down" :src="butterflyDown" alt="" />
        </div>

        <div class="reveal-copy">
          <small>THE JOURNAL REMEMBERS</small>
          <h1>认出你了，{{ matchedName }}</h1>
          <p>{{ matchedShortName }}，今天这一页已经替你翻开。</p>
        </div>

        <div class="opening-progress" aria-hidden="true">
          <span /><span /><span />
        </div>
      </section>
    </section>

    <img class="corner-lily" :src="microLily" alt="" aria-hidden="true" />

    <div
      v-if="phase === 'opening'"
      class="journal-opening-curtain"
      aria-hidden="true"
    >
      <div class="curtain-paper" />
      <div class="departing-butterfly">
        <img :src="butterflyOpenFrame" alt="" />
      </div>
    </div>
  </main>
</template>

<style scoped>
.identity-journal {
  position: relative;
  min-height: 100dvh;
  width: min(100%, 560px);
  overflow: hidden;
  margin: 0 auto;
  background-color: #f5ecd9;
  background-image:
    linear-gradient(
      90deg,
      transparent 31px,
      rgb(181 88 79 / 0.14) 32px,
      transparent 33px
    ),
    repeating-linear-gradient(
      0deg,
      transparent,
      transparent 31px,
      rgb(95 123 128 / 0.09) 32px
    );
  padding: max(22px, env(safe-area-inset-top)) 20px
    calc(24px + env(safe-area-inset-bottom)) 42px;
  color: #443229;
  box-shadow:
    0 0 70px rgb(70 45 30 / 0.17),
    inset 18px 0 34px rgb(83 56 38 / 0.05);
}

.paper-grain {
  position: absolute;
  z-index: 0;
  inset: 0;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.72' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.18'/%3E%3C/svg%3E");
  mix-blend-mode: multiply;
  opacity: 0.22;
}

.book-spine {
  position: absolute;
  z-index: 12;
  top: 24px;
  bottom: 38px;
  left: 8px;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  pointer-events: none;
}

.book-spine::before {
  position: absolute;
  top: 10px;
  bottom: 10px;
  left: 8px;
  width: 1px;
  background: rgb(93 65 48 / 0.12);
  content: "";
}

.book-spine span {
  position: relative;
  width: 19px;
  height: 7px;
  border-radius: 999px;
  background: linear-gradient(#81766b, #d4c9ba 47%, #6f655c);
  box-shadow: 2px 2px 4px rgb(64 47 36 / 0.2);
}

.book-spine span::after {
  position: absolute;
  top: -2px;
  right: -4px;
  width: 8px;
  height: 11px;
  border-radius: 50%;
  background: #d9cdbb;
  content: "";
}

.identity-sheet,
.corner-lily {
  position: relative;
  z-index: 3;
}

.identity-heading {
  text-align: center;
}

.identity-heading p,
.welcome-copy small,
.reveal-copy small,
.open-journal-button small {
  margin: 0;
  color: #995b51;
  font-family: "Courier New", monospace;
  font-size: 7px;
  font-weight: 700;
  letter-spacing: 0.13em;
}

.heading-line {
  display: grid;
  grid-template-columns: 1fr 24px 1fr;
  align-items: center;
  gap: 7px;
  margin: 9px auto 0;
  opacity: 0.72;
}

.heading-line span {
  height: 1px;
  background: linear-gradient(90deg, transparent, rgb(118 78 57 / 0.28));
}

.heading-line span:last-child {
  background: linear-gradient(90deg, rgb(118 78 57 / 0.28), transparent);
}

.heading-line img {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.name-form {
  display: flex;
  min-height: calc(100dvh - 92px);
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4px 0 18px;
}

.welcome-seal {
  position: relative;
  width: 176px;
  height: 176px;
  margin-top: -8px;
}

.welcome-seal > img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(3px 7px 6px rgb(68 45 32 / 0.15));
  transform: rotate(2deg);
}

.welcome-seal > span,
.emblem-names {
  position: absolute;
  top: 57px;
  left: 52px;
  display: flex;
  width: 72px;
  height: 72px;
  align-items: center;
  justify-content: center;
  gap: 3px;
  border-radius: 50%;
  color: #65483c;
  font-family: "Kaiti SC", "STKaiti", serif;
}

.welcome-seal b,
.emblem-names b {
  font-size: 19px;
}

.welcome-seal i,
.emblem-names i {
  color: #a1514a;
  font-family: Georgia, serif;
  font-size: 14px;
}

.welcome-copy {
  margin-top: -5px;
  text-align: center;
}

.welcome-copy h1,
.reveal-copy h1 {
  margin: 8px 0 0;
  font-family: "Songti SC", "Noto Serif SC", serif;
  font-size: clamp(31px, 9vw, 39px);
  line-height: 1.15;
  letter-spacing: -0.055em;
}

.welcome-copy p,
.reveal-copy p {
  max-width: 300px;
  margin: 12px auto 0;
  color: #765c4e;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 13px;
  line-height: 1.65;
}

.name-paper {
  position: relative;
  display: grid;
  width: 100%;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  margin-top: 25px;
  border: 1px solid rgb(104 73 54 / 0.16);
  background: #fff8e8;
  padding: 24px 16px 15px;
  box-shadow: 5px 6px 0 rgb(79 52 36 / 0.09);
  transform: rotate(-0.45deg);
}

.name-paper > img {
  position: absolute;
  top: -19px;
  left: 50%;
  width: 92px;
  transform: translateX(-50%) rotate(1deg);
}

.name-paper > span {
  position: absolute;
  top: 8px;
  left: 16px;
  color: #9c6257;
  font-family: "Courier New", monospace;
  font-size: 7px;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.name-paper input {
  min-width: 0;
  height: 46px;
  border: 0;
  border-bottom: 1px solid rgb(107 75 56 / 0.24);
  outline: 0;
  background: transparent;
  color: #49362c;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 21px;
  text-align: center;
  letter-spacing: 0.12em;
}

.name-paper input::placeholder {
  color: #ad9989;
  letter-spacing: 0.04em;
}

.name-paper > svg {
  margin-left: 11px;
  color: #875b47;
  transform: rotate(-10deg);
}

.name-paper--invalid {
  animation: name-shake 420ms cubic-bezier(0.36, 0.07, 0.19, 0.97);
}

.form-error,
.request-error {
  width: 100%;
  margin: 11px 0 0;
  color: #9b4a44;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 11px;
  text-align: center;
}

.request-error {
  border: 1px dashed rgb(155 74 68 / 0.25);
  background: rgb(255 248 232 / 0.64);
  padding: 8px 10px;
}

.open-journal-button {
  display: flex;
  width: 100%;
  min-height: 62px;
  align-items: center;
  justify-content: space-between;
  margin-top: 18px;
  border: 1px solid rgb(73 49 36 / 0.24);
  border-radius: 3px;
  background: #a6534c;
  padding: 0 20px;
  color: #fff8e9;
  text-align: left;
  box-shadow: 4px 5px 0 rgb(77 50 35 / 0.15);
}

.open-journal-button span {
  display: grid;
  gap: 2px;
}

.open-journal-button small {
  color: #f3d9c3;
}

.open-journal-button strong {
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 16px;
}

.privacy-note {
  margin: 13px 0 0;
  color: #907565;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 10px;
}

.identity-reveal {
  position: relative;
  display: flex;
  min-height: calc(100dvh - 74px);
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-bottom: 30px;
  text-align: center;
}

.reveal-ribbon {
  position: absolute;
  top: 36px;
  left: -25px;
  width: 92px;
  opacity: 0;
  animation: ribbon-arrive 800ms 220ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
  transform: rotate(-10deg);
}

.reveal-emblem {
  position: relative;
  width: 214px;
  height: 214px;
  opacity: 0;
  animation: emblem-bloom 950ms 120ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.reveal-emblem > img {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(4px 9px 7px rgb(66 44 31 / 0.18));
}

.emblem-halo {
  position: absolute;
  z-index: 1;
  inset: 27px;
  border: 1px solid rgb(166 83 76 / 0.25);
  border-radius: 50%;
  animation: halo-breathe 1.8s ease-in-out infinite;
}

.emblem-names {
  z-index: 3;
  top: 70px;
  left: 64px;
  width: 86px;
  height: 86px;
}

.emblem-names b {
  font-size: 22px;
}

.winged-guide {
  position: absolute;
  z-index: 5;
  top: 33%;
  right: -3px;
  width: 70px;
  height: 70px;
  opacity: 0;
  animation: butterfly-path 1.45s 300ms cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
}

.winged-guide .wing {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(2px 4px 3px rgb(60 40 30 / 0.15));
}

.wing-up {
  animation: wing-up 360ms steps(1) infinite;
}

.wing-open {
  animation: wing-open 360ms steps(1) infinite;
}

.wing-down {
  animation: wing-down 360ms steps(1) infinite;
}

.reveal-copy {
  margin-top: -9px;
  opacity: 0;
  animation: reveal-words 720ms 780ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.opening-progress {
  display: flex;
  gap: 7px;
  margin-top: 28px;
}

.opening-progress span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #a6534c;
  animation: progress-dot 780ms ease-in-out infinite alternate;
}

.opening-progress span:nth-child(2) {
  animation-delay: 160ms;
}

.opening-progress span:nth-child(3) {
  animation-delay: 320ms;
}

.floral-corner {
  position: absolute;
  z-index: 1;
  right: -74px;
  bottom: -82px;
  width: 230px;
  pointer-events: none;
  opacity: 0.25;
}

.corner-lily {
  position: absolute;
  left: 23px;
  bottom: -16px;
  width: 72px;
  pointer-events: none;
  opacity: 0.4;
  transform: rotate(8deg);
}

.petal-field {
  position: absolute;
  z-index: 8;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.petal-field img {
  position: absolute;
  top: -25px;
  height: auto;
  animation: petal-fall linear infinite;
  opacity: 0.58;
}

.journal-opening-curtain {
  position: fixed;
  z-index: 80;
  inset: 0;
  pointer-events: none;
}

.curtain-paper {
  position: absolute;
  inset: 0;
  background-color: #f5ecd9;
  background-image: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 31px,
    rgb(95 123 128 / 0.08) 32px
  );
  animation: curtain-open 720ms cubic-bezier(0.76, 0, 0.24, 1) forwards;
  clip-path: inset(0 50% 0 50%);
}

.departing-butterfly {
  position: absolute;
  z-index: 2;
  top: 52%;
  left: 50%;
  width: 82px;
  animation: butterfly-depart 720ms cubic-bezier(0.2, 0.75, 0.2, 1) forwards;
}

.departing-butterfly img {
  width: 100%;
}

@keyframes name-shake {
  0%,
  100% {
    transform: translateX(0) rotate(-0.45deg);
  }
  25% {
    transform: translateX(-8px) rotate(-0.8deg);
  }
  50% {
    transform: translateX(7px) rotate(0deg);
  }
  75% {
    transform: translateX(-4px) rotate(-0.6deg);
  }
}

@keyframes emblem-bloom {
  0% {
    opacity: 0;
    transform: scale(0.62) rotate(-8deg);
  }
  68% {
    opacity: 1;
    transform: scale(1.05) rotate(1.5deg);
  }
  100% {
    opacity: 1;
    transform: scale(1) rotate(0);
  }
}

@keyframes halo-breathe {
  50% {
    opacity: 0.25;
    transform: scale(1.12);
  }
}

@keyframes ribbon-arrive {
  from {
    opacity: 0;
    transform: translateX(-20px) rotate(-15deg);
  }
  to {
    opacity: 0.7;
    transform: translateX(0) rotate(-10deg);
  }
}

@keyframes butterfly-path {
  0% {
    opacity: 0;
    transform: translate3d(45px, 45px, 0) rotate(20deg) scale(0.7);
  }
  25% {
    opacity: 1;
  }
  65% {
    transform: translate3d(-35px, -25px, 0) rotate(-8deg) scale(1);
  }
  100% {
    opacity: 1;
    transform: translate3d(-8px, -55px, 0) rotate(4deg) scale(0.9);
  }
}

@keyframes wing-up {
  0%,
  32% {
    opacity: 1;
  }
  33%,
  100% {
    opacity: 0;
  }
}

@keyframes wing-open {
  0%,
  32%,
  66%,
  100% {
    opacity: 0;
  }
  33%,
  65% {
    opacity: 1;
  }
}

@keyframes wing-down {
  0%,
  65% {
    opacity: 0;
  }
  66%,
  100% {
    opacity: 1;
  }
}

@keyframes reveal-words {
  from {
    opacity: 0;
    transform: translateY(13px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes progress-dot {
  to {
    opacity: 0.2;
    transform: translateY(-4px) scale(0.75);
  }
}

@keyframes petal-fall {
  0% {
    transform: translate3d(0, -25px, 0) rotate(0deg);
  }
  50% {
    transform: translate3d(20px, 50dvh, 0) rotate(180deg);
  }
  100% {
    transform: translate3d(-8px, 108dvh, 0) rotate(380deg);
  }
}

@keyframes curtain-open {
  to {
    clip-path: inset(0 0 0 0);
  }
}

@keyframes butterfly-depart {
  0% {
    opacity: 1;
    transform: translate(-50%, -50%) rotate(0) scale(0.8);
  }
  100% {
    opacity: 0;
    transform: translate(95px, -330px) rotate(18deg) scale(0.45);
  }
}

@media (min-width: 640px) {
  .identity-journal {
    min-height: calc(100dvh - 32px);
    margin: 16px auto;
    border-radius: 6px;
  }

  .name-form,
  .identity-reveal {
    min-height: calc(100dvh - 124px);
  }
}

@media (max-height: 700px) {
  .welcome-seal {
    width: 136px;
    height: 136px;
  }

  .welcome-seal > span {
    top: 44px;
    left: 40px;
    width: 56px;
    height: 56px;
  }

  .welcome-seal b {
    font-size: 16px;
  }

  .name-paper {
    margin-top: 18px;
  }
}
</style>
