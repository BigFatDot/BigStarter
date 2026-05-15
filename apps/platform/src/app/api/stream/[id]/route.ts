/**
 * SSE stream route — no longer used in static export mode.
 * The UpdateFeed component now polls the GitHub API directly from the browser.
 *
 * This file is kept as a reference. It will NOT be included in the static export
 * because Next.js static export skips Route Handlers.
 *
 * To re-enable for a non-static deployment, restore the Redis SSE implementation
 * and change next.config.ts output back to 'standalone'.
 */

export async function GET(): Promise<Response> {
  return new Response('Not available in static export mode.', { status: 410 })
}
