import { Injectable, Logger, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

type RoutedRequest = Request & {
  route?: { path?: unknown };
};

export function requestRouteTemplate(request: RoutedRequest): string {
  const path = request.route?.path;
  return typeof path === "string" && path.length > 0 ? path : "<unmatched>";
}

@Injectable()
export class StructuredRequestLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger("HttpRequest");

  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();

    response.once("finish", () => {
      const durationNanoseconds = process.hrtime.bigint() - startedAt;
      const durationMs = Number(durationNanoseconds) / 1_000_000;
      this.logger.log(
        JSON.stringify({
          requestId: request.requestId ?? "unknown",
          method: request.method,
          route: requestRouteTemplate(request),
          status: response.statusCode,
          durationMs: Number(durationMs.toFixed(3)),
        }),
      );
    });

    next();
  }
}
