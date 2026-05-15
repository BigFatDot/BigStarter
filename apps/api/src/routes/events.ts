import type { FastifyInstance } from 'fastify'
import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { authProject, getPKG } from '../store.js'

// BullMQ — eager init on module load (not lazy) to catch connection errors early
const _redisUrl = process.env['REDIS_URL']
let reporterQueue: Queue | null = null

if (_redisUrl) {
  try {
    const conn = new Redis(_redisUrl, { maxRetriesPerRequest: null })
    conn.on('error', (err) => console.error('[events] Redis error:', err.message))
    reporterQueue = new Queue('kap-reporter', { connection: conn })
    console.log('[events] BullMQ reporter queue connected')
  } catch (err) {
    console.error('[events] Failed to init BullMQ queue:', err)
  }
} else {
  console.warn('[events] REDIS_URL not set — jobs will not be queued')
}

function getReporterQueue(): Queue | null { return reporterQueue }

export async function eventsRoutes(app: FastifyInstance): Promise<void> {
  // POST / — receive event from SDK (git hook, CI, manual)
  app.post<{
    Body: { projectId: string; type: string; payload: Record<string, unknown> }
  }>('/', async (req, reply) => {
    const project = authProject(req.headers.authorization)
    if (!project) return reply.status(401).send({ error: 'Unauthorized' })
    if (project.id !== req.body.projectId) {
      return reply.status(403).send({ error: 'Token does not match projectId' })
    }

    const pkg = getPKG(project.id)
    if (!pkg) return reply.status(404).send({ error: 'Project PKG not found' })

    const { type, payload } = req.body
    const ts = new Date()

    // Persist as Artifact node in PKG
    const artifactId = await pkg.writeNode({
      type: 'artifact',
      id: crypto.randomUUID().replace(/-/g, '').slice(0, 16),
      artifact_type: type === 'commit' ? 'commit'
        : type === 'push'   ? 'commit'
        : type === 'deploy' ? 'deploy'
        : 'test_run',
      reference: String(payload['hash'] ?? payload['runId'] ?? type),
      description: buildEventDescription(type, payload),
      verification_status: 'pending',
      timestamp: ts,
    })

    app.log.info({ projectId: project.id, type, artifactId }, 'event stored')

    // Enqueue Reporter Agent job
    const q = getReporterQueue()
    if (q) {
      await q.add('reporter', {
        projectId: project.id,
        eventType: type,
        summary: buildEventDescription(type, payload),
        sprint: 0,
        artifactId,
      })
    }

    return reply.status(202).send({
      queued: true,
      artifactId,
      message: `Event "${type}" recorded. Reporter Agent will publish an update shortly.`,
    })
  })

  // GET /:projectId — list recent events
  app.get<{ Params: { projectId: string } }>('/:projectId', async (req, reply) => {
    const project = authProject(req.headers.authorization)
    if (!project || project.id !== req.params.projectId) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }
    const pkg = getPKG(project.id)
    if (!pkg) return reply.status(404).send({ error: 'Not found' })

    const artifacts = await pkg.semanticSearch('commit deploy test', ['artifact'], 20)
    return reply.send({ events: artifacts })
  })
}

function buildEventDescription(type: string, payload: Record<string, unknown>): string {
  if (type === 'commit') {
    return `Commit: ${payload['message'] ?? 'no message'} by ${payload['author'] ?? 'unknown'}`
  }
  if (type === 'push') {
    return `Push to branch ${payload['branch'] ?? 'unknown'}`
  }
  if (type === 'deploy') {
    return `Deploy to ${payload['environment'] ?? 'unknown'} — ${payload['status'] ?? 'pending'}`
  }
  return `Event: ${type} — ${JSON.stringify(payload).slice(0, 100)}`
}
