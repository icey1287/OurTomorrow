export type FixedRole = "boy" | "girl";

export type HttpResult<T> = {
  status: number;
  headers: Headers;
  body: T | null;
};

type RequestOptions = {
  role?: FixedRole | null;
};

export class Stage1HttpClient {
  private role: FixedRole | null;

  constructor(
    private readonly baseUrl: string,
    role: FixedRole | null = null,
    private readonly origin = "http://127.0.0.1:5173",
  ) {
    this.role = role;
  }

  setRole(role: FixedRole | null): void {
    this.role = role;
  }

  clone(role: FixedRole | null = this.role): Stage1HttpClient {
    return new Stage1HttpClient(this.baseUrl, role, this.origin);
  }

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
    const body = contentType.includes("application/json")
      ? ((await response.json()) as T)
      : null;

    return {
      status: response.status,
      headers: response.headers,
      body,
    };
  }

  get<T>(path: string, options?: RequestOptions): Promise<HttpResult<T>> {
    return this.request<T>(path, { method: "GET" }, options);
  }

  post<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<HttpResult<T>> {
    const init: RequestInit = { method: "POST" };
    if (body !== undefined) init.body = JSON.stringify(body);
    return this.request<T>(path, init, options);
  }

  patch<T>(
    path: string,
    body: unknown,
    options?: RequestOptions,
  ): Promise<HttpResult<T>> {
    return this.request<T>(
      path,
      { method: "PATCH", body: JSON.stringify(body) },
      options,
    );
  }
}
