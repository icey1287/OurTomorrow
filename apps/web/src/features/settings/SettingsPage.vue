<script setup lang="ts">
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Flower2,
  LogOut,
} from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { RouterLink, useRouter } from "vue-router";

import {
  coupleEmblem,
  microDaisy,
  microLily,
  microWashi,
  nightGarden,
  springDivider,
} from "@/shared/assets/romantic";
import { ApiClientError } from "@/shared/api/client";
import { useIdentityStore } from "@/shared/stores/identity";

const router = useRouter();
const identity = useIdentityStore();
const relationshipStartDate = ref("");
const relationshipSignature = ref("");
const saving = ref(false);
const formError = ref<string | null>(null);
const savedMessage = ref<string | null>(null);

const currentName = computed(() =>
  identity.role === "boy" ? "甲" : identity.role === "girl" ? "乙" : "我",
);
const partnerName = computed(() =>
  identity.role === "boy" ? "乙" : identity.role === "girl" ? "甲" : "你",
);
const initials = computed(() => ({
  mine: currentName.value.trim().slice(0, 1) || "我",
  partner: partnerName.value.trim().slice(0, 1) || "你",
}));
const formattedStartDate = computed(() => {
  const value = identity.couple?.startDate;
  if (!value) return "还没有写下日期";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
});

const todayDate = computed(() => {
  const timeZone = identity.couple?.timezone ?? "Asia/Shanghai";
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
});

const daysTogether = computed(() => {
  const start = relationshipStartDate.value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  const startTime = Date.parse(`${start}T00:00:00.000Z`);
  const todayTime = Date.parse(`${todayDate.value}T00:00:00.000Z`);
  if (!Number.isFinite(startTime) || !Number.isFinite(todayTime)) return null;
  return Math.max(1, Math.floor((todayTime - startTime) / 86_400_000) + 1);
});

async function saveRelationship() {
  const couple = identity.couple;
  if (!couple || saving.value) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(relationshipStartDate.value)) {
    formError.value = "请写下一个完整的纪念日日期。";
    return;
  }
  if (relationshipStartDate.value > todayDate.value) {
    formError.value = "纪念日不能晚于今天。";
    return;
  }

  saving.value = true;
  formError.value = null;
  savedMessage.value = null;
  try {
    await identity.updateCouple({
      version: couple.version,
      startDate: relationshipStartDate.value,
      signature: relationshipSignature.value.trim() || null,
    });
    savedMessage.value = "纪念日和扉页句子已经写好了。";
  } catch (error) {
    formError.value =
      error instanceof ApiClientError && error.code === "STATE_CONFLICT"
        ? "这一页刚刚在另一处更新了，请再保存一次。"
        : error instanceof Error
          ? error.message
          : "纪念日没有保存成功，请稍后再试。";
  } finally {
    saving.value = false;
  }
}

async function chooseAnotherPerson() {
  identity.clearIdentity();
  await router.replace("/login");
}

watch(
  () => identity.couple,
  (couple) => {
    if (!couple) return;
    relationshipStartDate.value = couple.startDate;
    relationshipSignature.value = couple.signature ?? "";
  },
  { immediate: true },
);
</script>

<template>
  <main class="settings-journal">
    <div class="paper-grain" aria-hidden="true" />

    <div class="book-spine" aria-hidden="true">
      <span v-for="index in 8" :key="index" />
    </div>

    <header class="settings-header">
      <RouterLink to="/today" aria-label="返回今天">
        <ArrowLeft class="size-4" />
        <span>今天</span>
      </RouterLink>
      <div>
        <p>THE LITTLE DRAWER · SETTINGS</p>
        <h1>手账的小抽屉</h1>
      </div>
      <Flower2 class="size-5" aria-hidden="true" />
    </header>

    <section class="garden-postcard" aria-label="我们的手账">
      <span class="postcard-tape" aria-hidden="true" />
      <img :src="nightGarden" alt="" aria-hidden="true" />
      <div class="garden-copy">
        <small>PRIVATE GARDEN · FOR TWO</small>
        <h2>{{ identity.couple?.name || "我们的明天" }}</h2>
        <p>
          从 {{ formattedStartDate }} 开始，只有 {{ currentName }} 和
          {{ partnerName }}。
        </p>
      </div>
      <div class="postcard-seal" aria-hidden="true">
        <img :src="coupleEmblem" alt="" />
        <span
          ><b>{{ initials.mine }}</b
          ><i>&amp;</i><b>{{ initials.partner }}</b></span
        >
      </div>
    </section>

    <div class="section-divider" aria-hidden="true">
      <img :src="springDivider" alt="" />
      <span>OUR STORY</span>
    </div>

    <section
      class="settings-paper relationship-paper"
      aria-labelledby="relationship-title"
    >
      <span class="paper-tape" aria-hidden="true" />
      <img class="paper-flower" :src="microDaisy" alt="" aria-hidden="true" />
      <header>
        <small>01 · 写在扉页的共同日期</small>
        <h2 id="relationship-title">我们的纪念日</h2>
        <p>它决定手账从哪一天开始计算，也会显示我们一起走过多久。</p>
      </header>

      <form @submit.prevent="saveRelationship">
        <label class="date-input">
          <CalendarDays class="size-5" aria-hidden="true" />
          <span>在一起的第一天</span>
          <input
            v-model="relationshipStartDate"
            type="date"
            :max="todayDate"
            aria-label="我们的纪念日"
            @input="
              formError = null;
              savedMessage = null;
            "
          />
        </label>

        <p v-if="daysTogether" class="days-together">
          今天是我们在一起的第 <strong>{{ daysTogether }}</strong> 天。
        </p>

        <label class="signature-input">
          <img :src="microWashi" alt="" aria-hidden="true" />
          <span>写在首页扉页的一句话 · 可不写</span>
          <input
            v-model="relationshipSignature"
            maxlength="120"
            autocomplete="off"
            placeholder="例如：普通的一天，也值得好好夹进书里。"
            @input="
              formError = null;
              savedMessage = null;
            "
          />
        </label>

        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
        <p v-else-if="savedMessage" class="saved-message" role="status">
          <Check class="size-3.5" />{{ savedMessage }}
        </p>

        <button type="submit" :disabled="saving || !identity.couple">
          {{ saving ? "正在写好…" : "把这一页保存好" }}
        </button>
      </form>
    </section>

    <section class="identity-ticket" aria-labelledby="identity-title">
      <span class="ticket-notch ticket-notch-left" aria-hidden="true" />
      <span class="ticket-notch ticket-notch-right" aria-hidden="true" />
      <div class="ticket-initial">{{ initials.mine }}</div>
      <div>
        <small>02 · THIS DEVICE REMEMBERS</small>
        <h2 id="identity-title">现在是 {{ currentName }} 在用</h2>
        <p>想换一个人，就重新在首页写一次名字。</p>
      </div>
      <button type="button" @click="chooseAnotherPerson">
        <LogOut class="size-4" />
        换一个人
      </button>
    </section>

    <footer class="settings-footer">
      <img :src="microLily" alt="" aria-hidden="true" />
      <p>只有这些，刚刚好。</p>
      <RouterLink to="/today">把抽屉合上</RouterLink>
    </footer>
  </main>
</template>

<style scoped>
.settings-journal {
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
  padding: max(20px, env(safe-area-inset-top)) 18px
    calc(32px + env(safe-area-inset-bottom)) 42px;
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

.settings-header,
.garden-postcard,
.section-divider,
.settings-paper,
.identity-ticket,
.settings-footer {
  position: relative;
  z-index: 3;
}

.settings-header {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) 34px;
  align-items: center;
  gap: 7px;
  min-height: 72px;
}

.settings-header > a {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  gap: 3px;
  color: #7b5d4d;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 11px;
}

.settings-header > div {
  text-align: center;
}

.settings-header p,
.garden-copy small,
.settings-paper header small,
.identity-ticket small {
  margin: 0;
  color: #9b5d53;
  font-family: "Courier New", monospace;
  font-size: 7px;
  font-weight: 700;
  letter-spacing: 0.11em;
}

.settings-header h1 {
  margin: 4px 0 0;
  font-family: "Songti SC", "Noto Serif SC", serif;
  font-size: 25px;
  letter-spacing: -0.04em;
}

.settings-header > svg {
  color: #895f4c;
}

.garden-postcard {
  min-height: 188px;
  overflow: hidden;
  border: 5px solid #fff9e9;
  background: #20322f;
  box-shadow: 6px 7px 0 rgb(78 51 35 / 0.12);
  transform: rotate(-0.55deg);
}

.garden-postcard > img {
  position: absolute;
  inset: -20% 0 auto;
  width: 100%;
  opacity: 0.82;
}

.garden-postcard::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    rgb(25 39 36 / 0.84),
    rgb(25 39 36 / 0.22)
  );
  content: "";
}

.postcard-tape,
.paper-tape {
  position: absolute;
  z-index: 5;
  top: -7px;
  left: 50%;
  width: 78px;
  height: 19px;
  background: rgb(218 196 156 / 0.72);
  transform: translateX(-50%) rotate(1deg);
}

.garden-copy {
  position: relative;
  z-index: 3;
  width: 64%;
  padding: 34px 0 26px 20px;
  color: #fff8e9;
}

.garden-copy small {
  color: #e7cabc;
}

.garden-copy h2 {
  margin: 9px 0 0;
  font-family: "Songti SC", "Noto Serif SC", serif;
  font-size: 27px;
  line-height: 1.15;
}

.garden-copy p {
  margin: 12px 0 0;
  color: #e8ddd0;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 11px;
  line-height: 1.6;
}

.postcard-seal {
  position: absolute;
  z-index: 4;
  right: -10px;
  bottom: -17px;
  width: 132px;
  height: 132px;
}

.postcard-seal > img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(2px 5px 4px rgb(0 0 0 / 0.2));
}

.postcard-seal > span {
  position: absolute;
  top: 43px;
  left: 39px;
  display: flex;
  width: 54px;
  height: 54px;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: #65483c;
  font-family: "Kaiti SC", "STKaiti", serif;
}

.postcard-seal b {
  font-size: 14px;
}

.postcard-seal i {
  color: #a1514a;
  font-family: Georgia, serif;
  font-size: 11px;
}

.section-divider {
  display: grid;
  height: 70px;
  place-items: center;
}

.section-divider img {
  position: absolute;
  width: 275px;
  max-width: 92%;
  opacity: 0.7;
}

.section-divider span {
  position: relative;
  z-index: 1;
  background: #f5ecd9;
  padding: 0 8px;
  color: #9b5d53;
  font-family: "Courier New", monospace;
  font-size: 7px;
  font-weight: 700;
  letter-spacing: 0.14em;
}

.settings-paper {
  border: 1px solid rgb(106 75 55 / 0.15);
  background: #fff8e8;
  padding: 23px 17px 18px;
  box-shadow: 5px 6px 0 rgb(79 52 36 / 0.08);
}

.relationship-paper {
  transform: rotate(0.35deg);
}

.settings-paper header {
  position: relative;
  z-index: 2;
}

.settings-paper h2,
.identity-ticket h2 {
  margin: 5px 0 0;
  font-family: "Songti SC", "Noto Serif SC", serif;
  font-size: 21px;
  letter-spacing: -0.035em;
}

.settings-paper header p,
.identity-ticket p {
  margin: 7px 0 0;
  color: #7e6657;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 11px;
  line-height: 1.55;
}

.paper-flower {
  position: absolute;
  z-index: 1;
  right: -4px;
  top: -18px;
  width: 69px;
  opacity: 0.72;
  transform: rotate(8deg);
}

.relationship-paper form {
  position: relative;
  z-index: 2;
  margin-top: 18px;
}

.date-input {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-height: 66px;
  border: 1px solid rgb(106 74 54 / 0.18);
  background: rgb(255 251 240 / 0.68);
  padding: 9px 12px;
  box-shadow: 2px 3px 0 rgb(78 51 35 / 0.06);
}

.date-input > svg {
  grid-row: 1 / span 2;
  color: #9d554d;
}

.date-input > span {
  color: #8c7060;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 10px;
}

.date-input input {
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #4b382e;
  font-family: "Courier New", monospace;
  font-size: 15px;
  font-weight: 700;
}

.days-together {
  margin: 10px 2px 0;
  color: #775b4b;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 11px;
  text-align: center;
}

.days-together strong {
  color: #a6534c;
  font-family: Georgia, serif;
  font-size: 15px;
}

.signature-input {
  position: relative;
  display: block;
  min-height: 78px;
  margin-top: 18px;
  border-bottom: 1px solid rgb(106 74 54 / 0.25);
  padding: 26px 3px 4px;
}

.signature-input > img {
  position: absolute;
  top: -14px;
  left: 18px;
  width: 84px;
  opacity: 0.76;
}

.signature-input > span {
  position: absolute;
  top: 4px;
  left: 3px;
  color: #998170;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 9px;
}

.signature-input input {
  width: 100%;
  min-width: 0;
  height: 42px;
  border: 0;
  outline: 0;
  background: transparent;
  color: #49362c;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 14px;
}

.form-error,
.saved-message {
  display: flex;
  min-height: 32px;
  align-items: center;
  gap: 5px;
  margin: 8px 0 0;
  color: #984a44;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 10px;
}

.saved-message {
  color: #547263;
}

.relationship-paper form > button {
  width: 100%;
  min-height: 47px;
  margin-top: 10px;
  border: 1px solid rgb(75 51 37 / 0.22);
  border-radius: 3px;
  background: #a6534c;
  color: #fff8e9;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 13px;
  font-weight: 700;
  box-shadow: 3px 4px 0 rgb(76 49 34 / 0.12);
}

.relationship-paper form > button:disabled {
  opacity: 0.5;
}

.identity-ticket {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 11px;
  margin-top: 20px;
  overflow: hidden;
  border: 1px solid rgb(99 68 50 / 0.15);
  background: #ead6ba;
  padding: 16px 15px 14px;
  box-shadow: 4px 5px 0 rgb(78 51 35 / 0.08);
  transform: rotate(0.45deg);
}

.identity-ticket::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 69px;
  border-left: 1px dashed rgb(104 72 52 / 0.23);
  content: "";
}

.ticket-notch {
  position: absolute;
  top: 50%;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #f5ecd9;
  transform: translateY(-50%);
}

.ticket-notch-left {
  left: -9px;
}

.ticket-notch-right {
  right: -9px;
}

.ticket-initial {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 50%;
  background: #fff7e6;
  color: #854f46;
  font-family: "Songti SC", "Noto Serif SC", serif;
  font-size: 20px;
  box-shadow: inset 0 0 0 1px rgb(113 75 53 / 0.14);
}

.identity-ticket > div:nth-of-type(2) {
  padding-left: 7px;
}

.identity-ticket h2 {
  font-size: 18px;
}

.identity-ticket > button {
  grid-column: 2;
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 6px 0 0 7px;
  border: 1px solid rgb(80 54 39 / 0.2);
  border-radius: 3px;
  background: rgb(255 248 232 / 0.62);
  color: #7d5143;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 11px;
  font-weight: 700;
}

.settings-footer {
  display: grid;
  place-items: center;
  padding: 27px 0 8px;
  text-align: center;
}

.settings-footer img {
  width: 55px;
  opacity: 0.58;
}

.settings-footer p {
  margin: -4px 0 0;
  color: #796051;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 12px;
}

.settings-footer a {
  margin-top: 9px;
  border-bottom: 1px solid #9e5049;
  color: #9e5049;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 11px;
  font-weight: 700;
}

@media (min-width: 640px) {
  .settings-journal {
    min-height: calc(100dvh - 32px);
    margin: 16px auto;
    border-radius: 6px;
  }
}
</style>
