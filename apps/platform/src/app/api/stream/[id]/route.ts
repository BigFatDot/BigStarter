/**
 * SSE endpoint — GET /api/stream/:id
 *
 * Subscribes to the Redis Pub/Sub channel `project:{id}:updates` and
 * forwards each message to the client as a Server-Sent Event.
 * Cleans up the subscriber on client disconnect.
 */

import IORedis from 'ioredis'

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  const { id } = await params
  const channel = `project:${id}:updates`

  const subscriber = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })

  let closed = false

  const stream = new ReadableStream({
    start(controller) {
      // Send an initial keep-alive comment so the browser knows the connection is open
      controller.enqueue(': connected\n\n')

      subscriber.subscribe(channel, (err) => {
        if (err) {
          console.error(`[sse] subscribe error for channel ${channel}:`, err)
          controller.close()
        }
      })

      subscriber.on('message', (_chan: string, message: string) => {
        if (closed) return
        try {
          // SSE format: "data: <payload>\n\n"
          controller.enqueue(`data: ${message}\n\n`)
        } catch {
          // Controller may be closed if the client disconnected between the check and
          // the enqueue. Ignore — cleanup is handled in cancel().
        }
      })

      subscriber.on('error', (err) => {
        console.error(`[sse] redis subscriber error for channel ${channel}:`, err)
        if (!closed) {
          closed = true
          subscriber.disconnect()
          try { controller.close() } catch { /* already closed */ }
        }
      })
    },

    cancel() {
      // Called when the client disconnects
      closed = true
      subscriber.unsubscribe(channel).finally(() => {
        subscriber.disconnect()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no', // disable Nginx/Caddy buffering
    },
  })
}
