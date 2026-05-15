/**
 * In-memory project registry for MVP.
 * Holds active KuzuPKGService instances keyed by projectId.
 * Replace with Supabase persistence in v0.2.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { KuzuPKGService } from './pkg/kuzu-pkg-service.js'
import pg from 'pg'

// Lazy PostgreSQL pool — syncs projects to DB for FK consistency
let _pgPool: pg.Pool | null = null
function getPgPool(): pg.Pool | null {
  if (_pgPool) return _pgPool
  const url = process.env['DATABASE_URL']
  if (!url) return null
  _pgPool = new pg.Pool({ connectionString: url })
  return _pgPool
}

export interface Project {
  id: string
  adminId: string
  name: string
  pitch: string
  apiToken: string
  createdAt: Date
}

const projects  = new Map<string, Project>()
const pkgStore  = new Map<string, KuzuPKGService>()
const DATA_DIR  = './data'

function makeToken(projectId: string): string {
  return `kap_${projectId}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
}

export function getProject(projectId: string): Project | undefined {
  return projects.get(projectId)
}

export function getProjectByToken(token: string): Project | undefined {
  for (const p of projects.values()) {
    if (p.apiToken === token) return p
  }
  return undefined
}

export async function createProject(
  adminId: string,
  name: string,
  pitch: string,
): Promise<{ project: Project; pkg: KuzuPKGService }> {
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  const apiToken = makeToken(id)

  mkdirSync(DATA_DIR, { recursive: true })
  const pkg = await KuzuPKGService.create(join(DATA_DIR, `${id}.db`))

  const project: Project = { id, adminId, name, pitch, apiToken, createdAt: new Date() }
  projects.set(id, project)
  pkgStore.set(id, pkg)

  // Sync to PostgreSQL for FK consistency (worker needs project row to insert updates)
  const pool = getPgPool()
  if (pool) {
    await pool.query(
      `INSERT INTO projects (id, admin_id, name, pitch, api_token, created_at)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
      [id, adminId, name, pitch, apiToken, project.createdAt],
    ).catch(e => console.error('[store] pg sync failed:', e.message))
  }

  return { project, pkg }
}

export function getPKG(projectId: string): KuzuPKGService | undefined {
  return pkgStore.get(projectId)
}

/** Auth middleware helper — returns project or null */
export function authProject(authHeader: string | undefined): Project | null {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  return getProjectByToken(token) ?? null
}
