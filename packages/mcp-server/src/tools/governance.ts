/**
 * KAP MCP Server — Tool group: Community Governance / Votes (Group 3).
 *
 * Tools registered here:
 *   kap_trigger_vote     — launch a public vote on the project page
 *   kap_get_vote_result  — retrieve the outcome of a previously launched vote
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { kapRequest } from "../api-client.js";
import {
  KapTriggerVoteInputSchema,
  KapGetVoteResultInputSchema,
} from "../types.js";
import type {
  KapTriggerVoteOutput,
  KapGetVoteResultOutput,
} from "../types.js";

export function registerCommunityTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // kap_trigger_vote
  // -------------------------------------------------------------------------
  server.tool(
    "kap_trigger_vote",
    `Launch a public community vote on the KAP project page.
Use this when a significant decision should be made by the community rather than autonomously by the agent.
Ideal use cases: choosing between two architectural directions, deciding on a feature scope,
or validating a product pivot.
Limit options to 2–4 clear, distinct choices. Write the 'context' field thoroughly —
voters who lack context make poor decisions.
Set 'blocking' to true when the Orchestrator must wait for the result before proceeding
(e.g. a technical decision that affects the next sprint).
Set 'blocking' to false for advisory votes that do not block execution.`,
    KapTriggerVoteInputSchema.shape,
    async (args) => {
      const input = KapTriggerVoteInputSchema.parse(args);
      const result = await kapRequest<KapTriggerVoteOutput>(
        "POST",
        `/projects/${input.project_id}/votes`,
        {
          question: input.question,
          options: input.options,
          duration_hours: input.duration_hours,
          context: input.context,
          blocking: input.blocking,
        }
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // kap_get_vote_result
  // -------------------------------------------------------------------------
  server.tool(
    "kap_get_vote_result",
    `Retrieve the current or final result of a community vote.
Use this to check whether a blocking vote has concluded before proceeding with a blocked decision.
Also use it to read the outcome of any advisory vote before drafting a plan.
The 'status' field tells you whether the vote is still open, closed, or cancelled.
If status is 'open', the result is partial — poll again later if the vote is blocking.`,
    KapGetVoteResultInputSchema.shape,
    async (args) => {
      const input = KapGetVoteResultInputSchema.parse(args);
      const result = await kapRequest<KapGetVoteResultOutput>(
        "GET",
        `/votes/${input.vote_id}`
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    }
  );
}
