// ============================================================
// PKG — Project Knowledge Graph: Node & Edge type definitions
// ============================================================

// ------------------------------------
// Shared primitives
// ------------------------------------

export type PKGNodeType =
  | 'decision'
  | 'feature'
  | 'component'
  | 'constraint'
  | 'signal'
  | 'artifact';

export type PKGEdgeType =
  | 'DECIDED_BECAUSE'
  | 'IMPLEMENTS'
  | 'CONFLICTS_WITH'
  | 'SUPERSEDES'
  | 'REQUESTED_BY'
  | 'BLOCKED_BY'
  | 'VERIFIED_BY'
  | 'DEPENDS_ON'
  | 'REFERENCES'
  | 'RESULTED_IN';

// ------------------------------------
// Node definitions
// ------------------------------------

export interface DecisionNode {
  type: 'decision';
  id: string;
  title: string;
  description: string;
  rationale: string;
  alternatives_rejected: AlternativeRejected[];
  domain: 'architecture' | 'product' | 'technical' | 'community' | 'financial';
  /** 0–1, confidence at the moment the decision was taken */
  confidence: number;
  sprint: number;
  timestamp: Date;
  /** ID of the DecisionNode that replaces this one, if any */
  superseded_by?: string;
}

export interface AlternativeRejected {
  option: string;
  reason: string;
}

export interface AcceptanceCriteria {
  id: string;
  description: string;
  met: boolean;
}

export interface FeatureNode {
  type: 'feature';
  id: string;
  title: string;
  description: string;
  status: 'proposed' | 'accepted' | 'in_progress' | 'done' | 'rejected' | 'deferred';
  acceptance_criteria: AcceptanceCriteria[];
  /** Composite score: votes × funding × sentiment */
  community_score: number;
  estimated_effort_hours: number;
  sprint_target?: number;
  rejected_reason?: string;
}

export interface ComponentNode {
  type: 'component';
  id: string;
  name: string;
  component_type: 'service' | 'library' | 'agent' | 'external_api' | 'database';
  description: string;
  /** Primary file paths belonging to this component */
  files: string[];
  version?: string;
}

export interface ConstraintNode {
  type: 'constraint';
  id: string;
  description: string;
  constraint_type: 'technical' | 'financial' | 'legal' | 'product' | 'timeline';
  /** hard = must never be violated; soft = open to discussion */
  hard: boolean;
  expires_at?: Date;
  /** Person, team, or external entity that imposed the constraint */
  source: string;
}

export interface SignalNode {
  type: 'signal';
  id: string;
  signal_type:
    | 'feature_request'
    | 'bug_report'
    | 'question'
    | 'vote_result'
    | 'community_trend';
  content: string;
  source: 'community' | 'admin' | 'agent' | 'platform';
  votes?: number;
  /** Amount in EUR pledged/funded */
  funding_amount?: number;
  /** Sentiment score from –1 (negative) to 1 (positive) */
  sentiment?: number;
  timestamp: Date;
  /** Whether this signal has been transformed into a PO brief */
  processed: boolean;
}

export interface ArtifactNode {
  type: 'artifact';
  id: string;
  artifact_type: 'commit' | 'pr' | 'deploy' | 'test_run' | 'proof_bundle' | 'update_post';
  /** Git hash, PR URL, deployment ID, etc. */
  reference: string;
  description: string;
  verification_status?: 'pass' | 'fail' | 'partial' | 'pending';
  timestamp: Date;
}

/** Discriminated union of all node types */
export type PKGNode =
  | DecisionNode
  | FeatureNode
  | ComponentNode
  | ConstraintNode
  | SignalNode
  | ArtifactNode;

// ------------------------------------
// Edge definitions
// ------------------------------------

interface BaseEdge {
  edge_type: PKGEdgeType;
  source_id: string;
  target_id: string;
}

export interface DecidedBecauseEdge extends BaseEdge {
  edge_type: 'DECIDED_BECAUSE';
  reason: string;
}

export interface ImplementsEdge extends BaseEdge {
  edge_type: 'IMPLEMENTS';
}

export interface ConflictsWithEdge extends BaseEdge {
  edge_type: 'CONFLICTS_WITH';
  reason: string;
}

export interface SupersedesEdge extends BaseEdge {
  edge_type: 'SUPERSEDES';
}

export interface RequestedByEdge extends BaseEdge {
  edge_type: 'REQUESTED_BY';
}

export interface BlockedByEdge extends BaseEdge {
  edge_type: 'BLOCKED_BY';
}

export interface VerifiedByEdge extends BaseEdge {
  edge_type: 'VERIFIED_BY';
}

export interface DependsOnEdge extends BaseEdge {
  edge_type: 'DEPENDS_ON';
}

export interface ReferencesEdge extends BaseEdge {
  edge_type: 'REFERENCES';
}

export interface ResultedInEdge extends BaseEdge {
  edge_type: 'RESULTED_IN';
}

/** Discriminated union of all edge types */
export type PKGEdge =
  | DecidedBecauseEdge
  | ImplementsEdge
  | ConflictsWithEdge
  | SupersedesEdge
  | RequestedByEdge
  | BlockedByEdge
  | VerifiedByEdge
  | DependsOnEdge
  | ReferencesEdge
  | ResultedInEdge;
