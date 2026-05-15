// ============================================================
// PKG — PKGService interface + context/drift types
// ============================================================

import type {
  PKGNode,
  PKGEdge,
  PKGNodeType,
  PKGEdgeType,
  DecisionNode,
  ConstraintNode,
  FeatureNode,
  SignalNode,
} from './schema.js';

// ------------------------------------
// Supporting output types
// ------------------------------------

/**
 * Reconstructed context slice delivered to an agent at session start
 * or before executing a bounded task. Contains only what is relevant
 * to the described task, ranked by proximity/recency.
 */
export interface AgentContext {
  /** Decisions whose domain or referenced components overlap the task */
  relevant_decisions: DecisionNode[];
  /** All currently active (non-expired) hard and soft constraints */
  active_constraints: ConstraintNode[];
  /** Features whose status or acceptance criteria touch the task scope */
  related_features: FeatureNode[];
  /** Names of components likely modified or read by the task */
  touched_component_ids: string[];
  /** Signals that have not yet been processed and relate to the task */
  pending_signals: SignalNode[];
  /** Free-text summary the agent can prepend to its system prompt */
  context_summary: string;
  /** Timestamp at which this context snapshot was built */
  generated_at: Date;
}

/** Per-domain drift detail */
export interface DomainDrift {
  domain: DecisionNode['domain'];
  /** 0–1, higher = more deviation from foundational decisions */
  score: number;
  /** Human-readable description of detected drift */
  description: string;
  /** IDs of decisions that appear to be violated or contradicted */
  conflicting_decision_ids: string[];
}

/**
 * Result of comparing current graph state against foundational decisions.
 * A high overall_score signals the Orchestrator should trigger a review session.
 */
export interface DriftReport {
  /** 0–1 aggregate drift score across all domains */
  overall_score: number;
  per_domain: DomainDrift[];
  /** Feature IDs whose current status contradicts an active constraint */
  constraint_violations: string[];
  /** IDs of superseded decisions that are still referenced without the SUPERSEDES edge */
  stale_references: string[];
  computed_at: Date;
}

// ------------------------------------
// PKGService interface
// ------------------------------------

export interface PKGService {
  // ------ Write operations ------

  /** Persists a new node; returns its assigned id */
  writeNode(node: PKGNode): Promise<string>;

  writeEdge(edge: PKGEdge): Promise<void>;

  /**
   * Partial update of an existing node.
   * Only the provided keys are modified; the rest stay unchanged.
   */
  updateNode(id: string, updates: Partial<PKGNode>): Promise<void>;

  // ------ Direct read operations ------

  getNode(id: string): Promise<PKGNode | null>;

  /**
   * Returns all nodes directly connected to `id`.
   * Optionally filtered by edge type (traverses both directions).
   */
  getNeighbors(id: string, edge_type?: PKGEdgeType): Promise<PKGNode[]>;

  // ------ Semantic queries ------

  /**
   * Most recent decisions, optionally scoped to a domain.
   * Excludes decisions that have been superseded.
   */
  getRecentDecisions(
    domain?: DecisionNode['domain'],
    limit?: number,
  ): Promise<DecisionNode[]>;

  /**
   * All hard constraints plus soft constraints that have not yet expired.
   */
  getActiveConstraints(): Promise<ConstraintNode[]>;

  getFeaturesByStatus(status: FeatureNode['status']): Promise<FeatureNode[]>;

  /**
   * Returns features that have a CONFLICTS_WITH edge to/from `feature_id`.
   */
  getConflictingFeatures(feature_id: string): Promise<FeatureNode[]>;

  /**
   * Signals with `processed = false`, ordered by funding_amount desc, then votes desc.
   */
  getPendingSignals(): Promise<SignalNode[]>;

  /**
   * Returns the earliest foundational decisions (sprint 0 or sprint 1, high confidence)
   * that define the project vision. Used to anchor drift detection.
   */
  getProjectVision(): Promise<DecisionNode[]>;

  // ------ Agent context construction ------

  /**
   * Critical path: given a plain-language task description, assembles an
   * AgentContext by combining semantic search results with graph traversal.
   * Called at the start of every agent session and before delegated sub-tasks.
   */
  buildAgentContext(task_description: string): Promise<AgentContext>;

  // ------ Drift detection ------

  /**
   * Computes a DriftReport by comparing the live graph state against
   * foundational decisions returned by getProjectVision().
   * Should be called periodically by the Orchestrator (e.g. once per sprint).
   */
  computeDriftScore(): Promise<DriftReport>;

  // ------ Semantic search ------

  /**
   * Embedding-based similarity search over node descriptions and content.
   * Returns at most `limit` nodes (default 10) sorted by relevance score.
   */
  semanticSearch(
    query: string,
    node_types?: PKGNodeType[],
    limit?: number,
  ): Promise<PKGNode[]>;
}
