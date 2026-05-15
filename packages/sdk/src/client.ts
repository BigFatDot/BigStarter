import type { KAPEvent, KAPSDKConfig, SendEventResult } from "./types.js";

export type KAPClientOptions = KAPSDKConfig;

export interface KAPClient {
  sendEvent(event: KAPEvent): Promise<SendEventResult>;
  ping(): Promise<boolean>;
}

export function createKAPClient(options: KAPClientOptions): KAPClient {
  const { apiUrl, apiKey, projectId, timeoutMs = 10_000 } = options;

  async function sendEvent(event: KAPEvent): Promise<SendEventResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${apiUrl}/v1/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "X-KAP-Project": projectId,
        },
        body: JSON.stringify(event),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`KAP API error: ${response.status} ${response.statusText}`);
      }

      return (await response.json()) as SendEventResult;
    } finally {
      clearTimeout(timer);
    }
  }

  async function ping(): Promise<boolean> {
    try {
      const response = await fetch(`${apiUrl}/health`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  return { sendEvent, ping };
}
