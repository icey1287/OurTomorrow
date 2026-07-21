import type { ApiError, IdentityRole } from "@our-tomorrow/contracts";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api/v1").replace(
  /\/$/,
  "",
);

const IDENTITY_HEADER = "X-Our-Tomorrow-Role";
let identityRole: IdentityRole | null = null;
let identityEpoch = 0;

const ERROR_MESSAGES: Record<string, string> = {
  VALIDATION_FAILED: "请检查填写的内容后再试。",
  IDENTITY_REQUIRED: "请先选择你的身份。",
  IDENTITY_NAME_MISMATCH: "姓名没有匹配到任何身份。",
  ACTION_FORBIDDEN: "当前身份不能执行这个操作。",
  RESOURCE_NOT_FOUND: "请求的内容不存在或已不可用。",
  STATE_CONFLICT: "内容已在另一处更新，请刷新后重试。",
  PRECONDITION_REQUIRED: "请先刷新当前状态后再更新。",
  EXTERNAL_SERVICE_UNAVAILABLE: "地点搜索暂时不可用，也可以继续手动填写。",
  INTERNAL_ERROR: "服务暂时没有回应，请稍后再试。",
  IDENTITY_CHANGED: "身份已切换，这次响应已忽略。",
};

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly details: Record<string, string[]> | null;

  constructor(
    message: string,
    options: {
      status: number;
      code?: string;
      requestId?: string | null;
      details?: Record<string, string[]> | null;
    },
  ) {
    super(message);
    this.name = "ApiClientError";
    this.status = options.status;
    this.code = options.code ?? "REQUEST_FAILED";
    this.requestId = options.requestId ?? null;
    this.details = options.details ?? null;
  }
}

export function setApiIdentityRole(role: IdentityRole | null) {
  if (identityRole !== role) identityEpoch += 1;
  identityRole = role;
}

async function parseError(response: Response): Promise<ApiClientError> {
  const fallbackMessage =
    response.status >= 500
      ? "服务暂时没有回应，请稍后再试。"
      : "请求没有成功，请检查后重试。";

  try {
    const payload = (await response.json()) as Partial<ApiError>;
    const code = payload.code ?? "REQUEST_FAILED";

    return new ApiClientError(
      ERROR_MESSAGES[code] ?? payload.message ?? fallbackMessage,
      {
        status: response.status,
        code,
        ...(payload.requestId ? { requestId: payload.requestId } : {}),
        ...(payload.details ? { details: payload.details } : {}),
      },
    );
  } catch {
    return new ApiClientError(fallbackMessage, { status: response.status });
  }
}

export interface ApiRequestInit extends RequestInit {
  includeIdentity?: boolean;
}

async function assertIdentityUnchanged(
  includeIdentity: boolean,
  requestIdentityEpoch: number,
  response?: Response,
): Promise<void> {
  if (!includeIdentity || requestIdentityEpoch === identityEpoch) return;
  try {
    await response?.body?.cancel();
  } catch {
    // The response is intentionally discarded after an identity switch.
  }
  throw new ApiClientError("身份已切换，这次响应已忽略。", {
    status: 409,
    code: "IDENTITY_CHANGED",
  });
}

async function request<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { includeIdentity = true, ...fetchInit } = init;
  const requestIdentityEpoch = identityEpoch;
  const headers = new Headers(fetchInit.headers);

  headers.set("Accept", "application/json");

  if (typeof fetchInit.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (includeIdentity && identityRole) {
    headers.set(IDENTITY_HEADER, identityRole);
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...fetchInit,
      headers,
      credentials: "omit",
    });
  } catch {
    throw new ApiClientError("暂时无法连接 OurTomorrow，请检查网络后再试。", {
      status: 0,
      code: "NETWORK_ERROR",
    });
  }

  await assertIdentityUnchanged(
    includeIdentity,
    requestIdentityEpoch,
    response,
  );

  if (!response.ok) {
    const error = await parseError(response);
    await assertIdentityUnchanged(includeIdentity, requestIdentityEpoch);
    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (
    response.status === 202 &&
    !response.headers?.get?.("Content-Type")?.includes("application/json")
  ) {
    return undefined as T;
  }

  const payload = (await response.json()) as T;
  await assertIdentityUnchanged(includeIdentity, requestIdentityEpoch);
  return payload;
}

async function requestBlob(
  path: string,
  init: ApiRequestInit = {},
): Promise<Blob> {
  const { includeIdentity = true, ...fetchInit } = init;
  const requestIdentityEpoch = identityEpoch;
  const headers = new Headers(fetchInit.headers);
  headers.set("Accept", "image/*");
  if (includeIdentity && identityRole) {
    headers.set(IDENTITY_HEADER, identityRole);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...fetchInit,
      headers,
      credentials: "omit",
    });
  } catch {
    throw new ApiClientError("暂时无法连接 OurTomorrow，请检查网络后再试。", {
      status: 0,
      code: "NETWORK_ERROR",
    });
  }

  await assertIdentityUnchanged(
    includeIdentity,
    requestIdentityEpoch,
    response,
  );
  if (!response.ok) {
    const error = await parseError(response);
    await assertIdentityUnchanged(includeIdentity, requestIdentityEpoch);
    throw error;
  }
  const payload = await response.blob();
  await assertIdentityUnchanged(includeIdentity, requestIdentityEpoch);
  return payload;
}

function jsonBody(payload: unknown): string {
  return JSON.stringify(payload);
}

export const apiClient = {
  get<T>(path: string, init?: ApiRequestInit) {
    return request<T>(path, { ...init, method: "GET" });
  },
  getBlob(path: string, init?: ApiRequestInit) {
    return requestBlob(path, { ...init, method: "GET" });
  },
  post<T>(path: string, payload?: unknown, init?: ApiRequestInit) {
    return request<T>(path, {
      ...init,
      method: "POST",
      ...(payload === undefined ? {} : { body: jsonBody(payload) }),
    });
  },
  put<T>(path: string, payload?: unknown, init?: ApiRequestInit) {
    return request<T>(path, {
      ...init,
      method: "PUT",
      ...(payload === undefined ? {} : { body: jsonBody(payload) }),
    });
  },
  patch<T>(path: string, payload?: unknown, init?: ApiRequestInit) {
    return request<T>(path, {
      ...init,
      method: "PATCH",
      ...(payload === undefined ? {} : { body: jsonBody(payload) }),
    });
  },
  delete<T>(path: string, init?: ApiRequestInit) {
    return request<T>(path, { ...init, method: "DELETE" });
  },
};
