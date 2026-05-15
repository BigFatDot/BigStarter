// ============================================================
// GitHub webhook handler — cache invalidation + artifact creation
// ============================================================

import type { GitHubPKGService } from './service.js';

// ------------------------------------
// Webhook payload shapes (minimal)
// ------------------------------------

interface PushPayload {
  commits?: Array<{
    added?: string[];
    modified?: string[];
    removed?: string[];
  }>;
  head_commit?: {
    id?: string;
    message?: string;
  };
}

interface IssuePayload {
  action?: string;
}

interface PullRequestPayload {
  action?: string;
  pull_request?: {
    merged?: boolean;
    merge_commit_sha?: string | null;
    title?: string;
    html_url?: string;
  };
}

interface WorkflowRunPayload {
  action?: string;
  workflow_run?: {
    id?: number;
    name?: string;
    conclusion?: string | null;
    html_url?: string;
  };
}

interface ReleasePayload {
  action?: string;
  release?: {
    tag_name?: string;
    name?: string | null;
    html_url?: string;
  };
}

// ------------------------------------
// Handler
// ------------------------------------

function touchesKapDir(payload: PushPayload): boolean {
  const allFiles = (payload.commits ?? []).flatMap((c) => [
    ...(c.added ?? []),
    ...(c.modified ?? []),
    ...(c.removed ?? []),
  ]);
  return allFiles.some((f) => f.startsWith('.kap/'));
}

function touchesKapSubdir(payload: PushPayload, subdir: string): boolean {
  const prefix = `.kap/${subdir}/`;
  const allFiles = (payload.commits ?? []).flatMap((c) => [
    ...(c.added ?? []),
    ...(c.modified ?? []),
    ...(c.removed ?? []),
  ]);
  return allFiles.some((f) => f.startsWith(prefix));
}

export async function handleGitHubWebhook(
  service: GitHubPKGService,
  event: string,
  payload: unknown,
): Promise<void> {
  try {
    switch (event) {
      case 'push': {
        const p = payload as PushPayload;
        if (!touchesKapDir(p)) break;

        if (touchesKapSubdir(p, 'decisions')) {
          service.invalidateCache('decisions:all');
          // Invalidate per-domain keys
          const domains = ['architecture', 'product', 'technical', 'community', 'financial'];
          for (const d of domains) {
            service.invalidateCache(`decisions:${d}`);
          }
          service.invalidateCache('dir:.kap/decisions');
        }
        if (touchesKapSubdir(p, 'features')) {
          service.invalidateCache('dir:.kap/features');
        }
        if (touchesKapSubdir(p, 'artifacts')) {
          service.invalidateCache('dir:.kap/artifacts');
        }
        if (touchesKapSubdir(p, 'components')) {
          service.invalidateCache('dir:.kap/components');
        }

        // Check constraints.md specifically
        const allFiles = (p.commits ?? []).flatMap((c) => [
          ...(c.added ?? []),
          ...(c.modified ?? []),
        ]);
        if (allFiles.some((f) => f === '.kap/constraints.md')) {
          service.invalidateCache('constraints');
        }
        break;
      }

      case 'issues.opened':
      case 'issues.closed': {
        const p = payload as IssuePayload;
        void p; // acknowledged
        service.invalidateCache('signals');
        break;
      }

      case 'pull_request.closed': {
        const p = payload as PullRequestPayload;
        if (p.pull_request?.merged !== true) break;

        const pr = p.pull_request;
        const sha = pr.merge_commit_sha ?? '';
        const id = `art-pr-${Date.now()}`;

        await service.writeNode({
          type: 'artifact',
          id,
          artifact_type: 'pr',
          reference: pr.html_url ?? sha,
          description: pr.title ?? 'Merged pull request',
          timestamp: new Date(),
        });

        service.invalidateCache('dir:.kap/artifacts');
        break;
      }

      case 'workflow_run.completed': {
        const p = payload as WorkflowRunPayload;
        const run = p.workflow_run;
        if (run === undefined) break;

        const conclusion = run.conclusion ?? '';
        let verificationStatus: 'pass' | 'fail' | 'partial' | 'pending';
        if (conclusion === 'success') {
          verificationStatus = 'pass';
        } else if (conclusion === 'failure') {
          verificationStatus = 'fail';
        } else if (conclusion === 'cancelled' || conclusion === 'timed_out') {
          verificationStatus = 'fail';
        } else {
          verificationStatus = 'pending';
        }

        const id = `art-run-${run.id ?? Date.now()}`;
        await service.writeNode({
          type: 'artifact',
          id,
          artifact_type: 'test_run',
          reference: run.html_url ?? String(run.id ?? ''),
          description: `Workflow run: ${run.name ?? 'unknown'} — ${conclusion}`,
          verification_status: verificationStatus,
          timestamp: new Date(),
        });

        service.invalidateCache('dir:.kap/artifacts');
        break;
      }

      case 'release.published': {
        const p = payload as ReleasePayload;
        const release = p.release;
        if (release === undefined) break;

        const id = `art-rel-${release.tag_name ?? Date.now()}`;
        await service.writeNode({
          type: 'artifact',
          id,
          artifact_type: 'deploy',
          reference: release.html_url ?? release.tag_name ?? '',
          description: `Release ${release.tag_name ?? ''}: ${release.name ?? ''}`,
          timestamp: new Date(),
        });

        service.invalidateCache('dir:.kap/artifacts');
        break;
      }

      default:
        // Unhandled event — no-op
        break;
    }
  } catch {
    // Webhook handlers must never crash the caller
  }
}
