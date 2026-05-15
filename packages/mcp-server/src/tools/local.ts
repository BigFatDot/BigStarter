/**
 * Local-mode tool registrations.
 * Used when KAP_API_URL=local — no backend needed.
 * All data persists in .kap/{projectId}.db (Kuzu graph).
 *
 * Sampling : les appels LLM (buildAgentContext summary, etc.) sont délégués
 * au client MCP via sampling/createMessage — pas besoin de clé Anthropic.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getLocalPKG } from "../local-pkg.js";
import { sampleText } from "../sampling.js";

const projectIdParam = {
  project_id: z.string().describe("Your KAP project ID (from kap.config.json)"),
};

export function registerLocalTools(server: McpServer): void {

  // ----------------------------------------------------------------
  // kap_report_event
  // ----------------------------------------------------------------
  server.tool(
    "kap_report_event",
    `Report a significant development event to KAP. Stores an artifact in the PKG and generates an editorial update for the public project page via sampling (no API key needed).

CALL WHEN: completing a feature, milestone, successful test suite, deployment, or any meaningful progress worth communicating to the community.
DO NOT CALL for: trivial commits (typo fixes, formatting), intermediate work-in-progress steps, or failed attempts you're about to retry.
SIDE EFFECT: generates a public editorial update visible on the project page.`,
    {
      ...projectIdParam,
      event_type: z.enum(["commit", "test_run", "deploy", "milestone", "custom"])
        .describe("Type of event"),
      summary: z.string().describe("Human-readable description of what happened"),
      metadata: z.record(z.unknown()).optional()
        .describe("Extra data: commit hash, test counts, branch name, etc."),
    },
    async (args) => {
      const pkg = await getLocalPKG(args.project_id);

      // 1. Persist artifact in PKG
      const artifactId = await pkg.writeArtifact({
        artifact_type: args.event_type,
        reference: String((args.metadata?.["hash"] ?? args.metadata?.["runId"]) ?? args.event_type),
        description: args.summary,
        verification_status: "pass",
      });

      // 2. Récupérer le contexte récent pour enrichir l'update
      const recentDecisions = await pkg.getRecentDecisions(3);
      const decisionsCtx = recentDecisions
        .map(d => `- ${String(d["d.title"] ?? "")}`)
        .join("\n") || "none yet";

      // 3. Générer l'update éditoriale via sampling (client LLM, pas d'API key)
      let editorial = args.summary;
      let publishReady = false;

      try {
        const raw = await sampleText(
          server,
          `EVENT: ${args.event_type}
WHAT HAPPENED: ${args.summary}
${args.metadata ? `DETAILS: ${JSON.stringify(args.metadata)}` : ""}

RECENT PROJECT DECISIONS:
${decisionsCtx}

TASK: Write a public project update (2-3 sentences).
RULES:
- Specific and concrete — mention real things that were built
- No hype words: "excited", "amazing", "revolutionary", "cutting-edge"
- No openers like "Here's an update:" or "I'm happy to share"
- No markdown, no links, no formatting
- Start directly with the content`,
          {
            system: "You write honest, specific project updates for a developer audience. Plain prose only.",
            model: "claude-haiku-4-5",
            maxTokens: 220,
          },
        );

        // Validate: non-empty, no markdown artifacts, reasonable length
        const cleaned = raw.trim().replace(/^[`#*>\-]+/gm, '').trim();
        if (cleaned.length < 20) throw new Error("Editorial too short");
        editorial = cleaned.slice(0, 400);
        publishReady = true;
      } catch {
        // Sampling not available or output invalid — fallback to raw summary
        editorial = args.summary;
        publishReady = false;
      }

      // 4. Commit l'update dans .kap/updates/ (GitHub source de vérité)
      const date = new Date().toISOString().slice(0, 10);
      const slug = editorial.slice(0, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
      const filename = `${date}-${slug}.md`;
      const markdownContent = `---
date: "${new Date().toISOString()}"
event_type: "${args.event_type}"
artifact_id: "${artifactId}"
---

${editorial}
`;

      // Essaie de committer via GitHubPKGService si disponible, sinon log local
      let committed = false;
      try {
        const { Octokit } = await import("@octokit/rest" as string);
        const token = process.env["GITHUB_TOKEN"] ?? process.env["GITHUB_APP_TOKEN"];
        const owner = process.env["GITHUB_OWNER"];
        const repo  = process.env["GITHUB_REPO"];
        if (token && owner && repo) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const octokit = new (Octokit as any)({ auth: token });
          const path = `.kap/updates/${filename}`;
          // Check if file exists (for SHA)
          let sha: string | undefined;
          try {
            const existing = await octokit.repos.getContent({ owner, repo, path });
            sha = (existing.data as { sha: string }).sha;
          } catch { /* new file */ }
          await octokit.repos.createOrUpdateFileContents({
            owner, repo, path,
            message: `bigstarter: update "${editorial.slice(0, 60)}"`,
            content: Buffer.from(markdownContent).toString("base64"),
            ...(sha ? { sha } : {}),
          });
          committed = true;
        }
      } catch { /* GitHub not configured or unreachable */ }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            ok: true,
            artifact_id: artifactId,
            editorial_update: editorial,
            publish_ready: publishReady,
            committed_to_github: committed,
            filename: committed ? `.kap/updates/${filename}` : null,
            message: committed
              ? `Update committed to .kap/updates/${filename} — visible on BigStarter platform.`
              : publishReady
                ? `Update generated via sampling. Add GITHUB_TOKEN to commit automatically.`
                : `Event stored. Sampling unavailable — using raw summary.`,
          }),
        }],
      };
    }
  );

  // ----------------------------------------------------------------
  // kap_pkg_write
  // ----------------------------------------------------------------
  server.tool(
    "kap_pkg_write",
    `Write a node to the Project Knowledge Graph — the persistent memory of this project that survives across sessions.

CALL WHEN: making a significant architectural, technical, or product decision. A decision is significant if a future agent (or future you) would need to know WHY you made this choice.
DO NOT CALL for: trivial implementation choices (variable names, minor style), decisions already recorded in this session, or anything that will be obvious from the code.
REQUIRED fields for decisions: title, description, rationale, alternatives_rejected (even if empty array).
SIDE EFFECT: this data persists across sessions and is read by kap_pkg_build_context.`,
    {
      ...projectIdParam,
      node_type: z.enum(["decision", "signal", "artifact"])
        .describe("Type of node to write"),
      title: z.string().describe("Short title"),
      description: z.string().describe("Full description"),
      rationale: z.string().optional()
        .describe("Why this decision was made (required for decisions)"),
      domain: z.enum(["architecture", "product", "technical", "community", "financial"]).optional()
        .describe("Domain (required for decisions)"),
      confidence: z.number().min(0).max(1).optional()
        .describe("Confidence 0–1 (for decisions)"),
      alternatives_rejected: z.array(z.object({
        option: z.string(),
        reason: z.string(),
      })).optional().describe("Alternatives you considered and rejected"),
    },
    async (args) => {
      const pkg = await getLocalPKG(args.project_id);
      let id: string;

      if (args.node_type === "decision") {
        id = await pkg.writeDecision({
          title: args.title,
          description: args.description,
          rationale: args.rationale ?? args.description,
          domain: args.domain ?? "technical",
          confidence: args.confidence ?? 0.8,
          ...(args.alternatives_rejected ? { alternatives_rejected: args.alternatives_rejected } : {}),
        });
      } else if (args.node_type === "signal") {
        id = await pkg.writeSignal({
          signal_type: "feature_request",
          content: args.description,
          source: "agent",
        });
      } else {
        id = await pkg.writeArtifact({
          artifact_type: "commit",
          reference: args.title,
          description: args.description,
        });
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ ok: true, id, node_type: args.node_type }),
        }],
      };
    }
  );

  // ----------------------------------------------------------------
  // kap_pkg_build_context
  // Uses sampling to generate the context summary via the MCP client LLM
  // — no direct Anthropic API call needed in local mode.
  // ----------------------------------------------------------------
  server.tool(
    "kap_pkg_build_context",
    `Load your working context from the Project Knowledge Graph before starting a task. Returns relevant past decisions, constraints, and community signals as a ready-to-use summary.

CALL WHEN: starting a new session, before implementing a non-trivial feature, before any architectural decision.
DO NOT CALL if: context was already loaded earlier in this session for the same task scope. Not a substitute for kap_pkg_query when searching for a specific decision.
READ THE RESULT: the context_summary field is your briefing. If it contradicts your plan, stop and reassess before proceeding.`,
    {
      ...projectIdParam,
      task_description: z.string()
        .describe("Plain-language description of what you are about to work on"),
      use_sampling: z.boolean().optional().default(true)
        .describe("Generate a smart summary via LLM sampling (default: true). Set false for raw data only."),
    },
    async (args) => {
      const pkg = await getLocalPKG(args.project_id);
      const decisions = await pkg.getRecentDecisions(8);
      const signals = await pkg.getPendingSignals();

      // Raw context data
      const rawContext = {
        recent_decisions: decisions.map(d => ({
          title: d["d.title"],
          domain: d["d.domain"],
          rationale: d["d.rationale"],
          confidence: d["d.confidence"],
        })),
        top_signals: signals.slice(0, 5).map(s => ({
          content: s["s.content"],
          type: s["s.signal_type"],
          votes: s["s.votes"],
          funding_eur: s["s.funding_amount"],
        })),
      };

      // Try sampling for a smart summary
      let context_summary = ""
      if (args.use_sampling !== false && (decisions.length > 0 || signals.length > 0)) {
        try {
          context_summary = await sampleText(
            server,
            `Task: "${args.task_description}"

Relevant decisions from the project knowledge graph:
${rawContext.recent_decisions.map(d => `- ${d.title}: ${d.rationale}`).join("\n") || "none"}

Pending community signals:
${rawContext.top_signals.map(s => `- [${s.type}] ${s.content} (${s.votes} votes, €${s.funding_eur})`).join("\n") || "none"}

In 2-3 sentences, summarize what this agent should know before starting the task. Be specific and actionable.`,
            {
              system: "You are a project context summarizer. Be concise and specific. No fluff.",
              model: "claude-haiku-4-5",
              maxTokens: 256,
            },
          )
        } catch {
          // Sampling not available (client doesn't support it) — use text fallback
          context_summary = [
            `Task: ${args.task_description}`,
            decisions.length > 0 ? `Key decisions: ${decisions.slice(0, 3).map(d => d["d.title"]).join(", ")}.` : "",
            signals.length > 0 ? `Top signal: ${signals[0]?.["s.content"]}` : "",
          ].filter(Boolean).join(" ")
        }
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            context_summary: context_summary || `Context for: ${args.task_description}`,
            raw: rawContext,
            decisions_count: decisions.length,
            signals_count: signals.length,
          }),
        }],
      };
    }
  );

  // ----------------------------------------------------------------
  // kap_fetch_feedback
  // ----------------------------------------------------------------
  server.tool(
    "kap_fetch_feedback",
    `Retrieve pending community signals and feature requests.
Call this at the start of each planning cycle to understand what the community wants.
Returns signals ordered by funding amount then votes.
Do not plan a sprint without checking this first.`,
    {
      ...projectIdParam,
      limit: z.number().int().min(1).max(50).default(10)
        .describe("Max number of signals to return"),
    },
    async (args) => {
      const pkg = await getLocalPKG(args.project_id);
      const signals = await pkg.getPendingSignals();
      const top = signals.slice(0, args.limit);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            pending_signals: top.map(s => ({
              id: s["s.id"],
              type: s["s.signal_type"],
              content: s["s.content"],
              votes: s["s.votes"],
              funding_eur: s["s.funding_amount"],
            })),
            total_pending: signals.length,
            retrieved_at: new Date().toISOString(),
          }),
        }],
      };
    }
  );

  // ----------------------------------------------------------------
  // kap_pkg_query
  // ----------------------------------------------------------------
  server.tool(
    "kap_pkg_query",
    `Search the Project Knowledge Graph by keyword.
Use this to check if a decision or pattern already exists before implementing something new.
Searches across decisions and features.`,
    {
      ...projectIdParam,
      query: z.string().describe("Keyword or phrase to search for"),
    },
    async (args) => {
      const pkg = await getLocalPKG(args.project_id);
      const results = await pkg.searchNodes(args.query);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ results, count: results.length }),
        }],
      };
    }
  );

  // ----------------------------------------------------------------
  // kap_escalate_to_admin
  // ----------------------------------------------------------------
  server.tool(
    "kap_escalate_to_admin",
    `Escalate a decision to the Admin when it exceeds your autonomy level.
Use for: architectural decisions, financial spend, breaking changes, new external dependencies.
Always provide context + options + your recommendation — never just ask a blank question.
In local mode this is stored in the PKG and printed to stderr for the Admin to review.`,
    {
      ...projectIdParam,
      title: z.string().describe("Short title of the decision needed"),
      context: z.string().describe("Background — what led to this escalation"),
      options: z.array(z.object({
        label: z.string(),
        description: z.string(),
        pros: z.array(z.string()),
        cons: z.array(z.string()),
      })).describe("Options you considered"),
      recommendation: z.string().describe("Your recommended option and why"),
      urgency: z.enum(["low", "medium", "high", "critical"]),
      impact_if_no_response: z.string()
        .describe("What happens if Admin doesn't respond in 24h"),
    },
    async (args) => {
      const pkg = await getLocalPKG(args.project_id);

      // Store as signal in PKG
      const id = await pkg.writeSignal({
        signal_type: "question",
        content: `[ESCALATION] ${args.title}\n\nContext: ${args.context}\n\nRecommendation: ${args.recommendation}`,
        source: "agent",
      });

      // Print to stderr so Admin sees it in the Claude Code terminal
      process.stderr.write(`\n⚠️  KAP ESCALATION [${args.urgency.toUpperCase()}] — ${args.title}\n`);
      process.stderr.write(`Context: ${args.context}\n`);
      process.stderr.write(`Recommendation: ${args.recommendation}\n`);
      process.stderr.write(`If no response: ${args.impact_if_no_response}\n\n`);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            escalation_id: id,
            urgency: args.urgency,
            message: "Escalation stored in PKG and surfaced to Admin. Awaiting response.",
            impact_if_timeout: args.impact_if_no_response,
          }),
        }],
      };
    }
  );
}
