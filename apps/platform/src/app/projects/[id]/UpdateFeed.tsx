'use client'

import { useEffect, useRef, useState } from 'react'

interface Update {
  id: string
  title: string
  summary: string
  sprint: number
  publishedAt: string
}

interface Props {
  projectId: string
  initialUpdates: Update[]
}

export function UpdateFeed({ projectId, initialUpdates }: Props) {
  const [updates, setUpdates] = useState<Update[]>(initialUpdates)
  const [connected, setConnected] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const es = new EventSource(`/api/stream/${projectId}`)
    esRef.current = es

    es.onopen = () => setConnected(true)

    es.onmessage = (e) => {
      try {
        const update = JSON.parse(e.data) as Update
        if (update.id) {
          setUpdates(prev => {
            if (prev.some(u => u.id === update.id)) return prev
            return [update, ...prev]
          })
        }
      } catch { /* skip malformed */ }
    }

    es.onerror = () => setConnected(false)

    return () => { es.close(); setConnected(false) }
  }, [projectId])

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-200">Updates</h2>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          connected
            ? 'bg-green-900 text-green-300'
            : 'bg-gray-800 text-gray-500'
        }`}>
          {connected ? '● live' : '○ offline'}
        </span>
      </div>

      {updates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-700 bg-gray-900 p-8 text-center text-sm text-gray-500">
          No updates yet. The Reporter Agent will post here after each sprint.
        </div>
      ) : (
        <ul className="space-y-4">
          {updates.map(update => (
            <li key={update.id} className="rounded-lg border border-gray-700 bg-gray-900 p-5 animate-in fade-in duration-300">
              <div className="flex items-center justify-between gap-4">
                <h3 className="font-semibold text-gray-100">{update.title}</h3>
                <span className="shrink-0 rounded-full bg-indigo-900 px-2 py-0.5 text-xs text-indigo-300">
                  Sprint {update.sprint}
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-400">{update.summary}</p>
              <p className="mt-3 text-xs text-gray-600">
                {new Date(update.publishedAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
