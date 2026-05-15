import Fastify from 'fastify'
import { eventsRoutes } from './routes/events.js'
import { projectsRoutes } from './routes/projects.js'
import { feedbackRoutes } from './routes/feedback.js'
import { githubRoutes } from './routes/github.js'

const app = Fastify({ logger: true })

app.register(eventsRoutes,  { prefix: '/api/v1/events' })
app.register(projectsRoutes, { prefix: '/api/v1/projects' })
app.register(feedbackRoutes, { prefix: '/api/v1/feedback' })
app.register(githubRoutes)  // /webhooks/github + /github/install + /github/callback

app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

// Published updates — inlined here due to Fastify plugin route ordering
app.get<{ Params: { id: string } }>('/api/v1/projects/:id/updates', async (req, reply) => {
  const dbUrl = process.env['DATABASE_URL']
  if (!dbUrl) return reply.send({ updates: [] })
  try {
    const pg = await import('pg')
    const pool = new pg.default.Pool({ connectionString: dbUrl })
    const result = await pool.query(
      `SELECT id, title, summary, sprint, created_at AS "publishedAt"
       FROM project_updates WHERE project_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      [req.params.id],
    )
    await pool.end()
    return reply.send({ updates: result.rows })
  } catch { return reply.send({ updates: [] }) }
})

const port = Number(process.env['PORT'] ?? 3000)
const host = process.env['HOST'] ?? '0.0.0.0'

try {
  await app.listen({ port, host })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
