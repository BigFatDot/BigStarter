import Link from 'next/link'
import { searchProjects, getProjectUpdates } from '@/lib/github'
import type { BigStarterProject } from '@/lib/github'

function ActivityDot({ updatedAt }: { updatedAt: string }) {
  const daysAgo = (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24)
  if (daysAgo > 7) return null
  return (
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
    </span>
  )
}

async function ProjectCard({ project }: { project: BigStarterProject }) {
  // Fetch latest update for preview
  const updates = await getProjectUpdates(project.owner, project.repo).catch(() => [])
  const latestUpdate = updates[0]

  const updatedDate = new Date(project.updatedAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  })

  return (
    <Link
      href={`/projects/${project.owner}/${project.repo}/`}
      className="group block rounded-xl border border-gray-700/60 bg-gray-900/60 p-6 transition-all hover:border-indigo-500/60 hover:bg-gray-800/60 hover:shadow-lg hover:shadow-indigo-950/20"
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-100 group-hover:text-white transition">
            {project.name}
          </h2>
          <ActivityDot updatedAt={project.updatedAt} />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {updates.length > 0 && (
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
              {updates.length} update{updates.length > 1 ? 's' : ''}
            </span>
          )}
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            {project.stars}
          </span>
        </div>
      </div>

      {/* Pitch */}
      <p className="mb-3 text-sm leading-relaxed text-gray-400 line-clamp-2">
        {project.pitch || 'No description.'}
      </p>

      {/* Latest update preview */}
      {latestUpdate && (
        <p className="mb-4 text-xs text-gray-500 border-l-2 border-indigo-800 pl-3 line-clamp-2 italic">
          {latestUpdate.summary}
        </p>
      )}

      {/* Tags */}
      {project.tags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {project.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="rounded-full bg-indigo-950/60 px-2 py-0.5 text-xs text-indigo-400/80">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-600">
        <span>{project.owner}/{project.repo}</span>
        <span>Updated {updatedDate}</span>
      </div>
    </Link>
  )
}

export default async function HomePage() {
  const projects = await searchProjects()

  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      {/* Hero */}
      <header className="mb-14 text-center">
        <p className="mb-3 text-sm font-medium uppercase tracking-widest text-indigo-400">
          BigStarter
        </p>
        <h1 className="text-5xl font-extrabold tracking-tight mb-5">
          The Kickstarter for Vibe Coding
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-gray-400">
          Every project here is built in public with AI agents.
          Commits, decisions, and community signals tracked automatically.
          No backend. GitHub is the source of truth.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link href="/install/"
            className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500">
            Add your project
          </Link>
          <a href="https://github.com/BigFatDot/BigStarter" target="_blank" rel="noopener noreferrer"
            className="rounded-lg border border-gray-600 px-6 py-3 text-sm font-semibold text-gray-300 transition hover:border-gray-400 hover:text-white">
            Browse on GitHub
          </a>
        </div>
      </header>

      {/* Projects */}
      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/40 p-16 text-center">
          <p className="text-lg font-medium text-gray-400">No projects yet.</p>
          <p className="mt-2 text-sm text-gray-600">
            Be the first — push a <code className="text-indigo-400">.kap/kap.json</code> to your repo.
          </p>
          <Link href="/install/"
            className="mt-6 inline-block rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition">
            Get started
          </Link>
        </div>
      ) : (
        <>
          <p className="mb-5 text-sm text-gray-500">
            {projects.length} project{projects.length !== 1 ? 's' : ''} building in public
          </p>
          {/* Full width for single project, 2-col for multiple */}
          <div className={projects.length === 1
            ? 'max-w-2xl mx-auto'
            : 'grid gap-4 sm:grid-cols-2'
          }>
            {projects.map((project) => (
              <ProjectCard
                key={`${project.owner}/${project.repo}`}
                project={project}
              />
            ))}
          </div>
        </>
      )}

      {/* Footer */}
      <footer className="mt-20 border-t border-gray-800 pt-8 text-center text-xs text-gray-600">
        <p>
          Open protocol — push <code>.kap/kap.json</code> to join.{' '}
          <a href="https://github.com/BigFatDot/BigStarter" target="_blank" rel="noopener noreferrer"
            className="text-gray-500 hover:text-gray-400 transition">github.com/BigFatDot/BigStarter</a>
        </p>
      </footer>
    </main>
  )
}
