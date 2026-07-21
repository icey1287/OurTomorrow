<script setup lang="ts">
import type { NoteImageUpload, NoteView } from "@our-tomorrow/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, nextTick, ref, watch } from "vue";

import NoteBox from "@/features/today/romantic/NoteBox.vue";
import NoteComposer from "@/features/today/romantic/NoteComposer.vue";
import LocationMapSheet from "@/features/today/romantic/LocationMapSheet.vue";
import RomanticHomeCanvas from "@/features/today/romantic/RomanticHomeCanvas.vue";
import StatusComposer from "@/features/today/romantic/StatusComposer.vue";
import {
  isUnread,
  type NoteDecorationKey,
  visibleNotes,
} from "@/features/today/romantic/romantic-model";
import { ApiClientError } from "@/shared/api/client";
import { stageThreeApi } from "@/shared/api/stage-three";
import { useIdentityStore } from "@/shared/stores/identity";

const identity = useIdentityStore();
const queryClient = useQueryClient();
const statusComposerOpen = ref(false);
const noteComposerOpen = ref(false);
const noteBoxOpen = ref(false);
const locationMapOpen = ref(false);
const noteBoxFilter = ref<"unread" | "all">("all");
const statusActionError = ref<string | null>(null);
const noteSendError = ref<string | null>(null);
const noteBoxError = ref<string | null>(null);
const markingIds = ref<string[]>([]);
const markingAll = ref(false);

const statusesQuery = useQuery({
  queryKey: computed(() => ["statuses", identity.role]),
  queryFn: stageThreeApi.statuses,
  enabled: computed(() => Boolean(identity.role)),
  refetchInterval: 10_000,
});

const notesQuery = useQuery({
  queryKey: computed(() => ["notes", identity.role, "romantic-home"]),
  queryFn: stageThreeApi.notes,
  enabled: computed(() => Boolean(identity.role)),
  refetchInterval: 10_000,
});

const currentUserId = computed(() => identity.user?.id ?? "");
const myName = computed(() => identity.user?.displayName ?? "我");
const partnerName = computed(
  () =>
    identity.couple?.members.find((member) => member.id !== identity.user?.id)
      ?.displayName ?? "另一半",
);
const timezone = computed(() => identity.couple?.timezone ?? "Asia/Shanghai");
const myStatus = computed(() => statusesQuery.data.value?.mine ?? null);
const partnerStatus = computed(() => statusesQuery.data.value?.partner ?? null);
const messages = computed(() =>
  visibleNotes(notesQuery.data.value?.items ?? []),
);
const latestNote = computed(() => messages.value[0] ?? null);
const unreadMessages = computed(() =>
  messages.value.filter((note) => isUnread(note, currentUserId.value)),
);
const pageLoading = computed(
  () => statusesQuery.isPending.value || notesQuery.isPending.value,
);
const pageError = computed(() => {
  const errors = [statusesQuery.error.value, notesQuery.error.value].filter(
    Boolean,
  );
  if (!errors.length) return null;
  const first = errors[0];
  return first instanceof Error
    ? first.message
    : "今天这一页暂时没有完整打开，请稍后再试。";
});

function conflictMessage(error: unknown, noun: string) {
  if (
    error instanceof ApiClientError &&
    (error.code === "STATE_CONFLICT" || error.code === "PRECONDITION_REQUIRED")
  ) {
    return `${noun}刚刚在另一处更新了，已经为你刷新，请再试一次。`;
  }
  return error instanceof Error ? error.message : `${noun}没有保存成功。`;
}

async function refreshHome() {
  await Promise.all([statusesQuery.refetch(), notesQuery.refetch()]);
}

async function invalidateStatus() {
  await queryClient.invalidateQueries({ queryKey: ["statuses"] });
}

async function invalidateNotes() {
  await queryClient.invalidateQueries({ queryKey: ["notes"] });
}

const saveStatusMutation = useMutation({
  mutationFn: (input: {
    kind: Parameters<typeof stageThreeApi.setStatus>[0]["kind"];
    location: string;
    locationAddress: string | null;
    latitude: number | null;
    longitude: number | null;
    message: string;
  }) =>
    stageThreeApi.setStatus({
      kind: input.kind,
      location: input.location,
      locationAddress: input.locationAddress,
      latitude: input.latitude,
      longitude: input.longitude,
      message: input.message || null,
      expiresAt: new Date(Date.now() + 6 * 60 * 60_000).toISOString(),
      ...(myStatus.value ? { version: myStatus.value.version } : {}),
    }),
});

const clearStatusMutation = useMutation({
  mutationFn: (version: number) => stageThreeApi.clearStatus(version),
});

const sendNoteMutation = useMutation({
  mutationFn: (input: {
    content: string;
    decoration: NoteDecorationKey;
    image: NoteImageUpload | null;
  }) =>
    stageThreeApi.createNote({
      content: input.content,
      icon: input.decoration,
      image: input.image,
    }),
});

function openStatusComposer() {
  statusActionError.value = null;
  statusComposerOpen.value = true;
}

function openNoteComposer() {
  noteSendError.value = null;
  noteComposerOpen.value = true;
}

function openNoteBox(filter: "unread" | "all") {
  noteBoxError.value = null;
  noteBoxFilter.value = filter;
  noteBoxOpen.value = true;
}

function openPartnerLocation() {
  const status = partnerStatus.value;
  if (!status || status.latitude === null || status.longitude === null) {
    return;
  }
  locationMapOpen.value = true;
}

async function composeFromNoteBox() {
  noteBoxOpen.value = false;
  await nextTick();
  openNoteComposer();
}

async function saveStatus(input: {
  kind: Parameters<typeof stageThreeApi.setStatus>[0]["kind"];
  location: string;
  locationAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  message: string;
}) {
  if (saveStatusMutation.isPending.value) return;
  statusActionError.value = null;
  try {
    await saveStatusMutation.mutateAsync(input);
    await invalidateStatus();
    statusComposerOpen.value = false;
  } catch (error) {
    statusActionError.value = conflictMessage(error, "这张状态贴纸");
    if (error instanceof ApiClientError && error.code === "STATE_CONFLICT") {
      await queryClient.invalidateQueries({ queryKey: ["statuses"] });
    }
  }
}

async function clearStatus() {
  if (!myStatus.value || clearStatusMutation.isPending.value) return;
  statusActionError.value = null;
  try {
    await clearStatusMutation.mutateAsync(myStatus.value.version);
    await invalidateStatus();
    statusComposerOpen.value = false;
  } catch (error) {
    statusActionError.value = conflictMessage(error, "这张状态贴纸");
    await queryClient.invalidateQueries({ queryKey: ["statuses"] });
  }
}

async function sendNote(input: {
  content: string;
  decoration: NoteDecorationKey;
  image: NoteImageUpload | null;
}) {
  if (sendNoteMutation.isPending.value) return;
  noteSendError.value = null;
  try {
    await sendNoteMutation.mutateAsync(input);
    await invalidateNotes();
    noteComposerOpen.value = false;
  } catch (error) {
    noteSendError.value = conflictMessage(error, "这张便笺");
  }
}

async function markRead(note: NoteView) {
  if (markingIds.value.includes(note.id)) return;
  noteBoxError.value = null;
  markingIds.value = [...markingIds.value, note.id];
  try {
    await stageThreeApi.markNoteViewed(note.id, note.version);
    await invalidateNotes();
  } catch (error) {
    noteBoxError.value = conflictMessage(error, "这张便笺");
    await queryClient.invalidateQueries({ queryKey: ["notes"] });
  } finally {
    markingIds.value = markingIds.value.filter((id) => id !== note.id);
  }
}

async function markAllRead() {
  if (markingAll.value || !unreadMessages.value.length) return;
  noteBoxError.value = null;
  markingAll.value = true;
  const pending = [...unreadMessages.value];
  markingIds.value = pending.map((note) => note.id);
  try {
    await Promise.all(
      pending.map((note) =>
        stageThreeApi.markNoteViewed(note.id, note.version),
      ),
    );
    await invalidateNotes();
  } catch (error) {
    noteBoxError.value = conflictMessage(error, "未读便笺");
    await queryClient.invalidateQueries({ queryKey: ["notes"] });
  } finally {
    markingIds.value = [];
    markingAll.value = false;
  }
}

watch(
  () => identity.role,
  () => {
    statusComposerOpen.value = false;
    noteComposerOpen.value = false;
    noteBoxOpen.value = false;
    locationMapOpen.value = false;
  },
);
</script>

<template>
  <RomanticHomeCanvas
    :my-name="myName"
    :partner-name="partnerName"
    :signature="identity.couple?.signature || null"
    :current-user-id="currentUserId"
    :my-status="myStatus"
    :partner-status="partnerStatus"
    :latest-note="latestNote"
    :unread-count="unreadMessages.length"
    :timezone="timezone"
    :loading="pageLoading"
    :error="pageError"
    @open-status="openStatusComposer"
    @open-message="openNoteComposer"
    @open-inbox="openNoteBox"
    @open-location="openPartnerLocation"
    @retry="refreshHome"
  />

  <StatusComposer
    :open="statusComposerOpen"
    :current="myStatus"
    :submitting="saveStatusMutation.isPending.value"
    :clearing="clearStatusMutation.isPending.value"
    :error="statusActionError"
    @close="statusComposerOpen = false"
    @save="saveStatus"
    @clear="clearStatus"
  />

  <NoteComposer
    :open="noteComposerOpen"
    :partner-name="partnerName"
    :submitting="sendNoteMutation.isPending.value"
    :error="noteSendError"
    @close="noteComposerOpen = false"
    @send="sendNote"
  />

  <NoteBox
    :open="noteBoxOpen"
    :initial-filter="noteBoxFilter"
    :messages="messages"
    :current-user-id="currentUserId"
    :timezone="timezone"
    :marking-ids="markingIds"
    :marking-all="markingAll"
    :error="noteBoxError"
    @close="noteBoxOpen = false"
    @compose="composeFromNoteBox"
    @mark-read="markRead"
    @mark-all-read="markAllRead"
  />

  <LocationMapSheet
    :open="locationMapOpen"
    :status="partnerStatus"
    :partner-name="partnerName"
    :timezone="timezone"
    @close="locationMapOpen = false"
  />
</template>
