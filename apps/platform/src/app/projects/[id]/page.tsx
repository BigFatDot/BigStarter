import { notFound } from 'next/navigation'
import { UpdateFeed } from './UpdateFeed'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000'

interface ProjectStats {
  featuresInProgress: number
  recentDecisions: number
  pendingSignals: number
}

interface ProjectData {
  id: string
  name: string
  pitch: string
  createdAt: string
  stats: ProjectStats
}

interface Update {
  id: string
  title: string
  summary: string
  sprint: number
  publishedAt: string
}

async function fetchProject(id: string): Promise<ProjectData | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/projects/${id}`, {
      next: { revalidate: 30 },
    })
    if (!res.ok) return null
    return res.json() as Promise<ProjectData>
  } catch {
    return null
  }
}

async function fetchUpdates(projectId: string): Promise<Update[]> {
  try {
    const res = await fetch(`${API_URL}/api/v1/projects/${projectId}/updates`, {
      next: { revalidate: 0 }, // always fresh
    })
    if (!res.ok) return []
    const data = await res.json() as { updates?: Update[] }
    return data.updates ?? []
  } catch {
    return []
  }
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-4 text-center">
      <p className="text-3xl font-bold text-indigo-400">{value}</p>
      <p className="mt-1 text-sm text-gray-400">{label}</p>
    </div>
  )
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectPage({ params }: PageProps) {
  const { id } = await params
  const [project, updates] = await Promise.all([
    fetchProject(id),
    fetchUpdates(id),
  ])

  if (!project) notFound()

  const createdDate = new Date(project.createdAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <header className="mb-10">
        <p className="mb-2 text-sm font-medium uppercase tracking-widest text-indigo-400">
          KAP Project
        </p>
        <h1 className="text-4xl font-extrabold tracking-tight">{project.name}</h1>
        <p className="mt-4 text-lg leading-relaxed text-gray-300">{project.pitch}</p>
        <p className="mt-3 text-xs text-gray-500">Started {createdDate}</p>
      </header>

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-gray-200">At a glance</h2>
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Features in progress" value={project.stats.featuresInProgress} />
          <StatCard label="Recent decisions"     value={project.stats.recentDecisions}    />
          <StatCard label="Community signals"    value={project.stats.pendingSignals}     />
        </div>
      </section>

      <section className="mb-10">
        <button
          type="button"
          className="w-full rounded-lg border border-indigo-500 bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          Follow this project
        </button>
        <p className="mt-2 text-center text-xs text-gray-500">
          Get notified when a new update is published (coming in v0.2)
        </p>
      </section>

      {/* Client component — connects SSE, shows live updates */}
      <UpdateFeed projectId={id} initialUpdates={updates} />
    </main>
  )
}
