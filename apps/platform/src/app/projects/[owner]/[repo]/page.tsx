import { notFound } from 'next/navigation'
import { UpdateFeed } from './UpdateFeed'
import {
  getProject,
  getProjectUpdates,
  getProjectSignals,
  getProjectDecisions,
  searchProjects,
} from '@/lib/github'

interface PageProps {
  params: Promise<{ owner: string; repo: string }>
}

export async function generateStaticParams(): Promise<Array<{ owner: string; repo: string }>> {
  // Fallback: always pre-render the BigStarter project itself
  const seed = [{ owner: 'BigFatDot', repo: 'BigStarter' }]
  try {
    const projects = await searchProjects()
    const discovered = projects.map((p) => ({ owner: p.owner, repo: p.repo }))
    // Merge seed + discovered, deduplicated
    const seen = new Set(seed.map(p => `${p.owner}/${p.repo}`))
    for (const p of discovered) {
      const key = `${p.owner}/${p.repo}`
      if (!seen.has(key)) { seen.add(key); seed.push(p) }
    }
  } catch { /* network unavailable at build time — use seed only */ }
  return seed
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-4 text-center">
      <p className="text-3xl font-bold text-indigo-400">{value}</p>
      <p className="mt-1 text-sm text-gray-400">{label}</p>
    </div>
  )
}

export default async function ProjectPage({ params }: PageProps) {
  const { owner, repo } = await params

  const [project, updates, signals, decisions] = await Promise.all([
    getProject(owner, repo),
    getProjectUpdates(owner, repo),
    getProjectSignals(owner, repo),
    getProjectDecisions(owner, repo),
  ])

  if (!project) notFound()

  const updatedDate = new Date(project.updatedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <header className="mb-10">
        <p className="mb-2 text-sm font-medium uppercase tracking-widest text-indigo-400">
          BigStarter Project
        </p>
        <h1 className="text-4xl font-extrabold tracking-tight">{project.name}</h1>
        <p className="mt-4 text-lg leading-relaxed text-gray-300">{project.pitch}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {project.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-indigo-900/60 px-2.5 py-0.5 text-xs text-indigo-300"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
          <span>Updated {updatedDate}</span>
          <span>{project.stars} stars</span>
          <a
            href={`https://github.com/${owner}/${repo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:underline"
          >
            View on GitHub
          </a>
        </div>
      </header>

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-gray-200">At a glance</h2>
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Updates published" value={updates.length} />
          <StatCard label="Decisions recorded" value={decisions.length} />
          <StatCard label="Community signals" value={signals.length} />
        </div>
      </section>

      {signals.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-gray-200">Community signals</h2>
          <ul className="space-y-2">
            {signals.map((signal) => (
              <li
                key={signal.url}
                className="flex items-center justify-between rounded-xl border border-gray-700/60 bg-gray-900/60 px-4 py-3 hover:border-gray-600 transition"
              >
                <a href={signal.url} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-gray-200 hover:text-indigo-300 transition">
                  {signal.title}
                </a>
                <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded-full">
                  👍 {signal.votes}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {decisions.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-gray-200">Decisions</h2>
          <ul className="space-y-2">
            {decisions.slice(0, 5).map((d, i) => (
              <li key={i} className="flex items-start gap-3 rounded-xl border border-gray-700/40 bg-gray-900/40 px-4 py-3">
                <span className="shrink-0 mt-0.5 text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-800 px-1.5 py-0.5 rounded">
                  {d.domain}
                </span>
                <span className="text-sm text-gray-300">{d.title}</span>
                <span className="ml-auto shrink-0 text-xs text-gray-600">{Math.round(d.confidence * 100)}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Community CTA — signals empty state */}
      {signals.length === 0 && (
        <section className="mb-10 rounded-xl border border-dashed border-gray-700/60 bg-gray-900/20 p-6">
          <p className="text-sm font-medium text-gray-400 mb-2">No community signals yet</p>
          <p className="text-xs text-gray-600 mb-4">
            Open GitHub Issues labeled <code className="text-gray-400">kap-signal</code> on this repo
            to request features, report bugs, or vote on direction.
          </p>
          <a
            href={`https://github.com/${owner}/${repo}/issues/new?labels=kap-signal&title=Feature+request%3A+`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition"
          >
            + Open a signal on GitHub
          </a>
        </section>
      )}

      <section className="mb-10 flex items-center gap-4">
        <a href={`https://github.com/${owner}/${repo}`} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition border border-gray-700 hover:border-gray-500 px-4 py-2 rounded-lg">
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
          View on GitHub
        </a>
        <span className="text-xs text-gray-600">⭐ Star to follow progress</span>
      </section>

      <UpdateFeed owner={owner} repo={repo} initialUpdates={updates} />
    </main>
  )
}
