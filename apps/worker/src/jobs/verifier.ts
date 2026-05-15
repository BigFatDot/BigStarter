/**
 * Verifier job — receives a diff + acceptance criteria, runs the Verifier
 * Agent, and persists the resulting ProofBundle.
 */

import type { Job } from 'bullmq'
import { runVerifierAgent } from '@kap/agents'
import pg from 'pg'
import { randomUUID } from 'node:crypto'

const { Pool } = pg

export interface VerifierJobData {
  projectId: string
  featureId: string
  diff: string
  acceptanceCriteria: { id: string; description: string }[]
  ciResults?: { passed: number; failed: number; coverage: number }
}

let _pool: pg.Pool | null = null

function getPool(): pg.Pool | null {
  if (!process.env['DATABASE_URL']) return null
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env['DATABASE_URL'] })
  }
  return _pool
}

export async function handleVerifierJob(job: Job<VerifierJobData>): Promise<void> {
  const { projectId, featureId, diff, acceptanceCriteria, ciResults } = job.data

  console.log(`[verifier] job ${job.id} — project ${projectId}, feature ${featureId}`)

  const output = await runVerifierAgent({
    featureId,
    diff,
    acceptanceCriteria,
    ...(ciResults !== undefined ? { ciResults } : {}),
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
        'verifier',
        output.status,
        JSON.stringify(output.proofBundle),
      ],
    )
  } else {
    console.log(`[verifier] no DATABASE_URL — skipping DB write for run ${runId}`)
    console.log(`[verifier] proof bundle score: ${output.proofBundle.verifierScore}`)
  }

  console.log(`[verifier] job ${job.id} done — status ${output.status}, score ${output.score}`)
}
