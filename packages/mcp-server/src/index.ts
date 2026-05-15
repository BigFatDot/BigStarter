#!/usr/bin/env node
/**
 * KAP MCP Server — entrypoint.
 *
 * Deux modes :
 *   LOCAL  (KAP_API_URL=local ou absent) — Kuzu direct, sampling pour LLM, zéro backend
 *   REMOTE (KAP_API_URL=https://...) — HTTP backend, Anthropic API directe
 *
 * Primitives MCP exposées :
 *   Tools     — actions actives (kap_report_event, kap_pkg_write, etc.)
 *   Resources — données lisibles via @mention (kap://decisions, kap://vision, etc.)
 *   Prompts   — slash commands versionnés (/mcp__kap__agent_setup, etc.)
 *   Sampling  — délégation d'appels LLM au client (local mode uniquement)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { initConfig } from "./config.js"
import { registerAllTools } from "./tools/index.js"
import { registerResources } from "./resources.js"
import { registerPrompts } from "./prompts.js"

const LOCAL_MODE = !process.env["KAP_API_URL"] || process.env["KAP_API_URL"] === "local"

async function main(): Promise<void> {
  if (!LOCAL_MODE) {
    initConfig()
  }

  const server = new McpServer(
    {
      name: "kap-server",
      version: "0.2.0",
      // description est le champ standard dans cette version du SDK (instructions = spec future)
      description: `KAP (KickStartering Agent Platform) — project memory and community feedback server.

USE THESE TOOLS WHEN:
- Starting a session on a KAP-connected project (kap_pkg_build_context)
- Making an architectural or technical decision worth remembering (kap_pkg_write)
- Completing a commit, test run, deploy, or milestone (kap_report_event)
- Planning the next sprint or feature priority (kap_fetch_feedback)
- Searching for past decisions before implementing a pattern (kap_pkg_query)
- A decision exceeds your autonomy level (kap_escalate_to_admin)

DO NOT use these tools for:
- Trivial code changes (variable renames, style fixes)
- Decisions already recorded in the current session context
- Reporting every single commit — only significant milestones

RESOURCES (use via @mention, not tool calls):
- @kap://decisions: recent architectural decisions
- @kap://vision: foundational project vision
- @kap://signals: pending community feature requests
- @kap://artifacts: recent events and deployments

Autonomy level 1: execute freely, escalate architectural/financial/auth decisions.`,
    },
    {
      capabilities: {
        tools:     { listChanged: true },
        resources: { subscribe: false, listChanged: true },
        prompts:   { listChanged: false },
        logging:   {},
        // sampling est déclaré via experimental pour compatibilité SDK
        experimental: { sampling: {} },
      },
    },
  )

  // ---- Tools ----
  registerAllTools(server)

  // ---- Resources (PKG comme données lisibles via @mention) ----
  if (LOCAL_MODE) {
    registerResources(server)
  }

  // ---- Prompts (slash commands versionnés) ----
  if (LOCAL_MODE) {
    registerPrompts(server)
  }

  // ---- Transport stdio ----
  const transport = new StdioServerTransport()
  await server.connect(transport)

  const mode = LOCAL_MODE ? "local (Kuzu + sampling)" : "remote (HTTP backend)"
  process.stderr.write(`[kap-mcp-server] started — mode: ${mode}\n`)
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  process.stderr.write(`[kap-mcp-server] fatal: ${message}\n`)
  process.exit(1)
})
