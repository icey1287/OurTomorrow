<script setup lang="ts">
import type { CurrentStatusSummary, NoteView } from "@our-tomorrow/contracts";
import {
  ChevronRight,
  MapPin,
  PenLine,
  RefreshCw,
  Settings,
} from "lucide-vue-next";
import { computed } from "vue";
import { RouterLink } from "vue-router";

import NoteImage from "./NoteImage.vue";
import {
  decorationAssetByKey,
  isIncoming,
  isUnread,
  noteDecoration,
  romanticArt,
  statusAssetByKey,
  statusPresentation,
} from "./romantic-model";

const props = defineProps<{
  myName: string;
  partnerName: string;
  signature: string | null;
  currentUserId: string;
  myStatus: CurrentStatusSummary | null;
  partnerStatus: CurrentStatusSummary | null;
  latestNote: NoteView | null;
  unreadCount: number;
  timezone: string;
  loading: boolean;
  error: string | null;
}>();

defineEmits<{
  openStatus: [];
  openMessage: [];
  openInbox: [filter: "unread" | "all"];
  openLocation: [];
  retry: [];
}>();

const myStatusLook = computed(() =>
  props.myStatus ? statusPresentation(props.myStatus.kind) : null,
);
const partnerStatusLook = computed(() =>
  props.partnerStatus ? statusPresentation(props.partnerStatus.kind) : null,
);
const latestIsIncoming = computed(() =>
  props.latestNote ? isIncoming(props.latestNote, props.currentUserId) : false,
);
const latestIsUnread = computed(() =>
  props.latestNote ? isUnread(props.latestNote, props.currentUserId) : false,
);
const latestDecoration = computed(
  () => decorationAssetByKey[noteDecoration(props.latestNote?.icon ?? null)],
);
const hasPartnerCoordinates = computed(
  () =>
    props.partnerStatus?.latitude !== null &&
    props.partnerStatus?.latitude !== undefined &&
    props.partnerStatus?.longitude !== null &&
    props.partnerStatus?.longitude !== undefined,
);
const unreadBadgeLabel = computed(() => {
  if (!props.unreadCount) return "便笺匣";
  if (!latestIsUnread.value) return `${props.unreadCount} 张未读`;
  const remaining = Math.max(props.unreadCount - 1, 0);
  return remaining > 0 ? `还有 ${remaining} 张` : "1 张未读";
});

const initials = computed(() => ({
  mine: props.myName.trim().slice(0, 1) || "我",
  partner: props.partnerName.trim().slice(0, 1) || "你",
}));

const now = new Date();
const dateParts = new Intl.DateTimeFormat("en", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: props.timezone,
}).formatToParts(now);
const part = (type: string) =>
  dateParts.find((item) => item.type === type)?.value ?? "";
const day = part("day");
const month = part("month").toUpperCase();
const year = part("year");
const weekday = new Intl.DateTimeFormat("zh-CN", {
  weekday: "long",
  timeZone: props.timezone,
}).format(now);

const petals = [
  { left: "7%", delay: "-2s", duration: "12s", size: "17px" },
  { left: "28%", delay: "-8s", duration: "15s", size: "12px" },
  { left: "52%", delay: "-5s", duration: "13s", size: "15px" },
  { left: "73%", delay: "-10s", duration: "16s", size: "11px" },
  { left: "91%", delay: "-4s", duration: "14s", size: "14px" },
];

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: props.timezone,
  }).format(new Date(value));
}

function relativeStatusTime(status: CurrentStatusSummary | null) {
  if (!status) return "等待更新";
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(status.startsAt).getTime()) / 60_000),
  );
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  return formatTime(status.startsAt);
}

function latestState() {
  const note = props.latestNote;
  if (!note) return "";
  if (latestIsIncoming.value) return latestIsUnread.value ? "未读" : "已读";
  return note.status === "VIEWED" ? "对方已读" : "已送达";
}
</script>

<template>
  <main class="journal-page">
    <div class="paper-grain" aria-hidden="true" />

    <div class="book-spine" aria-hidden="true">
      <span v-for="index in 7" :key="index" />
    </div>

    <div class="petal-field" aria-hidden="true">
      <img
        v-for="(petal, index) in petals"
        :key="index"
        :src="romanticArt.pinkPetal"
        alt=""
        :style="{
          left: petal.left,
          width: petal.size,
          animationDelay: petal.delay,
          animationDuration: petal.duration,
        }"
      />
    </div>

    <div class="flying-butterfly" aria-hidden="true">
      <img :src="romanticArt.butterflyOpen" alt="" />
    </div>

    <header class="journal-header">
      <div class="title-copy">
        <p>OUR TOMORROW · CARNET À DEUX</p>
        <h1>今天的我们</h1>
        <div class="date-line">
          <strong>{{ day }}</strong>
          <span>{{ month }} {{ year }}<br />{{ weekday }}</span>
        </div>
      </div>

      <div
        class="couple-seal"
        :aria-label="`${myName}和${partnerName}的专属植物徽记`"
      >
        <img :src="romanticArt.coupleEmblem" alt="" aria-hidden="true" />
        <span
          ><b>{{ initials.mine }}</b
          ><i>&amp;</i><b>{{ initials.partner }}</b></span
        >
        <RouterLink to="/settings" aria-label="打开设置">
          <Settings class="size-3.5" />
        </RouterLink>
      </div>
    </header>

    <p class="handwritten-line">
      <img :src="romanticArt.microHearts" alt="" aria-hidden="true" />
      “{{ signature || "普通的一天，也值得好好夹进书里。" }}”
    </p>

    <p v-if="loading" class="loading-slip" role="status">
      正在轻轻翻开今天这一页…
    </p>

    <div v-else-if="error" class="error-slip" role="alert">
      <span>{{ error }}</span>
      <button type="button" @click="$emit('retry')">
        <RefreshCw class="size-3.5" />再试一次
      </button>
    </div>

    <section class="partner-card" aria-labelledby="partner-status-title">
      <span class="paper-tape tape-top" aria-hidden="true" />
      <img
        class="partner-botanical"
        :src="romanticArt.springFloralCorner"
        alt=""
        aria-hidden="true"
      />

      <header class="partner-card-heading">
        <span
          >{{ partnerName.toUpperCase() }}'S MOMENT ·
          {{ relativeStatusTime(partnerStatus) }}</span
        >
        <i aria-hidden="true">♡</i>
      </header>

      <div class="partner-status-body">
        <div class="partner-sticker">
          <img
            v-if="partnerStatusLook"
            :src="statusAssetByKey[partnerStatusLook.key]"
            alt=""
            aria-hidden="true"
          />
          <img
            v-else
            :src="romanticArt.statusLocation"
            alt=""
            aria-hidden="true"
          />
        </div>
        <div class="partner-copy">
          <small>{{ partnerName }}的此刻</small>
          <h2 id="partner-status-title">
            {{ partnerStatusLook?.label || "还没有贴上状态" }}
          </h2>
          <button
            type="button"
            class="partner-location"
            :disabled="!hasPartnerCoordinates"
            :aria-label="
              hasPartnerCoordinates
                ? `查看${partnerName}在${partnerStatus?.location}的地图位置`
                : `${partnerName}还没有发送地图位置`
            "
            @click="$emit('openLocation')"
          >
            <MapPin class="size-3.5" />
            <span>{{ partnerStatus?.location || "还没有留下位置" }}</span>
            <small v-if="hasPartnerCoordinates">查看地图</small>
            <ChevronRight v-if="hasPartnerCoordinates" class="size-3" />
          </button>
          <p v-if="partnerStatus?.locationAddress" class="partner-address">
            {{ partnerStatus.locationAddress }}
          </p>
        </div>
      </div>

      <blockquote>
        “{{
          partnerStatus?.message ||
          "等对方有空时，这里会出现一张新的此刻贴纸。"
        }}”
      </blockquote>
    </section>

    <button class="my-status-ticket" type="button" @click="$emit('openStatus')">
      <span class="ticket-notch ticket-notch-left" aria-hidden="true" />
      <span class="ticket-notch ticket-notch-right" aria-hidden="true" />
      <img
        :src="
          myStatusLook
            ? statusAssetByKey[myStatusLook.key]
            : romanticArt.statusLocation
        "
        alt=""
        aria-hidden="true"
      />
      <span class="ticket-copy">
        <small>MY MOMENT · 轻点更新</small>
        <strong>{{ myStatusLook?.label || "留下我的此刻" }}</strong>
        <em>
          {{ myStatus?.location || "状态 + 位置" }}
          <template v-if="myStatus?.message">
            · {{ myStatus.message }}</template
          >
        </em>
      </span>
      <ChevronRight class="size-5" aria-hidden="true" />
    </button>

    <div class="floral-divider" aria-hidden="true">
      <img :src="romanticArt.springDivider" alt="" />
      <span>LOVE NOTE</span>
    </div>

    <section class="message-paper" aria-label="最新便笺">
      <span class="paper-tape tape-side" aria-hidden="true" />
      <img
        class="message-stamp"
        :src="romanticArt.microStamp"
        alt=""
        aria-hidden="true"
      />

      <button
        v-if="latestNote"
        class="message-reading"
        type="button"
        data-testid="latest-note-card"
        aria-label="打开便笺匣，查看全部往来留言"
        @click="$emit('openInbox', 'all')"
      >
        <header>
          <img :src="latestDecoration" alt="" aria-hidden="true" />
          <div>
            <span class="message-kicker">
              <small>
                {{
                  latestIsIncoming
                    ? `FROM ${partnerName.toUpperCase()}`
                    : "FROM ME"
                }}
              </small>
              <i :class="{ unread: latestIsUnread }">{{ latestState() }}</i>
            </span>
            <h2>刚刚夹进来的话</h2>
          </div>
        </header>

        <span v-if="latestNote.image" class="latest-note-photo">
          <NoteImage :note-id="latestNote.id" alt="便笺照片" />
        </span>

        <blockquote>{{ latestNote.content }}</blockquote>

        <footer>
          <span>TODAY · {{ formatTime(latestNote.createdAt) }}</span>
          <i>note no. {{ latestNote.id.slice(-3).toUpperCase() }}</i>
        </footer>
      </button>

      <div v-else class="empty-latest-note">
        <img :src="romanticArt.journalCollage" alt="" aria-hidden="true" />
        <div>
          <small>FIRST NOTE</small>
          <h2>这里还没有便笺</h2>
          <p>第一张不用写很多，一句“想你了”就够。</p>
        </div>
      </div>

      <div class="message-actions">
        <button
          class="write-note-button"
          type="button"
          @click="$emit('openMessage')"
        >
          <PenLine class="size-4" aria-hidden="true" />
          <span>
            <small>写给{{ partnerName }}</small>
            <strong>放一张新便笺</strong>
          </span>
        </button>

        <button
          class="inbox-envelope-button"
          type="button"
          data-testid="note-box-envelope"
          aria-label="打开便笺匣，查看未读留言"
          @click="$emit('openInbox', unreadCount ? 'unread' : 'all')"
        >
          <img :src="romanticArt.envelopeClosed" alt="" aria-hidden="true" />
          <span v-if="unreadCount" data-testid="unread-badge">{{
            unreadBadgeLabel
          }}</span>
          <small>便笺匣</small>
        </button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.journal-page {
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
  padding: max(24px, env(safe-area-inset-top)) 18px
    calc(34px + env(safe-area-inset-bottom)) 42px;
  color: #443229;
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
  box-shadow:
    0 0 70px rgb(70 45 30 / 0.17),
    inset 18px 0 34px rgb(83 56 38 / 0.05);
}

.journal-page button,
.journal-page a {
  color: inherit;
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
  bottom: 46px;
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
  box-shadow: inset 1px 1px 2px rgb(73 54 42 / 0.2);
}

.journal-header,
.handwritten-line,
.loading-slip,
.error-slip,
.partner-card,
.my-status-ticket,
.floral-divider,
.message-paper {
  position: relative;
  z-index: 3;
}

.journal-header {
  min-height: 132px;
}

.title-copy {
  position: relative;
  z-index: 2;
  width: 67%;
}

.title-copy > p {
  margin: 0;
  color: #8f5149;
  font-family: "Courier New", monospace;
  font-size: 7px;
  font-weight: 700;
  letter-spacing: 0.11em;
}

.title-copy h1 {
  margin: 7px 0 0;
  font-family: "Songti SC", "Noto Serif SC", serif;
  font-size: clamp(35px, 10vw, 43px);
  font-weight: 700;
  line-height: 1.12;
  letter-spacing: -0.06em;
}

.date-line {
  display: inline-grid;
  grid-template-columns: auto auto;
  align-items: center;
  gap: 7px;
  margin-top: 9px;
  transform: rotate(-1deg);
}

.date-line strong {
  font-family: Georgia, serif;
  font-size: 27px;
  font-weight: 400;
  line-height: 1;
}

.date-line span {
  border-left: 1px solid rgb(77 54 42 / 0.3);
  padding-left: 7px;
  font-family: "Courier New", monospace;
  font-size: 7px;
  font-weight: 700;
  line-height: 1.45;
  letter-spacing: 0.06em;
}

.couple-seal {
  position: absolute;
  z-index: 1;
  top: -16px;
  right: -12px;
  width: 139px;
  height: 139px;
}

.couple-seal > img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(2px 5px 4px rgb(68 47 34 / 0.16));
  transform: rotate(4deg);
}

.couple-seal > span {
  position: absolute;
  top: 44px;
  left: 41px;
  display: flex;
  width: 57px;
  height: 57px;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border-radius: 50%;
  color: #694a3e;
  font-family: "Kaiti SC", "STKaiti", serif;
  transform: rotate(4deg);
}

.couple-seal b {
  font-size: 15px;
}

.couple-seal i {
  color: #a0514a;
  font-family: Georgia, serif;
  font-size: 12px;
}

.couple-seal > a {
  position: absolute;
  right: 4px;
  bottom: 18px;
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid rgb(93 61 44 / 0.18);
  border-radius: 50%;
  background: rgb(255 247 229 / 0.88);
  box-shadow: 1px 2px 4px rgb(70 46 31 / 0.12);
}

.handwritten-line {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 3px 0 19px;
  color: #755748;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 12px;
  transform: rotate(-0.5deg);
}

.handwritten-line img {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.loading-slip,
.error-slip {
  margin: -7px 0 15px;
  border: 1px dashed rgb(133 91 66 / 0.2);
  background: rgb(255 249 233 / 0.58);
  padding: 9px 12px;
  color: #806454;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 11px;
  text-align: center;
  transform: rotate(0.25deg);
}

.error-slip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-color: rgb(166 83 76 / 0.26);
  color: #8f4842;
  text-align: left;
}

.error-slip button {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  border-bottom: 1px solid currentColor;
  font-size: 10px;
  font-weight: 700;
}

.partner-card {
  min-height: 177px;
  overflow: hidden;
  border: 1px solid rgb(110 80 59 / 0.15);
  background: rgb(255 250 237 / 0.72);
  padding: 17px 18px 14px;
  box-shadow: 5px 6px 0 rgb(86 57 39 / 0.08);
  transform: rotate(-0.45deg);
}

.paper-tape {
  position: absolute;
  z-index: 5;
  display: block;
  background: rgb(215 195 157 / 0.58);
  box-shadow: inset 0 0 0 1px rgb(125 92 61 / 0.05);
}

.tape-top {
  top: -7px;
  left: 50%;
  width: 75px;
  height: 18px;
  transform: translateX(-50%) rotate(1deg);
}

.partner-botanical {
  position: absolute;
  z-index: 0;
  right: -35px;
  bottom: -47px;
  width: 166px;
  opacity: 0.35;
  transform: rotate(-4deg);
}

.partner-card-heading {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  color: #9b6155;
  font-family: "Courier New", monospace;
  font-size: 7px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.partner-card-heading i {
  font-family: Georgia, serif;
  font-size: 14px;
}

.partner-status-body {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  margin-top: 5px;
}

.partner-sticker {
  display: grid;
  height: 80px;
  place-items: center;
}

.partner-sticker img {
  width: 100%;
  max-height: 80px;
  object-fit: contain;
  filter: drop-shadow(2px 4px 3px rgb(68 47 34 / 0.14));
}

.partner-copy small {
  color: #8b6e5c;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 10px;
}

.partner-copy h2 {
  margin: 2px 0 0;
  font-family: "Songti SC", "Noto Serif SC", serif;
  font-size: 19px;
  line-height: 1.2;
}

.partner-location {
  display: grid;
  max-width: 100%;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 4px;
  margin-top: 5px;
  background: transparent;
  padding: 0;
  color: #856a59;
  font-size: 10px;
  text-align: left;
}

.partner-location > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.partner-location > small {
  color: #a6534c;
  font-size: 9px;
  white-space: nowrap;
}

.partner-location:disabled {
  cursor: default;
}

.partner-copy p {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 5px 0 0;
  color: #856a59;
  font-size: 10px;
}

.partner-copy .partner-address {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.35;
}

.partner-card blockquote {
  position: relative;
  z-index: 2;
  margin: 7px 0 0;
  border-top: 1px dashed rgb(113 80 58 / 0.16);
  padding-top: 9px;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 12px;
  line-height: 1.45;
}

.my-status-ticket {
  position: relative;
  display: grid;
  width: calc(100% - 9px);
  min-height: 78px;
  grid-template-columns: 72px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  margin: 15px 0 0 9px;
  overflow: hidden;
  border: 1px solid rgb(95 66 48 / 0.14);
  border-radius: 3px;
  background: #eddcc3;
  padding: 8px 11px 8px 7px;
  text-align: left;
  box-shadow: 4px 5px 0 rgb(81 54 38 / 0.08);
  transform: rotate(0.55deg);
}

.my-status-ticket::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 77px;
  border-left: 1px dashed rgb(105 73 52 / 0.23);
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

.my-status-ticket > img {
  width: 66px;
  height: 58px;
  object-fit: contain;
  filter: drop-shadow(1px 3px 2px rgb(72 49 35 / 0.12));
}

.ticket-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
  padding-left: 4px;
}

.ticket-copy small {
  color: #9d5b51;
  font-family: "Courier New", monospace;
  font-size: 7px;
  font-weight: 700;
  letter-spacing: 0.07em;
}

.ticket-copy strong {
  font-family: "Songti SC", "Noto Serif SC", serif;
  font-size: 17px;
}

.ticket-copy em {
  overflow: hidden;
  color: #806655;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 10px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.floral-divider {
  display: grid;
  height: 70px;
  place-items: center;
  margin: 3px 0 -2px;
}

.floral-divider img {
  position: absolute;
  width: 285px;
  max-width: 95%;
  opacity: 0.77;
}

.floral-divider span {
  position: relative;
  z-index: 1;
  background: #f5ecd9;
  padding: 0 9px;
  color: #9b5d53;
  font-family: "Courier New", monospace;
  font-size: 7px;
  font-weight: 700;
  letter-spacing: 0.14em;
}

.message-paper {
  position: relative;
  border: 1px solid rgb(108 76 56 / 0.15);
  background: #fff8e8;
  padding: 15px 15px 13px;
  box-shadow: 6px 7px 0 rgb(80 54 37 / 0.08);
  transform: rotate(-0.35deg);
}

.tape-side {
  top: -8px;
  left: 28px;
  width: 61px;
  height: 18px;
  transform: rotate(-2deg);
}

.message-stamp {
  position: absolute;
  z-index: 3;
  top: -22px;
  right: -4px;
  width: 58px;
  height: 66px;
  object-fit: contain;
  opacity: 0.8;
  transform: rotate(8deg);
}

.message-reading {
  width: 100%;
  border: 0;
  background: transparent;
  padding: 0;
  text-align: left;
}

.message-reading header {
  display: grid;
  grid-template-columns: 53px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}

.message-reading header > img {
  width: 53px;
  height: 55px;
  object-fit: contain;
  filter: drop-shadow(1px 3px 2px rgb(72 49 34 / 0.12));
}

.message-kicker {
  display: flex;
  align-items: center;
  gap: 7px;
}

.message-kicker small {
  color: #9b6055;
  font-family: "Courier New", monospace;
  font-size: 7px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.message-kicker i {
  border-radius: 999px;
  background: #e8ded0;
  padding: 2px 6px;
  color: #7d6b5d;
  font-size: 8px;
  font-style: normal;
  font-weight: 700;
}

.message-kicker i.unread {
  background: #a6534c;
  color: #fff8eb;
}

.message-reading h2 {
  margin: 3px 0 0;
  font-family: "Songti SC", "Noto Serif SC", serif;
  font-size: 18px;
}

.latest-note-photo {
  display: block;
  height: 178px;
  margin: 12px 3px 14px;
  border: 7px solid #fffdf5;
  background: #eadfc9;
  box-shadow: 2px 5px 12px rgb(67 45 32 / 0.15);
  transform: rotate(-0.45deg);
}

.message-reading blockquote {
  margin: 11px 4px 13px;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 16px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.message-reading footer {
  display: flex;
  justify-content: space-between;
  border-top: 1px dashed rgb(110 78 57 / 0.16);
  padding: 8px 3px 0;
  color: #99806f;
  font-family: "Courier New", monospace;
  font-size: 7px;
  font-weight: 700;
}

.message-reading footer i {
  font-style: normal;
}

.empty-latest-note {
  display: grid;
  min-height: 145px;
  grid-template-columns: 95px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 4px 5px 9px;
}

.empty-latest-note img {
  width: 100px;
  opacity: 0.82;
}

.empty-latest-note small {
  color: #a0524c;
  font-family: "Courier New", monospace;
  font-size: 7px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.empty-latest-note h2 {
  margin: 5px 0 0;
  font-family: "Songti SC", "Noto Serif SC", serif;
  font-size: 19px;
}

.empty-latest-note p {
  margin: 6px 0 0;
  color: #7e6657;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 11px;
  line-height: 1.5;
}

.message-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 92px;
  gap: 9px;
  margin-top: 13px;
}

.write-note-button {
  display: flex;
  min-height: 57px;
  align-items: center;
  gap: 10px;
  border: 1px solid rgb(74 50 37 / 0.22);
  border-radius: 3px;
  background: #a6534c;
  padding: 0 14px;
  color: #fff8e9 !important;
  text-align: left;
  box-shadow: 3px 4px 0 rgb(76 49 34 / 0.12);
}

.write-note-button > span {
  display: grid;
}

.write-note-button small {
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 9px;
  opacity: 0.72;
}

.write-note-button strong {
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 13px;
}

.inbox-envelope-button {
  position: relative;
  display: grid;
  min-height: 57px;
  place-items: center;
  border: 1px solid rgb(106 75 54 / 0.14);
  border-radius: 3px;
  background: #efe1c8;
  padding: 2px 4px 3px;
}

.inbox-envelope-button img {
  width: 64px;
  height: 35px;
  object-fit: contain;
  filter: drop-shadow(1px 2px 2px rgb(73 48 34 / 0.13));
}

.inbox-envelope-button > span {
  position: absolute;
  top: -8px;
  right: -7px;
  border: 2px solid #fff6e4;
  border-radius: 999px;
  background: #a6534c;
  padding: 3px 6px;
  color: #fff8eb;
  font-size: 8px;
  font-weight: 700;
  box-shadow: 1px 2px 3px rgb(72 45 31 / 0.14);
  white-space: nowrap;
}

.inbox-envelope-button small {
  margin-top: -3px;
  color: #765848;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 9px;
  font-weight: 700;
}

.petal-field {
  position: absolute;
  z-index: 9;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.petal-field img {
  position: absolute;
  top: -30px;
  height: auto;
  animation: petal-fall linear infinite;
  filter: drop-shadow(1px 2px 2px rgb(89 53 45 / 0.08));
  opacity: 0.68;
}

.flying-butterfly {
  position: absolute;
  z-index: 6;
  top: 287px;
  right: -12px;
  width: 49px;
  pointer-events: none;
  animation: butterfly-float 8s ease-in-out infinite;
}

.flying-butterfly img {
  width: 100%;
  filter: drop-shadow(2px 4px 3px rgb(56 41 34 / 0.15));
}

@keyframes petal-fall {
  0% {
    transform: translate3d(0, -30px, 0) rotate(0deg);
  }
  48% {
    transform: translate3d(24px, 48dvh, 0) rotate(190deg);
  }
  100% {
    transform: translate3d(-12px, 108dvh, 0) rotate(390deg);
  }
}

@keyframes butterfly-float {
  0%,
  100% {
    transform: translate3d(0, 0, 0) rotate(7deg);
  }
  35% {
    transform: translate3d(-18px, -17px, 0) rotate(-5deg);
  }
  68% {
    transform: translate3d(-7px, 12px, 0) rotate(2deg);
  }
}

@media (min-width: 640px) {
  .journal-page {
    min-height: calc(100dvh - 32px);
    margin: 16px auto;
    border-radius: 6px;
  }
}
</style>
