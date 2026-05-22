import { notFound } from 'next/navigation'
import { getProject, getProjectUpdates, getProjectDecisions, getProjectSignals, searchProjects } from '@/lib/github'
import { UpdateFeed } from './UpdateFeed'
import { VoteButton } from '@/components/VoteButton'

interface PageProps {
  params: Promise<{ owner: string; repo: string }>
}

function StatPill({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-gray-400">
      <span className="font-semibold text-white">{value}</span>
      <span>{label}</span>
    </div>
  )
}

function ProgressBar({ updates, decisions }: { updates: number; decisions: number }) {
  // Visual activity indicator based on content
  const activity = Math.min(100, (updates * 20) + (decisions * 15))
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1.5 text-xs text-gray-500">
        <span>Project activity</span>
        <span>{activity}%</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-full transition-all"
          style={{ width: `${activity}%` }}
        />
      </div>
    </div>
  )
}

export async function generateStaticParams() {
  // Always include the seed + fetch all from registry
  const seed = [{ owner: 'BigFatDot', repo: 'BigStarter' }]
  try {
    const projects = await searchProjects()
    const fromRegistry = projects.map(p => ({ owner: p.owner, repo: p.repo }))
    // Merge seed + registry, deduplicate
    const seen = new Set(seed.map(p => `${p.owner}/${p.repo}`))
    const merged = [...seed]
    for (const p of fromRegistry) {
      const key = `${p.owner}/${p.repo}`
      if (!seen.has(key)) { seen.add(key); merged.push(p) }
    }
    return merged
  } catch {
    return seed
  }
}

export default async function ProjectPage({ params }: PageProps) {
  const { owner, repo } = await params

  const [project, updates, decisions, signals] = await Promise.all([
    getProject(owner, repo),
    getProjectUpdates(owner, repo),
    getProjectDecisions(owner, repo),
    getProjectSignals(owner, repo),
  ])

  if (!project) notFound()

  const launchDate = new Date(project.updatedAt).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric',
  })

  const latestUpdate = updates[0]

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">

      {/* Breadcrumb */}
      <p className="text-xs text-indigo-400 font-medium uppercase tracking-widest mb-6">
        BigStarter Project
      </p>

      {/* Hero */}
      <header className="mb-8">
        <h1 className="text-4xl font-extrabold tracking-tight mb-3">{project.name}</h1>
        <p className="text-lg text-gray-300 leading-relaxed mb-4">{project.pitch}</p>

        {/* Tags */}
        {project.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {project.tags.map(tag => (
              <span key={tag} className="rounded-full bg-indigo-950/80 border border-indigo-900/50 px-2.5 py-0.5 text-xs text-indigo-300">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Stats row */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm mb-6">
          <StatPill value={updates.length} label={updates.length === 1 ? 'update' : 'updates'} />
          <span className="text-gray-700">·</span>
          <StatPill value={decisions.length} label={decisions.length === 1 ? 'decision' : 'decisions'} />
          <span className="text-gray-700">·</span>
          <StatPill value={signals.length} label={signals.length === 1 ? 'request' : 'requests'} />
          <span className="text-gray-700">·</span>
          <span className="text-sm text-gray-500">Building since {launchDate}</span>
          <a href={`https://github.com/${owner}/${repo}`} target="_blank" rel="noopener noreferrer"
            className="text-sm text-indigo-400 hover:text-indigo-300 transition ml-auto">
            GitHub ↗
          </a>
        </div>

        {/* Progress */}
        <div className="mb-7">
          <ProgressBar updates={updates.length} decisions={decisions.length} />
        </div>

        {/* CTAs */}
        <div className="flex gap-3">
          <a
            href={`https://github.com/${owner}/${repo}/discussions`}
            target="_blank" rel="noopener noreferrer"
            className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-3 text-sm font-semibold text-white text-center transition"
          >
            Follow this project
          </a>
          <a
            href={`https://github.com/${owner}/${repo}/issues/new?labels=kap-signal&title=Feature+request%3A+`}
            target="_blank" rel="noopener noreferrer"
            className="flex-1 rounded-xl border border-gray-600 hover:border-gray-400 px-5 py-3 text-sm font-semibold text-gray-300 hover:text-white text-center transition"
          >
            Suggest a feature
          </a>
        </div>
      </header>

      <hr className="border-gray-800 mb-8" />

      {/* Latest update — prominent */}
      {latestUpdate && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <h2 className="text-xs font-medium uppercase tracking-wider text-green-400">Latest update</h2>
          </div>
          <div className="rounded-xl border border-green-900/40 bg-green-950/20 p-5">
            <div className="flex items-start justify-between gap-4 mb-2">
              <h3 className="font-semibold text-gray-100">{latestUpdate.title}</h3>
              <span className="shrink-0 text-xs text-gray-500">
                {new Date(latestUpdate.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">{latestUpdate.summary}</p>
          </div>
        </section>
      )}

      {/* All updates */}
      {updates.length > 1 && (
        <section className="mb-10">
          <h2 className="text-base font-semibold text-gray-200 mb-4">All updates</h2>
          <UpdateFeed owner={owner} repo={repo} initialUpdates={updates.slice(1)} />
        </section>
      )}

      <hr className="border-gray-800 mb-8" />

      {/* Community voices */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-200">
            Community wants
            {signals.length > 0 && <span className="ml-2 text-xs text-gray-500 font-normal">{signals.length} request{signals.length > 1 ? 's' : ''}</span>}
          </h2>
          <a
            href={`https://github.com/${owner}/${repo}/issues/new?labels=kap-signal&title=Feature+request%3A+`}
            target="_blank" rel="noopener noreferrer"
            className="text-xs text-indigo-400 hover:text-indigo-300 transition"
          >
            + Submit a request
          </a>
        </div>

        {signals.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-700/60 p-8 text-center">
            <p className="text-sm text-gray-500 mb-3">No requests yet — be the first to suggest something</p>
            <a
              href={`https://github.com/${owner}/${repo}/issues/new?labels=kap-signal&title=Feature+request%3A+`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-lg transition"
            >
              Open a request on GitHub
            </a>
          </div>
        ) : (
          <ul className="space-y-2">
            {signals.map(signal => (
              <li key={signal.url} className="flex items-center justify-between rounded-xl border border-gray-700/60 bg-gray-900/40 px-4 py-3 hover:border-gray-600 transition gap-4">
                <a href={signal.url} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-gray-300 hover:text-white transition flex-1">
                  {signal.title}
                </a>
                <VoteButton
                  owner={owner}
                  repo={repo}
                  issueNumber={parseInt(signal.url.split('/').pop() ?? '0')}
                  initialVotes={signal.votes}
                  signalTitle={signal.title}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Under the hood — decisions */}
      {decisions.length > 0 && (
        <section className="mb-10">
          <h2 className="text-base font-semibold text-gray-200 mb-1">Under the hood</h2>
          <p className="text-xs text-gray-500 mb-4">Architecture decisions made by the agent, with rationale</p>
          <ul className="space-y-2">
            {decisions.slice(0, 5).map((d, i) => (
              <li key={i} className="flex items-center gap-3 rounded-xl border border-gray-700/40 bg-gray-900/30 px-4 py-3">
                <span className="shrink-0 text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-800 px-1.5 py-0.5 rounded">
                  {d.domain}
                </span>
                <span className="text-sm text-gray-400">{d.title}</span>
                <div className="ml-auto flex items-center gap-2 shrink-0">
                  <div className="h-1 w-12 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${Math.round(d.confidence * 100)}%` }} />
                  </div>
                  <span className="text-xs text-gray-600">{Math.round(d.confidence * 100)}%</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Built with */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/20 p-5 text-center">
        <p className="text-xs text-gray-600 mb-1">Built in public with AI agents</p>
        <p className="text-xs text-gray-600">
          Every update, decision, and commit is tracked automatically via{' '}
          <a href="/BigStarter/install/" className="text-indigo-500 hover:text-indigo-400 transition">BigStarter</a>
        </p>
      </div>

    </main>
  )
}
