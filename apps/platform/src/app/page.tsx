import Link from 'next/link'
import { searchProjects } from '@/lib/github'
import type { BigStarterProject } from '@/lib/github'

function ProjectCard({ project }: { project: BigStarterProject }) {
  const updatedDate = new Date(project.updatedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return (
    <Link
      href={`/projects/${project.owner}/${project.repo}/`}
      className="group block rounded-xl border border-gray-700 bg-gray-900 p-6 transition hover:border-indigo-500 hover:bg-gray-800"
    >
      <div className="mb-3 flex items-start justify-between gap-4">
        <h2 className="text-lg font-semibold text-gray-100 group-hover:text-white">
          {project.name}
        </h2>
        <span className="flex shrink-0 items-center gap-1 text-xs text-gray-500">
          <svg
            className="h-3.5 w-3.5"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          {project.stars}
        </span>
      </div>

      <p className="mb-4 text-sm leading-relaxed text-gray-400 line-clamp-3">
        {project.pitch || 'No description.'}
      </p>

      {project.tags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {project.tags.slice(0, 5).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-indigo-900/60 px-2.5 py-0.5 text-xs text-indigo-300"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-gray-600">
        <span>
          {project.owner}/{project.repo}
        </span>
        <span>Updated {updatedDate}</span>
      </div>
    </Link>
  )
}

export default async function HomePage() {
  const projects = await searchProjects()

  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <header className="mb-14 text-center">
        <p className="mb-3 text-sm font-medium uppercase tracking-widest text-indigo-400">
          BigStarter
        </p>
        <h1 className="text-5xl font-extrabold tracking-tight">
          The Kickstarter for Vibe Coding
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-gray-300">
          Every project here is built in public — commits, decisions, and community signals
          tracked automatically via a local MCP plugin. No backend. GitHub is the source of truth.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/install/"
            className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            Add your project
          </Link>
          <a
            href="https://github.com/topics/bigstarter"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-gray-600 px-6 py-3 text-sm font-semibold text-gray-300 transition hover:border-gray-400 hover:text-white"
          >
            Browse on GitHub
          </a>
        </div>
      </header>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900 p-16 text-center">
          <p className="text-lg font-medium text-gray-400">No projects indexed yet.</p>
          <p className="mt-2 text-sm text-gray-600">
            Be the first — install the BigStarter MCP plugin and push your{' '}
            <code className="text-indigo-400">.kap/kap.json</code>.
          </p>
          <Link
            href="/install/"
            className="mt-6 inline-block rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            Get started
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-6 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {projects.length} project{projects.length !== 1 ? 's' : ''} building in public
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {projects.map((project) => (
              <ProjectCard
                key={`${project.owner}/${project.repo}`}
                project={project}
              />
            ))}
          </div>
        </>
      )}
    </main>
  )
}
