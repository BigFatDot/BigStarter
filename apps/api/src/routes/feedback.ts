import type { FastifyInstance } from 'fastify'
import { authProject, getPKG, getProject } from '../store.js'

export async function feedbackRoutes(app: FastifyInstance): Promise<void> {
  // GET /:projectId — latest pending signals (public)
  app.get<{ Params: { projectId: string } }>('/:projectId', async (req, reply) => {
    const project = getProject(req.params.projectId)
    if (!project) return reply.status(404).send({ error: 'Project not found' })

    const pkg = getPKG(project.id)
    if (!pkg) return reply.status(404).send({ error: 'PKG not found' })

    const signals  = await pkg.getPendingSignals()
    const features = await pkg.getFeaturesByStatus('proposed')
    return reply.send({ signals, proposed_features: features })
  })

  // POST /:projectId/signals — submit a community signal (public)
  app.post<{
    Params: { projectId: string }
    Body: {
      signal_type: string
      content: string
      source?: string
      votes?: number
      funding_amount?: number
    }
  }>('/:projectId/signals', async (req, reply) => {
    const project = getProject(req.params.projectId)
    if (!project) return reply.status(404).send({ error: 'Project not found' })

    const pkg = getPKG(project.id)
    if (!pkg) return reply.status(404).send({ error: 'PKG not found' })

    const id = await pkg.writeNode({
      type: 'signal',
      id: crypto.randomUUID().replace(/-/g, '').slice(0, 16),
      signal_type: (req.body.signal_type ?? 'feature_request') as 'feature_request' | 'bug_report' | 'question' | 'vote_result' | 'community_trend',
      content: req.body.content,
      source: (req.body.source ?? 'community') as 'community' | 'admin' | 'agent' | 'platform',
      timestamp: new Date(),
      processed: false,
      ...(req.body.votes        ? { votes: req.body.votes }               : {}),
      ...(req.body.funding_amount ? { funding_amount: req.body.funding_amount } : {}),
    })

    return reply.status(201).send({
      id,
      message: 'Signal recorded. The PO Agent will process it in the next cycle.',
    })
  })

  // POST /:projectId/vote — vote on an existing feature
  app.post<{
    Params: { projectId: string }
    Body: { featureId: string; amount?: number }
  }>('/:projectId/vote', async (req, reply) => {
    const project = getProject(req.params.projectId)
    if (!project) return reply.status(404).send({ error: 'Project not found' })

    const pkg = getPKG(project.id)
    if (!pkg) return reply.status(404).send({ error: 'PKG not found' })

    // Add a vote_result signal linked to the feature
    const sigId = await pkg.writeNode({
      type: 'signal',
      id: crypto.randomUUID().replace(/-/g, '').slice(0, 16),
      signal_type: 'vote_result',
      content: `Vote for feature ${req.body.featureId}`,
      source: 'community',
      timestamp: new Date(),
      processed: false,
      votes: 1,
      ...(req.body.amount ? { funding_amount: req.body.amount } : {}),
    })

    await pkg.writeEdge({
      edge_type: 'RESULTED_IN',
      source_id: sigId,
      target_id: req.body.featureId,
    })

    return reply.status(202).send({ recorded: true, signalId: sigId })
  })

  // GET /:projectId/brief — PO brief (authenticated — for Orchestrator)
  app.get<{ Params: { projectId: string } }>('/:projectId/brief', async (req, reply) => {
    const project = authProject(req.headers.authorization)
    if (!project || project.id !== req.params.projectId) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }
    const pkg = getPKG(project.id)
    if (!pkg) return reply.status(404).send({ error: 'Not found' })

    const signals  = await pkg.getPendingSignals()
    const features = await pkg.getFeaturesByStatus('proposed')
    const decisions = await pkg.getRecentDecisions(undefined, 3)

    return reply.send({
      top_signals: signals.slice(0, 5),
      proposed_features: features.slice(0, 5),
      recent_decisions: decisions,
      generated_at: new Date(),
    })
  })
}
