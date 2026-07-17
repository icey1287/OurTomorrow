import type { ConfigService } from "@nestjs/config";
import type { Server, Socket } from "socket.io";
import { describe, expect, it, vi } from "vitest";
import type { Environment } from "../config/env.schema";
import type { IdentityService } from "../identity/identity.service";
import { RealtimeGateway } from "./realtime.gateway";

const actor = {
  role: "boy" as const,
  user: { id: "00000000-0000-4000-8000-000000000101" },
  couple: { id: "00000000-0000-4000-8000-000000000001" },
};

function client(overrides: { role?: string; origin?: string } = {}) {
  return {
    handshake: {
      headers: { origin: overrides.origin ?? "http://localhost:5173" },
      auth: { role: overrides.role ?? "boy" },
    },
    data: {},
    join: vi.fn(async () => undefined),
    emit: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as Socket;
}

function gateway(current = vi.fn(async () => actor)) {
  return new RealtimeGateway(
    {
      get: vi.fn(() => "http://localhost:5173"),
    } as unknown as ConfigService<Environment, true>,
    { current } as unknown as IdentityService,
  );
}

describe("RealtimeGateway", () => {
  it("derives rooms from the fixed local role instead of client supplied ids", async () => {
    const current = vi.fn(async () => actor);
    const realtime = gateway(current);
    const socket = client();

    await realtime.handleConnection(socket);

    expect(current).toHaveBeenCalledWith("boy");
    expect(socket.join).toHaveBeenCalledWith(`couple:${actor.couple.id}`);
    expect(socket.join).toHaveBeenCalledWith(`user:${actor.user.id}`);
    expect(socket.emit).toHaveBeenCalledWith("realtime.ready", {
      role: "boy",
    });
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it("rejects an invalid role or origin before joining rooms", async () => {
    const current = vi.fn(async () => actor);
    const realtime = gateway(current);
    const wrongRole = client({ role: "admin" });
    const wrongOrigin = client({ origin: "https://example.com" });

    await realtime.handleConnection(wrongRole);
    await realtime.handleConnection(wrongOrigin);

    expect(current).not.toHaveBeenCalled();
    expect(wrongRole.disconnect).toHaveBeenCalledWith(true);
    expect(wrongOrigin.disconnect).toHaveBeenCalledWith(true);
  });

  it("emits only to the server-derived couple or recipient rooms", () => {
    const realtime = gateway();
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    (realtime as unknown as { server: Server }).server = {
      to,
    } as unknown as Server;
    const event = {
      id: "event-1",
      type: "note.visible",
      resourceId: "note-1",
      occurredAt: "2026-07-17T00:00:00.000Z",
    };

    realtime.publish(
      { coupleId: actor.couple.id, recipientIds: [actor.user.id] },
      event,
    );

    expect(to).toHaveBeenCalledWith(`user:${actor.user.id}`);
    expect(emit).toHaveBeenCalledWith("domain.event", event);
  });
});
