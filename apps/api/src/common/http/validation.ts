import { BadRequestException, ValidationPipe } from "@nestjs/common";
import type { ValidationError } from "class-validator";

function flattenErrors(
  errors: ValidationError[],
  prefix = "",
): Record<string, string[]> {
  return errors.reduce<Record<string, string[]>>((details, error) => {
    const path = prefix ? `${prefix}.${error.property}` : error.property;
    if (error.constraints) details[path] = Object.values(error.constraints);
    Object.assign(details, flattenErrors(error.children ?? [], path));
    return details;
  }, {});
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    stopAtFirstError: false,
    exceptionFactory: (errors) =>
      new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "Request validation failed",
        details: flattenErrors(errors),
      }),
  });
}
