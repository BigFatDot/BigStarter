import type { KAPClient } from "../client.js";
import type { DeployEvent, TestRunEvent } from "../types.js";

export type CIHookContext = {
  client: KAPClient;
  projectId: string;
};

export type CITestRunPayload = {
  runId: string;
  suite: string;
  status: TestRunEvent["status"];
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  reportUrl?: string;
  coverage?: TestRunEvent["coverage"];
};

export type CIDeployPayload = {
  environment: DeployEvent["environment"];
  version: string;
  status: DeployEvent["status"];
  commitSha: string;
  deployUrl?: string;
  durationMs?: number;
};

export async function handleCITestRun(
  ctx: CIHookContext,
  payload: CITestRunPayload
): Promise<void> {
  const event: TestRunEvent = {
    id: crypto.randomUUID(),
    type: "test_run",
    projectId: ctx.projectId,
    timestamp: new Date().toISOString(),
    source: "ci",
    runId: payload.runId,
    suite: payload.suite,
    status: payload.status,
    passed: payload.passed,
    failed: payload.failed,
    skipped: payload.skipped,
    durationMs: payload.durationMs,
    reportUrl: payload.reportUrl ?? null,
    coverage: payload.coverage ?? null,
  };

  await ctx.client.sendEvent(event);
}

export async function handleCIDeploy(
  ctx: CIHookContext,
  payload: CIDeployPayload
): Promise<void> {
  const event: DeployEvent = {
    id: crypto.randomUUID(),
    type: "deploy",
    projectId: ctx.projectId,
    timestamp: new Date().toISOString(),
    source: "ci",
    environment: payload.environment,
    version: payload.version,
    status: payload.status,
    commitSha: payload.commitSha,
    deployUrl: payload.deployUrl ?? null,
    durationMs: payload.durationMs ?? null,
  };

  await ctx.client.sendEvent(event);
}
