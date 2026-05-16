'use client'

import { useEffect, useState } from 'react'
import type { ProjectUpdate } from '@/lib/github'

interface Props {
  owner: string
  repo: string
  initialUpdates: ProjectUpdate[]
}

export function UpdateFeed({ owner, repo, initialUpdates }: Props) {
  const [updates, setUpdates] = useState<ProjectUpdate[]>(initialUpdates)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  useEffect(() => {
    let cancelled = false

    async function refresh() {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/.kap/updates`,
          {
            headers: {
              Accept: 'application/vnd.github.v3+json',
            },
          }
        )
        if (!res.ok || cancelled) return

        const files = await res.json() as Array<{ name: string; type: string }>
        const mdFiles = files.filter((f) => f.type === 'file' && f.name.endsWith('.md'))

        const fetched = await Promise.allSettled(
          mdFiles.map(async (f) => {
            const fileRes = await fetch(
              `https://api.github.com/repos/${owner}/${repo}/contents/.kap/updates/${f.name}`,
              { headers: { Accept: 'application/vnd.github.v3+json' } }
            )
            if (!fileRes.ok) return null
            const file = await fileRes.json() as { content: string; encoding: string }
            if (file.encoding !== 'base64') return null
            const raw = atob(file.content.replace(/\n/g, ''))
            const match = /^---\n([\s\S]*?)\n---/.exec(raw)
            const fm: Record<string, string> = {}
            if (match) {
              const block = match[1] ?? ''
              for (const line of block.split('\n')) {
                const sep = line.indexOf(':')
                if (sep === -1) continue
                fm[line.slice(0, sep).trim()] = line.slice(sep + 1).trim().replace(/^["']|["']$/g, '')
              }
            }
            const bodyStart = raw.indexOf('---', 3)
            const body = bodyStart !== -1 ? raw.slice(bodyStart + 4).trim() : raw
            return {
              id: f.name.replace(/\.md$/, ''),
              title: fm['title'] ?? f.name.replace(/\.md$/, ''),
              summary: fm['summary'] ?? body.slice(0, 200),
              date: fm['date'] ?? '',
              filename: f.name,
            } satisfies ProjectUpdate
          })
        )

        if (cancelled) return

        const fresh = fetched
          .filter((r): r is PromiseFulfilledResult<ProjectUpdate> => r.status === 'fulfilled' && r.value !== null)
          .map((r) => r.value)
          .sort((a, b) => b.date.localeCompare(a.date))

        setUpdates(fresh)
        setLastRefresh(new Date())
      } catch {
        // silently ignore network errors
      }
    }

    // Poll every 5 minutes
    const id = setInterval(() => { void refresh() }, 5 * 60 * 1000)
    return () => { cancelled = true; clearInterval(id) }
  }, [owner, repo])

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-200">Updates</h2>
        {lastRefresh && (
          <span className="text-xs text-gray-600">
            Refreshed {lastRefresh.toLocaleTimeString()}
          </span>
        )}
      </div>

      {updates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-700 bg-gray-900/40 p-8 text-center text-sm text-gray-500">
          No updates yet. Updates appear when <code className="text-indigo-400">.kap/updates/</code> files are pushed.
        </div>
      ) : (
        <ul className="space-y-3">
          {updates.map((update) => (
            <li
              key={update.id}
              className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-5 animate-in fade-in duration-300 hover:border-gray-600 transition"
            >
              <div className="flex items-start justify-between gap-4 mb-2">
                <h3 className="font-semibold text-gray-100 leading-snug">{update.title}</h3>
                {update.date && (
                  <span className="shrink-0 text-xs text-gray-500 mt-0.5">
                    {(() => {
                      try {
                        return new Date(update.date).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric'
                        })
                      } catch { return update.date }
                    })()}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">{update.summary}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
