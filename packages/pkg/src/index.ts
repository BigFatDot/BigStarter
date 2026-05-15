// ============================================================
// PKG — public surface
// ============================================================

// Node & edge types
export type {
  PKGNodeType,
  PKGEdgeType,
  PKGNode,
  PKGEdge,
  // Individual node types
  DecisionNode,
  AlternativeRejected,
  AcceptanceCriteria,
  FeatureNode,
  ComponentNode,
  ConstraintNode,
  SignalNode,
  ArtifactNode,
  // Individual edge types
  DecidedBecauseEdge,
  ImplementsEdge,
  ConflictsWithEdge,
  SupersedesEdge,
  RequestedByEdge,
  BlockedByEdge,
  VerifiedByEdge,
  DependsOnEdge,
  ReferencesEdge,
  ResultedInEdge,
} from './schema.js';

// Service interface + context types
export type {
  PKGService,
  AgentContext,
  DriftReport,
  DomainDrift,
} from './queries.js';
