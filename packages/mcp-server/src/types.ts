/**
 * KAP MCP Server — Zod schemas and inferred TypeScript types for all tool
 * inputs and outputs.
 *
 * Naming convention:
 *   - Input schema: `<ToolName>Input`  (e.g. KapReportEventInput)
 *   - Output type:  `<ToolName>Output` (e.g. KapReportEventOutput)
 *
 * Schemas are exported both as Zod objects (for MCP registration) and as
 * TypeScript types (via z.infer<>) for use in handler implementations.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export const ProjectIdSchema = z
  .string()
  .min(1)
  .describe("Unique identifier of the KAP project");

export const ConfidenceLevelSchema = z
  .number()
  .min(0)
  .max(1)
  .describe(
    "Agent confidence in the correctness / safety of this action (0.0–1.0)"
  );

export const UrgencySchema = z
  .enum(["low", "medium", "high", "critical"])
  .describe("Urgency level that determines Admin notification priority");

// ---------------------------------------------------------------------------
// Group 1 — Dev events
// ---------------------------------------------------------------------------

// kap_report_event --------------------------------------------------------

export const EventTypeSchema = z.enum([
  "commit",
  "test_run",
  "deploy",
  "milestone",
  "custom",
]);
export type EventType = z.infer<typeof EventTypeSchema>;

export const KapReportEventInputSchema = z.object({
  project_id: ProjectIdSchema,
  event_type: EventTypeSchema.describe(
    "Category of the development event being reported"
  ),
  metadata: z
    .record(z.unknown())
    .describe(
      "Arbitrary key/value pairs describing the event (e.g. commit_sha, test_suite, deploy_env)"
    ),
  confidence: ConfidenceLevelSchema,
  autonomous: z
    .boolean()
    .describe(
      "True if this action was taken autonomously by the agent without Admin validation"
    ),
  summary: z
    .string()
    .optional()
    .describe("Short human-readable description of the event (1–2 sentences)"),
});
export type KapReportEventInput = z.infer<typeof KapReportEventInputSchema>;

export interface KapReportEventOutput {
  event_id: string;
  public_update_triggered: boolean;
  message: string;
}

// kap_publish_demo --------------------------------------------------------

export const KapPublishDemoInputSchema = z.object({
  project_id: ProjectIdSchema,
  demo_url: z.string().url().describe("Publicly accessible URL of the demo"),
  description: z
    .string()
    .min(10)
    .describe("Description of what the demo shows and why it matters"),
  screenshot_base64: z
    .string()
    .optional()
    .describe("Base64-encoded PNG/JPEG screenshot to display on the project page"),
  feature_id: z
    .string()
    .optional()
    .describe("ID of the feature this demo is linked to, if applicable"),
});
export type KapPublishDemoInput = z.infer<typeof KapPublishDemoInputSchema>;

export interface KapPublishDemoOutput {
  demo_id: string;
  public_url: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Group 2 — Feedback and backlog
// ---------------------------------------------------------------------------

// kap_fetch_feedback -------------------------------------------------------

export const KapFetchFeedbackInputSchema = z.object({
  project_id: ProjectIdSchema,
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Maximum number of feature requests to return"),
});
export type KapFetchFeedbackInput = z.infer<typeof KapFetchFeedbackInputSchema>;

export interface FeatureRequest {
  id: string;
  title: string;
  description: string;
  community_score: number;
  vote_count: number;
  comment_count: number;
}

export interface CommunitySignal {
  type: "sentiment" | "churn_risk" | "demand_spike" | "complaint_pattern";
  description: string;
  severity: "low" | "medium" | "high";
}

export interface ActionableBrief {
  priority: number;
  recommendation: string;
  rationale: string;
  linked_feature_ids: string[];
}

export interface KapFetchFeedbackOutput {
  top_feature_requests: FeatureRequest[];
  community_signals: CommunitySignal[];
  po_recommendations: ActionableBrief[];
  generated_at: string;
}

// kap_get_backlog ----------------------------------------------------------

export const KapGetBacklogInputSchema = z.object({
  project_id: ProjectIdSchema,
  sprint_target: z
    .string()
    .optional()
    .describe("Filter by sprint target label, e.g. 'sprint-7'"),
  status: z
    .enum(["open", "in_progress", "done", "blocked"])
    .optional()
    .describe("Filter by feature status"),
});
export type KapGetBacklogInput = z.infer<typeof KapGetBacklogInputSchema>;

export interface BacklogItem {
  id: string;
  title: string;
  description: string;
  status: "open" | "in_progress" | "done" | "blocked";
  community_score: number;
  acceptance_criteria: string[];
  effort_estimate: "xs" | "s" | "m" | "l" | "xl";
  sprint_target: string | null;
}

export interface KapGetBacklogOutput {
  items: BacklogItem[];
  total_count: number;
  last_updated: string;
}

// kap_submit_feature_request -----------------------------------------------

export const KapSubmitFeatureRequestInputSchema = z.object({
  project_id: ProjectIdSchema,
  title: z
    .string()
    .min(5)
    .max(150)
    .describe("Concise title for the feature request"),
  description: z
    .string()
    .min(20)
    .describe("Detailed description of the feature and the problem it solves"),
  rationale: z
    .string()
    .describe(
      "Why the agent believes this feature is needed — observed signal in code or user behavior"
    ),
  suggested_priority: z
    .enum(["low", "medium", "high"])
    .describe("Agent's suggested priority based on impact assessment"),
});
export type KapSubmitFeatureRequestInput = z.infer<
  typeof KapSubmitFeatureRequestInputSchema
>;

export interface KapSubmitFeatureRequestOutput {
  feature_id: string;
  status: "submitted" | "duplicate" | "rejected";
  message: string;
}

// ---------------------------------------------------------------------------
// Group 3 — Community governance / votes
// ---------------------------------------------------------------------------

// kap_trigger_vote ---------------------------------------------------------

export const VoteOptionSchema = z
  .string()
  .min(1)
  .max(120)
  .describe("A single vote option label");

export const KapTriggerVoteInputSchema = z.object({
  project_id: ProjectIdSchema,
  question: z
    .string()
    .min(10)
    .max(300)
    .describe("The question posed to the community"),
  options: z
    .array(VoteOptionSchema)
    .min(2)
    .max(4)
    .describe("Between 2 and 4 answer options"),
  duration_hours: z
    .number()
    .int()
    .min(1)
    .max(168)
    .describe("How long the vote stays open, in hours (max 7 days)"),
  context: z
    .string()
    .describe(
      "Background information displayed to voters so they can make an informed choice"
    ),
  blocking: z
    .boolean()
    .describe(
      "If true, the Orchestrator must wait for kap_get_vote_result before proceeding with the decision"
    ),
});
export type KapTriggerVoteInput = z.infer<typeof KapTriggerVoteInputSchema>;

export interface KapTriggerVoteOutput {
  vote_id: string;
  public_url: string;
  closes_at: string;
  blocking: boolean;
  message: string;
}

// kap_get_vote_result ------------------------------------------------------

export const KapGetVoteResultInputSchema = z.object({
  vote_id: z.string().min(1).describe("ID returned by kap_trigger_vote"),
});
export type KapGetVoteResultInput = z.infer<typeof KapGetVoteResultInputSchema>;

export interface VoteOptionResult {
  option: string;
  vote_count: number;
  percentage: number;
}

export interface KapGetVoteResultOutput {
  vote_id: string;
  question: string;
  status: "open" | "closed" | "cancelled";
  results: VoteOptionResult[];
  winner: string | null;
  total_votes: number;
  closed_at: string | null;
}

// ---------------------------------------------------------------------------
// Group 4 — Project Knowledge Graph (PKG)
// ---------------------------------------------------------------------------

// kap_pkg_write ------------------------------------------------------------

export const PKGNodeTypeSchema = z.enum([
  "Decision",
  "Feature",
  "Component",
  "Constraint",
  "Signal",
  "Artifact",
]);
export type PKGNodeType = z.infer<typeof PKGNodeTypeSchema>;

export const PKGNodeStatusSchema = z.enum([
  "active",
  "superseded",
  "archived",
  "proposed",
]);
export type PKGNodeStatus = z.infer<typeof PKGNodeStatusSchema>;

export const KapPKGWriteInputSchema = z.object({
  project_id: ProjectIdSchema,
  node_type: PKGNodeTypeSchema.describe("Ontology type of this PKG node"),
  title: z.string().min(3).max(200).describe("Short title for the node"),
  content: z
    .string()
    .min(10)
    .describe(
      "Full content of the node: reasoning, context, implications. Be thorough."
    ),
  status: PKGNodeStatusSchema.default("active"),
  domain: z
    .string()
    .optional()
    .describe(
      "Technical domain this node belongs to (e.g. 'auth', 'payments', 'infra')"
    ),
  related_node_ids: z
    .array(z.string())
    .optional()
    .describe("IDs of existing PKG nodes this node relates to"),
  tags: z.array(z.string()).optional().describe("Free-form tags for indexing"),
  confidence: ConfidenceLevelSchema.optional(),
});
export type KapPKGWriteInput = z.infer<typeof KapPKGWriteInputSchema>;

export interface KapPKGWriteOutput {
  node_id: string;
  created_at: string;
  message: string;
}

// kap_pkg_query ------------------------------------------------------------

export const KapPKGQueryInputSchema = z.object({
  project_id: ProjectIdSchema,
  mode: z
    .enum(["structured", "semantic"])
    .describe(
      "structured: filter by explicit fields. semantic: free-text search over node content."
    ),
  // Structured mode filters
  node_types: z
    .array(PKGNodeTypeSchema)
    .optional()
    .describe("[structured] Filter by one or more node types"),
  status: z
    .array(PKGNodeStatusSchema)
    .optional()
    .describe("[structured] Filter by node status"),
  domain: z
    .string()
    .optional()
    .describe("[structured] Filter by technical domain"),
  tags: z
    .array(z.string())
    .optional()
    .describe("[structured] Filter by tags (AND logic)"),
  // Semantic mode
  query: z
    .string()
    .optional()
    .describe(
      "[semantic] Natural-language query — the backend performs embedding search"
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Maximum number of nodes to return"),
});
export type KapPKGQueryInput = z.infer<typeof KapPKGQueryInputSchema>;

export interface PKGNode {
  id: string;
  node_type: PKGNodeType;
  title: string;
  content: string;
  status: PKGNodeStatus;
  domain: string | null;
  tags: string[];
  related_node_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface KapPKGQueryOutput {
  nodes: PKGNode[];
  total_matched: number;
}

// kap_pkg_build_context ----------------------------------------------------

export const KapPKGBuildContextInputSchema = z.object({
  project_id: ProjectIdSchema,
  task_description: z
    .string()
    .min(10)
    .describe(
      "Natural-language description of the task the Orchestrator is about to work on"
    ),
  max_nodes_per_type: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(3)
    .describe("Maximum nodes to return per node type"),
});
export type KapPKGBuildContextInput = z.infer<
  typeof KapPKGBuildContextInputSchema
>;

export interface KapPKGBuildContextOutput {
  relevant_decisions: PKGNode[];
  active_constraints: PKGNode[];
  related_features: PKGNode[];
  affected_components: PKGNode[];
  context_summary: string;
}

// ---------------------------------------------------------------------------
// Group 5 — Escalation and policy
// ---------------------------------------------------------------------------

// kap_escalate_to_admin ----------------------------------------------------

export const EscalationOptionSchema = z.object({
  label: z.string().describe("Short label for the option"),
  description: z.string().describe("What this option entails"),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
});

export const KapEscalateToAdminInputSchema = z.object({
  project_id: ProjectIdSchema,
  title: z
    .string()
    .min(5)
    .max(200)
    .describe("Short summary of the escalation — appears in the Admin alert"),
  context: z
    .string()
    .min(20)
    .describe(
      "Full context: what happened, what was tried, why Admin input is needed"
    ),
  options: z
    .array(EscalationOptionSchema)
    .min(1)
    .max(5)
    .describe("Options the Admin can choose from"),
  recommendation: z
    .string()
    .describe("Agent's recommended option and rationale"),
  urgency: UrgencySchema,
  impact_if_timeout: z
    .string()
    .describe(
      "What the agent will do if Admin does not respond before the timeout"
    ),
});
export type KapEscalateToAdminInput = z.infer<
  typeof KapEscalateToAdminInputSchema
>;

export interface KapEscalateToAdminOutput {
  escalation_id: string;
  timeout_at: string;
  action_if_timeout: string;
  message: string;
}

// kap_check_escalation_policy ---------------------------------------------

export const KapCheckEscalationPolicyInputSchema = z.object({
  project_id: ProjectIdSchema,
  decision_description: z
    .string()
    .min(10)
    .describe("Description of the decision the agent is about to make"),
  domain: z
    .string()
    .describe(
      "Technical or business domain of the decision (e.g. 'security', 'billing', 'database-schema')"
    ),
  estimated_confidence: ConfidenceLevelSchema.describe(
    "Agent's self-assessed confidence in the correctness of the decision"
  ),
});
export type KapCheckEscalationPolicyInput = z.infer<
  typeof KapCheckEscalationPolicyInputSchema
>;

export interface KapCheckEscalationPolicyOutput {
  must_escalate: boolean;
  reason: string;
  required_confidence_threshold: number;
  policy_rule: string | null;
}

// kap_get_autonomy_config --------------------------------------------------

export const KapGetAutonomyConfigInputSchema = z.object({
  project_id: ProjectIdSchema,
});
export type KapGetAutonomyConfigInput = z.infer<
  typeof KapGetAutonomyConfigInputSchema
>;

export interface DomainAutonomyLevel {
  domain: string;
  level: "full" | "supervised" | "blocked";
  confidence_threshold: number;
  notes: string | null;
}

export interface KapGetAutonomyConfigOutput {
  project_id: string;
  default_level: "full" | "supervised" | "blocked";
  domain_overrides: DomainAutonomyLevel[];
  admin_constraints: string[];
  last_updated: string;
}

// ---------------------------------------------------------------------------
// Group 6 — Internal agent coordination
// ---------------------------------------------------------------------------

// kap_spawn_subagent -------------------------------------------------------

export const SubAgentTypeSchema = z.enum([
  "Reporter",
  "Verifier",
  "PO",
  "Promoter",
  "Builder",
]);
export type SubAgentType = z.infer<typeof SubAgentTypeSchema>;

export const KapSpawnSubagentInputSchema = z.object({
  project_id: ProjectIdSchema,
  agent_type: SubAgentTypeSchema.describe(
    "Type of specialised sub-agent to spawn"
  ),
  task: z
    .string()
    .min(10)
    .describe(
      "Precise description of the task the sub-agent must accomplish"
    ),
  context: z
    .string()
    .describe(
      "Relevant context the sub-agent needs: current state, constraints, expected output format"
    ),
  priority: z
    .enum(["low", "normal", "high"])
    .default("normal")
    .describe("Execution priority — high tasks are scheduled first"),
});
export type KapSpawnSubagentInput = z.infer<typeof KapSpawnSubagentInputSchema>;

export interface KapSpawnSubagentOutput {
  subagent_id: string;
  status: "queued" | "running";
  estimated_completion_at: string | null;
  message: string;
}

// kap_get_subagent_result -------------------------------------------------

export const KapGetSubagentResultInputSchema = z.object({
  subagent_id: z
    .string()
    .min(1)
    .describe("ID returned by kap_spawn_subagent"),
});
export type KapGetSubagentResultInput = z.infer<
  typeof KapGetSubagentResultInputSchema
>;

export interface KapGetSubagentResultOutput {
  subagent_id: string;
  agent_type: SubAgentType;
  status: "queued" | "running" | "completed" | "failed";
  result: unknown | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
}

// kap_list_active_agents --------------------------------------------------

export const KapListActiveAgentsInputSchema = z.object({
  project_id: ProjectIdSchema,
});
export type KapListActiveAgentsInput = z.infer<
  typeof KapListActiveAgentsInputSchema
>;

export interface ActiveAgent {
  subagent_id: string;
  agent_type: SubAgentType;
  status: "queued" | "running";
  task_summary: string;
  started_at: string | null;
  estimated_completion_at: string | null;
}

export interface KapListActiveAgentsOutput {
  agents: ActiveAgent[];
  total_active: number;
}
