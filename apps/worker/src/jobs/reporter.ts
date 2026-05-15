/**
 * Reporter job — receives an event, runs the Reporter Agent, persists the
 * resulting update, and publishes it on Redis Pub/Sub for the SSE stream.
 */

import type { Job } from 'bullmq'
import { runReporterAgent } from '@kap/agents'
import { connection } from '../queues.js'
import pg from 'pg'
import { randomUUID } from 'node:crypto'

export interface ReporterJobData {
  projectId: string
  eventType: string
  summary: string
  sprint: number
}

const { Pool } = pg

// Lazy pool — only created when DATABASE_URL is present
let _pool: pg.Pool | null = null

function getPool(): pg.Pool | null {
  if (!process.env['DATABASE_URL']) return null
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env['DATABASE_URL'] })
  }
  return _pool
}

function templateUpdate(projectId: string, eventType: string, summary: string, sprint: number) {
  const typeLabel: Record<string, string> = {
    commit: 'New commit', test_run: 'Tests run', deploy: 'Deployed',
    milestone: 'Milestone reached', custom: 'Update',
  }
  const label = typeLabel[eventType] ?? 'Update'
  return {
    title: `${label} — Sprint ${sprint}`,
    summary,
    changelog: [{ feature: label, description: summary, status: 'shipped' as const }],
    metrics: { featuresShipped: 1, featuresPartial: 0, tasksAttempted: 1, verifierScoreAvg: 0, sprintNumber: sprint },
  }
}

export async function handleReporterJob(job: Job<ReporterJobData>): Promise<void> {
  const { projectId, eventType, summary, sprint } = job.data

  console.log(`[reporter] job ${job.id} — project ${projectId}, event ${eventType}`)

  // Use LLM when API key is available, template otherwise
  const output = process.env['ANTHROPIC_API_KEY']
    ? await runReporterAgent({
        projectId, sprint,
        completedTasks: [{ result: { eventType, summary } }],
        tone: 'general',
      })
    : templateUpdate(projectId, eventType, summary, sprint)

  const updateId = randomUUID().replace(/-/g, '').slice(0, 16)

  // Persist to PostgreSQL when available
  const pool = getPool()
  if (pool) {
    await pool.query(
      `INSERT INTO project_updates (id, project_id, title, summary, changelog, sprint)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        updateId,
        projectId,
        output.title,
        output.summary,
        JSON.stringify(output.changelog),
        sprint,
      ],
    )
  } else {
    console.log(`[reporter] no DATABASE_URL — skipping DB write for update ${updateId}`)
    console.log(`[reporter] update content: ${output.title}`)
  }

  // Publish on Redis Pub/Sub for SSE consumers
  const publisher = connection.duplicate()
  try {
    await publisher.publish(
      `project:${projectId}:updates`,
      JSON.stringify({
        id: updateId,
        projectId,
        title: output.title,
        summary: output.summary,
        changelog: output.changelog,
        sprint,
        publishedAt: new Date().toISOString(),
      }),
    )
  } finally {
    publisher.disconnect()
  }

  console.log(`[reporter] job ${job.id} done — update ${updateId} published`)
}
