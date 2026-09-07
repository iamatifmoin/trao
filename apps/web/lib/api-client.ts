export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Every request includes credentials — the session cookie lives on the
 * API's own origin (it's httpOnly, so JS here can't even read it), and CORS
 * on the API is configured to allow exactly that for the frontend's origin.
 * This is why auth has to be checked client-side rather than in Next
 * middleware: a server-rendered request from this app's own server has no
 * access to a cookie scoped to a different origin.
 */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const err = (data?.error as { code?: string; message?: string } | undefined) ?? {};
    throw new ApiError(response.status, err.code ?? "UNKNOWN_ERROR", err.message ?? "Something went wrong");
  }

  return data as T;
}
