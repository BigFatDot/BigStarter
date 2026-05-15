import type { KAPClient } from "../client.js";
import type { CommitEvent } from "../types.js";

export type GitHookContext = {
  client: KAPClient;
  projectId: string;
};

export type PostCommitPayload = {
  sha: string;
  branch: string;
  message: string;
  authorName: string;
  authorEmail: string;
  filesChanged: number;
  additions: number;
  deletions: number;
  relatedTaskIds?: string[];
};

export async function handlePostCommit(
  ctx: GitHookContext,
  payload: PostCommitPayload
): Promise<void> {
  const event: CommitEvent = {
    id: crypto.randomUUID(),
    type: "commit",
    projectId: ctx.projectId,
    timestamp: new Date().toISOString(),
    source: "git",
    sha: payload.sha,
    branch: payload.branch,
    message: payload.message,
    author: {
      name: payload.authorName,
      email: payload.authorEmail,
    },
    filesChanged: payload.filesChanged,
    additions: payload.additions,
    deletions: payload.deletions,
    relatedTaskIds: payload.relatedTaskIds ?? [],
  };

  await ctx.client.sendEvent(event);
}
