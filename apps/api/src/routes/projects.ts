import type { FastifyInstance } from 'fastify'
import { createProject, getProject, getPKG, authProject } from '../store.js'

export async function projectsRoutes(app: FastifyInstance): Promise<void> {
  // POST / — create a project + init PKG
  app.post<{
    Body: { adminId: string; name: string; pitch: string }
  }>('/', async (req, reply) => {
    const { adminId, name, pitch } = req.body
    if (!adminId || !name || !pitch) {
      return reply.status(400).send({ error: 'adminId, name, pitch are required' })
    }
    const { project } = await createProject(adminId, name, pitch)
    return reply.status(201).send({
      projectId: project.id,
      apiToken: project.apiToken,
      name: project.name,
      createdAt: project.createdAt,
      message: `Project "${project.name}" created. Use apiToken to authenticate SDK and MCP server.`,
    })
  })

  // GET /:id — project info + PKG stats
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const project = getProject(req.params.id)
    if (!project) return reply.status(404).send({ error: 'Project not found' })

    const pkg = getPKG(project.id)
    const features = pkg ? await pkg.getFeaturesByStatus('in_progress') : []
    const decisions = pkg ? await pkg.getRecentDecisions(undefined, 5) : []
    const signals   = pkg ? await pkg.getPendingSignals() : []

    return reply.send({
      id: project.id,
      name: project.name,
      pitch: project.pitch,
      createdAt: project.createdAt,
      stats: {
        featuresInProgress: features.length,
        recentDecisions: decisions.length,
        pendingSignals: signals.length,
      },
    })
  })

  // GET /:id/context — build agent context for a task
  app.get<{
    Params: { id: string }
    Querystring: { task: string }
  }>('/:id/context', async (req, reply) => {
    const project = authProject(req.headers.authorization)
    if (!project || project.id !== req.params.id) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }
    const pkg = getPKG(project.id)
    if (!pkg) return reply.status(404).send({ error: 'PKG not found' })

    const task = req.query.task || 'general context'
    const context = await pkg.buildAgentContext(task)
    return reply.send(context)
  })

  // POST /:id/decisions — write a decision to PKG
  app.post<{
    Params: { id: string }
    Body: {
      title: string
      description: string
      rationale: string
      domain: string
      confidence: number
      alternatives_rejected?: { option: string; reason: string }[]
    }
  }>('/:id/decisions', async (req, reply) => {
    const project = authProject(req.headers.authorization)
    if (!project || project.id !== req.params.id) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }
    const pkg = getPKG(project.id)
    if (!pkg) return reply.status(404).send({ error: 'PKG not found' })

    const id = await pkg.writeNode({
      type: 'decision',
      id: crypto.randomUUID().replace(/-/g, '').slice(0, 16),
      title: req.body.title,
      description: req.body.description,
      rationale: req.body.rationale,
      domain: req.body.domain as 'architecture' | 'product' | 'technical' | 'community' | 'financial',
      confidence: req.body.confidence,
      sprint: 0,
      timestamp: new Date(),
      alternatives_rejected: req.body.alternatives_rejected ?? [],
    })

    return reply.status(201).send({ id })
  })
}
