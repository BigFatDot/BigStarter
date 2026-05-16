import Link from 'next/link'
import { searchProjects, getProjectUpdates } from '@/lib/github'
import type { BigStarterProject } from '@/lib/github'

function ActivityDot({ updatedAt }: { updatedAt: string }) {
  const days = (Date.now() - new Date(updatedAt).getTime()) / 86400000
  if (days > 7) return null
  return (
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
    </span>
  )
}

async function ProjectCard({ project }: { project: BigStarterProject }) {
  const updates = await getProjectUpdates(project.owner, project.repo).catch(() => [])
  const latest = updates[0]
  const days = Math.round((Date.now() - new Date(project.updatedAt).getTime()) / 86400000)
  const timeAgo = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days}d ago`

  return (
    <Link
      href={`/projects/${project.owner}/${project.repo}/`}
      className="group block rounded-2xl border border-gray-700/60 bg-gray-900/50 overflow-hidden transition-all hover:border-indigo-500/50 hover:shadow-xl hover:shadow-indigo-950/30"
    >
      {/* Top color bar */}
      <div className="h-1 w-full bg-gradient-to-r from-indigo-600 to-purple-600 opacity-60 group-hover:opacity-100 transition" />

      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-gray-100 group-hover:text-white transition">
              {project.name}
            </h2>
            <ActivityDot updatedAt={project.updatedAt} />
          </div>
          <span className="shrink-0 text-xs text-gray-600">{timeAgo}</span>
        </div>

        {/* Pitch */}
        <p className="text-sm text-gray-400 leading-relaxed mb-4 line-clamp-2">
          {project.pitch}
        </p>

        {/* Latest update */}
        {latest && (
          <div className="mb-4 pl-3 border-l-2 border-indigo-800/60">
            <p className="text-xs text-gray-500 line-clamp-2 italic">{latest.summary}</p>
          </div>
        )}

        {/* Tags */}
        {project.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {project.tags.slice(0, 3).map(tag => (
              <span key={tag} className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-500">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-800">
          <div className="flex items-center gap-3 text-xs text-gray-600">
            {updates.length > 0 && <span>{updates.length} update{updates.length > 1 ? 's' : ''}</span>}
            <span>{project.stars} ⭐</span>
          </div>
          <span className="text-xs text-indigo-500 opacity-0 group-hover:opacity-100 transition">
            View project →
          </span>
        </div>
      </div>
    </Link>
  )
}

export default async function HomePage() {
  const projects = await searchProjects()

  return (
    <div>
      {/* Hero */}
      <section className="border-b border-gray-800/60 bg-gradient-to-b from-indigo-950/20 to-transparent">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-800/40 bg-indigo-950/40 px-3 py-1 text-xs text-indigo-400 mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
            Open protocol · GitHub native · No backend
          </div>

          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight mb-5">
            The Kickstarter<br />for Vibe Coding
          </h1>

          <p className="mx-auto max-w-lg text-lg text-gray-400 leading-relaxed mb-8">
            Follow AI-built projects in public. Every commit, decision, and milestone tracked automatically. Back the features you want shipped.
          </p>

          <div className="flex items-center justify-center gap-4">
            <Link href="/install/"
              className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-7 py-3.5 text-sm font-semibold text-white transition shadow-lg shadow-indigo-950/50">
              Add your project
            </Link>
            <a href="#projects"
              className="rounded-xl border border-gray-600 hover:border-gray-400 px-7 py-3.5 text-sm font-semibold text-gray-300 hover:text-white transition">
              Explore projects
            </a>
          </div>
        </div>
      </section>

      {/* How it works — 3 pillars */}
      <section className="border-b border-gray-800/40 bg-gray-900/20">
        <div className="mx-auto max-w-4xl px-4 py-12">
          <div className="grid grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-2xl mb-2">🔨</div>
              <h3 className="text-sm font-semibold text-gray-200 mb-1">Built with AI agents</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Every project uses a local MCP plugin. Commits and decisions are tracked automatically.
              </p>
            </div>
            <div>
              <div className="text-2xl mb-2">📡</div>
              <h3 className="text-sm font-semibold text-gray-200 mb-1">Built in public</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Every update, every architectural decision is visible. GitHub is the source of truth.
              </p>
            </div>
            <div>
              <div className="text-2xl mb-2">🗳️</div>
              <h3 className="text-sm font-semibold text-gray-200 mb-1">Community-driven</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Vote on features, submit requests, pledge funding. The agent listens.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Projects */}
      <section id="projects" className="mx-auto max-w-4xl px-4 py-12">
        {projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-700 p-20 text-center">
            <p className="text-xl font-semibold text-gray-400 mb-2">No projects yet</p>
            <p className="text-sm text-gray-600 mb-6">
              Be the first to build in public with BigStarter
            </p>
            <Link href="/install/"
              className="inline-block rounded-xl bg-indigo-600 hover:bg-indigo-500 px-6 py-3 text-sm font-semibold text-white transition">
              Add your project
            </Link>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                {projects.length} project{projects.length !== 1 ? 's' : ''} building in public
              </h2>
            </div>

            <div className={projects.length === 1 ? 'max-w-md mx-auto' : 'grid gap-5 sm:grid-cols-2'}>
              {projects.map(p => (
                <ProjectCard key={`${p.owner}/${p.repo}`} project={p} />
              ))}
            </div>
          </>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-10">
        <div className="mx-auto max-w-4xl px-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-400">◆ BigStarter</p>
            <p className="text-xs text-gray-600 mt-1">Open protocol · push .kap/kap.json to join</p>
          </div>
          <div className="flex items-center gap-6 text-xs text-gray-600">
            <Link href="/install/" className="hover:text-gray-400 transition">Add your project</Link>
            <a href="https://github.com/BigFatDot/BigStarter" target="_blank" rel="noopener noreferrer"
              className="hover:text-gray-400 transition">GitHub</a>
            <a href="https://npmjs.com/package/bigstarter" target="_blank" rel="noopener noreferrer"
              className="hover:text-gray-400 transition">npm</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
