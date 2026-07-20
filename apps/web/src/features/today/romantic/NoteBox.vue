<script setup lang="ts">
import type { VisibleNoteView } from "@our-tomorrow/contracts";
import { Check, CheckCheck, PenLine, X } from "lucide-vue-next";
import { computed, ref, watch } from "vue";

import {
  decorationAssetByKey,
  isIncoming,
  isUnread,
  noteDecoration,
  romanticArt,
} from "./romantic-model";
import { useSheetBodyLock } from "./use-sheet-body-lock";

const props = defineProps<{
  open: boolean;
  initialFilter: "unread" | "all";
  messages: VisibleNoteView[];
  currentUserId: string;
  timezone: string;
  markingIds: string[];
  markingAll: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  close: [];
  compose: [];
  markRead: [note: VisibleNoteView];
  markAllRead: [];
}>();

const filter = ref<"unread" | "all">(props.initialFilter);
const isOpen = computed(() => props.open);
useSheetBodyLock(isOpen);

const unreadMessages = computed(() =>
  props.messages.filter((note) => isUnread(note, props.currentUserId)),
);

const filteredMessages = computed(() =>
  filter.value === "unread" ? unreadMessages.value : props.messages,
);

const groupedMessages = computed(() => {
  const groups: Array<{ label: string; messages: VisibleNoteView[] }> = [];
  for (const note of filteredMessages.value) {
    const label = formatDate(note.createdAt);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup?.label === label) lastGroup.messages.push(note);
    else groups.push({ label, messages: [note] });
  }
  return groups;
});

watch(
  () => props.open,
  (open) => {
    if (open) filter.value = props.initialFilter;
  },
);

watch(
  () => props.initialFilter,
  (value) => {
    if (props.open) filter.value = value;
  },
);

function dateParts(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: props.timezone,
  }).formatToParts(new Date(value));
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function formatDate(value: string) {
  const nowParts = dateParts(new Date().toISOString());
  const noteParts = dateParts(value);
  const nowDay = Date.UTC(
    Number(nowParts.year),
    Number(nowParts.month) - 1,
    Number(nowParts.day),
  );
  const noteDay = Date.UTC(
    Number(noteParts.year),
    Number(noteParts.month) - 1,
    Number(noteParts.day),
  );
  const difference = Math.round((nowDay - noteDay) / 86_400_000);
  if (difference === 0) return "今天";
  if (difference === 1) return "昨天";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    timeZone: props.timezone,
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: props.timezone,
  }).format(new Date(value));
}

function noteState(note: VisibleNoteView) {
  if (isIncoming(note, props.currentUserId)) {
    return isUnread(note, props.currentUserId) ? "未读" : "已读";
  }
  return note.status === "VIEWED" ? "对方已读" : "已送达";
}
</script>

<template>
  <Teleport to="body">
    <Transition name="note-box-transition">
      <div
        v-if="open"
        class="note-box-backdrop"
        role="presentation"
        @click.self="$emit('close')"
      >
        <section
          class="note-box"
          role="dialog"
          aria-modal="true"
          aria-label="便笺匣"
          data-testid="note-box"
          @keydown.esc="$emit('close')"
        >
          <div class="note-box-handle" aria-hidden="true" />

          <header class="note-box-header">
            <img :src="romanticArt.envelopeOpen" alt="" aria-hidden="true" />
            <div>
              <p>NOTES BETWEEN US</p>
              <h2>便笺匣</h2>
              <span
                >{{ messages.length }} 张往来 ·
                {{ unreadMessages.length }} 张未读</span
              >
            </div>
            <button
              type="button"
              aria-label="关闭便笺匣"
              @click="$emit('close')"
            >
              <X class="size-5" />
            </button>
          </header>

          <div class="note-box-toolbar">
            <div class="note-filter" role="group" aria-label="筛选便笺">
              <button
                type="button"
                :class="{ selected: filter === 'unread' }"
                @click="filter = 'unread'"
              >
                未读 <span>{{ unreadMessages.length }}</span>
              </button>
              <button
                type="button"
                :class="{ selected: filter === 'all' }"
                @click="filter = 'all'"
              >
                全部 <span>{{ messages.length }}</span>
              </button>
            </div>

            <button
              v-if="unreadMessages.length"
              class="mark-all-button"
              type="button"
              :disabled="markingAll"
              @click="$emit('markAllRead')"
            >
              <CheckCheck class="size-3.5" />
              {{ markingAll ? "正在收好…" : "全部读过了" }}
            </button>
          </div>

          <p v-if="error" class="note-box-error" role="alert">{{ error }}</p>

          <div class="note-box-scroll">
            <div v-if="groupedMessages.length" class="note-groups">
              <section
                v-for="group in groupedMessages"
                :key="group.label"
                class="date-group"
              >
                <div class="date-divider">
                  <img
                    :src="romanticArt.springDivider"
                    alt=""
                    aria-hidden="true"
                  />
                  <span>{{ group.label }}</span>
                </div>

                <article
                  v-for="note in group.messages"
                  :key="note.id"
                  class="stored-note"
                  :class="{
                    mine: !isIncoming(note, currentUserId),
                    unread: isUnread(note, currentUserId),
                  }"
                >
                  <img
                    :src="decorationAssetByKey[noteDecoration(note.icon)]"
                    alt=""
                    aria-hidden="true"
                  />
                  <header>
                    <span>
                      {{
                        isIncoming(note, currentUserId)
                          ? `${note.author.nicknameInRelationship || note.author.displayName}写给我`
                          : `我写给${note.recipient.nicknameInRelationship || note.recipient.displayName}`
                      }}
                    </span>
                    <time :datetime="note.createdAt">{{
                      formatTime(note.createdAt)
                    }}</time>
                  </header>
                  <p>{{ note.content }}</p>
                  <footer>
                    <span
                      :class="
                        isUnread(note, currentUserId)
                          ? 'unread-state'
                          : 'read-state'
                      "
                    >
                      <i v-if="isUnread(note, currentUserId)" />
                      <Check v-else class="size-3" />
                      {{ noteState(note) }}
                    </span>
                    <button
                      v-if="isUnread(note, currentUserId)"
                      type="button"
                      :disabled="markingIds.includes(note.id)"
                      @click="$emit('markRead', note)"
                    >
                      {{ markingIds.includes(note.id) ? "收好中…" : "读过了" }}
                    </button>
                    <small>NO. {{ note.id.slice(-3).toUpperCase() }}</small>
                  </footer>
                </article>
              </section>
            </div>

            <div v-else class="empty-notes">
              <img
                :src="romanticArt.journalCollage"
                alt=""
                aria-hidden="true"
              />
              <h3>
                {{ filter === "unread" ? "没有未读便笺了" : "便笺匣还是空的" }}
              </h3>
              <p>
                {{
                  filter === "unread"
                    ? "读过的话仍会安静地收在“全部”里。"
                    : "第一张便笺，可以只写一句很小的话。"
                }}
              </p>
              <button
                v-if="filter === 'unread'"
                type="button"
                @click="filter = 'all'"
              >
                看看全部往来
              </button>
            </div>
          </div>

          <footer class="note-box-footer">
            <button type="button" @click="$emit('compose')">
              <PenLine class="size-4" />
              写一张新便笺
            </button>
          </footer>

          <img
            class="note-box-flower"
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
.note-box-backdrop {
  position: fixed;
  z-index: 160;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-top: 36px;
  background: rgb(48 36 31 / 0.46);
  backdrop-filter: blur(7px);
}

.note-box {
  position: relative;
  display: flex;
  width: min(100%, 520px);
  max-height: calc(100dvh - 18px);
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgb(105 75 55 / 0.22);
  border-radius: 29px 29px 0 0;
  background-color: #f4e8d1;
  background-image:
    linear-gradient(
      90deg,
      transparent 27px,
      rgb(179 89 80 / 0.1) 28px,
      transparent 29px
    ),
    repeating-linear-gradient(
      0deg,
      transparent,
      transparent 31px,
      rgb(101 125 128 / 0.07) 32px
    );
  color: #443229;
  box-shadow: 0 -28px 80px rgb(51 37 30 / 0.3);
}

.note-box::before {
  position: absolute;
  z-index: 0;
  inset: 0;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.76' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.14'/%3E%3C/svg%3E");
  content: "";
  mix-blend-mode: multiply;
  opacity: 0.19;
}

.note-box-handle,
.note-box-header,
.note-box-toolbar,
.note-box-error,
.note-box-scroll,
.note-box-footer {
  position: relative;
  z-index: 2;
}

.note-box-handle {
  width: 42px;
  height: 5px;
  flex: 0 0 auto;
  margin: 10px auto 7px;
  border-radius: 999px;
  background: #6c574a;
  opacity: 0.24;
}

.note-box-header {
  display: grid;
  grid-template-columns: 62px minmax(0, 1fr) 38px;
  align-items: center;
  gap: 10px;
  padding: 6px 18px 13px;
}

.note-box-header > img {
  width: 62px;
  height: 52px;
  object-fit: contain;
  filter: drop-shadow(1px 3px 3px rgb(72 47 34 / 0.13));
}

.note-box-header p {
  margin: 0;
  color: #a0524c;
  font-family: "Courier New", monospace;
  font-size: 7px;
  font-weight: 700;
  letter-spacing: 0.14em;
}

.note-box-header h2 {
  margin: 2px 0 0;
  font-family: "Songti SC", "Noto Serif SC", serif;
  font-size: 26px;
  line-height: 1.05;
}

.note-box-header span {
  display: block;
  margin-top: 4px;
  color: #846a58;
  font-size: 10px;
}

.note-box-header > button {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid rgb(95 67 51 / 0.12);
  border-radius: 50%;
  background: rgb(255 250 239 / 0.58);
}

.note-box-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-top: 1px dashed rgb(104 76 57 / 0.16);
  border-bottom: 1px dashed rgb(104 76 57 / 0.16);
  padding: 10px 18px;
}

.note-filter {
  display: inline-flex;
  padding: 3px;
  border: 1px solid rgb(99 70 52 / 0.12);
  border-radius: 999px;
  background: rgb(255 250 239 / 0.48);
}

.note-filter button {
  min-height: 30px;
  border-radius: 999px;
  padding: 0 11px;
  color: #806655;
  font-size: 10px;
  font-weight: 700;
}

.note-filter button.selected {
  background: #6d4b3b;
  color: #fff8eb;
  box-shadow: 1px 2px 3px rgb(73 47 33 / 0.12);
}

.note-filter span {
  margin-left: 3px;
  opacity: 0.65;
}

.mark-all-button {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  gap: 5px;
  border: 0;
  background: transparent;
  color: #a1514b;
  font-size: 10px;
  font-weight: 700;
}

.mark-all-button:disabled {
  opacity: 0.5;
}

.note-box-error {
  margin: 8px 18px 0;
  border-left: 3px solid #a6534c;
  background: rgb(166 83 76 / 0.08);
  padding: 8px 10px;
  color: #8d403b;
  font-size: 11px;
}

.note-box-scroll {
  min-height: 180px;
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 0 18px 20px;
  overscroll-behavior: contain;
}

.date-group {
  display: grid;
  gap: 13px;
}

.date-divider {
  position: relative;
  display: grid;
  height: 51px;
  place-items: center;
  margin-top: 8px;
}

.date-divider img {
  position: absolute;
  width: 235px;
  max-width: 82%;
  opacity: 0.68;
}

.date-divider span {
  position: relative;
  z-index: 1;
  background: #f4e8d1;
  padding: 0 8px;
  color: #876b59;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 11px;
  font-weight: 700;
}

.stored-note {
  position: relative;
  width: calc(100% - 12px);
  border: 1px solid rgb(102 73 55 / 0.13);
  background: #fff8e8;
  padding: 15px 62px 13px 15px;
  box-shadow: 4px 5px 0 rgb(79 53 36 / 0.08);
  transform: rotate(-0.3deg);
}

.stored-note.mine {
  margin-left: 12px;
  background: #f4e2d7;
  transform: rotate(0.35deg);
}

.stored-note.unread {
  border-color: rgb(169 80 73 / 0.35);
  box-shadow:
    0 0 0 2px rgb(169 80 73 / 0.06),
    4px 5px 0 rgb(79 53 36 / 0.09);
}

.stored-note > img {
  position: absolute;
  right: 6px;
  bottom: 0;
  width: 56px;
  height: 65px;
  object-fit: contain;
  filter: drop-shadow(1px 3px 2px rgb(74 49 34 / 0.12));
}

.stored-note header,
.stored-note footer {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.stored-note header {
  color: #966357;
  font-family: "Courier New", monospace;
  font-size: 7px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.stored-note p {
  position: relative;
  z-index: 1;
  margin: 12px 0;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 15px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.stored-note footer {
  justify-content: flex-start;
  min-height: 24px;
}

.stored-note footer > span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #7e6a5c;
  font-size: 9px;
  font-weight: 700;
}

.stored-note .unread-state {
  color: #a34e48;
}

.unread-state i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #b94f48;
  box-shadow: 0 0 0 3px rgb(185 79 72 / 0.1);
}

.stored-note footer button {
  min-height: 25px;
  border: 1px solid rgb(163 78 71 / 0.2);
  border-radius: 999px;
  background: rgb(255 249 235 / 0.72);
  padding: 0 9px;
  color: #9f4d47;
  font-size: 9px;
  font-weight: 700;
}

.stored-note footer button:disabled {
  opacity: 0.5;
}

.stored-note footer small {
  margin-left: auto;
  color: #a58d7c;
  font-family: "Courier New", monospace;
  font-size: 7px;
}

.empty-notes {
  display: grid;
  min-height: 330px;
  place-items: center;
  align-content: center;
  padding: 20px;
  text-align: center;
}

.empty-notes > img {
  width: 138px;
  margin-bottom: -8px;
  opacity: 0.82;
}

.empty-notes h3 {
  margin: 0;
  font-family: "Songti SC", "Noto Serif SC", serif;
  font-size: 20px;
}

.empty-notes p {
  margin: 8px 0 0;
  color: #806b5c;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 12px;
}

.empty-notes button {
  min-height: 36px;
  margin-top: 15px;
  border-bottom: 1px solid #9e5049;
  color: #9e5049;
  font-size: 11px;
  font-weight: 700;
}

.note-box-footer {
  flex: 0 0 auto;
  border-top: 1px solid rgb(102 73 55 / 0.12);
  background: rgb(244 232 209 / 0.91);
  padding: 11px 18px calc(12px + env(safe-area-inset-bottom));
  backdrop-filter: blur(8px);
}

.note-box-footer button {
  display: flex;
  width: 100%;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid rgb(76 51 37 / 0.22);
  border-radius: 3px;
  background: #a6534c;
  color: #fff7e9;
  font-family: "Kaiti SC", "STKaiti", serif;
  font-size: 14px;
  font-weight: 700;
  box-shadow: 3px 4px 0 rgb(76 49 34 / 0.12);
}

.note-box-flower {
  position: absolute;
  z-index: 1;
  right: -28px;
  bottom: 54px;
  width: 105px;
  pointer-events: none;
  opacity: 0.13;
  transform: rotate(-7deg);
}

.note-box-transition-enter-active,
.note-box-transition-leave-active {
  transition: opacity 180ms ease;
}

.note-box-transition-enter-active .note-box,
.note-box-transition-leave-active .note-box {
  transition: transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
}

.note-box-transition-enter-from,
.note-box-transition-leave-to {
  opacity: 0;
}

.note-box-transition-enter-from .note-box,
.note-box-transition-leave-to .note-box {
  transform: translateY(55px);
}

@media (min-width: 640px) {
  .note-box-backdrop {
    align-items: center;
    padding: 24px;
  }

  .note-box {
    max-height: min(820px, calc(100dvh - 48px));
    border-radius: 29px;
  }
}
</style>
