/**
 * KAP MCP Server — thin HTTP client for the KAP backend API.
 *
 * Responsibilities:
 *   - Attach the Authorization header
 *   - Enforce request timeout via AbortController
 *   - Retry on transient errors (5xx, network failures) with exponential back-off
 *   - Surface API errors as structured McpToolError messages
 */

import { config } from "./config.js";

export class KapApiError extends Error {
  constructor(
    public readonly statusCode: number | null,
    message: string,
    public readonly body: unknown = null
  ) {
    super(message);
    this.name = "KapApiError";
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isTransient(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Make an authenticated request to the KAP API.
 * Retries on transient errors with exponential back-off.
 */
export async function kapRequest<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${config.apiUrl}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const options: RequestInit = {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= config.retryCount; attempt++) {
    if (attempt > 0) {
      const delay = config.retryBaseDelayMs * Math.pow(2, attempt - 1);
      await sleep(delay);
    }

    try {
      const response = await fetchWithTimeout(url, options);

      if (response.ok) {
        // 204 No Content
        if (response.status === 204) return undefined as unknown as T;
        return (await response.json()) as T;
      }

      // Parse error body for a useful message
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text().catch(() => null);
      }

      const message =
        typeof errorBody === "object" &&
        errorBody !== null &&
        "message" in errorBody &&
        typeof (errorBody as Record<string, unknown>)["message"] === "string"
          ? (errorBody as Record<string, unknown>)["message"]
          : `KAP API error ${response.status} ${response.statusText}`;

      if (isTransient(response.status) && attempt < config.retryCount) {
        lastError = new KapApiError(response.status, message as string, errorBody);
        continue;
      }

      throw new KapApiError(response.status, message as string, errorBody);
    } catch (err) {
      if (err instanceof KapApiError) throw err;

      // Network-level error (ECONNRESET, AbortError, etc.)
      const msg =
        err instanceof Error ? err.message : "Unknown network error";
      lastError = new KapApiError(null, `Network error calling KAP API: ${msg}`);

      if (attempt < config.retryCount) continue;
      throw lastError;
    }
  }

  // Should be unreachable, but satisfies the compiler
  throw lastError;
}
