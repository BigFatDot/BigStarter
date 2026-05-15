/**
 * KAP MCP Server — runtime configuration.
 *
 * All values are read from environment variables at startup.
 * The server refuses to start if KAP_API_URL is not set.
 */

export interface KapServerConfig {
  /** Base URL of the KAP backend API, e.g. https://api.kap.example.com */
  apiUrl: string;
  /** Bearer token used to authenticate MCP server calls to the KAP API */
  apiToken: string;
  /** Default request timeout in milliseconds */
  timeoutMs: number;
  /** Number of retries for transient network errors (5xx, ECONNRESET) */
  retryCount: number;
  /** Base delay between retries in milliseconds (exponential back-off applied) */
  retryBaseDelayMs: number;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Set it before starting the KAP MCP server.`
    );
  }
  return value;
}

function optionalEnvInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) {
    throw new Error(
      `Environment variable ${name} must be an integer, got: "${raw}"`
    );
  }
  return parsed;
}

export function loadConfig(): KapServerConfig {
  return {
    apiUrl: requireEnv("KAP_API_URL").replace(/\/$/, ""), // strip trailing slash
    apiToken: requireEnv("KAP_API_TOKEN"),
    timeoutMs: optionalEnvInt("KAP_TIMEOUT_MS", 30_000),
    retryCount: optionalEnvInt("KAP_RETRY_COUNT", 3),
    retryBaseDelayMs: optionalEnvInt("KAP_RETRY_BASE_DELAY_MS", 500),
  };
}

/** Singleton config — loaded once at startup. */
export let config: KapServerConfig;

export function initConfig(): void {
  config = loadConfig();
}
