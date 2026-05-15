/**
 * KAP MCP Server — Tool group: Escalation and Policy (Group 5).
 *
 * Tools registered here:
 *   kap_escalate_to_admin          — trigger an Admin escalation with full context
 *   kap_check_escalation_policy    — check whether a decision requires escalation
 *   kap_get_autonomy_config        — retrieve the project's autonomy configuration
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { kapRequest } from "../api-client.js";
import {
  KapEscalateToAdminInputSchema,
  KapCheckEscalationPolicyInputSchema,
  KapGetAutonomyConfigInputSchema,
} from "../types.js";
import type {
  KapEscalateToAdminOutput,
  KapCheckEscalationPolicyOutput,
  KapGetAutonomyConfigOutput,
} from "../types.js";

export function registerEscalationTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // kap_escalate_to_admin
  // -------------------------------------------------------------------------
  server.tool(
    "kap_escalate_to_admin",
    `Trigger an escalation to the project Admin and wait for a decision.
Use this when you have reached a decision point that exceeds your autonomy level,
is irreversible, involves high risk, or was flagged as requiring escalation by kap_check_escalation_policy.

Provide ALL of the following to get a fast, well-informed Admin response:
  - 'context': full background — what happened, what you tried, why you are stuck
  - 'options': 2–5 concrete options with pros and cons (not just "do it" vs "don't do it")
  - 'recommendation': your preferred option with justification
  - 'impact_if_timeout': what you will do if the Admin does not respond — be explicit

The tool returns an escalation_id, a timeout timestamp, and the fallback action.
If the Admin responds before timeout, retrieve their decision via the escalation_id.
Do not proceed with the recommended option until either Admin confirms or timeout expires.`,
    KapEscalateToAdminInputSchema.shape,
    async (args) => {
      const input = KapEscalateToAdminInputSchema.parse(args);
      const result = await kapRequest<KapEscalateToAdminOutput>(
        "POST",
        `/projects/${input.project_id}/escalations`,
        {
          title: input.title,
          context: input.context,
          options: input.options,
          recommendation: input.recommendation,
          urgency: input.urgency,
          impact_if_timeout: input.impact_if_timeout,
        }
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // kap_check_escalation_policy
  // -------------------------------------------------------------------------
  server.tool(
    "kap_check_escalation_policy",
    `Check whether a decision you are about to make requires Admin escalation.
Call this BEFORE executing any action that:
  - Is irreversible (schema migrations, data deletions, external API calls with side effects)
  - Involves a sensitive domain (security, billing, user data, infrastructure)
  - Has a confidence below 0.8
  - Could affect production user data

Returns 'must_escalate' (boolean), the reason, and the confidence threshold required
for autonomous execution in this domain.
If must_escalate is true, call kap_escalate_to_admin before proceeding.
If must_escalate is false, you may proceed autonomously — record the decision in the PKG.`,
    KapCheckEscalationPolicyInputSchema.shape,
    async (args) => {
      const input = KapCheckEscalationPolicyInputSchema.parse(args);
      const result = await kapRequest<KapCheckEscalationPolicyOutput>(
        "POST",
        `/projects/${input.project_id}/escalation-policy/check`,
        {
          decision_description: input.decision_description,
          domain: input.domain,
          estimated_confidence: input.estimated_confidence,
        }
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // kap_get_autonomy_config
  // -------------------------------------------------------------------------
  server.tool(
    "kap_get_autonomy_config",
    `Retrieve the full autonomy configuration for the project.
Call this once at the start of a session to understand what you are and are not allowed to do.
The config specifies the default autonomy level ('full', 'supervised', or 'blocked')
and per-domain overrides (e.g. billing is 'blocked', frontend is 'full').
Also returns explicit Admin constraints written in natural language.
Use this to calibrate your confidence thresholds before any planning.`,
    KapGetAutonomyConfigInputSchema.shape,
    async (args) => {
      const input = KapGetAutonomyConfigInputSchema.parse(args);
      const result = await kapRequest<KapGetAutonomyConfigOutput>(
        "GET",
        `/projects/${input.project_id}/autonomy-config`
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    }
  );
}
