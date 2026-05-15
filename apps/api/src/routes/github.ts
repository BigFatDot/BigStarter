/**
 * GitHub App routes
 *
 * POST /webhooks/github  — webhook handler (push, PR, issues, workflow_run, release)
 * GET  /github/install   — redirect to GitHub App installation page
 * GET  /github/callback  — OAuth callback after app installation
 */

import type { FastifyInstance } from 'fastify'
import { createHmac, timingSafeEqual } from 'node:crypto'

// ------------------------------------
// Webhook signature verification
// ------------------------------------

function verifySignature(secret: string, body: string, signature: string): boolean {
  if (!signature.startsWith('sha256=')) return false
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  const sig = Buffer.from(signature.slice(7), 'hex')
  const exp = Buffer.from(expected, 'hex')
  if (sig.length !== exp.length) return false
  return timingSafeEqual(sig, exp)
}

// ------------------------------------
// Webhook event → BullMQ job
// ------------------------------------

async function dispatchWebhookEvent(
  app: FastifyInstance,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  // Determine project from repo info
  const repo = (payload['repository'] as Record<string, unknown>)?.['full_name']
  if (!repo) return

  app.log.info({ event, repo }, 'GitHub webhook received')

  // Import queue lazily (same pattern as events.ts)
  const { Queue } = await import('bullmq')
  const { Redis } = await import('ioredis')
  const redisUrl = process.env['REDIS_URL']
  if (!redisUrl) return

  const conn = new Redis(redisUrl, { maxRetriesPerRequest: null })
  const q = new Queue('kap-reporter', { connection: conn })

  try {
    switch (event) {
      case 'push': {
        const commits = (payload['commits'] as unknown[]) ?? []
        const branch = String(payload['ref'] ?? '').replace('refs/heads/', '')
        const headCommit = payload['head_commit'] as Record<string, unknown> | null
        if (!headCommit) break

        await q.add('reporter', {
          projectId: String(repo),
          eventType: 'commit',
          summary: `Push to ${branch}: ${headCommit['message'] ?? ''}`,
          sprint: 0,
          metadata: {
            hash: headCommit['id'],
            branch,
            author: (headCommit['author'] as Record<string, unknown>)?.['email'],
            filesChanged: commits.flatMap(
              (c) => [...((c as Record<string, unknown>)['modified'] as string[] ?? [])],
            ).slice(0, 20),
          },
        })
        break
      }

      case 'pull_request': {
        const action = String(payload['action'] ?? '')
        const pr = payload['pull_request'] as Record<string, unknown>
        if (action === 'closed' && pr?.['merged']) {
          await q.add('reporter', {
            projectId: String(repo),
            eventType: 'milestone',
            summary: `PR merged: ${pr['title']}`,
            sprint: 0,
            metadata: {
              prNumber: pr['number'],
              prTitle: pr['title'],
              mergedBy: (pr['merged_by'] as Record<string, unknown>)?.['login'],
              additions: pr['additions'],
              deletions: pr['deletions'],
            },
          })
        }
        break
      }

      case 'release': {
        if (String(payload['action'] ?? '') === 'published') {
          const release = payload['release'] as Record<string, unknown>
          await q.add('reporter', {
            projectId: String(repo),
            eventType: 'deploy',
            summary: `Release ${release['tag_name']}: ${release['name'] ?? ''}`,
            sprint: 0,
            metadata: {
              tag: release['tag_name'],
              releaseName: release['name'],
              prerelease: release['prerelease'],
            },
          })
        }
        break
      }

      case 'issues': {
        // New issue = new community signal — invalidate PO cache
        // (actual signal creation handled by GitHubPKGService reading Issues)
        app.log.info({ repo, action: payload['action'] }, 'Issue event — signal cache invalidated')
        break
      }

      case 'workflow_run': {
        const run = payload['workflow_run'] as Record<string, unknown>
        if (String(payload['action'] ?? '') === 'completed') {
          await q.add('reporter', {
            projectId: String(repo),
            eventType: 'test_run',
            summary: `CI ${run['conclusion']}: ${run['name']}`,
            sprint: 0,
            metadata: {
              runId: run['id'],
              workflow: run['name'],
              conclusion: run['conclusion'],
              status: run['status'],
              branch: run['head_branch'],
            },
          })
        }
        break
      }
    }
  } finally {
    await q.close()
    conn.disconnect()
  }
}

// ------------------------------------
// Routes
// ------------------------------------

export async function githubRoutes(app: FastifyInstance): Promise<void> {

  // POST /webhooks/github — GitHub sends events here
  app.post('/webhooks/github', async (req, reply) => {
      const event     = String(req.headers['x-github-event'] ?? '')
      const signature = String(req.headers['x-hub-signature-256'] ?? '')
      const secret    = process.env['GITHUB_WEBHOOK_SECRET'] ?? ''

      // Verify signature if secret is configured (using JSON body)
      if (secret && signature) {
        const body = JSON.stringify(req.body)
        if (!verifySignature(secret, body, signature)) {
          return reply.status(401).send({ error: 'Invalid signature' })
        }
      }

      const payload = req.body as Record<string, unknown>

      // Process async — respond immediately to GitHub (10s timeout)
      dispatchWebhookEvent(app, event, payload).catch(
        err => app.log.error(err, 'webhook dispatch failed'),
      )

      return reply.status(200).send({ ok: true, event })
    },
  )

  // GET /github/install — redirect to GitHub App installation
  app.get('/github/install', async (_req, reply) => {
    const appSlug = process.env['GITHUB_APP_SLUG']
    if (!appSlug) return reply.status(503).send({ error: 'GitHub App not configured' })
    return reply.redirect(`https://github.com/apps/${appSlug}/installations/new`)
  })

  // GET /github/callback — called after installation/OAuth
  app.get<{ Querystring: { installation_id?: string; setup_action?: string } }>(
    '/github/callback',
    async (req, reply) => {
      const { installation_id, setup_action } = req.query
      app.log.info({ installation_id, setup_action }, 'GitHub App callback')

      // TODO: store installation_id → project mapping
      // TODO: trigger initial project scan (.kap/ bootstrap)

      const platformUrl = process.env['PLATFORM_URL'] ?? 'http://localhost:3010'
      return reply.redirect(`${platformUrl}/install/success?installation=${installation_id ?? ''}`)
    },
  )
}
