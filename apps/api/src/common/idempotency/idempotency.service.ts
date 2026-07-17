import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";
import { Clock } from "../clock/clock";
import { idempotencyConflict, stateConflict } from "../http/api-exception";
import { PrismaService } from "../../database/prisma.service";

const RETENTION_MILLISECONDS = 24 * 60 * 60 * 1_000;
const MAX_TRANSACTION_ATTEMPTS = 4;

type IdempotencyDatabase = Pick<Prisma.TransactionClient, "idempotencyRecord">;

export type StoredIdempotentResponse = {
  status: number;
  body: Prisma.JsonValue | Prisma.InputJsonValue;
  replayed: boolean;
};

export type IdempotentOperationResponse = {
  status: number;
  body: Prisma.InputJsonObject;
};

export type IdempotentOperation = (
  transaction: Prisma.TransactionClient,
) => Promise<IdempotentOperationResponse>;

function normalizedJson(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    if (
      value === undefined ||
      typeof value === "function" ||
      typeof value === "symbol" ||
      typeof value === "bigint"
    ) {
      throw new TypeError("Idempotency requests must be JSON serializable");
    }
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizedJson);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalizedJson(entry)]),
  );
}

export function stableJson(value: unknown): string {
  return JSON.stringify(normalizedJson(value));
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

@Injectable()
export class IdempotencyService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(Clock)
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    userId: string;
    coupleId: string;
    route: string;
    key: string;
    request: unknown;
    operation: IdempotentOperation;
  }): Promise<StoredIdempotentResponse> {
    const keyHash = digest(input.key);
    const requestHash = digest(stableJson(input.request));
    const replay = await this.replay(
      this.prisma,
      input.userId,
      input.route,
      keyHash,
      requestHash,
    );
    if (replay) return replay;

    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (transaction) => {
            const insideReplay = await this.replay(
              transaction,
              input.userId,
              input.route,
              keyHash,
              requestHash,
            );
            if (insideReplay) return insideReplay;

            const response = await input.operation(transaction);
            await transaction.idempotencyRecord.create({
              data: {
                userId: input.userId,
                coupleId: input.coupleId,
                route: input.route,
                keyHash,
                requestHash,
                responseStatus: response.status,
                responseBody: response.body,
                expiresAt: new Date(
                  this.clock.now().valueOf() + RETENTION_MILLISECONDS,
                ),
              },
              select: { id: true },
            });
            return {
              status: response.status,
              body: response.body,
              replayed: false,
            } satisfies StoredIdempotentResponse;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === "P2002" || error.code === "P2034")
        ) {
          const concurrentReplay = await this.replay(
            this.prisma,
            input.userId,
            input.route,
            keyHash,
            requestHash,
          );
          if (concurrentReplay) return concurrentReplay;
          if (attempt < MAX_TRANSACTION_ATTEMPTS) continue;
          throw stateConflict();
        }
        throw error;
      }
    }
    throw stateConflict();
  }

  private async replay(
    database: IdempotencyDatabase | PrismaClient,
    userId: string,
    route: string,
    keyHash: string,
    requestHash: string,
  ): Promise<StoredIdempotentResponse | undefined> {
    const now = this.clock.now();
    const record = await database.idempotencyRecord.findUnique({
      where: { userId_route_keyHash: { userId, route, keyHash } },
      select: {
        requestHash: true,
        responseStatus: true,
        responseBody: true,
        expiresAt: true,
      },
    });
    if (!record) return undefined;
    if (record.expiresAt <= now) {
      await database.idempotencyRecord.deleteMany({
        where: { userId, route, keyHash, expiresAt: { lte: now } },
      });
      return undefined;
    }
    if (record.requestHash !== requestHash) throw idempotencyConflict();
    return {
      status: record.responseStatus,
      body: record.responseBody,
      replayed: true,
    };
  }
}
