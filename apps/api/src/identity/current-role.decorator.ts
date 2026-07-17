import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { identityRequired } from "../common/http/api-exception";
import { IDENTITY_ROLES, type IdentityRole } from "./identity.constants";

export const IDENTITY_ROLE_HEADER = "X-Our-Tomorrow-Role";

export function parseIdentityRole(value: unknown): IdentityRole {
  if (
    typeof value === "string" &&
    (IDENTITY_ROLES as readonly string[]).includes(value)
  ) {
    return value as IdentityRole;
  }
  throw identityRequired();
}

export const CurrentIdentityRole = createParamDecorator(
  (_data: unknown, context: ExecutionContext): IdentityRole => {
    const request = context.switchToHttp().getRequest<Request>();
    return parseIdentityRole(request.get(IDENTITY_ROLE_HEADER));
  },
);
