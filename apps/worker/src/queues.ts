import { Queue } from 'bullmq'
import { Redis } from 'ioredis'

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379'

export const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null })

export const QUEUE_NAMES = {
  reporter: 'kap-reporter',
  verifier: 'kap-verifier',
  po:       'kap-po',
  promoter: 'kap-promoter',
} as const

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES]

export function createQueue(name: string): Queue {
  return new Queue(name, { connection })
}
