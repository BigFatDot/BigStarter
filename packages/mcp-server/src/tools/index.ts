/**
 * KAP MCP Server — central tool registration.
 *
 * All tool groups are wired here. Import this module in index.ts and call
 * registerAllTools(server) once after the McpServer is instantiated.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerEventTools } from "./events.js";
import { registerCommunityTools } from "./governance.js";
import { registerPKGTools } from "./pkg.js";
import { registerEscalationTools } from "./escalation.js";
import { registerAgentTools } from "./agents.js";
import { registerLocalTools } from "./local.js";

/**
 * Mode detection:
 *   KAP_API_URL=local + GITHUB_TOKEN set  → GitHub mode (GitHub Contents API as PKG)
 *   KAP_API_URL=local                     → local mode (Kuzu direct, no backend)
 *   KAP_API_URL=<url>                     → remote mode (HTTP backend)
 *   (unset)                               → local mode by default
 */
export function isLocalMode(): boolean {
  const url = process.env["KAP_API_URL"];
  return !url || url === "local";
}

export function isGitHubMode(): boolean {
  return isLocalMode() &&
    !!(process.env["GITHUB_TOKEN"] || process.env["GITHUB_APP_TOKEN"]) &&
    !!(process.env["GITHUB_OWNER"]) &&
    !!(process.env["GITHUB_REPO"]);
}

export function registerAllTools(server: McpServer): void {
  if (isLocalMode()) {
    // Local mode — Kuzu in-process, no backend required
    registerLocalTools(server);
  } else {
    // Remote mode — full HTTP backend
    registerEventTools(server);
    registerCommunityTools(server);
    registerPKGTools(server);
    registerEscalationTools(server);
    registerAgentTools(server);
  }
}
