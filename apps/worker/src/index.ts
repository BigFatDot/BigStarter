/**
 * KAP Worker — BullMQ process.
 * Starts one Worker per queue (reporter, verifier, po, promoter) with concurrency 2.
 * Never crashes on job error — all handlers are wrapped in try/catch.
 * Graceful shutdown on SIGTERM/SIGINT.
 */

import { Worker } from 'bullmq'
import { connection, QUEUE_NAMES } from './queues.js'
import { handleReporterJob } from './jobs/reporter.js'
import { handleVerifierJob } from './jobs/verifier.js'
import { handlePOJob }       from './jobs/po.js'
import { handlePromoterJob } from './jobs/promoter.js'
import type { ReporterJobData } from './jobs/reporter.js'
import type { VerifierJobData } from './jobs/verifier.js'
import type { POJobData }       from './jobs/po.js'
import type { PromoterJobData } from './jobs/promoter.js'

const CONCURRENCY = 2

// ------------------------------------
// Worker factory — wraps the handler in try/catch so a job failure never
// crashes the process. BullMQ will retry based on the job's options.
// ------------------------------------

const reporterWorker = new Worker<ReporterJobData>(
  QUEUE_NAMES.reporter,
  async (job) => {
    try {
      await handleReporterJob(job)
    } catch (err) {
      console.error(`[reporter] job ${job.id} failed:`, err)
      throw err // rethrow so BullMQ marks the job as failed and retries
    }
  },
  { connection, concurrency: CONCURRENCY },
)

const verifierWorker = new Worker<VerifierJobData>(
  QUEUE_NAMES.verifier,
  async (job) => {
    try {
      await handleVerifierJob(job)
    } catch (err) {
      console.error(`[verifier] job ${job.id} failed:`, err)
      throw err
    }
  },
  { connection, concurrency: CONCURRENCY },
)

const poWorker = new Worker<POJobData>(
  QUEUE_NAMES.po,
  async (job) => {
    try {
      await handlePOJob(job)
    } catch (err) {
      console.error(`[po] job ${job.id} failed:`, err)
      throw err
    }
  },
  { connection, concurrency: CONCURRENCY },
)

const promoterWorker = new Worker<PromoterJobData>(
  QUEUE_NAMES.promoter,
  async (job) => {
    try {
      await handlePromoterJob(job)
    } catch (err) {
      console.error(`[promoter] job ${job.id} failed:`, err)
      throw err
    }
  },
  { connection, concurrency: CONCURRENCY },
)

// ------------------------------------
// Error event listeners — prevent uncaught errors from crashing the process
// ------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Worker<any> is the correct union here
type AnyWorker = Worker<any>

const namedWorkers: Array<[string, AnyWorker]> = [
  ['reporter', reporterWorker],
  ['verifier', verifierWorker],
  ['po',       poWorker],
  ['promoter', promoterWorker],
]

for (const entry of namedWorkers) {
  const name   = entry[0]
  const worker = entry[1]
  if (name === undefined || worker === undefined) continue
  worker.on('error',    (err)       => console.error(`[${name}] worker error:`,    err))
  worker.on('failed',   (job, err)  => console.error(`[${name}] job ${job?.id ?? '?'} permanently failed:`, err))
  worker.on('completed',(job)       => console.log(`[${name}] job ${job.id} completed`))
}

console.log('[kap-worker] started — listening on queues:', Object.values(QUEUE_NAMES).join(', '))

// ------------------------------------
// Graceful shutdown
// ------------------------------------

async function shutdown(signal: string): Promise<void> {
  console.log(`[kap-worker] ${signal} received — shutting down gracefully`)
  await Promise.all([
    reporterWorker.close(),
    verifierWorker.close(),
    poWorker.close(),
    promoterWorker.close(),
  ])
  connection.disconnect()
  console.log('[kap-worker] shutdown complete')
  process.exit(0)
}

process.on('SIGTERM', () => { void shutdown('SIGTERM') })
process.on('SIGINT',  () => { void shutdown('SIGINT') })
