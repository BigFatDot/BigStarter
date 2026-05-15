// ─── Base ────────────────────────────────────────────────────────────────────

export type EventBase = {
  id: string;
  projectId: string;
  /** ISO-8601 */
  timestamp: string;
  source: EventSource;
};

export type EventSource = "git" | "ci" | "sdk" | "manual";

// ─── Events ──────────────────────────────────────────────────────────────────

export type CommitEvent = EventBase & {
  type: "commit";
  sha: string;
  branch: string;
  message: string;
  author: GitActor;
  filesChanged: number;
  additions: number;
  deletions: number;
  relatedTaskIds: string[];
};

export type TestRunEvent = EventBase & {
  type: "test_run";
  runId: string;
  suite: string;
  status: "passed" | "failed" | "skipped" | "cancelled";
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  /** URL to the full test report */
  reportUrl: string | null;
  coverage: CoverageReport | null;
};

export type DeployEvent = EventBase & {
  type: "deploy";
  environment: DeployEnvironment;
  version: string;
  status: "started" | "succeeded" | "failed" | "rolled_back";
  commitSha: string;
  /** URL where the deployment is reachable */
  deployUrl: string | null;
  durationMs: number | null;
};

export type MilestoneEvent = EventBase & {
  type: "milestone";
  title: string;
  description: string;
  relatedFeatureIds: string[];
};

export type CustomEvent = EventBase & {
  type: "custom";
  name: string;
  payload: Record<string, unknown>;
};

export type KAPEvent =
  | CommitEvent
  | TestRunEvent
  | DeployEvent
  | MilestoneEvent
  | CustomEvent;

// ─── Supporting types ─────────────────────────────────────────────────────────

export type GitActor = {
  name: string;
  email: string;
};

export type DeployEnvironment = "development" | "staging" | "production" | "preview";

export type CoverageReport = {
  /** 0–100 */
  lines: number;
  statements: number;
  branches: number;
  functions: number;
};

// ─── SDK Config ───────────────────────────────────────────────────────────────

export type KAPSDKConfig = {
  /** KAP API base URL */
  apiUrl: string;
  /** Project-scoped API key */
  apiKey: string;
  projectId: string;
  /** Maximum ms to wait before giving up on a send */
  timeoutMs?: number;
};

// ─── API response ─────────────────────────────────────────────────────────────

export type SendEventResult = {
  accepted: boolean;
  eventId: string;
  warnings: string[];
};
