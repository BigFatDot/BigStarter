/**
 * KAP MCP Server — Tool group: Internal Agent Coordination (Group 6).
 *
 * Tools registered here:
 *   kap_spawn_subagent        — launch a specialised sub-agent
 *   kap_get_subagent_result   — retrieve the result of a previously spawned sub-agent
 *   kap_list_active_agents    — list all sub-agents currently active on the project
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { kapRequest } from "../api-client.js";
import {
  KapSpawnSubagentInputSchema,
  KapGetSubagentResultInputSchema,
  KapListActiveAgentsInputSchema,
} from "../types.js";
import type {
  KapSpawnSubagentOutput,
  KapGetSubagentResultOutput,
  KapListActiveAgentsOutput,
} from "../types.js";

export function registerAgentTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // kap_spawn_subagent
  // -------------------------------------------------------------------------
  server.tool(
    "kap_spawn_subagent",
    `Spawn a specialised sub-agent to handle a bounded, delegatable task.
Use this to parallelise work or to leverage domain-specific capabilities.

Agent types and when to use them:
  Reporter   — generate a structured progress update, changelog entry, or public announcement
  Verifier   — run QA, validate acceptance criteria, check for regressions, audit code quality
  PO         — analyse feedback, score feature requests, update backlog priorities
  Promoter   — create community-facing content, tweets, changelogs, release notes
  Builder    — implement a well-scoped feature or fix with clear acceptance criteria

Provide a precise 'task' and rich 'context' (current state, constraints, expected output format).
The sub-agent runs asynchronously — use kap_get_subagent_result to retrieve its output.
Use priority 'high' only for tasks blocking the current sprint goal.`,
    KapSpawnSubagentInputSchema.shape,
    async (args) => {
      const input = KapSpawnSubagentInputSchema.parse(args);
      const result = await kapRequest<KapSpawnSubagentOutput>(
        "POST",
        `/projects/${input.project_id}/agents`,
        {
          agent_type: input.agent_type,
          task: input.task,
          context: input.context,
          priority: input.priority,
        }
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // kap_get_subagent_result
  // -------------------------------------------------------------------------
  server.tool(
    "kap_get_subagent_result",
    `Retrieve the result of a previously spawned sub-agent.
Use the subagent_id returned by kap_spawn_subagent.
Check the 'status' field first:
  queued    — not yet started, check back later
  running   — still executing, check back later
  completed — result is available in the 'result' field
  failed    — the 'error' field explains what went wrong

Do not poll in a tight loop — use estimated_completion_at to decide when to check.
If a sub-agent fails, analyse the error and decide whether to retry, fix the task description, or escalate.`,
    KapGetSubagentResultInputSchema.shape,
    async (args) => {
      const input = KapGetSubagentResultInputSchema.parse(args);
      const result = await kapRequest<KapGetSubagentResultOutput>(
        "GET",
        `/agents/${input.subagent_id}`
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // kap_list_active_agents
  // -------------------------------------------------------------------------
  server.tool(
    "kap_list_active_agents",
    `List all sub-agents currently active (queued or running) on the project.
Use this at the start of a session to understand what work is already in flight
before spawning duplicate agents.
Also use it to detect stuck agents (running far past their estimated_completion_at).
Returns each agent's type, task summary, and timing information.`,
    KapListActiveAgentsInputSchema.shape,
    async (args) => {
      const input = KapListActiveAgentsInputSchema.parse(args);
      const result = await kapRequest<KapListActiveAgentsOutput>(
        "GET",
        `/projects/${input.project_id}/agents?status=active`
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    }
  );
}
