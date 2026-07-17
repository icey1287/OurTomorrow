import { Inject, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import type { Environment } from "../config/env.schema";
import {
  IDENTITY_ROLES,
  type IdentityRole,
} from "../identity/identity.constants";
import { IdentityService } from "../identity/identity.service";

export type RealtimeEvent = {
  id: string;
  type: string;
  resourceId?: string;
  occurredAt: string;
};

export type RealtimeAudience = {
  coupleId: string;
  recipientIds?: string[];
};

function origin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function identityRole(value: unknown): IdentityRole | null {
  return typeof value === "string" &&
    IDENTITY_ROLES.includes(value as IdentityRole)
    ? (value as IdentityRole)
    : null;
}

@WebSocketGateway({
  path: "/socket",
  transports: ["websocket"],
  cors: { origin: true, credentials: false },
})
export class RealtimeGateway
  implements OnGatewayConnection<Socket>, OnGatewayDisconnect<Socket>
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
    @Inject(IdentityService)
    private readonly identities: IdentityService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const requestOrigin = client.handshake.headers.origin;
    const allowedOrigin = origin(
      this.config.get("WEB_ORIGIN", { infer: true }),
    );
    if (
      typeof requestOrigin !== "string" ||
      origin(requestOrigin) !== allowedOrigin
    ) {
      client.disconnect(true);
      return;
    }

    const role = identityRole(client.handshake.auth?.role);
    if (!role) {
      client.disconnect(true);
      return;
    }

    try {
      const actor = await this.identities.current(role);
      client.data.identity = {
        role,
        userId: actor.user.id,
        coupleId: actor.couple.id,
      };
      await client.join(`couple:${actor.couple.id}`);
      await client.join(`user:${actor.user.id}`);
      client.emit("realtime.ready", { role });
    } catch (error) {
      this.logger.warn(
        `Rejected realtime connection: ${error instanceof Error ? error.message : String(error)}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    delete client.data.identity;
  }

  publish(audience: RealtimeAudience, event: RealtimeEvent): void {
    const recipients = [...new Set(audience.recipientIds ?? [])];
    if (recipients.length === 0) {
      this.server.to(`couple:${audience.coupleId}`).emit("domain.event", event);
      return;
    }

    for (const recipientId of recipients) {
      this.server.to(`user:${recipientId}`).emit("domain.event", event);
    }
  }
}
