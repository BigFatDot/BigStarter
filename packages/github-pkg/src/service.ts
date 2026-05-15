// ============================================================
// GitHubPKGService — PKGService backed by GitHub Contents API
// ============================================================

import { Octokit } from '@octokit/rest';
import matter from 'gray-matter';
import { ulid } from 'ulid';
import type {
  PKGService,
  AgentContext,
  DriftReport,
  DomainDrift,
  PKGNode,
  PKGEdge,
  PKGEdgeType,
  PKGNodeType,
  DecisionNode,
  ConstraintNode,
  FeatureNode,
  SignalNode,
  ArtifactNode,
} from '@kap/pkg';

// ------------------------------------
// Internal types
// ------------------------------------

interface EdgeRecord {
  type: PKGEdgeType;
  target_id: string;
  /** Optional payload fields (reason, etc.) */
  [key: string]: unknown;
}

interface KapFileFrontmatter {
  id?: string;
  title?: string;
  name?: string;
  description?: string;
  rationale?: string;
  domain?: string;
  confidence?: number;
  sprint?: number;
  timestamp?: string;
  superseded_by?: string;
  alternatives_rejected?: Array<{ option: string; reason: string }>;
  status?: string;
  community_score?: number;
  estimated_effort_hours?: number;
  sprint_target?: number;
  rejected_reason?: string;
  acceptance_criteria?: Array<{ id: string; description: string; met: boolean }>;
  constraint_type?: string;
  hard?: boolean;
  expires_at?: string;
  source?: string;
  signal_type?: string;
  votes?: number;
  funding_amount?: number;
  sentiment?: number;
  processed?: boolean;
  artifact_type?: string;
  reference?: string;
  verification_status?: string;
  component_type?: string;
  files?: string[];
  version?: string;
  type?: string;
  edges?: EdgeRecord[];
}

interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: string;
  labels: Array<{ name?: string }>;
  reactions?: {
    '+1'?: number;
    [key: string]: unknown;
  };
}

interface GitHubFile {
  sha: string;
  content?: string;
  encoding?: string;
  name: string;
  path: string;
  type: string;
}

// ------------------------------------
// Helpers
// ------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function parsePKGNodeFromFrontmatter(
  fm: KapFileFrontmatter,
  body: string,
): PKGNode | null {
  const nodeType = fm.type;
  const id = fm.id ?? '';

  if (!id) return null;

  switch (nodeType) {
    case 'decision': {
      const node: DecisionNode = {
        type: 'decision',
        id,
        title: fm.title ?? '',
        description: body.trim(),
        rationale: fm.rationale ?? '',
        alternatives_rejected: fm.alternatives_rejected ?? [],
        domain: (fm.domain as DecisionNode['domain']) ?? 'technical',
        confidence: fm.confidence ?? 0.5,
        sprint: fm.sprint ?? 0,
        timestamp: fm.timestamp ? new Date(fm.timestamp) : new Date(),
      };
      if (fm.superseded_by !== undefined && fm.superseded_by !== '') {
        node.superseded_by = fm.superseded_by;
      }
      return node;
    }

    case 'feature': {
      const node: FeatureNode = {
        type: 'feature',
        id,
        title: fm.title ?? '',
        description: body.trim(),
        status: (fm.status as FeatureNode['status']) ?? 'proposed',
        acceptance_criteria: fm.acceptance_criteria ?? [],
        community_score: fm.community_score ?? 0,
        estimated_effort_hours: fm.estimated_effort_hours ?? 0,
      };
      if (fm.sprint_target !== undefined) node.sprint_target = fm.sprint_target;
      if (fm.rejected_reason !== undefined) node.rejected_reason = fm.rejected_reason;
      return node;
    }

    case 'constraint': {
      const node: ConstraintNode = {
        type: 'constraint',
        id,
        description: (body.trim() !== '' ? body.trim() : null) ?? fm.description ?? '',
        constraint_type: (fm.constraint_type as ConstraintNode['constraint_type']) ?? 'technical',
        hard: fm.hard ?? true,
        source: fm.source ?? 'unknown',
      };
      if (fm.expires_at !== undefined) node.expires_at = new Date(fm.expires_at);
      return node;
    }

    case 'signal': {
      const node: SignalNode = {
        type: 'signal',
        id,
        signal_type: (fm.signal_type as SignalNode['signal_type']) ?? 'feature_request',
        content: body.trim(),
        source: (fm.source as SignalNode['source']) ?? 'community',
        timestamp: fm.timestamp ? new Date(fm.timestamp) : new Date(),
        processed: fm.processed ?? false,
      };
      if (fm.votes !== undefined) node.votes = fm.votes;
      if (fm.funding_amount !== undefined) node.funding_amount = fm.funding_amount;
      if (fm.sentiment !== undefined) node.sentiment = fm.sentiment;
      return node;
    }

    case 'artifact': {
      const node: ArtifactNode = {
        type: 'artifact',
        id,
        artifact_type: (fm.artifact_type as ArtifactNode['artifact_type']) ?? 'commit',
        reference: fm.reference ?? '',
        description: body.trim(),
        timestamp: fm.timestamp ? new Date(fm.timestamp) : new Date(),
      };
      if (fm.verification_status !== undefined) {
        node.verification_status = fm.verification_status as NonNullable<ArtifactNode['verification_status']>;
      }
      return node;
    }

    default:
      return null;
  }
}

// ------------------------------------
// GitHubPKGService
// ------------------------------------

export class GitHubPKGService implements PKGService {
  private signalsCacheTime = 0;
  private readonly SIGNALS_TTL_MS = 60_000;

  constructor(
    private readonly octokit: Octokit,
    private readonly owner: string,
    private readonly repo: string,
    private readonly cache: Map<string, unknown> = new Map(),
  ) {}

  static async create(
    token: string,
    owner: string,
    repo: string,
  ): Promise<GitHubPKGService> {
    const octokit = new Octokit({ auth: token });
    return new GitHubPKGService(octokit, owner, repo);
  }

  // ------ File I/O helpers ------

  async readKapFile(
    path: string,
  ): Promise<{ data: KapFileFrontmatter; content: string; sha: string } | null> {
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
      });

      const file = response.data as GitHubFile;
      if (file.type !== 'file' || !file.content) return null;

      const raw = Buffer.from(file.content, 'base64').toString('utf-8');
      const parsed = matter(raw);
      return {
        data: parsed.data as KapFileFrontmatter,
        content: parsed.content,
        sha: file.sha,
      };
    } catch {
      return null;
    }
  }

  async writeKapFile(
    path: string,
    frontmatter: Record<string, unknown>,
    body: string,
    message: string,
  ): Promise<void> {
    const existing = await this.readKapFile(path);

    const fileContent = matter.stringify(body, frontmatter);
    const encoded = Buffer.from(fileContent, 'utf-8').toString('base64');

    if (existing !== null) {
      await this.octokit.rest.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path,
        message,
        content: encoded,
        sha: existing.sha,
      });
    } else {
      await this.octokit.rest.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path,
        message,
        content: encoded,
      });
    }
  }

  async listKapFiles(dir: string): Promise<string[]> {
    const cacheKey = `dir:${dir}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as string[];
    }

    try {
      const response = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: dir,
      });

      const items = response.data as GitHubFile[];
      if (!Array.isArray(items)) return [];

      const paths = items
        .filter((f) => f.type === 'file' && f.name.endsWith('.md'))
        .map((f) => f.path);

      this.cache.set(cacheKey, paths);
      return paths;
    } catch {
      return [];
    }
  }

  issueToSignalNode(issue: GitHubIssue): SignalNode {
    const labels = issue.labels.map((l) => l.name ?? '');
    const votes = issue.reactions?.['+1'] ?? 0;

    // Parse funding from label like "kap-funded:50"
    let fundingAmount: number | undefined;
    for (const label of labels) {
      const match = /^kap-funded:(\d+(?:\.\d+)?)$/.exec(label);
      if (match !== null && match[1] !== undefined) {
        fundingAmount = parseFloat(match[1]);
        break;
      }
    }

    // Derive signal_type from labels
    let signalType: SignalNode['signal_type'] = 'feature_request';
    if (labels.includes('bug_report') || labels.includes('bug')) {
      signalType = 'bug_report';
    } else if (labels.includes('question')) {
      signalType = 'question';
    } else if (labels.includes('vote_result')) {
      signalType = 'vote_result';
    } else if (labels.includes('community_trend')) {
      signalType = 'community_trend';
    }

    const node: SignalNode = {
      type: 'signal',
      id: `sig-${issue.number}`,
      signal_type: signalType,
      content: issue.body ?? issue.title,
      source: 'community',
      votes,
      timestamp: new Date(),
      processed: issue.state === 'closed',
    };

    if (fundingAmount !== undefined) node.funding_amount = fundingAmount;

    return node;
  }

  invalidateCache(scope?: string): void {
    if (scope !== undefined) {
      this.cache.delete(scope);
    } else {
      this.cache.clear();
    }
  }

  // ------ Write operations ------

  async writeNode(node: PKGNode): Promise<string> {
    const id = node.id !== '' ? node.id : ulid();

    switch (node.type) {
      case 'decision': {
        const n: DecisionNode = { ...node, id };
        const path = `.kap/decisions/${id}-${slugify(n.title)}.md`;
        const fm: Record<string, unknown> = {
          id,
          type: 'decision',
          title: n.title,
          rationale: n.rationale,
          alternatives_rejected: n.alternatives_rejected,
          domain: n.domain,
          confidence: n.confidence,
          sprint: n.sprint,
          timestamp: n.timestamp.toISOString(),
        };
        if (n.superseded_by !== undefined) fm['superseded_by'] = n.superseded_by;
        await this.writeKapFile(path, fm, n.description, `chore(pkg): add decision ${id}`);
        this.invalidateCache('decisions:all');
        this.invalidateCache(`decisions:${n.domain}`);
        this.invalidateCache(`dir:.kap/decisions`);
        break;
      }

      case 'feature': {
        const n: FeatureNode = { ...node, id };
        const path = `.kap/features/${id}-${slugify(n.title)}.md`;
        const fm: Record<string, unknown> = {
          id,
          type: 'feature',
          title: n.title,
          status: n.status,
          acceptance_criteria: n.acceptance_criteria,
          community_score: n.community_score,
          estimated_effort_hours: n.estimated_effort_hours,
        };
        if (n.sprint_target !== undefined) fm['sprint_target'] = n.sprint_target;
        if (n.rejected_reason !== undefined) fm['rejected_reason'] = n.rejected_reason;
        await this.writeKapFile(path, fm, n.description, `chore(pkg): add feature ${id}`);
        this.invalidateCache(`dir:.kap/features`);
        break;
      }

      case 'signal': {
        const n: SignalNode = { ...node, id };
        const labelNames = ['kap-signal', n.signal_type];
        if (n.funding_amount !== undefined) {
          labelNames.push(`kap-funded:${n.funding_amount}`);
        }
        await this.octokit.rest.issues.create({
          owner: this.owner,
          repo: this.repo,
          title: n.content.slice(0, 200),
          body: n.content,
          labels: labelNames,
        });
        this.invalidateCache('signals');
        break;
      }

      case 'artifact': {
        const n: ArtifactNode = { ...node, id };
        const path = `.kap/artifacts/${id}.md`;
        const fm: Record<string, unknown> = {
          id,
          type: 'artifact',
          artifact_type: n.artifact_type,
          reference: n.reference,
          timestamp: n.timestamp.toISOString(),
        };
        if (n.verification_status !== undefined) fm['verification_status'] = n.verification_status;
        await this.writeKapFile(path, fm, n.description, `chore(pkg): add artifact ${id}`);
        this.invalidateCache(`dir:.kap/artifacts`);
        break;
      }

      case 'constraint': {
        // Append to constraints.md
        const existing = await this.readKapFile('.kap/constraints.md');
        const n: ConstraintNode = { ...node, id };
        const fm: Record<string, unknown> = {
          id,
          type: 'constraint',
          constraint_type: n.constraint_type,
          hard: n.hard,
          source: n.source,
        };
        if (n.expires_at !== undefined) fm['expires_at'] = n.expires_at.toISOString();

        if (existing !== null) {
          // Append new constraint section to the existing file body
          const newSection = `\n\n## ${id}\n\n${n.description}`;
          const updatedBody = existing.content + newSection;
          await this.writeKapFile(
            '.kap/constraints.md',
            existing.data as unknown as Record<string, unknown>,
            updatedBody,
            `chore(pkg): add constraint ${id}`,
          );
        } else {
          await this.writeKapFile(
            '.kap/constraints.md',
            fm,
            `## ${id}\n\n${n.description}`,
            `chore(pkg): add constraint ${id}`,
          );
        }
        this.invalidateCache('constraints');
        break;
      }

      case 'component': {
        const n = node;
        const path = `.kap/components/${id}-${slugify(n.name)}.md`;
        const fm: Record<string, unknown> = {
          id,
          type: 'component',
          name: n.name,
          component_type: n.component_type,
          files: n.files,
        };
        if (n.version !== undefined) fm['version'] = n.version;
        await this.writeKapFile(path, fm, n.description, `chore(pkg): add component ${id}`);
        this.invalidateCache(`dir:.kap/components`);
        break;
      }
    }

    return id;
  }

  async writeEdge(edge: PKGEdge): Promise<void> {
    // Find the source file and add the edge to its frontmatter
    const sourceNode = await this.getNode(edge.source_id);
    if (sourceNode === null) return;

    const filePath = await this.findFilePath(edge.source_id, sourceNode.type);
    if (filePath === null) return;

    const existing = await this.readKapFile(filePath);
    if (existing === null) return;

    const edges: EdgeRecord[] = (existing.data.edges as EdgeRecord[] | undefined) ?? [];
    const newEdge: EdgeRecord = { type: edge.edge_type, target_id: edge.target_id };

    // Carry over optional fields
    if ('reason' in edge) newEdge['reason'] = (edge as { reason: string }).reason;

    edges.push(newEdge);

    const updatedFm: Record<string, unknown> = {
      ...(existing.data as unknown as Record<string, unknown>),
      edges,
    };

    await this.writeKapFile(
      filePath,
      updatedFm,
      existing.content,
      `chore(pkg): add edge ${edge.edge_type} on ${edge.source_id}`,
    );
    this.invalidateCache(`node:${edge.source_id}`);
  }

  async updateNode(id: string, updates: Partial<PKGNode>): Promise<void> {
    const existing = await this.getNode(id);
    if (existing === null) return;

    const filePath = await this.findFilePath(id, existing.type);
    if (filePath === null) return;

    const file = await this.readKapFile(filePath);
    if (file === null) return;

    // Merge updates into the frontmatter
    const mergedFm: Record<string, unknown> = {
      ...(file.data as unknown as Record<string, unknown>),
    };

    for (const [key, value] of Object.entries(updates)) {
      if (value instanceof Date) {
        mergedFm[key] = value.toISOString();
      } else {
        mergedFm[key] = value as unknown;
      }
    }

    let body = file.content;
    if ('description' in updates && typeof updates.description === 'string') {
      body = updates.description;
    }

    await this.writeKapFile(
      filePath,
      mergedFm,
      body,
      `chore(pkg): update node ${id}`,
    );
    this.invalidateCache(`node:${id}`);
  }

  // ------ Direct read operations ------

  async getNode(id: string): Promise<PKGNode | null> {
    const cacheKey = `node:${id}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as PKGNode;
    }

    // Search across all .kap directories
    const dirs = [
      '.kap/decisions',
      '.kap/features',
      '.kap/artifacts',
      '.kap/components',
    ];

    for (const dir of dirs) {
      const files = await this.listKapFiles(dir);
      for (const filePath of files) {
        const file = await this.readKapFile(filePath);
        if (file === null) continue;
        if (file.data.id === id) {
          const node = parsePKGNodeFromFrontmatter(file.data, file.content);
          if (node !== null) {
            this.cache.set(cacheKey, node);
            return node;
          }
        }
      }
    }

    // Check constraints.md for constraint nodes
    const constraints = await this.getActiveConstraints();
    const found = constraints.find((c) => c.id === id);
    if (found !== undefined) return found;

    return null;
  }

  async getNeighbors(id: string, edge_type?: PKGEdgeType): Promise<PKGNode[]> {
    const sourceNode = await this.getNode(id);
    if (sourceNode === null) return [];

    const filePath = await this.findFilePath(id, sourceNode.type);
    if (filePath === null) return [];

    const file = await this.readKapFile(filePath);
    if (file === null) return [];

    const edges: EdgeRecord[] = (file.data.edges as EdgeRecord[] | undefined) ?? [];
    const filtered =
      edge_type !== undefined ? edges.filter((e) => e.type === edge_type) : edges;

    const results: PKGNode[] = [];
    for (const edge of filtered) {
      const node = await this.getNode(edge.target_id);
      if (node !== null) results.push(node);
    }

    return results;
  }

  // ------ Semantic queries ------

  async getRecentDecisions(
    domain?: DecisionNode['domain'],
    limit = 20,
  ): Promise<DecisionNode[]> {
    const cacheKey = `decisions:${domain ?? 'all'}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as DecisionNode[];
    }

    const files = await this.listKapFiles('.kap/decisions');
    const decisions: DecisionNode[] = [];

    for (const filePath of files) {
      const file = await this.readKapFile(filePath);
      if (file === null) continue;
      const node = parsePKGNodeFromFrontmatter(file.data, file.content);
      if (node?.type !== 'decision') continue;
      if (node.superseded_by !== undefined) continue;
      if (domain !== undefined && node.domain !== domain) continue;
      decisions.push(node);
    }

    decisions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const result = decisions.slice(0, limit);
    this.cache.set(cacheKey, result);
    return result;
  }

  async getActiveConstraints(): Promise<ConstraintNode[]> {
    const cacheKey = 'constraints';
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as ConstraintNode[];
    }

    const file = await this.readKapFile('.kap/constraints.md');
    if (file === null) return [];

    const now = new Date();

    // The constraints.md may have multiple constraints embedded in sections
    // Each section "## {id}" describes a constraint; frontmatter holds the primary one
    const constraints: ConstraintNode[] = [];

    if (file.data.id !== undefined && file.data.id !== '') {
      const node = parsePKGNodeFromFrontmatter(file.data, file.content.split('##')[0] ?? '');
      if (node?.type === 'constraint') {
        const expired =
          node.expires_at !== undefined && node.expires_at < now;
        if (!expired || node.hard) constraints.push(node);
      }
    }

    this.cache.set(cacheKey, constraints);
    return constraints;
  }

  async getFeaturesByStatus(status: FeatureNode['status']): Promise<FeatureNode[]> {
    const files = await this.listKapFiles('.kap/features');
    const features: FeatureNode[] = [];

    for (const filePath of files) {
      const file = await this.readKapFile(filePath);
      if (file === null) continue;
      const node = parsePKGNodeFromFrontmatter(file.data, file.content);
      if (node?.type !== 'feature') continue;
      if (node.status === status) features.push(node);
    }

    return features;
  }

  async getConflictingFeatures(feature_id: string): Promise<FeatureNode[]> {
    const neighbors = await this.getNeighbors(feature_id, 'CONFLICTS_WITH');
    return neighbors.filter((n): n is FeatureNode => n.type === 'feature');
  }

  async getPendingSignals(): Promise<SignalNode[]> {
    const now = Date.now();
    if (this.cache.has('signals') && now - this.signalsCacheTime < this.SIGNALS_TTL_MS) {
      return this.cache.get('signals') as SignalNode[];
    }

    try {
      const response = await this.octokit.rest.issues.listForRepo({
        owner: this.owner,
        repo: this.repo,
        labels: 'kap-signal',
        state: 'open',
        per_page: 100,
      });

      const signals = response.data.map((issue) =>
        this.issueToSignalNode(issue as GitHubIssue),
      );

      signals.sort((a, b) => {
        const aVotes = a.votes ?? 0;
        const bVotes = b.votes ?? 0;
        return bVotes - aVotes;
      });

      this.cache.set('signals', signals);
      this.signalsCacheTime = now;
      return signals;
    } catch {
      return [];
    }
  }

  async getProjectVision(): Promise<DecisionNode[]> {
    const all = await this.getRecentDecisions(undefined, 100);
    return all.filter((d) => d.sprint <= 1 && d.confidence >= 0.8);
  }

  // ------ Agent context construction ------

  async buildAgentContext(task_description: string): Promise<AgentContext> {
    const [decisions, constraints, inProgress, signals] = await Promise.all([
      this.getRecentDecisions(undefined, 10),
      this.getActiveConstraints(),
      this.getFeaturesByStatus('in_progress'),
      this.getPendingSignals(),
    ]);

    const taskLower = task_description.toLowerCase();

    const relevantDecisions = decisions.filter(
      (d) =>
        taskLower.includes(d.domain) ||
        d.title.toLowerCase().split(' ').some((w) => w.length > 3 && taskLower.includes(w)),
    );

    const relatedFeatures = inProgress.filter(
      (f) =>
        f.title.toLowerCase().split(' ').some((w) => w.length > 3 && taskLower.includes(w)) ||
        f.description.toLowerCase().split(' ').some((w) => w.length > 4 && taskLower.includes(w)),
    );

    const topSignals = signals.slice(0, 5);

    const summary =
      `Task: ${task_description}\n\n` +
      `Relevant decisions (${relevantDecisions.length}): ` +
      relevantDecisions.map((d) => `[${d.id}] ${d.title}`).join(', ') +
      `\n\nActive constraints (${constraints.length}): ` +
      constraints.map((c) => c.description.slice(0, 80)).join('; ') +
      `\n\nIn-progress features (${relatedFeatures.length}): ` +
      relatedFeatures.map((f) => `[${f.id}] ${f.title}`).join(', ') +
      `\n\nTop pending signals: ` +
      topSignals.map((s) => s.content.slice(0, 60)).join('; ');

    return {
      relevant_decisions: relevantDecisions,
      active_constraints: constraints,
      related_features: relatedFeatures,
      touched_component_ids: [],
      pending_signals: topSignals,
      context_summary: summary,
      generated_at: new Date(),
    };
  }

  // ------ Drift detection ------

  async computeDriftScore(): Promise<DriftReport> {
    return {
      overall_score: 0,
      per_domain: [] as DomainDrift[],
      constraint_violations: [],
      stale_references: [],
      computed_at: new Date(),
    };
  }

  // ------ Semantic search ------

  async semanticSearch(
    query: string,
    node_types?: PKGNodeType[],
    limit = 10,
  ): Promise<PKGNode[]> {
    const queryLower = query.toLowerCase();
    const terms = queryLower.split(/\s+/).filter((t) => t.length > 2);
    const results: PKGNode[] = [];

    const dirs: Array<{ dir: string; type: PKGNodeType }> = [
      { dir: '.kap/decisions', type: 'decision' },
      { dir: '.kap/features', type: 'feature' },
      { dir: '.kap/artifacts', type: 'artifact' },
      { dir: '.kap/components', type: 'component' },
    ];

    for (const { dir, type } of dirs) {
      if (node_types !== undefined && !node_types.includes(type)) continue;

      const files = await this.listKapFiles(dir);
      for (const filePath of files) {
        const file = await this.readKapFile(filePath);
        if (file === null) continue;

        const node = parsePKGNodeFromFrontmatter(file.data, file.content);
        if (node === null) continue;

        const searchText = [
          file.data.title ?? file.data.name ?? '',
          file.content,
          file.data.description ?? '',
        ]
          .join(' ')
          .toLowerCase();

        const matches = terms.filter((t) => searchText.includes(t));
        if (matches.length > 0) {
          results.push(node);
        }

        if (results.length >= limit * 2) break;
      }
    }

    // Also search constraints for 'constraint' type
    if (node_types === undefined || node_types.includes('constraint')) {
      const constraints = await this.getActiveConstraints();
      for (const c of constraints) {
        const text = c.description.toLowerCase();
        if (terms.some((t) => text.includes(t))) {
          results.push(c);
        }
      }
    }

    // Also search signals for 'signal' type
    if (node_types === undefined || node_types.includes('signal')) {
      const signals = await this.getPendingSignals();
      for (const s of signals) {
        const text = s.content.toLowerCase();
        if (terms.some((t) => text.includes(t))) {
          results.push(s);
        }
      }
    }

    return results.slice(0, limit);
  }

  // ------ Internal helpers ------

  private async findFilePath(id: string, nodeType: PKGNode['type']): Promise<string | null> {
    let dir: string;
    switch (nodeType) {
      case 'decision':
        dir = '.kap/decisions';
        break;
      case 'feature':
        dir = '.kap/features';
        break;
      case 'artifact':
        dir = '.kap/artifacts';
        break;
      case 'component':
        dir = '.kap/components';
        break;
      case 'constraint':
        return '.kap/constraints.md';
      case 'signal':
        return null; // signals live as GitHub issues, no file
    }

    const files = await this.listKapFiles(dir);
    for (const filePath of files) {
      const file = await this.readKapFile(filePath);
      if (file?.data.id === id) return filePath;
    }

    return null;
  }
}
