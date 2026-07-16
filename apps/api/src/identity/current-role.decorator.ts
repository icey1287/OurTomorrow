import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { identityRequired } from "../common/http/api-exception";
import { IDENTITY_ROLES, type IdentityRole } from "./identity.constants";

export const IDENTITY_ROLE_HEADER = "X-Our-Tomorrow-Role";

export function parseIdentityRole(value: unknown): IdentityRole {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  if ((IDENTITY_ROLES as readonly string[]).includes(normalized)) {
    return normalized as IdentityRole;
  }
  throw identityRequired();
}

export const CurrentIdentityRole = createParamDecorator(
  (_data: unknown, context: ExecutionContext): IdentityRole => {
    const request = context.switchToHttp().getRequest<Request>();
    return parseIdentityRole(request.get(IDENTITY_ROLE_HEADER));
  },
);
