/**
 * KAP MCP Server — Tool group: Project Knowledge Graph (Group 4).
 *
 * Tools registered here:
 *   kap_pkg_write          — write a node to the project PKG
 *   kap_pkg_query          — structured or semantic query over the PKG
 *   kap_pkg_build_context  — one-shot context assembly for a task description
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { kapRequest } from "../api-client.js";
import {
  KapPKGWriteInputSchema,
  KapPKGQueryInputSchema,
  KapPKGBuildContextInputSchema,
} from "../types.js";
import type {
  KapPKGWriteOutput,
  KapPKGQueryOutput,
  KapPKGBuildContextOutput,
} from "../types.js";

export function registerPKGTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // kap_pkg_write
  // -------------------------------------------------------------------------
  server.tool(
    "kap_pkg_write",
    `Write a node to the Project Knowledge Graph (PKG).
The PKG is the persistent memory of the project — every significant decision, constraint,
or architectural element should be recorded here.

Node types:
  Decision   — an architectural or product choice that was made and why
  Feature    — a feature and its specifications, acceptance criteria, current state
  Component  — a system component (service, module, library) and its responsibilities
  Constraint — a hard constraint (regulatory, technical, performance) that must not be violated
  Signal     — an observed signal (user behaviour, metric, anomaly) worth tracking
  Artifact   — a produced artifact (schema, spec, migration) with its location and version

Write a Decision node after every significant technical choice.
Write a Constraint node whenever you discover a non-obvious limitation.
Link related nodes via 'related_node_ids' to build the graph.
Set status to 'superseded' when a node replaces an older one.`,
    KapPKGWriteInputSchema.shape,
    async (args) => {
      const input = KapPKGWriteInputSchema.parse(args);
      const result = await kapRequest<KapPKGWriteOutput>(
        "POST",
        `/projects/${input.project_id}/pkg/nodes`,
        {
          node_type: input.node_type,
          title: input.title,
          content: input.content,
          status: input.status,
          domain: input.domain,
          related_node_ids: input.related_node_ids,
          tags: input.tags,
          confidence: input.confidence,
        }
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // kap_pkg_query
  // -------------------------------------------------------------------------
  server.tool(
    "kap_pkg_query",
    `Query the Project Knowledge Graph.
Two modes:
  structured — filter by node_type, status, domain, or tags. Use when you know what category of knowledge you need.
  semantic   — free-text natural-language query backed by embedding search. Use when you need relevant nodes for a vague topic.

Prefer kap_pkg_build_context over this tool when starting work on a task —
it already combines multiple queries into a ready-to-use context bundle.
Use kap_pkg_query directly when you need fine-grained control over what to retrieve
(e.g. all active Constraints in the 'auth' domain before making a security change).`,
    KapPKGQueryInputSchema.shape,
    async (args) => {
      const input = KapPKGQueryInputSchema.parse(args);
      const result = await kapRequest<KapPKGQueryOutput>(
        "POST",
        `/projects/${input.project_id}/pkg/query`,
        {
          mode: input.mode,
          node_types: input.node_types,
          status: input.status,
          domain: input.domain,
          tags: input.tags,
          query: input.query,
          limit: input.limit,
        }
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // kap_pkg_build_context
  // -------------------------------------------------------------------------
  server.tool(
    "kap_pkg_build_context",
    `Assemble the full PKG context relevant to a task the Orchestrator is about to work on.
This is the PRIMARY tool to call at the start of any non-trivial session.
Provide a natural-language description of what you are about to do.
The backend uses semantic search to find and group:
  - Decisions that have shaped this area of the codebase
  - Active constraints that must not be violated
  - Related features that may be affected
  - Components that will be touched
  - A synthesised 'context_summary' string ready to prepend to your planning prompt

Calling this avoids re-deriving context that already exists in the graph and prevents
contradicting past decisions.`,
    KapPKGBuildContextInputSchema.shape,
    async (args) => {
      const input = KapPKGBuildContextInputSchema.parse(args);
      const result = await kapRequest<KapPKGBuildContextOutput>(
        "POST",
        `/projects/${input.project_id}/pkg/build-context`,
        {
          task_description: input.task_description,
          max_nodes_per_type: input.max_nodes_per_type,
        }
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    }
  );
}
