/**
 * KuzuPKGService — Kuzu-backed implementation of PKGService.
 *
 * Storage strategy:
 *   - 6 node tables (one per PKGNode type), matching the schema types exactly.
 *   - 1 flat KAPEdge node table for all edge types (flexible, avoids Kuzu
 *     rel-table per-pair constraints at this stage).
 *   - JSON-encoded strings for array/object fields.
 *   - Dates serialized as ISO-8601 strings.
 *
 * buildAgentContext uses keyword search + Claude for the summary.
 * computeDriftScore uses graph queries + heuristics (no embeddings at MVP).
 */

import { Database, Connection } from 'kuzu'
import { ulid } from 'ulid'
import Anthropic from '@anthropic-ai/sdk'

import type {
  PKGNode,
  PKGEdge,
  PKGNodeType,
  PKGEdgeType,
  DecisionNode,
  FeatureNode,
  ComponentNode,
  ConstraintNode,
  SignalNode,
  ArtifactNode,
} from '@kap/pkg'
import type { PKGService, AgentContext, DriftReport } from '@kap/pkg'

// ------------------------------------
// Schema DDL
// ------------------------------------

const SCHEMA_DDL = [
  `CREATE NODE TABLE IF NOT EXISTS Decision(
    id          STRING,
    title       STRING,
    description STRING,
    rationale   STRING,
    alternatives_rejected STRING,
    domain      STRING,
    confidence  DOUBLE,
    sprint      INT64,
    timestamp   STRING,
    superseded_by STRING,
    PRIMARY KEY(id)
  )`,

  `CREATE NODE TABLE IF NOT EXISTS Feature(
    id                    STRING,
    title                 STRING,
    description           STRING,
    status                STRING,
    acceptance_criteria   STRING,
    community_score       DOUBLE,
    estimated_effort_hours DOUBLE,
    sprint_target         INT64,
    rejected_reason       STRING,
    PRIMARY KEY(id)
  )`,

  `CREATE NODE TABLE IF NOT EXISTS Component(
    id             STRING,
    name           STRING,
    component_type STRING,
    description    STRING,
    files          STRING,
    version        STRING,
    PRIMARY KEY(id)
  )`,

  `CREATE NODE TABLE IF NOT EXISTS Constraint(
    id              STRING,
    description     STRING,
    constraint_type STRING,
    hard            BOOLEAN,
    expires_at      STRING,
    source          STRING,
    PRIMARY KEY(id)
  )`,

  `CREATE NODE TABLE IF NOT EXISTS Signal(
    id             STRING,
    signal_type    STRING,
    content        STRING,
    source         STRING,
    votes          INT64,
    funding_amount DOUBLE,
    sentiment      DOUBLE,
    timestamp      STRING,
    processed      BOOLEAN,
    PRIMARY KEY(id)
  )`,

  `CREATE NODE TABLE IF NOT EXISTS Artifact(
    id                  STRING,
    artifact_type       STRING,
    reference           STRING,
    description         STRING,
    verification_status STRING,
    timestamp           STRING,
    PRIMARY KEY(id)
  )`,

  // Flat edge table — stores all relationship types
  `CREATE NODE TABLE IF NOT EXISTS KAPEdge(
    id        STRING,
    source_id STRING,
    target_id STRING,
    edge_type STRING,
    payload   STRING,
    PRIMARY KEY(id)
  )`,
]

// ------------------------------------
// Helper: run query + collect rows
// ------------------------------------

async function q(
  conn: Connection,
  cypher: string,
): Promise<Record<string, unknown>[]> {
  const result = await conn.query(cypher)
  const rows = await result.getAll()
  result.close()
  return rows
}

// Escape single quotes for inline Kuzu string literals
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function toDate(s: string): Date {
  return new Date(s)
}

// ------------------------------------
// Row → PKGNode deserialisers
// ------------------------------------

function rowToDecision(r: Record<string, unknown>): DecisionNode {
  // Kuzu returns column names as "tablename.property"
  const get = (k: string): unknown => r[`d.${k}`] ?? r[k]
  const superseded_by = get('superseded_by')
  return {
    type: 'decision',
    id: String(get('id')),
    title: String(get('title')),
    description: String(get('description')),
    rationale: String(get('rationale')),
    alternatives_rejected: JSON.parse(String(get('alternatives_rejected') ?? '[]')),
    domain: String(get('domain')) as DecisionNode['domain'],
    confidence: Number(get('confidence')),
    sprint: Number(get('sprint')),
    timestamp: toDate(String(get('timestamp'))),
    ...(superseded_by ? { superseded_by: String(superseded_by) } : {}),
  }
}

function rowToFeature(r: Record<string, unknown>): FeatureNode {
  const get = (k: string): unknown => r[`f.${k}`] ?? r[k]
  const sprint_target = get('sprint_target')
  const rejected_reason = get('rejected_reason')
  return {
    type: 'feature',
    id: String(get('id')),
    title: String(get('title')),
    description: String(get('description')),
    status: String(get('status')) as FeatureNode['status'],
    acceptance_criteria: JSON.parse(String(get('acceptance_criteria') ?? '[]')),
    community_score: Number(get('community_score')),
    estimated_effort_hours: Number(get('estimated_effort_hours')),
    ...(sprint_target && Number(sprint_target) > 0 ? { sprint_target: Number(sprint_target) } : {}),
    ...(rejected_reason ? { rejected_reason: String(rejected_reason) } : {}),
  }
}

function rowToConstraint(r: Record<string, unknown>): ConstraintNode {
  const get = (k: string): unknown => r[`c.${k}`] ?? r[k]
  const expires_at = get('expires_at')
  return {
    type: 'constraint',
    id: String(get('id')),
    description: String(get('description')),
    constraint_type: String(get('constraint_type')) as ConstraintNode['constraint_type'],
    hard: Boolean(get('hard')),
    ...(expires_at ? { expires_at: toDate(String(expires_at)) } : {}),
    source: String(get('source')),
  }
}

function rowToSignal(r: Record<string, unknown>): SignalNode {
  const get = (k: string): unknown => r[`s.${k}`] ?? r[k]
  const votes = get('votes')
  const funding_amount = get('funding_amount')
  const sentiment = get('sentiment')
  return {
    type: 'signal',
    id: String(get('id')),
    signal_type: String(get('signal_type')) as SignalNode['signal_type'],
    content: String(get('content')),
    source: String(get('source')) as SignalNode['source'],
    ...(votes !== undefined && Number(votes) !== 0 ? { votes: Number(votes) } : {}),
    ...(funding_amount !== undefined && Number(funding_amount) !== 0 ? { funding_amount: Number(funding_amount) } : {}),
    ...(sentiment !== undefined && Number(sentiment) !== 0 ? { sentiment: Number(sentiment) } : {}),
    timestamp: toDate(String(get('timestamp'))),
    processed: Boolean(get('processed')),
  }
}

function rowToArtifact(r: Record<string, unknown>): ArtifactNode {
  const get = (k: string): unknown => r[`a.${k}`] ?? r[k]
  const vs = get('verification_status')
  const node: ArtifactNode = {
    type: 'artifact',
    id: String(get('id')),
    artifact_type: String(get('artifact_type')) as ArtifactNode['artifact_type'],
    reference: String(get('reference')),
    description: String(get('description')),
    timestamp: toDate(String(get('timestamp'))),
  }
  if (vs) node.verification_status = String(vs) as NonNullable<ArtifactNode['verification_status']>
  return node
}

function rowToComponent(r: Record<string, unknown>): ComponentNode {
  const get = (k: string): unknown => r[`c.${k}`] ?? r[k]
  const version = get('version')
  return {
    type: 'component',
    id: String(get('id')),
    name: String(get('name')),
    component_type: String(get('component_type')) as ComponentNode['component_type'],
    description: String(get('description')),
    files: JSON.parse(String(get('files') ?? '[]')),
    ...(version ? { version: String(version) } : {}),
  }
}

// Generic row → PKGNode based on node_type field (used in getNeighbors / getNode)
function rowToNode(r: Record<string, unknown>, nodeType: string): PKGNode {
  switch (nodeType) {
    case 'decision':   return rowToDecision(r)
    case 'feature':    return rowToFeature(r)
    case 'constraint': return rowToConstraint(r)
    case 'signal':     return rowToSignal(r)
    case 'artifact':   return rowToArtifact(r)
    case 'component':  return rowToComponent(r)
    default: throw new Error(`Unknown node type: ${nodeType}`)
  }
}

// ------------------------------------
// KuzuPKGService
// ------------------------------------

export class KuzuPKGService implements PKGService {
  private conn: Connection
  private _claude: Anthropic | null = null

  private get claude(): Anthropic {
    if (!this._claude) this._claude = new Anthropic()
    return this._claude
  }

  private constructor(conn: Connection) {
    this.conn = conn
  }

  static async create(dbPath: string): Promise<KuzuPKGService> {
    const db = new Database(dbPath, 256 * 1024 * 1024)
    const conn = new Connection(db)
    for (const ddl of SCHEMA_DDL) {
      const r = await conn.query(ddl)
      r.close()
    }
    return new KuzuPKGService(conn)
  }

  // ------------------------------------
  // Write
  // ------------------------------------

  async writeNode(node: PKGNode): Promise<string> {
    const id = node.id || ulid()

    switch (node.type) {
      case 'decision':
        await q(this.conn, `
          CREATE (:Decision {
            id: '${esc(id)}',
            title: '${esc(node.title)}',
            description: '${esc(node.description)}',
            rationale: '${esc(node.rationale)}',
            alternatives_rejected: '${esc(JSON.stringify(node.alternatives_rejected))}',
            domain: '${esc(node.domain)}',
            confidence: ${node.confidence},
            sprint: ${node.sprint},
            timestamp: '${new Date(node.timestamp).toISOString()}',
            superseded_by: '${esc(node.superseded_by ?? '')}'
          })
        `)
        break

      case 'feature':
        await q(this.conn, `
          CREATE (:Feature {
            id: '${esc(id)}',
            title: '${esc(node.title)}',
            description: '${esc(node.description)}',
            status: '${esc(node.status)}',
            acceptance_criteria: '${esc(JSON.stringify(node.acceptance_criteria))}',
            community_score: ${node.community_score},
            estimated_effort_hours: ${node.estimated_effort_hours},
            sprint_target: ${node.sprint_target ?? -1},
            rejected_reason: '${esc(node.rejected_reason ?? '')}'
          })
        `)
        break

      case 'component':
        await q(this.conn, `
          CREATE (:Component {
            id: '${esc(id)}',
            name: '${esc(node.name)}',
            component_type: '${esc(node.component_type)}',
            description: '${esc(node.description)}',
            files: '${esc(JSON.stringify(node.files))}',
            version: '${esc(node.version ?? '')}'
          })
        `)
        break

      case 'constraint':
        await q(this.conn, `
          CREATE (:Constraint {
            id: '${esc(id)}',
            description: '${esc(node.description)}',
            constraint_type: '${esc(node.constraint_type)}',
            hard: ${node.hard},
            expires_at: '${node.expires_at ? new Date(node.expires_at).toISOString() : ''}',
            source: '${esc(node.source)}'
          })
        `)
        break

      case 'signal':
        await q(this.conn, `
          CREATE (:Signal {
            id: '${esc(id)}',
            signal_type: '${esc(node.signal_type)}',
            content: '${esc(node.content)}',
            source: '${esc(node.source)}',
            votes: ${node.votes ?? 0},
            funding_amount: ${node.funding_amount ?? 0},
            sentiment: ${node.sentiment ?? 0},
            timestamp: '${new Date(node.timestamp).toISOString()}',
            processed: ${node.processed}
          })
        `)
        break

      case 'artifact':
        await q(this.conn, `
          CREATE (:Artifact {
            id: '${esc(id)}',
            artifact_type: '${esc(node.artifact_type)}',
            reference: '${esc(node.reference)}',
            description: '${esc(node.description)}',
            verification_status: '${esc(node.verification_status ?? '')}',
            timestamp: '${new Date(node.timestamp).toISOString()}'
          })
        `)
        break
    }

    return id
  }

  async writeEdge(edge: PKGEdge): Promise<void> {
    const id = ulid()
    const payload = 'reason' in edge ? JSON.stringify({ reason: (edge as { reason: string }).reason }) : '{}'
    await q(this.conn, `
      CREATE (:KAPEdge {
        id: '${esc(id)}',
        source_id: '${esc(edge.source_id)}',
        target_id: '${esc(edge.target_id)}',
        edge_type: '${esc(edge.edge_type)}',
        payload: '${esc(payload)}'
      })
    `)
  }

  async updateNode(id: string, updates: Partial<PKGNode>): Promise<void> {
    // Determine table from a quick getNode lookup
    const node = await this.getNode(id)
    if (!node) return

    const sets = Object.entries(updates)
      .filter(([k]) => k !== 'type' && k !== 'id')
      .map(([k, v]) => {
        const val = typeof v === 'object' ? JSON.stringify(v) : String(v)
        return `n.${k} = '${esc(val)}'`
      })
      .join(', ')

    if (!sets) return

    const table = node.type.charAt(0).toUpperCase() + node.type.slice(1)
    await q(this.conn, `MATCH (n:${table} {id: '${esc(id)}'}) SET ${sets}`)
  }

  // ------------------------------------
  // Direct reads
  // ------------------------------------

  async getNode(id: string): Promise<PKGNode | null> {
    const tables: [string, string][] = [
      ['Decision', 'd'],
      ['Feature', 'f'],
      ['Component', 'c'],
      ['Constraint', 'c'],
      ['Signal', 's'],
      ['Artifact', 'a'],
    ]

    for (const [table, alias] of tables) {
      const rows = await q(
        this.conn,
        `MATCH (${alias}:${table} {id: '${esc(id)}'}) RETURN ${alias}.*`,
      )
      if (rows.length > 0 && rows[0] !== undefined) {
        return rowToNode(rows[0], table.toLowerCase())
      }
    }
    return null
  }

  async getNeighbors(id: string, edge_type?: PKGEdgeType): Promise<PKGNode[]> {
    const filter = edge_type ? `AND e.edge_type = '${esc(edge_type)}'` : ''
    const edgeRows = await q(
      this.conn,
      `MATCH (e:KAPEdge)
       WHERE (e.source_id = '${esc(id)}' OR e.target_id = '${esc(id)}') ${filter}
       RETURN e.source_id, e.target_id`,
    )

    const neighborIds = new Set<string>()
    for (const row of edgeRows) {
      const src = String(row['e.source_id'] ?? '')
      const tgt = String(row['e.target_id'] ?? '')
      if (src !== id) neighborIds.add(src)
      if (tgt !== id) neighborIds.add(tgt)
    }

    const nodes: PKGNode[] = []
    for (const nid of neighborIds) {
      const node = await this.getNode(nid)
      if (node) nodes.push(node)
    }
    return nodes
  }

  // ------------------------------------
  // Semantic queries
  // ------------------------------------

  async getRecentDecisions(
    domain?: DecisionNode['domain'],
    limit = 10,
  ): Promise<DecisionNode[]> {
    const domainFilter = domain ? `AND d.domain = '${esc(domain)}'` : ''
    const rows = await q(
      this.conn,
      `MATCH (d:Decision)
       WHERE d.superseded_by = '' ${domainFilter}
       RETURN d.*
       ORDER BY d.timestamp DESC
       LIMIT ${limit}`,
    )
    return rows.map(rowToDecision)
  }

  async getActiveConstraints(): Promise<ConstraintNode[]> {
    const now = new Date().toISOString()
    const rows = await q(
      this.conn,
      `MATCH (c:Constraint)
       WHERE c.expires_at = '' OR c.expires_at > '${now}'
       RETURN c.*`,
    )
    return rows.map(rowToConstraint)
  }

  async getFeaturesByStatus(status: FeatureNode['status']): Promise<FeatureNode[]> {
    const rows = await q(
      this.conn,
      `MATCH (f:Feature {status: '${esc(status)}'}) RETURN f.*`,
    )
    return rows.map(rowToFeature)
  }

  async getConflictingFeatures(feature_id: string): Promise<FeatureNode[]> {
    const edgeRows = await q(
      this.conn,
      `MATCH (e:KAPEdge)
       WHERE e.edge_type = 'CONFLICTS_WITH'
         AND (e.source_id = '${esc(feature_id)}' OR e.target_id = '${esc(feature_id)}')
       RETURN e.source_id, e.target_id`,
    )

    const conflictIds = edgeRows
      .flatMap(r => [String(r['e.source_id'] ?? ''), String(r['e.target_id'] ?? '')])
      .filter(id => id !== feature_id)

    const features: FeatureNode[] = []
    for (const id of [...new Set(conflictIds)]) {
      const rows = await q(this.conn, `MATCH (f:Feature {id: '${esc(id)}'}) RETURN f.*`)
      if (rows.length > 0 && rows[0] !== undefined) features.push(rowToFeature(rows[0]))
    }
    return features
  }

  async getPendingSignals(): Promise<SignalNode[]> {
    const rows = await q(
      this.conn,
      `MATCH (s:Signal {processed: false})
       RETURN s.*
       ORDER BY s.funding_amount DESC, s.votes DESC`,
    )
    return rows.map(rowToSignal)
  }

  async getProjectVision(): Promise<DecisionNode[]> {
    const rows = await q(
      this.conn,
      `MATCH (d:Decision)
       WHERE d.sprint <= 1 AND d.confidence >= 0.8
       RETURN d.*
       ORDER BY d.confidence DESC`,
    )
    return rows.map(rowToDecision)
  }

  // ------------------------------------
  // Agent context construction
  // ------------------------------------

  async buildAgentContext(task_description: string): Promise<AgentContext> {
    const keywords = task_description.toLowerCase().split(/\s+/).filter(w => w.length > 3)

    // Keyword-based decision search
    const allDecisions = await this.getRecentDecisions(undefined, 50)
    const relevant_decisions = allDecisions.filter(d =>
      keywords.some(kw =>
        d.description.toLowerCase().includes(kw) ||
        d.title.toLowerCase().includes(kw),
      ),
    ).slice(0, 8)

    const active_constraints = await this.getActiveConstraints()

    // Features related to task keywords
    const allFeatures: FeatureNode[] = []
    for (const status of ['in_progress', 'accepted', 'proposed'] as FeatureNode['status'][]) {
      const fs = await this.getFeaturesByStatus(status)
      allFeatures.push(...fs)
    }
    const related_features = allFeatures.filter(f =>
      keywords.some(kw =>
        f.title.toLowerCase().includes(kw) ||
        f.description.toLowerCase().includes(kw),
      ),
    ).slice(0, 6)

    // Components mentioned in decisions or features
    const compRows = await q(this.conn, 'MATCH (c:Component) RETURN c.*')
    const touched_component_ids = compRows
      .map(rowToComponent)
      .filter(c =>
        keywords.some(kw =>
          c.name.toLowerCase().includes(kw) ||
          c.description.toLowerCase().includes(kw),
        ),
      )
      .map(c => c.id)
      .slice(0, 5)

    const pending_signals = (await this.getPendingSignals()).slice(0, 5)

    // Generate summary via Claude
    const context_summary = await this.generateContextSummary({
      task_description,
      relevant_decisions,
      active_constraints,
      related_features,
    })

    return {
      relevant_decisions,
      active_constraints,
      related_features,
      touched_component_ids,
      pending_signals,
      context_summary,
      generated_at: new Date(),
    }
  }

  private async generateContextSummary(data: {
    task_description: string
    relevant_decisions: DecisionNode[]
    active_constraints: ConstraintNode[]
    related_features: FeatureNode[]
  }): Promise<string> {
    if (
      data.relevant_decisions.length === 0 &&
      data.active_constraints.length === 0 &&
      data.related_features.length === 0
    ) {
      return `No existing context found for task: "${data.task_description}". Starting fresh.`
    }

    // Fallback summary if no API key available
    if (!process.env['ANTHROPIC_API_KEY']) {
      return [
        `Task: ${data.task_description}`,
        data.relevant_decisions.length > 0
          ? `Key decisions: ${data.relevant_decisions.map(d => d.title).join(', ')}.`
          : '',
        data.active_constraints.length > 0
          ? `Active constraints: ${data.active_constraints.map(c => c.description).join('; ')}.`
          : '',
        data.related_features.length > 0
          ? `Related features: ${data.related_features.map(f => `${f.title} (${f.status})`).join(', ')}.`
          : '',
      ].filter(Boolean).join('\n')
    }

    const response = await this.claude.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      system: 'You summarize project context for an AI agent about to work on a task. Be concise and actionable. Max 3 paragraphs.',
      messages: [{
        role: 'user',
        content: `Task: ${data.task_description}

Relevant past decisions:
${data.relevant_decisions.map(d => `- ${d.title}: ${d.rationale}`).join('\n')}

Active constraints:
${data.active_constraints.map(c => `- [${c.hard ? 'HARD' : 'soft'}] ${c.description}`).join('\n')}

Related features:
${data.related_features.map(f => `- ${f.title} (${f.status})`).join('\n')}

Summarize what the agent needs to know before starting this task.`,
      }],
    })

    const block = response.content.find(b => b.type === 'text')
    return block?.type === 'text' ? block.text : ''
  }

  // ------------------------------------
  // Drift detection
  // ------------------------------------

  async computeDriftScore(): Promise<DriftReport> {
    const vision = await this.getProjectVision()
    const allFeatures: FeatureNode[] = []
    for (const s of ['proposed', 'accepted', 'in_progress', 'done'] as FeatureNode['status'][]) {
      allFeatures.push(...await this.getFeaturesByStatus(s))
    }
    const constraints = await this.getActiveConstraints()

    // Check for features that violate hard constraints (heuristic: keyword overlap)
    const constraint_violations: string[] = []
    for (const feature of allFeatures) {
      for (const constraint of constraints.filter(c => c.hard)) {
        const edgeRows = await q(
          this.conn,
          `MATCH (e:KAPEdge)
           WHERE e.edge_type = 'BLOCKED_BY'
             AND e.source_id = '${esc(feature.id)}'
             AND e.target_id = '${esc(constraint.id)}'
           RETURN e.id`,
        )
        if (edgeRows.length === 0 && feature.status === 'in_progress') {
          // Feature in progress with no BLOCKED_BY edge to this hard constraint
          // Not necessarily a violation — just flag if description overlaps
          const keywords = constraint.description.toLowerCase().split(/\s+/)
          if (keywords.some(k => feature.description.toLowerCase().includes(k))) {
            constraint_violations.push(feature.id)
          }
        }
      }
    }

    // Check for stale references: superseded decisions still referenced
    const stale_references: string[] = []
    const supersededRows = await q(
      this.conn,
      `MATCH (d:Decision) WHERE d.superseded_by <> '' RETURN d.id`,
    )
    for (const row of supersededRows) {
      const oldId = String(row['d.id'] ?? '')
      const refRows = await q(
        this.conn,
        `MATCH (e:KAPEdge)
         WHERE e.edge_type = 'REFERENCES' AND e.target_id = '${esc(oldId)}'
         RETURN e.id`,
      )
      if (refRows.length > 0) stale_references.push(oldId)
    }

    // Domain drift scores (heuristic: ratio of features that diverge from vision domain)
    const domains: DecisionNode['domain'][] = ['architecture', 'product', 'technical', 'community', 'financial']
    const per_domain = domains.map(domain => {
      const visionDecisions = vision.filter(d => d.domain === domain)
      const score = visionDecisions.length === 0 ? 0 :
        Math.min(1, constraint_violations.length / Math.max(1, visionDecisions.length) * 0.3)
      return {
        domain,
        score,
        description: score > 0.3
          ? `Potential drift in ${domain} domain — review recent decisions`
          : `${domain} domain appears aligned`,
        conflicting_decision_ids: [],
      }
    })

    const overall_score = per_domain.reduce((acc, d) => acc + d.score, 0) / per_domain.length

    return {
      overall_score,
      per_domain,
      constraint_violations: [...new Set(constraint_violations)],
      stale_references,
      computed_at: new Date(),
    }
  }

  // ------------------------------------
  // Semantic search (keyword-based MVP)
  // ------------------------------------

  async semanticSearch(
    query: string,
    node_types?: PKGNodeType[],
    limit = 10,
  ): Promise<PKGNode[]> {
    const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    const results: PKGNode[] = []

    const targets = node_types ?? ['decision', 'feature', 'component', 'constraint', 'signal', 'artifact']

    const tableMap: Record<PKGNodeType, { table: string; alias: string; searchFields: string[] }> = {
      decision:   { table: 'Decision',   alias: 'd', searchFields: ['title', 'description', 'rationale'] },
      feature:    { table: 'Feature',    alias: 'f', searchFields: ['title', 'description'] },
      component:  { table: 'Component',  alias: 'c', searchFields: ['name', 'description'] },
      constraint: { table: 'Constraint', alias: 'c', searchFields: ['description'] },
      signal:     { table: 'Signal',     alias: 's', searchFields: ['content'] },
      artifact:   { table: 'Artifact',   alias: 'a', searchFields: ['description', 'reference'] },
    }

    for (const nodeType of targets) {
      if (results.length >= limit) break
      const { table, alias } = tableMap[nodeType]
      const rows = await q(this.conn, `MATCH (${alias}:${table}) RETURN ${alias}.*`)

      for (const row of rows) {
        if (results.length >= limit) break
        const node = rowToNode(row, nodeType)
        const text = JSON.stringify(node).toLowerCase()
        if (keywords.some(kw => text.includes(kw))) {
          results.push(node)
        }
      }
    }

    return results
  }
}
