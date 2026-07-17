<script setup lang="ts">
import type { NotificationView } from "@our-tomorrow/contracts";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/vue-query";
import type { Component } from "vue";
import {
  Archive,
  Bell,
  BellRing,
  BookHeart,
  Check,
  CheckCheck,
  ChevronDown,
  LoaderCircle,
  MessageCircleHeart,
  RefreshCw,
  ShieldCheck,
  Smile,
  Sparkles,
  StickyNote,
  X,
} from "lucide-vue-next";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  useId,
  watch,
} from "vue";

import {
  formatNotificationTime,
  notificationCopy,
  notificationState,
  unreadBadgeLabel,
} from "@/features/notifications/notification-utils";
import { ApiClientError } from "@/shared/api/client";
import { stageThreeApi } from "@/shared/api/stage-three";
import BaseButton from "@/shared/components/BaseButton.vue";
import { useIdentityStore } from "@/shared/stores/identity";

const props = withDefaults(
  defineProps<{
    variant?: "icon" | "sidebar";
  }>(),
  { variant: "icon" },
);

const identity = useIdentityStore();
const queryClient = useQueryClient();
const open = ref(false);
const trigger = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const actionFeedback = ref<{
  tone: "success" | "error";
  message: string;
} | null>(null);
const paginationError = ref<string | null>(null);
const pendingItemActions = reactive<Record<string, "mark-read" | "archive">>(
  {},
);
const markAllPending = ref(false);
const loadMorePending = ref(false);
const panelId = `notification-panel-${useId().replace(/:/g, "")}`;
const panelTitleId = `${panelId}-title`;
let previousOverflow = "";

const countQuery = useQuery({
  queryKey: computed(() => ["notifications", identity.role, "unread-count"]),
  queryFn: stageThreeApi.notificationUnreadCount,
  enabled: computed(() => identity.role !== null),
  refetchInterval: 60_000,
});

const listQuery = useInfiniteQuery({
  queryKey: computed(() => ["notifications", identity.role, "list"]),
  queryFn: ({ pageParam }) => stageThreeApi.notifications(pageParam),
  initialPageParam: null as string | null,
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  enabled: computed(() => open.value && identity.role !== null),
});

const notifications = computed(() => {
  const unique = new Map<string, NotificationView>();
  for (const notification of listQuery.data.value?.pages.flatMap(
    (page) => page.items,
  ) ?? []) {
    if (!unique.has(notification.id)) unique.set(notification.id, notification);
  }
  return [...unique.values()];
});
const loadedUnreadCount = computed(
  () =>
    notifications.value.filter(
      (notification) => notification.status === "UNREAD",
    ).length,
);
const unreadCount = computed(() =>
  Math.max(countQuery.data.value?.count ?? 0, loadedUnreadCount.value),
);
const unreadCountUnavailable = computed(
  () => countQuery.isError.value && loadedUnreadCount.value === 0,
);
const badge = computed(() => unreadBadgeLabel(unreadCount.value));
const triggerLabel = computed(() =>
  unreadCountUnavailable.value
    ? "打开通知中心，未读数量暂时无法确认"
    : unreadCount.value > 0
      ? `打开通知中心，有 ${unreadCount.value} 条未读通知`
      : "打开通知中心，没有未读通知",
);
const timezone = computed(() => identity.couple?.timezone ?? "Asia/Shanghai");
const listErrorMessage = computed(() =>
  errorMessage(listQuery.error.value, "通知暂时没有顺利打开，请稍后再试。"),
);

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message : fallback;
}

function copyFor(notification: NotificationView) {
  return notificationCopy(notification);
}

function stateFor(notification: NotificationView) {
  return notificationState(notification.status);
}

function iconFor(type: string): Component {
  if (type.startsWith("NOTE_")) return StickyNote;
  if (type.startsWith("DAILY_")) return BookHeart;
  if (type.startsWith("MOOD_")) return Smile;
  if (type.startsWith("STATUS_")) return MessageCircleHeart;
  return Sparkles;
}

function itemActionPending(notificationId: string): boolean {
  return pendingItemActions[notificationId] !== undefined;
}

function togglePanel() {
  open.value = !open.value;
}

function closePanel() {
  open.value = false;
}

async function refreshNotifications() {
  actionFeedback.value = null;
  paginationError.value = null;
  await Promise.all([listQuery.refetch(), countQuery.refetch()]);
}

async function invalidateNotifications() {
  await queryClient.invalidateQueries({ queryKey: ["notifications"] });
}

async function markRead(notification: NotificationView) {
  if (notification.status !== "UNREAD" || itemActionPending(notification.id)) {
    return;
  }
  actionFeedback.value = null;
  pendingItemActions[notification.id] = "mark-read";
  try {
    await stageThreeApi.markNotificationRead(notification.id);
    actionFeedback.value = { tone: "success", message: "已标为已读。" };
    await invalidateNotifications();
  } catch (error) {
    actionFeedback.value = {
      tone: "error",
      message: errorMessage(error, "这条通知暂时无法标为已读，请稍后再试。"),
    };
  } finally {
    delete pendingItemActions[notification.id];
  }
}

async function markAllRead() {
  if (unreadCount.value === 0 || markAllPending.value) return;
  actionFeedback.value = null;
  markAllPending.value = true;
  try {
    await stageThreeApi.markAllNotificationsRead();
    actionFeedback.value = { tone: "success", message: "所有通知都已读。" };
    await invalidateNotifications();
  } catch (error) {
    actionFeedback.value = {
      tone: "error",
      message: errorMessage(error, "暂时无法全部标为已读，请稍后再试。"),
    };
  } finally {
    markAllPending.value = false;
  }
}

async function archive(notification: NotificationView) {
  if (itemActionPending(notification.id)) return;
  actionFeedback.value = null;
  pendingItemActions[notification.id] = "archive";
  try {
    await stageThreeApi.archiveNotification(notification.id);
    actionFeedback.value = { tone: "success", message: "通知已归档。" };
    await invalidateNotifications();
  } catch (error) {
    actionFeedback.value = {
      tone: "error",
      message: errorMessage(error, "这条通知暂时无法归档，请稍后再试。"),
    };
  } finally {
    delete pendingItemActions[notification.id];
  }
}

async function loadMore() {
  if (!listQuery.hasNextPage.value || loadMorePending.value) return;
  paginationError.value = null;
  loadMorePending.value = true;
  try {
    const result = await listQuery.fetchNextPage();
    if (result.isError) {
      paginationError.value = errorMessage(
        result.error,
        "更早的通知暂时没有加载成功。",
      );
    }
  } catch (error) {
    paginationError.value = errorMessage(error, "更早的通知暂时没有加载成功。");
  } finally {
    loadMorePending.value = false;
  }
}

function onKeydown(event: KeyboardEvent) {
  if (!open.value) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closePanel();
    return;
  }
  if (event.key !== "Tab" || !panel.value) return;

  const focusable = Array.from(
    panel.value.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("hidden"));
  if (focusable.length === 0) {
    event.preventDefault();
    panel.value.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    actionFeedback.value = null;
    paginationError.value = null;
    void nextTick(() =>
      panel.value?.querySelector<HTMLElement>("button")?.focus(),
    );
    return;
  }

  document.body.style.overflow = previousOverflow;
  void nextTick(() => trigger.value?.focus());
});

watch(
  () => identity.role,
  () => {
    if (open.value) closePanel();
  },
);

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  if (open.value) document.body.style.overflow = previousOverflow;
});
</script>

<template>
  <button
    v-if="variant === 'sidebar'"
    ref="trigger"
    type="button"
    class="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-medium text-ink-500 transition hover:bg-white/65 hover:text-ink-950 dark:text-ink-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
    aria-haspopup="dialog"
    :aria-controls="panelId"
    :aria-expanded="open"
    :aria-label="triggerLabel"
    @click="togglePanel"
  >
    <span class="relative">
      <Bell class="size-[1.1rem]" />
      <span
        v-if="badge"
        class="absolute -right-2.5 -top-2.5 grid min-w-4 place-items-center rounded-full bg-present-600 px-1 text-[9px] font-bold leading-4 text-white dark:bg-present-400 dark:text-ink-950"
        aria-hidden="true"
      >
        {{ badge }}
      </span>
    </span>
    <span class="flex-1 text-left">通知</span>
    <span
      v-if="badge"
      class="rounded-full bg-present-100 px-2 py-0.5 text-[10px] font-bold text-present-700 dark:bg-present-950/60 dark:text-present-200"
      aria-hidden="true"
    >
      {{ badge }}
    </span>
  </button>

  <button
    v-else
    ref="trigger"
    type="button"
    class="relative grid size-10 shrink-0 place-items-center rounded-xl text-ink-500 transition hover:bg-white/70 hover:text-ink-950 dark:hover:bg-white/[0.06] dark:hover:text-white"
    aria-haspopup="dialog"
    :aria-controls="panelId"
    :aria-expanded="open"
    :aria-label="triggerLabel"
    @click="togglePanel"
  >
    <Bell class="size-5" />
    <span
      v-if="badge"
      class="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full border-2 border-[#f8f6f2] bg-present-600 px-0.5 text-[8px] font-bold leading-3 text-white dark:border-ink-950 dark:bg-present-400 dark:text-ink-950"
      aria-hidden="true"
    >
      {{ badge }}
    </span>
  </button>

  <Teleport to="body">
    <Transition name="panel">
      <div
        v-if="open"
        class="fixed inset-0 z-[60] flex justify-end bg-ink-950/40 backdrop-blur-sm"
        role="presentation"
        @mousedown.self="closePanel"
      >
        <section
          :id="panelId"
          ref="panel"
          data-panel
          role="dialog"
          aria-modal="true"
          :aria-labelledby="panelTitleId"
          tabindex="-1"
          class="flex h-dvh w-full max-w-[30rem] flex-col border-l border-white/70 bg-[#f8f6f2] shadow-2xl dark:border-white/10 dark:bg-ink-950"
        >
          <header
            class="flex shrink-0 items-start justify-between gap-4 border-b border-ink-200/70 px-5 py-5 dark:border-white/10 sm:px-6"
          >
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span
                  class="grid size-9 place-items-center rounded-2xl bg-present-100 text-present-700 dark:bg-present-950/60 dark:text-present-200"
                >
                  <BellRing class="size-4" />
                </span>
                <div>
                  <p class="eyebrow">只属于你</p>
                  <h2
                    :id="panelTitleId"
                    class="font-display text-xl font-semibold text-ink-950 dark:text-white"
                  >
                    通知中心
                  </h2>
                </div>
              </div>
              <p class="mt-3 text-xs leading-5 text-ink-500 dark:text-ink-400">
                {{
                  unreadCountUnavailable
                    ? "未读数量暂时未同步，通知列表仍可查看。"
                    : unreadCount > 0
                      ? `还有 ${unreadCount} 条未读提醒。`
                      : "新变化会安静地出现在这里。"
                }}
              </p>
            </div>
            <button
              type="button"
              class="grid size-10 shrink-0 place-items-center rounded-xl text-ink-500 transition hover:bg-ink-100 hover:text-ink-950 dark:hover:bg-white/[0.07] dark:hover:text-white"
              aria-label="关闭通知中心"
              @click="closePanel"
            >
              <X class="size-5" />
            </button>
          </header>

          <div
            class="flex shrink-0 items-center justify-between gap-3 border-b border-ink-200/60 px-5 py-3 dark:border-white/10 sm:px-6"
          >
            <button
              type="button"
              class="inline-flex min-h-9 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-ink-500 transition hover:bg-white hover:text-ink-950 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/[0.06] dark:hover:text-white"
              :disabled="markAllPending || unreadCount === 0"
              @click="markAllRead"
            >
              <LoaderCircle
                v-if="markAllPending"
                class="size-3.5 animate-spin"
              />
              <CheckCheck v-else class="size-3.5" />
              全部已读
            </button>
            <button
              type="button"
              class="inline-flex min-h-9 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-ink-500 transition hover:bg-white hover:text-ink-950 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/[0.06] dark:hover:text-white"
              :disabled="listQuery.isFetching.value"
              @click="refreshNotifications"
            >
              <RefreshCw
                class="size-3.5"
                :class="listQuery.isFetching.value ? 'animate-spin' : ''"
              />
              刷新
            </button>
          </div>

          <p
            v-if="actionFeedback"
            class="mx-5 mt-4 rounded-2xl border px-4 py-3 text-xs leading-5 sm:mx-6"
            :class="
              actionFeedback.tone === 'error'
                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200'
                : 'border-present-200 bg-present-50 text-present-700 dark:border-present-900/60 dark:bg-present-950/30 dark:text-present-200'
            "
            :role="actionFeedback.tone === 'error' ? 'alert' : 'status'"
            aria-live="polite"
          >
            {{ actionFeedback.message }}
          </p>

          <div
            class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5"
          >
            <div
              v-if="listQuery.isPending.value && notifications.length === 0"
              class="grid min-h-64 place-items-center rounded-3xl border border-dashed border-ink-200/80 bg-white/45 px-6 text-center dark:border-white/10 dark:bg-white/[0.025]"
              role="status"
              aria-live="polite"
            >
              <div>
                <LoaderCircle
                  class="mx-auto size-6 animate-spin text-present-600 dark:text-present-300"
                />
                <p
                  class="mt-4 font-display text-lg font-semibold text-ink-950 dark:text-white"
                >
                  正在取回提醒…
                </p>
                <p class="mt-2 text-sm text-ink-500 dark:text-ink-400">
                  只加载当前身份收到的站内通知。
                </p>
              </div>
            </div>

            <div
              v-else-if="listQuery.isError.value && notifications.length === 0"
              class="grid min-h-64 place-items-center rounded-3xl border border-dashed border-red-200 bg-red-50/60 px-6 text-center dark:border-red-900/50 dark:bg-red-950/20"
              role="alert"
            >
              <div>
                <Bell class="mx-auto size-6 text-red-500" />
                <p
                  class="mt-4 font-display text-lg font-semibold text-ink-950 dark:text-white"
                >
                  通知暂时没有打开
                </p>
                <p
                  class="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400"
                >
                  {{ listErrorMessage }}
                </p>
                <BaseButton
                  class="mt-5"
                  variant="secondary"
                  size="sm"
                  @click="refreshNotifications"
                >
                  再试一次
                </BaseButton>
              </div>
            </div>

            <div
              v-else-if="notifications.length === 0"
              class="grid min-h-64 place-items-center rounded-3xl border border-dashed border-ink-200/80 bg-white/45 px-6 text-center dark:border-white/10 dark:bg-white/[0.025]"
              role="status"
              aria-live="polite"
            >
              <div>
                <ShieldCheck
                  class="mx-auto size-7 text-present-600 dark:text-present-300"
                />
                <p
                  class="mt-4 font-display text-lg font-semibold text-ink-950 dark:text-white"
                >
                  这里还很安静
                </p>
                <p
                  class="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400"
                >
                  对方留下新状态、纸条或日记变化时，会以泛化文案提醒你。
                </p>
              </div>
            </div>

            <template v-else>
              <p
                v-if="listQuery.isError.value"
                class="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
                role="alert"
              >
                刷新没有成功，下面仍保留上一次加载的通知。
              </p>

              <ol class="space-y-3" aria-label="通知列表">
                <li
                  v-for="notification in notifications"
                  :key="notification.id"
                >
                  <article
                    class="relative overflow-hidden rounded-3xl border p-4 transition sm:p-5"
                    :class="
                      stateFor(notification).isUnread
                        ? 'border-present-200 bg-present-50/65 shadow-sm dark:border-present-900/55 dark:bg-present-950/20'
                        : 'border-white/80 bg-white/70 dark:border-white/10 dark:bg-white/[0.035]'
                    "
                  >
                    <span
                      v-if="stateFor(notification).isUnread"
                      class="absolute right-4 top-4 size-2 rounded-full bg-present-500"
                      aria-hidden="true"
                    />
                    <div class="flex items-start gap-3 pr-3">
                      <span
                        class="grid size-10 shrink-0 place-items-center rounded-2xl bg-white text-present-700 shadow-sm dark:bg-white/[0.07] dark:text-present-200"
                      >
                        <component
                          :is="iconFor(notification.type)"
                          class="size-4"
                        />
                      </span>
                      <div class="min-w-0 flex-1">
                        <div class="flex flex-wrap items-center gap-2 pr-2">
                          <h3
                            class="text-sm font-semibold leading-5 text-ink-950 dark:text-white"
                          >
                            {{ copyFor(notification).title }}
                          </h3>
                          <span class="sr-only">
                            {{ stateFor(notification).label }}
                          </span>
                        </div>
                        <p
                          class="mt-1.5 text-sm leading-6 text-ink-600 dark:text-ink-300"
                        >
                          {{ copyFor(notification).body }}
                        </p>
                        <time
                          class="mt-2 block text-[11px] font-medium text-ink-400 dark:text-ink-500"
                          :datetime="notification.createdAt"
                        >
                          {{
                            formatNotificationTime(
                              notification.createdAt,
                              timezone,
                            )
                          }}
                        </time>
                      </div>
                    </div>

                    <div
                      class="mt-4 flex flex-wrap items-center justify-end gap-1 border-t border-ink-200/60 pt-3 dark:border-white/10"
                    >
                      <button
                        v-if="stateFor(notification).isUnread"
                        type="button"
                        class="inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-present-700 transition hover:bg-present-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-present-200 dark:hover:bg-present-950/50"
                        :disabled="itemActionPending(notification.id)"
                        :aria-label="`将“${copyFor(notification).title}”标为已读`"
                        @click="markRead(notification)"
                      >
                        <LoaderCircle
                          v-if="
                            pendingItemActions[notification.id] === 'mark-read'
                          "
                          class="size-3.5 animate-spin"
                        />
                        <Check v-else class="size-3.5" />
                        标为已读
                      </button>
                      <button
                        type="button"
                        class="inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-ink-500 transition hover:bg-ink-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-ink-400 dark:hover:bg-white/[0.06] dark:hover:text-red-300"
                        :disabled="itemActionPending(notification.id)"
                        :aria-label="`归档“${copyFor(notification).title}”`"
                        @click="archive(notification)"
                      >
                        <LoaderCircle
                          v-if="
                            pendingItemActions[notification.id] === 'archive'
                          "
                          class="size-3.5 animate-spin"
                        />
                        <Archive v-else class="size-3.5" />
                        归档
                      </button>
                    </div>
                  </article>
                </li>
              </ol>

              <p
                v-if="paginationError"
                class="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-center text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
                role="alert"
              >
                {{ paginationError }}
              </p>

              <BaseButton
                v-if="listQuery.hasNextPage.value"
                class="mt-4"
                variant="secondary"
                size="sm"
                block
                :loading="loadMorePending"
                @click="loadMore"
              >
                <ChevronDown v-if="!loadMorePending" class="size-4" />
                加载更早的通知
              </BaseButton>
            </template>
          </div>

          <footer
            class="flex shrink-0 items-start gap-2 border-t border-ink-200/70 bg-white/45 px-5 py-3 text-[11px] leading-5 text-ink-500 dark:border-white/10 dark:bg-white/[0.025] dark:text-ink-400 sm:px-6"
          >
            <ShieldCheck class="mt-0.5 size-3.5 shrink-0 text-present-600" />
            通知中心只展示服务端生成的隐私安全文案，不读取通知载荷里的私密正文。
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
