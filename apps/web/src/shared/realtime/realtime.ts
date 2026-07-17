import type { IdentityRole, RealtimeEvent } from "@our-tomorrow/contracts";
import type { QueryClient } from "@tanstack/vue-query";
import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;
let connectedRole: IdentityRole | null = null;

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
  return ["today"];
}

function invalidate(queryClient: QueryClient, event: RealtimeEvent) {
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
      "today",
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
    invalidate(queryClient, event);
  });
}

export function disconnectRealtime(): void {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  connectedRole = null;
}
