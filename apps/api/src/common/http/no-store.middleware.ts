import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

@Injectable()
export class NoStoreMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    if (!request.path.startsWith("/api/v1/health/")) {
      response.setHeader("Cache-Control", "private, no-store");
    }
    next();
  }
}
