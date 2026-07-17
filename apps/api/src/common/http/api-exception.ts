import { HttpException, HttpStatus } from "@nestjs/common";

export type ApiErrorDetails = Record<string, unknown>;

export class ApiException extends HttpException {
  constructor(
    status: HttpStatus,
    code: string,
    message: string,
    details?: ApiErrorDetails,
  ) {
    super(
      {
        code,
        message,
        ...(details === undefined ? {} : { details }),
      },
      status,
    );
  }
}

export function identityRequired(): ApiException {
  return new ApiException(
    HttpStatus.BAD_REQUEST,
    "IDENTITY_REQUIRED",
    "X-Our-Tomorrow-Role must be boy or girl",
  );
}

export function resourceNotFound(): ApiException {
  return new ApiException(
    HttpStatus.NOT_FOUND,
    "RESOURCE_NOT_FOUND",
    "Resource not found",
  );
}

export function actionForbidden(): ApiException {
  return new ApiException(
    HttpStatus.FORBIDDEN,
    "ACTION_FORBIDDEN",
    "The current identity cannot perform this action",
  );
}

export function validationFailed(message: string): ApiException {
  return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", message);
}

export function stateConflict(details?: ApiErrorDetails): ApiException {
  return new ApiException(
    HttpStatus.CONFLICT,
    "STATE_CONFLICT",
    "The resource changed before this request could be applied",
    details,
  );
}

export function idempotencyConflict(): ApiException {
  return new ApiException(
    HttpStatus.CONFLICT,
    "IDEMPOTENCY_CONFLICT",
    "The idempotency key was already used with a different request",
  );
}
