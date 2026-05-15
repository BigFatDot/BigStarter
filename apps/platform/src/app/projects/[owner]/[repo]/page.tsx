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
  const projects = await searchProjects()
  return projects.map((p) => ({ owner: p.owner, repo: p.repo }))
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
          <ul className="space-y-3">
            {signals.map((signal) => (
              <li
                key={signal.url}
                className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-900 px-4 py-3"
              >
                <a
                  href={signal.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gray-200 hover:text-indigo-300"
                >
                  {signal.title}
                </a>
                <span className="flex shrink-0 items-center gap-1 text-xs text-indigo-400">
                  <span>+1</span>
                  <span className="font-bold">{signal.votes}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-10">
        <a
          href={`https://github.com/${owner}/${repo}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full rounded-lg border border-indigo-500 bg-indigo-600 px-6 py-3 text-center text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          Follow on GitHub
        </a>
        <p className="mt-2 text-center text-xs text-gray-500">
          Star the repo to follow this project's progress
        </p>
      </section>

      <UpdateFeed owner={owner} repo={repo} initialUpdates={updates} />
    </main>
  )
}
