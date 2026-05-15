/**
 * Local PKG mode — KuzuPKGService running in-process, no HTTP backend needed.
 * Used when KAP_API_URL=local or when no backend is configured.
 *
 * Data is persisted to KAP_DATA_DIR (default: ./.kap)
 */

import { Database, Connection } from 'kuzu'
import { mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ulid } from 'ulid'

// ------------------------------------
// Minimal PKG (inline, no @kap/pkg dep cycle)
// ------------------------------------

const SCHEMA_DDL = [
  `CREATE NODE TABLE IF NOT EXISTS Decision(id STRING, title STRING, description STRING, rationale STRING, alternatives_rejected STRING, domain STRING, confidence DOUBLE, sprint INT64, timestamp STRING, superseded_by STRING, PRIMARY KEY(id))`,
  `CREATE NODE TABLE IF NOT EXISTS Feature(id STRING, title STRING, description STRING, status STRING, acceptance_criteria STRING, community_score DOUBLE, estimated_effort_hours DOUBLE, sprint_target INT64, rejected_reason STRING, PRIMARY KEY(id))`,
  `CREATE NODE TABLE IF NOT EXISTS Component(id STRING, name STRING, component_type STRING, description STRING, files STRING, version STRING, PRIMARY KEY(id))`,
  `CREATE NODE TABLE IF NOT EXISTS Constraint(id STRING, description STRING, constraint_type STRING, hard BOOLEAN, expires_at STRING, source STRING, PRIMARY KEY(id))`,
  `CREATE NODE TABLE IF NOT EXISTS Signal(id STRING, signal_type STRING, content STRING, source STRING, votes INT64, funding_amount DOUBLE, sentiment DOUBLE, timestamp STRING, processed BOOLEAN, PRIMARY KEY(id))`,
  `CREATE NODE TABLE IF NOT EXISTS Artifact(id STRING, artifact_type STRING, reference STRING, description STRING, verification_status STRING, timestamp STRING, PRIMARY KEY(id))`,
  `CREATE NODE TABLE IF NOT EXISTS KAPEdge(id STRING, source_id STRING, target_id STRING, edge_type STRING, payload STRING, PRIMARY KEY(id))`,
]

function esc(s: string): string {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

async function q(conn: Connection, cypher: string): Promise<Record<string, unknown>[]> {
  const r = await conn.query(cypher)
  const rows = await r.getAll()
  r.close()
  return rows
}

export class LocalPKG {
  private conn: Connection

  private constructor(conn: Connection) {
    this.conn = conn
  }

  static async open(projectId: string): Promise<LocalPKG> {
    const dataDir = process.env['KAP_DATA_DIR'] ?? './.kap'
    mkdirSync(dataDir, { recursive: true })
    const db = new Database(join(dataDir, `${projectId}.db`), 128 * 1024 * 1024)
    const conn = new Connection(db)
    for (const ddl of SCHEMA_DDL) {
      const r = await conn.query(ddl)
      r.close()
    }
    return new LocalPKG(conn)
  }

  async writeDecision(opts: {
    title: string
    description: string
    rationale: string
    domain: string
    confidence: number
    sprint?: number
    alternatives_rejected?: { option: string; reason: string }[]
  }): Promise<string> {
    const id = ulid()
    await q(this.conn, `
      CREATE (:Decision {
        id: '${esc(id)}',
        title: '${esc(opts.title)}',
        description: '${esc(opts.description)}',
        rationale: '${esc(opts.rationale)}',
        alternatives_rejected: '${esc(JSON.stringify(opts.alternatives_rejected ?? []))}',
        domain: '${esc(opts.domain)}',
        confidence: ${opts.confidence},
        sprint: ${opts.sprint ?? 0},
        timestamp: '${new Date().toISOString()}',
        superseded_by: ''
      })
    `)
    return id
  }

  async writeArtifact(opts: {
    artifact_type: string
    reference: string
    description: string
    verification_status?: string
  }): Promise<string> {
    const id = ulid()
    await q(this.conn, `
      CREATE (:Artifact {
        id: '${esc(id)}',
        artifact_type: '${esc(opts.artifact_type)}',
        reference: '${esc(opts.reference)}',
        description: '${esc(opts.description)}',
        verification_status: '${esc(opts.verification_status ?? 'pending')}',
        timestamp: '${new Date().toISOString()}'
      })
    `)
    return id
  }

  async writeSignal(opts: {
    signal_type: string
    content: string
    source?: string
    votes?: number
    funding_amount?: number
  }): Promise<string> {
    const id = ulid()
    await q(this.conn, `
      CREATE (:Signal {
        id: '${esc(id)}',
        signal_type: '${esc(opts.signal_type)}',
        content: '${esc(opts.content)}',
        source: '${esc(opts.source ?? 'agent')}',
        votes: ${opts.votes ?? 0},
        funding_amount: ${opts.funding_amount ?? 0},
        sentiment: 0,
        timestamp: '${new Date().toISOString()}',
        processed: false
      })
    `)
    return id
  }

  async writeEdge(source_id: string, target_id: string, edge_type: string, payload = '{}'): Promise<void> {
    const id = ulid()
    await q(this.conn, `
      CREATE (:KAPEdge {
        id: '${esc(id)}',
        source_id: '${esc(source_id)}',
        target_id: '${esc(target_id)}',
        edge_type: '${esc(edge_type)}',
        payload: '${esc(payload)}'
      })
    `)
  }

  async getRecentDecisions(limit = 10): Promise<Record<string, unknown>[]> {
    return q(this.conn, `
      MATCH (d:Decision) WHERE d.superseded_by = ''
      RETURN d.* ORDER BY d.timestamp DESC LIMIT ${limit}
    `)
  }

  async getPendingSignals(): Promise<Record<string, unknown>[]> {
    return q(this.conn, `
      MATCH (s:Signal {processed: false})
      RETURN s.* ORDER BY s.funding_amount DESC, s.votes DESC
    `)
  }

  async getArtifacts(limit = 20): Promise<Record<string, unknown>[]> {
    return q(this.conn, `
      MATCH (a:Artifact) RETURN a.* ORDER BY a.timestamp DESC LIMIT ${limit}
    `)
  }

  async getProjectVision(): Promise<Record<string, unknown>[]> {
    return q(this.conn, `
      MATCH (d:Decision)
      WHERE d.sprint <= 1 AND d.confidence >= 0.8 AND d.superseded_by = ''
      RETURN d.* ORDER BY d.confidence DESC
    `)
  }

  async searchNodes(keyword: string): Promise<Record<string, unknown>[]> {
    const kw = esc(keyword.toLowerCase())
    const decisions = await q(this.conn, `
      MATCH (d:Decision)
      WHERE lower(d.title) CONTAINS '${kw}' OR lower(d.description) CONTAINS '${kw}'
      RETURN d.id, d.title, d.domain, d.confidence, 'decision' AS node_type
    `)
    const features = await q(this.conn, `
      MATCH (f:Feature)
      WHERE lower(f.title) CONTAINS '${kw}' OR lower(f.description) CONTAINS '${kw}'
      RETURN f.id, f.title, f.status, 'feature' AS node_type
    `)
    return [...decisions, ...features].slice(0, 15)
  }

  async buildContextSummary(task: string): Promise<string> {
    const decisions = await this.getRecentDecisions(5)
    const signals = await this.getPendingSignals()

    const lines = [
      `## Context for task: "${task}"`,
      '',
      '### Recent decisions',
      ...decisions.map(d =>
        `- **${d['d.title']}** (${d['d.domain']}, confidence ${d['d.confidence']})\n  ${d['d.rationale']}`
      ),
      '',
      '### Pending community signals',
      ...signals.slice(0, 3).map(s =>
        `- [${s['s.signal_type']}] ${s['s.content']} (${s['s.votes'] ?? 0} votes, €${s['s.funding_amount'] ?? 0})`
      ),
    ]

    return lines.join('\n')
  }
}

// Singleton store — one LocalPKG per projectId
const instances = new Map<string, LocalPKG>()

export async function getLocalPKG(projectId: string): Promise<LocalPKG> {
  const existing = instances.get(projectId)
  if (existing) return existing
  const pkg = await LocalPKG.open(projectId)
  instances.set(projectId, pkg)
  return pkg
}

/**
 * Factory that returns the right PKG backend:
 *   - GitHub mode (GITHUB_TOKEN + GITHUB_OWNER + GITHUB_REPO set) → GitHubPKGService
 *   - Local mode (default) → Kuzu LocalPKG
 *
 * The tools in local.ts call this instead of getLocalPKG() directly.
 */
export async function getPKGBackend(projectId: string): Promise<LocalPKG> {
  // GitHub mode detection — if GitHub env vars are set, prefer GitHub backend
  // The GitHubPKGService import is dynamic to avoid loading @octokit/rest in non-GitHub mode
  const token = process.env["GITHUB_TOKEN"] ?? process.env["GITHUB_APP_TOKEN"]
  const owner = process.env["GITHUB_OWNER"]
  const repo  = process.env["GITHUB_REPO"]

  if (token && owner && repo) {
    try {
      const { GitHubPKGService } = await import("@kap/github-pkg" as string)
      return await (GitHubPKGService as unknown as { create: (t: string, o: string, r: string) => Promise<LocalPKG> }).create(token, owner, repo)
    } catch {
      // Fall through to local mode if github-pkg not available
    }
  }

  return getLocalPKG(projectId)
}
