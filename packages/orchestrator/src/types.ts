import type { PKGService } from '@kap/pkg'

// ------------------------------------
// State machine
// ------------------------------------

export type OrchestratorPhase =
  | 'idle'
  | 'planning'
  | 'executing'
  | 'verifying'
  | 'reporting'
  | 'waiting_community'
  | 'escalating'

// ------------------------------------
// Task graph
// ------------------------------------

export type TaskType = 'build' | 'verify' | 'report' | 'promote' | 'po'
export type TaskStatus = 'pending' | 'running' | 'complete' | 'failed' | 'skipped'

export interface AgentTask {
  id: string
  type: TaskType
  projectId: string
  featureId?: string
  input: Record<string, unknown>
  status: TaskStatus
  result?: Record<string, unknown>
  retries: number
  maxRetries: number
  deps: string[]        // task ids that must complete before this one starts
  startedAt?: Date
  completedAt?: Date
  errorMessage?: string
}

// ------------------------------------
// Escalation
// ------------------------------------

export type EscalationUrgency = 'low' | 'medium' | 'high' | 'critical'
export type EscalationTimeoutAction = 'pause' | 'proceed' | 'abort'

export interface EscalationRequest {
  title: string
  context: string
  options: EscalationOption[]
  recommendation: string
  urgency: EscalationUrgency
  impact_if_timeout: string
  timeout_action: EscalationTimeoutAction
  timeout_hours: number
}

export interface EscalationOption {
  label: string
  description: string
  pros: string[]
  cons: string[]
}

export interface EscalationRecord extends EscalationRequest {
  id: string
  projectId: string
  createdAt: Date
  resolvedAt?: Date
  resolution?: string
  resolvedBy: 'admin' | 'timeout_auto'
}

// ------------------------------------
// Autonomy policy (interpreted from YAML config)
// ------------------------------------

export type AutonomyLevel = 0 | 1 | 2 | 3

export interface DomainPolicy {
  domain: string
  level: AutonomyLevel
  always_escalate_patterns?: string[]
  never_escalate_patterns?: string[]
  confidence_threshold?: number      // escalate if agent confidence < this
}

export interface EscalationPolicy {
  version: number
  projectId: string
  domains: DomainPolicy[]
  timeout_default_hours: number
  timeout_urgent_hours: number
  auto_calibration_enabled: boolean
  approval_streak_to_learn: number
}

// ------------------------------------
// Orchestrator session context
// ------------------------------------

export interface OrchestratorContext {
  projectId: string
  adminId: string
  phase: OrchestratorPhase
  activeSprint: number
  taskQueue: AgentTask[]
  policy: EscalationPolicy
  pkg: PKGService
}

// ------------------------------------
// Verification
// ------------------------------------

export type VerificationStatus = 'pass' | 'partial' | 'fail' | 'pending'

export interface AcceptanceCriteria {
  id: string
  description: string
  testable: boolean
  verificationMethod: 'automated' | 'llm' | 'manual'
}

export interface ProofBundle {
  claim: string
  commitHash: string
  ciRunId?: string
  testResults: {
    passed: number
    failed: number
    coverage: number
  }
  verifierScore: number          // 0–100
  stagingUrl?: string
  acceptanceCriteriaMet: string[]
  acceptanceCriteriaPartial: string[]
  acceptanceCriteriaFailed: string[]
  timestamp: Date
}

// ------------------------------------
// Agent dispatch
// ------------------------------------

export type SubAgentType = 'builder' | 'reporter' | 'verifier' | 'po' | 'promoter'

export interface SubAgentJob {
  id: string
  type: SubAgentType
  projectId: string
  input: Record<string, unknown>
  status: 'queued' | 'running' | 'done' | 'failed'
  result?: Record<string, unknown>
  spawnedAt: Date
  completedAt?: Date
}
