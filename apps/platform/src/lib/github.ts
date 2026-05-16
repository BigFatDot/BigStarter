const GITHUB_API = 'https://api.github.com'
const TOKEN = process.env['NEXT_PUBLIC_GITHUB_TOKEN']

function githubHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  }
  if (TOKEN) {
    headers['Authorization'] = `Bearer ${TOKEN}`
  }
  return headers
}

async function githubFetch(url: string): Promise<Response> {
  const res = await fetch(url, {
    headers: githubHeaders(),
    next: { revalidate: 1800 }, // 30 min cache — aligns with rebuild schedule
  })
  const remaining = res.headers.get('X-RateLimit-Remaining')
  if (remaining !== null && Number(remaining) < 5) {
    console.warn(`[github] rate limit low: ${remaining} requests remaining`)
  }
  return res
}

function decodeBase64(encoded: string): string {
  return Buffer.from(encoded.replace(/\n/g, ''), 'base64').toString('utf-8')
}

function parseFrontmatter(raw: string): Record<string, string> {
  const result: Record<string, string> = {}
  const match = /^---\n([\s\S]*?)\n---/.exec(raw)
  if (!match) return result
  const block = match[1] ?? ''
  for (const line of block.split('\n')) {
    const sep = line.indexOf(':')
    if (sep === -1) continue
    const key = line.slice(0, sep).trim()
    const value = line.slice(sep + 1).trim().replace(/^["']|["']$/g, '')
    result[key] = value
  }
  return result
}

export interface BigStarterProject {
  owner: string
  repo: string
  name: string
  pitch: string
  tags: string[]
  stars: number
  updatedAt: string
}

export interface ProjectUpdate {
  id: string
  title: string
  summary: string
  date: string
  filename: string
}

export interface ProjectDecision {
  title: string
  domain: string
  confidence: number
}

export interface ProjectSignal {
  title: string
  votes: number
  url: string
}

interface GitHubCodeSearchItem {
  repository: {
    full_name: string
    stargazers_count: number
    updated_at: string
    owner: { login: string }
    name: string
  }
}

interface GitHubContentFile {
  content: string
  encoding: string
}

interface GitHubIssue {
  title: string
  reactions: { '+1': number; total_count: number }
  html_url: string
}

interface KapJson {
  name?: string
  pitch?: string
  tags?: string[]
}

interface RegistryEntry { owner: string; repo: string }
interface Registry { projects: RegistryEntry[] }

// Lit la liste des projets depuis registry.json dans le repo BigStarter
// Plus fiable que GitHub Search API qui a un délai d'indexation
export async function searchProjects(): Promise<BigStarterProject[]> {
  try {
    // 1. Lire registry.json
    const regRes = await githubFetch(
      `${GITHUB_API}/repos/BigFatDot/BigStarter/contents/registry.json`
    )
    if (!regRes.ok) return []
    const regFile = await regRes.json() as GitHubContentFile
    const registry = JSON.parse(decodeBase64(regFile.content)) as Registry
    const entries = registry.projects ?? []

    // 2. Récupérer les métadonnées de chaque projet
    const projects = await Promise.allSettled(
      entries.map(async ({ owner, repo: repoName }) => {
        const full_name = `${owner}/${repoName}`
        const project = await getProject(owner, repoName)
        if (!project) return null
        // Get repo metadata for stars/updatedAt
        let stargazers_count = 0
        let updated_at = new Date().toISOString()
        try {
          const repoRes = await githubFetch(`${GITHUB_API}/repos/${full_name}`)
          if (repoRes.ok) {
            const rd = await repoRes.json() as { stargazers_count: number; updated_at: string }
            stargazers_count = rd.stargazers_count
            updated_at = rd.updated_at
          }
        } catch { /* use defaults */ }
        return {
          ...project,
          stars: stargazers_count,
          updatedAt: updated_at,
          owner: owner,
          repo: repoName,
          // full_name used only for deduplication
          _full_name: full_name,
        }
      })
    )

    const seen = new Set<string>()
    const result: BigStarterProject[] = []
    for (const settled of projects) {
      if (settled.status !== 'fulfilled' || !settled.value) continue
      const { _full_name, ...p } = settled.value
      if (seen.has(_full_name)) continue
      seen.add(_full_name)
      result.push(p)
    }
    return result
  } catch {
    return []
  }
}

// Lit les metadonnees d'un projet depuis son kap.json
export async function getProject(owner: string, repo: string): Promise<BigStarterProject | null> {
  try {
    const res = await githubFetch(
      `${GITHUB_API}/repos/${owner}/${repo}/contents/.kap/kap.json`
    )
    if (!res.ok) return null

    const file = await res.json() as GitHubContentFile
    if (file.encoding !== 'base64') return null

    const raw = decodeBase64(file.content)
    const kap = JSON.parse(raw) as KapJson

    // Fetch repo metadata for stars/updatedAt
    const repoRes = await githubFetch(`${GITHUB_API}/repos/${owner}/${repo}`)
    const repoData = repoRes.ok
      ? await repoRes.json() as { stargazers_count: number; updated_at: string }
      : { stargazers_count: 0, updated_at: new Date().toISOString() }

    return {
      owner,
      repo,
      name: kap.name ?? repo,
      pitch: kap.pitch ?? '',
      tags: kap.tags ?? [],
      stars: repoData.stargazers_count,
      updatedAt: repoData.updated_at,
    }
  } catch {
    return null
  }
}

// Lit les updates depuis .kap/updates/ du repo
export async function getProjectUpdates(owner: string, repo: string): Promise<ProjectUpdate[]> {
  try {
    const res = await githubFetch(
      `${GITHUB_API}/repos/${owner}/${repo}/contents/.kap/updates`
    )
    if (!res.ok) return []

    const files = await res.json() as Array<{ name: string; download_url: string | null; type: string }>
    const mdFiles = files.filter((f) => f.type === 'file' && f.name.endsWith('.md'))

    const updates = await Promise.allSettled(
      mdFiles.map(async (f) => {
        const fileRes = await githubFetch(
          `${GITHUB_API}/repos/${owner}/${repo}/contents/.kap/updates/${f.name}`
        )
        if (!fileRes.ok) return null
        const file = await fileRes.json() as GitHubContentFile
        if (file.encoding !== 'base64') return null
        const raw = decodeBase64(file.content)
        const fm = parseFrontmatter(raw)
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

    return updates
      .filter((r): r is PromiseFulfilledResult<ProjectUpdate> => r.status === 'fulfilled' && r.value !== null)
      .map((r) => r.value)
      .sort((a, b) => b.date.localeCompare(a.date))
  } catch {
    return []
  }
}

// Lit les decisions depuis .kap/decisions/ du repo
export async function getProjectDecisions(owner: string, repo: string): Promise<ProjectDecision[]> {
  try {
    const res = await githubFetch(
      `${GITHUB_API}/repos/${owner}/${repo}/contents/.kap/decisions`
    )
    if (!res.ok) return []

    const files = await res.json() as Array<{ name: string; type: string }>
    const mdFiles = files.filter((f) => f.type === 'file' && f.name.endsWith('.md'))

    const decisions = await Promise.allSettled(
      mdFiles.map(async (f) => {
        const fileRes = await githubFetch(
          `${GITHUB_API}/repos/${owner}/${repo}/contents/.kap/decisions/${f.name}`
        )
        if (!fileRes.ok) return null
        const file = await fileRes.json() as GitHubContentFile
        if (file.encoding !== 'base64') return null
        const raw = decodeBase64(file.content)
        const fm = parseFrontmatter(raw)
        return {
          title: fm['title'] ?? f.name.replace(/\.md$/, ''),
          domain: fm['domain'] ?? 'general',
          confidence: Number(fm['confidence'] ?? 0.5),
        } satisfies ProjectDecision
      })
    )

    return decisions
      .filter((r): r is PromiseFulfilledResult<ProjectDecision> => r.status === 'fulfilled' && r.value !== null)
      .map((r) => r.value)
  } catch {
    return []
  }
}

// Lit les signaux communautaires depuis les GitHub Issues avec label kap-signal
export async function getProjectSignals(owner: string, repo: string): Promise<ProjectSignal[]> {
  try {
    const res = await githubFetch(
      `${GITHUB_API}/repos/${owner}/${repo}/issues?labels=kap-signal&state=open&per_page=20`
    )
    if (!res.ok) return []

    const issues = await res.json() as GitHubIssue[]
    return issues.map((issue) => ({
      title: issue.title,
      votes: issue.reactions['+1'] ?? 0,
      url: issue.html_url,
    }))
  } catch {
    return []
  }
}
