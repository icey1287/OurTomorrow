import { QueryClient, QueryObserver } from "@tanstack/vue-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const { ioMock } = vi.hoisted(() => ({ ioMock: vi.fn() }));

vi.mock("socket.io-client", () => ({ io: ioMock }));

import {
  disconnectRealtime,
  queryKeysForRealtimeEvent,
  syncRealtimeIdentity,
  touchKindForRealtimeEvent,
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
    ["touch_event.received", ["touch-events", "today", "notifications"]],
    [
      "calm_letter.available",
      ["calm-letters", "calm-letter", "today", "notifications"],
    ],
    ["memory_resurface.opened", ["memory-resurface", "random-memory", "today"]],
    [
      "annual-review.ready",
      ["annual-reviews", "annual-review-photo-options", "notifications"],
    ],
    [
      "wish.completed",
      [
        "wishes",
        "wish",
        "wish-options",
        "plans",
        "capsules",
        "upcoming",
        "today",
        "notifications",
      ],
    ],
    [
      "plan.completed",
      [
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
      ],
    ],
    [
      "capsule.hidden",
      ["capsules", "capsule", "upcoming", "today", "notifications"],
    ],
    [
      "conversion.completed",
      [
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
      ],
    ],
  ])("maps %s to precise query invalidations", (type, keys) => {
    expect(queryKeysForRealtimeEvent(event(type))).toEqual(keys);
  });

  it("allows only fixed non-content touch kinds", () => {
    expect(touchKindForRealtimeEvent(event("touch.HUG"))).toBe("HUG");
    expect(touchKindForRealtimeEvent(event("touch.CUSTOM_MESSAGE"))).toBeNull();
    expect(touchKindForRealtimeEvent(event("note.visible"))).toBeNull();
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

  it("resets active capsule detail and filters lists when a draft becomes TO_SELF", () => {
    const socket = fakeSocket();
    ioMock.mockReturnValue(socket);
    const invalidateQueries = vi.fn(async () => undefined);
    const resetQueries = vi.fn(async () => undefined);
    const setQueriesData = vi.fn();
    const queryClient = {
      invalidateQueries,
      resetQueries,
      setQueriesData,
    } as unknown as QueryClient;

    syncRealtimeIdentity("girl", queryClient);
    socket.receive("domain.event", event("capsule.hidden"));

    expect(resetQueries).toHaveBeenCalledWith({ queryKey: ["capsule"] });
    expect(setQueriesData).toHaveBeenCalledWith(
      { queryKey: ["capsules"] },
      expect.any(Function),
    );
    const updater = setQueriesData.mock.calls[0]?.[1] as (
      current: unknown,
    ) => unknown;
    expect(updater([{ id: "resource-1" }, { id: "keep" }])).toEqual([
      { id: "keep" },
    ]);
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["capsules"],
    });
  });

  it("clears secret data held by an active capsule query observer", () => {
    const socket = fakeSocket();
    ioMock.mockReturnValue(socket);
    const queryClient = new QueryClient();
    const detailKey = ["capsule", "girl", "resource-1"] as const;
    queryClient.setQueryData(detailKey, {
      messages: [{ content: "不应继续留在活跃 observer 的正文" }],
    });
    const observer = new QueryObserver(queryClient, {
      queryKey: detailKey,
      enabled: false,
    });
    const unsubscribe = observer.subscribe(() => undefined);
    expect(observer.getCurrentResult().data).toBeDefined();

    syncRealtimeIdentity("girl", queryClient);
    socket.receive("domain.event", event("capsule.hidden"));

    expect(observer.getCurrentResult().data).toBeUndefined();
    unsubscribe();
    queryClient.clear();
  });
});
