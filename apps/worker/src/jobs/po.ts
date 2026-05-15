/**
 * PO job — receives community signals, runs the PO Agent, and persists
 * the resulting brief as an agent_runs record.
 */

import type { Job } from 'bullmq'
import { runPOAgent } from '@kap/agents'
import type { SignalNode, FeatureNode } from '@kap/pkg'
import pg from 'pg'
import { randomUUID } from 'node:crypto'

const { Pool } = pg

export interface POJobData {
  projectId: string
  projectVisionSummary: string
  architectureNotes?: string
  signals: SignalNode[]
  existingFeatures: Pick<FeatureNode, 'id' | 'title' | 'status'>[]
}

let _pool: pg.Pool | null = null

function getPool(): pg.Pool | null {
  if (!process.env['DATABASE_URL']) return null
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env['DATABASE_URL'] })
  }
  return _pool
}

export async function handlePOJob(job: Job<POJobData>): Promise<void> {
  const { projectId, projectVisionSummary, architectureNotes, signals, existingFeatures } = job.data

  console.log(`[po] job ${job.id} — project ${projectId}, signals: ${signals.length}`)

  const brief = await runPOAgent({
    projectId,
    projectVisionSummary,
    signals,
    existingFeatures,
    ...(architectureNotes !== undefined ? { architectureNotes } : {}),
  })

  const runId = randomUUID().replace(/-/g, '').slice(0, 16)

  const pool = getPool()
  if (pool) {
    await pool.query(
      `INSERT INTO agent_runs (id, project_id, agent_type, status, output)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        runId,
        projectId,
        'po',
        'done',
        JSON.stringify(brief),
      ],
    )
  } else {
    console.log(`[po] no DATABASE_URL — skipping DB write for run ${runId}`)
    console.log(`[po] top features count: ${brief.topFeatures.length}`)
  }

  console.log(`[po] job ${job.id} done — ${brief.topFeatures.length} features prioritised`)
}
