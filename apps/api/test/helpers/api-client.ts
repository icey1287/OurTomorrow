export type FixedRole = "boy" | "girl";

export type HttpResult<T> = {
  status: number;
  headers: Headers;
  body: T | null;
};

type RequestOptions = { role?: FixedRole | null };

export class ApiHttpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly role: FixedRole | null = null,
    private readonly origin = "http://127.0.0.1:5173",
  ) {}

  async request<T>(
    path: string,
    init: RequestInit = {},
    options: RequestOptions = {},
  ): Promise<HttpResult<T>> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    headers.set("origin", this.origin);
    const role = options.role === undefined ? this.role : options.role;
    if (role) headers.set("x-our-tomorrow-role", role);
    if (init.body !== undefined && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      redirect: "manual",
    });
    const contentType = response.headers.get("content-type") ?? "";
    return {
      status: response.status,
      headers: response.headers,
      body: contentType.includes("application/json")
        ? ((await response.json()) as T)
        : null,
    };
  }

  get<T>(path: string, options?: RequestOptions) {
    return this.request<T>(path, { method: "GET" }, options);
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>(
      path,
      {
        method: "POST",
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      options,
    );
  }

  patch<T>(path: string, body: unknown, options?: RequestOptions) {
    return this.request<T>(
      path,
      { method: "PATCH", body: JSON.stringify(body) },
      options,
    );
  }

  put<T>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>(
      path,
      {
        method: "PUT",
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      options,
    );
  }

  delete<T>(path: string, options?: RequestOptions) {
    return this.request<T>(path, { method: "DELETE" }, options);
  }
}
