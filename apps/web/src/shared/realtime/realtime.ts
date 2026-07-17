import type {
  IdentityRole,
  RealtimeEvent,
  TouchEventKind,
} from "@our-tomorrow/contracts";
import type { QueryClient } from "@tanstack/vue-query";
import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;
let connectedRole: IdentityRole | null = null;

const TOUCH_KINDS = new Set<TouchEventKind>([
  "HUG",
  "MISS_YOU",
  "KISS",
  "CHEER",
  "REST",
  "TELL_ME_WHEN_HOME",
  "I_AM_HERE",
]);

export function touchKindForRealtimeEvent(
  event: Pick<RealtimeEvent, "type">,
): TouchEventKind | null {
  if (!event.type.startsWith("touch.")) return null;
  const kind = event.type.slice("touch.".length) as TouchEventKind;
  return TOUCH_KINDS.has(kind) ? kind : null;
}

export function queryKeysForRealtimeEvent(event: RealtimeEvent): string[] {
  if (
    event.type.startsWith("status.") ||
    event.type.startsWith("current_status.")
  ) {
    return ["statuses", "today", "notifications"];
  }
  if (event.type.startsWith("note.")) {
    return ["notes", "today", "notifications"];
  }
  if (
    event.type.startsWith("daily-entry.") ||
    event.type.startsWith("daily.")
  ) {
    return ["daily-entry", "daily-calendar", "today", "notifications"];
  }
  if (event.type.startsWith("mood.") || event.type.startsWith("mood_entry.")) {
    return ["moods", "today", "notifications"];
  }
  if (event.type.startsWith("notification.")) {
    return ["notifications"];
  }
  if (
    event.type.startsWith("touch_event.") ||
    event.type.startsWith("touch.")
  ) {
    return ["touch-events", "today", "notifications"];
  }
  if (
    event.type.startsWith("calm_letter.") ||
    event.type.startsWith("calm-letter.")
  ) {
    return ["calm-letters", "calm-letter", "today", "notifications"];
  }
  if (
    event.type.startsWith("memory_resurface.") ||
    event.type.startsWith("memory-resurface.")
  ) {
    return ["memory-resurface", "random-memory", "today"];
  }
  if (
    event.type.startsWith("annual-review.") ||
    event.type.startsWith("annual_review.")
  ) {
    return ["annual-reviews", "annual-review-photo-options", "notifications"];
  }
  if (event.type.startsWith("wish.")) {
    return [
      "wishes",
      "wish",
      "wish-options",
      "plans",
      "capsules",
      "upcoming",
      "today",
      "notifications",
    ];
  }
  if (event.type.startsWith("plan.")) {
    return [
      "plans",
      "plan",
      "wishes",
      "wish",
      "wish-options",
      "anniversaries",
      "anniversary",
      "capsules",
      "upcoming",
      "today",
      "notifications",
    ];
  }
  if (event.type.startsWith("anniversary.")) {
    return [
      "anniversaries",
      "anniversary",
      "anniversary-occurrences",
      "plans",
      "plan",
      "capsules",
      "upcoming",
      "today",
      "notifications",
    ];
  }
  if (event.type.startsWith("capsule.")) {
    return ["capsules", "capsule", "upcoming", "today", "notifications"];
  }
  if (event.type === "conversion.completed") {
    return [
      "wishes",
      "wish",
      "wish-options",
      "notes",
      "anniversaries",
      "anniversary",
      "anniversary-occurrences",
      "capsules",
      "capsule",
      "memories",
      "memory",
      "random-memory",
      "upcoming",
      "today",
      "notifications",
    ];
  }
  return ["today"];
}

function invalidate(queryClient: QueryClient, event: RealtimeEvent) {
  if (event.type === "capsule.hidden") {
    if (event.resourceId) {
      queryClient.setQueriesData(
        { queryKey: ["capsules"] },
        (current: unknown) =>
          Array.isArray(current)
            ? current.filter(
                (item) =>
                  !item ||
                  typeof item !== "object" ||
                  !("id" in item) ||
                  item.id !== event.resourceId,
              )
            : current,
      );
    }
    void queryClient.resetQueries({ queryKey: ["capsule"] });
  }
  for (const key of queryKeysForRealtimeEvent(event)) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}

export function syncRealtimeIdentity(
  role: IdentityRole | null,
  queryClient: QueryClient,
): void {
  if (role === connectedRole && socket) return;

  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  connectedRole = role;
  if (!role) return;

  socket = io({
    path: "/socket",
    transports: ["websocket"],
    auth: { role },
    withCredentials: false,
  });
  socket.on("realtime.ready", () => {
    for (const key of [
      "statuses",
      "notes",
      "daily-entry",
      "moods",
      "notifications",
      "touch-events",
      "calm-letters",
      "calm-letter",
      "today",
      "wishes",
      "wish",
      "wish-options",
      "plans",
      "plan",
      "anniversaries",
      "anniversary",
      "anniversary-occurrences",
      "capsules",
      "capsule",
      "upcoming",
      "memories",
      "memory",
      "random-memory",
      "memory-resurface",
      "first-times",
      "places-map",
      "annual-reviews",
      "annual-review-photo-options",
    ]) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  });
  socket.on("domain.event", (event: RealtimeEvent) => {
    if (
      !event ||
      typeof event.id !== "string" ||
      typeof event.type !== "string" ||
      typeof event.occurredAt !== "string"
    ) {
      return;
    }
    const touchKind = touchKindForRealtimeEvent(event);
    if (touchKind && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("our-tomorrow:touch", { detail: { kind: touchKind } }),
      );
    }
    invalidate(queryClient, event);
  });
}

export function disconnectRealtime(): void {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  connectedRole = null;
}
