/**
 * Promoter job — receives an update, runs the Promoter Agent, and persists
 * the resulting social posts as an agent_runs record.
 */

import type { Job } from 'bullmq'
import { runPromoterAgent } from '@kap/agents'
import type { PromoterChannel } from '@kap/agents'
import pg from 'pg'
import { randomUUID } from 'node:crypto'

const { Pool } = pg

export interface PromoterJobData {
  projectId: string
  projectName: string
  projectPitch: string
  latestUpdate: { title: string; summary: string }
  channels: PromoterChannel[]
  backerCount: number
  progressPercent: number
}

let _pool: pg.Pool | null = null

function getPool(): pg.Pool | null {
  if (!process.env['DATABASE_URL']) return null
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env['DATABASE_URL'] })
  }
  return _pool
}

export async function handlePromoterJob(job: Job<PromoterJobData>): Promise<void> {
  const {
    projectId,
    projectName,
    projectPitch,
    latestUpdate,
    channels,
    backerCount,
    progressPercent,
  } = job.data

  console.log(`[promoter] job ${job.id} — project ${projectId}, channels: ${channels.join(', ')}`)

  const output = await runPromoterAgent({
    projectId,
    projectName,
    projectPitch,
    latestUpdate,
    channels,
    backerCount,
    progressPercent,
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
        'promoter',
        'done',
        JSON.stringify(output),
      ],
    )
  } else {
    console.log(`[promoter] no DATABASE_URL — skipping DB write for run ${runId}`)
    console.log(`[promoter] posts generated: ${output.posts.length}`)
  }

  console.log(`[promoter] job ${job.id} done — ${output.posts.length} posts generated`)
}
