import type { IdentityRole, RealtimeEvent } from "@our-tomorrow/contracts";
import type { QueryClient } from "@tanstack/vue-query";
import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;
let connectedRole: IdentityRole | null = null;

function queryKeysForEvent(event: RealtimeEvent): string[] {
  if (
    event.type.startsWith("status.") ||
    event.type.startsWith("current_status.")
  ) {
    return ["statuses"];
  }
  if (event.type.startsWith("note.")) return ["notes"];
  return [];
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
    void queryClient.invalidateQueries({ queryKey: ["statuses"] });
    void queryClient.invalidateQueries({ queryKey: ["notes"] });
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
    for (const key of queryKeysForEvent(event)) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  });
}

export function disconnectRealtime(): void {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  connectedRole = null;
}
