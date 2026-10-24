import type { ApiErrorBody } from "@mindease/shared";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody,
  ) {
    super(Array.isArray(body.message) ? body.message.join(", ") : body.message);
  }

  /** Field errors from a failed validation, keyed by field name. */
  get fieldErrors(): Record<string, string[]> {
    return this.body.errors ?? {};
  }
}

// Endpoints where a 401 is a real answer, not an expired access token.
const NO_REFRESH = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"];

let refreshing: Promise<boolean> | null = null;

/** One refresh at a time, shared by every request that hit a 401 meanwhile. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch("/api/auth/refresh", { method: "POST" })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function api<T>(
  path: string,
  init: Omit<RequestInit, "body"> & { body?: unknown } = {},
): Promise<T> {
  const { body, headers, ...rest } = init;
  // FormData (file uploads) sets its own multipart Content-Type with the boundary.
  const isForm = body instanceof FormData;
  const send = () =>
    fetch(`/api${path}`, {
      ...rest,
      headers: isForm ? headers : { "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });

  let res = await send();
  if (res.status === 401 && !NO_REFRESH.includes(path) && (await refreshSession())) {
    res = await send();
  }

  if (res.status === 204) return undefined as T;
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

export async function toApiError(res: Response): Promise<ApiError> {
  const data = await res.json().catch(() => ({}));
  return new ApiError(res.status, {
    statusCode: res.status,
    message: data.message ?? res.statusText,
    code: data.code,
    errors: data.errors,
  });
}
