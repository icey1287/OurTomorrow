import type { QueryClient } from "@tanstack/vue-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const { ioMock } = vi.hoisted(() => ({ ioMock: vi.fn() }));

vi.mock("socket.io-client", () => ({ io: ioMock }));

import {
  disconnectRealtime,
  queryKeysForRealtimeEvent,
  syncRealtimeIdentity,
} from "./realtime";

type Listener = (payload: unknown) => void;

function fakeSocket() {
  const listeners = new Map<string, Set<Listener>>();
  const socket = {
    on: vi.fn((event: string, listener: Listener) => {
      const eventListeners = listeners.get(event) ?? new Set<Listener>();
      eventListeners.add(listener);
      listeners.set(event, eventListeners);
      return socket;
    }),
    removeAllListeners: vi.fn(() => {
      listeners.clear();
      return socket;
    }),
    disconnect: vi.fn(() => socket),
    receive(event: string, payload: unknown) {
      for (const listener of listeners.get(event) ?? []) listener(payload);
    },
  };
  return socket;
}

afterEach(() => {
  disconnectRealtime();
  ioMock.mockReset();
});

function event(type: string) {
  return {
    id: "event-1",
    type,
    resourceId: "resource-1",
    occurredAt: "2026-07-17T00:00:00.000Z",
  };
}

describe("queryKeysForRealtimeEvent", () => {
  it.each([
    ["current_status.updated", ["statuses", "today", "notifications"]],
    ["note.visible", ["notes", "today", "notifications"]],
    [
      "daily-entry.revealed",
      ["daily-entry", "daily-calendar", "today", "notifications"],
    ],
    ["mood_entry.updated", ["moods", "today", "notifications"]],
    ["notification.created", ["notifications"]],
  ])("maps %s to precise query invalidations", (type, keys) => {
    expect(queryKeysForRealtimeEvent(event(type))).toEqual(keys);
  });

  it("disconnects the old role socket and ignores its later events", () => {
    const boySocket = fakeSocket();
    const girlSocket = fakeSocket();
    ioMock.mockReturnValueOnce(boySocket).mockReturnValueOnce(girlSocket);
    const invalidateQueries = vi.fn(async () => undefined);
    const queryClient = { invalidateQueries } as unknown as QueryClient;

    syncRealtimeIdentity("boy", queryClient);
    expect(ioMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ auth: { role: "boy" }, path: "/socket" }),
    );

    syncRealtimeIdentity("girl", queryClient);
    expect(boySocket.removeAllListeners).toHaveBeenCalledOnce();
    expect(boySocket.disconnect).toHaveBeenCalledOnce();
    expect(ioMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ auth: { role: "girl" }, path: "/socket" }),
    );

    boySocket.receive("domain.event", event("mood_entry.updated"));
    expect(invalidateQueries).not.toHaveBeenCalled();

    girlSocket.receive("domain.event", event("mood_entry.updated"));
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["moods"] });
  });
});
