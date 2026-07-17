import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { requestRouteTemplate } from "./structured-request-log.middleware";

type ExceptionPayload = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = isHttpException ? exception.getResponse() : undefined;
    const payload: ExceptionPayload =
      typeof raw === "object" && raw !== null ? raw : {};
    const requestId = request.requestId ?? "unknown";
    const route = requestRouteTemplate(request);
    const defaultMessage =
      statusCode === 500
        ? "Internal server error"
        : String(raw ?? "Request failed");
    const message =
      typeof payload.message === "string" ? payload.message : defaultMessage;
    const code =
      typeof payload.code === "string"
        ? payload.code
        : statusCode === 500
          ? "INTERNAL_ERROR"
          : `HTTP_${statusCode}`;

    if (!isHttpException || statusCode >= 500) {
      this.logger.error(
        JSON.stringify({
          requestId,
          method: request.method,
          route,
          status: statusCode,
          errorType:
            exception instanceof Error ? exception.name : typeof exception,
        }),
      );
    }

    const body: Record<string, unknown> = {
      statusCode,
      code,
      message,
      requestId,
      timestamp: new Date().toISOString(),
      path: route,
    };
    if (payload.details !== undefined) body.details = payload.details;
    response.status(statusCode).json(body);
  }
}
