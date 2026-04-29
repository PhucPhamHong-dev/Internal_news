"use client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

type ApiRequestOptions = {
  signal?: AbortSignal;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest<T>(
  path: string,
  token: string | null,
  method: HttpMethod = "GET",
  body?: unknown,
  options: ApiRequestOptions = {}
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: options.signal
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(error.message || "Request failed", response.status);
  }
  return response.json() as Promise<T>;
}

export { API_URL };

