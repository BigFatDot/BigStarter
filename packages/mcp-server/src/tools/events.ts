/**
 * KAP MCP Server — Tool group: Dev Events and Feedback (Groups 1 & 2).
 *
 * Tools registered here:
 *   kap_report_event          — signal a dev event to the backend
 *   kap_publish_demo          — publish a demo/screenshot on the project page
 *   kap_fetch_feedback        — retrieve the structured PO brief
 *   kap_get_backlog           — retrieve the current prioritised backlog
 *   kap_submit_feature_request — submit an agent-originated feature request
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { kapRequest } from "../api-client.js";
import {
  KapReportEventInputSchema,
  KapPublishDemoInputSchema,
  KapFetchFeedbackInputSchema,
  KapGetBacklogInputSchema,
  KapSubmitFeatureRequestInputSchema,
} from "../types.js";
import type {
  KapReportEventOutput,
  KapPublishDemoOutput,
  KapFetchFeedbackOutput,
  KapGetBacklogOutput,
  KapSubmitFeatureRequestOutput,
} from "../types.js";

export function registerEventTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // kap_report_event
  // -------------------------------------------------------------------------
  server.tool(
    "kap_report_event",
    `Signal that a development event has occurred on the project.
Use this after every significant action: commits, test runs, deployments, milestone completions, or custom agent actions.
The KAP backend decides whether the event warrants a public update based on project settings.
Always report events — do not filter them yourself.
Set 'autonomous' to false when the action was explicitly validated by the Admin.`,
    KapReportEventInputSchema.shape,
    async (args) => {
      const input = KapReportEventInputSchema.parse(args);
      const result = await kapRequest<KapReportEventOutput>(
        "POST",
        `/projects/${input.project_id}/events`,
        {
          event_type: input.event_type,
          metadata: input.metadata,
          confidence: input.confidence,
          autonomous: input.autonomous,
          summary: input.summary,
        }
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result),
          },
        ],
      };
    }
  );

  // -------------------------------------------------------------------------
  // kap_publish_demo
  // -------------------------------------------------------------------------
  server.tool(
    "kap_publish_demo",
    `Explicitly publish a demo or screenshot to the public project page on KAP.
Use this when a feature is visually demonstrable and worth showcasing to the community.
Prefer calling this after milestone completions or when a new UI feature lands.
Providing a screenshot_base64 strongly increases community engagement.
Optionally link the demo to a specific feature ID so it appears on that feature's timeline.`,
    KapPublishDemoInputSchema.shape,
    async (args) => {
      const input = KapPublishDemoInputSchema.parse(args);
      const result = await kapRequest<KapPublishDemoOutput>(
        "POST",
        `/projects/${input.project_id}/demos`,
        {
          demo_url: input.demo_url,
          description: input.description,
          screenshot_base64: input.screenshot_base64,
          feature_id: input.feature_id,
        }
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // kap_fetch_feedback
  // -------------------------------------------------------------------------
  server.tool(
    "kap_fetch_feedback",
    `Retrieve the structured PO brief for the Orchestrator.
Call this at the start of each planning cycle or sprint to understand what the community wants most.
Returns top feature requests ranked by community score, active community signals (sentiment, churn risk, demand spikes),
PO Agent recommendations, and actionable briefs already formatted for agent consumption.
Do not make sprint planning decisions without calling this first.`,
    KapFetchFeedbackInputSchema.shape,
    async (args) => {
      const input = KapFetchFeedbackInputSchema.parse(args);
      const result = await kapRequest<KapFetchFeedbackOutput>(
        "GET",
        `/projects/${input.project_id}/feedback?limit=${input.limit}`
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // kap_get_backlog
  // -------------------------------------------------------------------------
  server.tool(
    "kap_get_backlog",
    `Retrieve the current prioritised feature backlog for the project.
Use this to understand what work is planned, in progress, blocked, or done.
Filter by sprint_target to focus on a specific sprint.
Filter by status to check blocked items before planning.
Each item includes acceptance criteria and effort estimates — use them to scope work accurately.`,
    KapGetBacklogInputSchema.shape,
    async (args) => {
      const input = KapGetBacklogInputSchema.parse(args);
      const params = new URLSearchParams();
      if (input.sprint_target) params.set("sprint_target", input.sprint_target);
      if (input.status) params.set("status", input.status);
      const query = params.toString() ? `?${params.toString()}` : "";
      const result = await kapRequest<KapGetBacklogOutput>(
        "GET",
        `/projects/${input.project_id}/backlog${query}`
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // kap_submit_feature_request
  // -------------------------------------------------------------------------
  server.tool(
    "kap_submit_feature_request",
    `Submit a new feature request on behalf of the Orchestrator.
Use this when you observe a gap in the project based on code analysis, error patterns, or technical needs
that has not yet been expressed by the community.
Provide a clear rationale explaining what signal led you to identify this need.
The PO Agent will review, score, and potentially promote it into the backlog.
Do not use this to re-submit features already present in the backlog.`,
    KapSubmitFeatureRequestInputSchema.shape,
    async (args) => {
      const input = KapSubmitFeatureRequestInputSchema.parse(args);
      const result = await kapRequest<KapSubmitFeatureRequestOutput>(
        "POST",
        `/projects/${input.project_id}/feature-requests`,
        {
          title: input.title,
          description: input.description,
          rationale: input.rationale,
          suggested_priority: input.suggested_priority,
        }
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    }
  );
}
