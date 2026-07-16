import type { ApiError } from "@our-tomorrow/contracts";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api/v1").replace(
  /\/$/,
  "",
);

let csrfToken: string | null = null;

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

  get isUnauthorized() {
    return this.status === 401 || this.status === 403;
  }
}

export function setApiCsrfToken(token: string | null) {
  csrfToken = token;
}

async function parseError(response: Response): Promise<ApiClientError> {
  const fallbackMessage =
    response.status >= 500
      ? "服务暂时没有回应，请稍后再试。"
      : "请求没有成功，请检查后重试。";

  try {
    const payload = (await response.json()) as Partial<ApiError>;

    return new ApiClientError(payload.message ?? fallbackMessage, {
      status: response.status,
      ...(payload.code ? { code: payload.code } : {}),
      ...(payload.requestId ? { requestId: payload.requestId } : {}),
      ...(payload.details ? { details: payload.details } : {}),
    });
  } catch {
    return new ApiClientError(fallbackMessage, { status: response.status });
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const method = (init.method ?? "GET").toUpperCase();

  headers.set("Accept", "application/json");

  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (csrfToken && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      credentials: "include",
    });
  } catch {
    throw new ApiClientError("暂时无法连接明天，请检查网络后再试。", {
      status: 0,
      code: "NETWORK_ERROR",
    });
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function jsonBody(payload: unknown): string {
  return JSON.stringify(payload);
}

export const apiClient = {
  get<T>(path: string, init?: RequestInit) {
    return request<T>(path, { ...init, method: "GET" });
  },
  post<T>(path: string, payload?: unknown, init?: RequestInit) {
    return request<T>(path, {
      ...init,
      method: "POST",
      ...(payload === undefined ? {} : { body: jsonBody(payload) }),
    });
  },
  put<T>(path: string, payload?: unknown, init?: RequestInit) {
    return request<T>(path, {
      ...init,
      method: "PUT",
      ...(payload === undefined ? {} : { body: jsonBody(payload) }),
    });
  },
  patch<T>(path: string, payload?: unknown, init?: RequestInit) {
    return request<T>(path, {
      ...init,
      method: "PATCH",
      ...(payload === undefined ? {} : { body: jsonBody(payload) }),
    });
  },
  delete<T>(path: string, init?: RequestInit) {
    return request<T>(path, { ...init, method: "DELETE" });
  },
};
