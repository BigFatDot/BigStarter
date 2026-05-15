# @kap/pkg — Project Knowledge Graph

The PKG is the long-term memory of the KAP Orchestrator Agent. Every significant
decision, feature, constraint, external signal, and produced artifact is stored
as a typed node in this graph. Edges capture causal, temporal, and dependency
relationships between them.

## Node types

| Type         | Purpose                                                            |
|--------------|--------------------------------------------------------------------|
| `decision`   | Architectural/product choices with rationale and rejected options  |
| `feature`    | User-facing capabilities, with status lifecycle and community score|
| `component`  | Services, agents, libraries, and APIs that make up the system      |
| `constraint` | Hard or soft limits (technical, financial, legal, timeline, etc.)  |
| `signal`     | Raw community inputs (requests, votes, trends) before processing   |
| `artifact`   | Commits, PRs, deploys, test runs, and proof bundles                |

## Edge types

`DECIDED_BECAUSE` · `IMPLEMENTS` · `CONFLICTS_WITH` · `SUPERSEDES` ·
`REQUESTED_BY` · `BLOCKED_BY` · `VERIFIED_BY` · `DEPENDS_ON` ·
`REFERENCES` · `RESULTED_IN`

## Key queries

### `buildAgentContext(task_description)`
**Most critical call.** Given a plain-language task, returns a ranked slice of
the graph (relevant decisions, active constraints, related features, pending
signals) plus a `context_summary` string ready to be prepended to a system
prompt. Called at every agent session start.

### `getRecentDecisions(domain?, limit?)`
Returns active (non-superseded) decisions, optionally scoped to a domain.
Used by the Orchestrator to avoid re-deciding already settled questions.

### `getActiveConstraints()`
Returns every hard constraint plus non-expired soft constraints. Any feature
or task touching these should be flagged.

### `computeDriftScore()`
Compares the live graph against foundational vision decisions and returns a
`DriftReport` with per-domain scores and a list of constraint violations.
Run once per sprint; a high score triggers a review session.

### `semanticSearch(query, node_types?, limit?)`
Embedding-based similarity search over node content. Underpins
`buildAgentContext` and is also available for ad-hoc agent queries.

## Package structure

```
src/
  schema.ts   — all TypeScript types (nodes + edges)
  queries.ts  — PKGService interface, AgentContext, DriftReport
  index.ts    — public re-exports
```

This package is **types only**. The concrete implementation lives in `apps/api`.
