/**
 * Project context auto-detection.
 *
 * The MCP server starts in the project directory.
 * Instead of requiring GITHUB_OWNER + GITHUB_REPO + KAP_PROJECT_ID
 * in every project's .mcp.json, we auto-detect them from:
 *
 *   1. .kap/kap.json  (authoritative if present)
 *   2. git remote     (parse owner/repo from origin URL)
 *   3. env vars       (explicit override always wins)
 *   4. directory name (last resort project_id)
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { execSync } from 'node:child_process'

export interface ProjectContext {
  projectId:  string
  owner:      string | null
  repo:       string | null
  name:       string
  pitch:      string
  dataDir:    string
  githubToken: string | null
}

interface KapJson {
  name?:   string
  pitch?:  string
  owner?:  string
  repo?:   string
  version?: string
}

function readKapJson(cwd: string): KapJson | null {
  const path = join(cwd, '.kap', 'kap.json')
  if (!existsSync(path)) return null
  try { return JSON.parse(readFileSync(path, 'utf8')) as KapJson } catch { return null }
}

function parseGitRemote(cwd: string): { owner: string; repo: string } | null {
  try {
    const url = execSync('git remote get-url origin 2>/dev/null', { cwd, timeout: 3000 })
      .toString().trim()
    // https://github.com/owner/repo.git or git@github.com:owner/repo.git
    const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/)
    if (match && match[1] && match[2]) {
      return { owner: match[1], repo: match[2] }
    }
  } catch { /* not a git repo or no remote */ }
  return null
}

export function detectProjectContext(cwd: string = process.cwd()): ProjectContext {
  const kapJson   = readKapJson(cwd)
  const gitRemote = parseGitRemote(cwd)

  // Owner + repo: env vars win, then kap.json, then git remote
  const owner = process.env['GITHUB_OWNER']
    ?? kapJson?.owner
    ?? gitRemote?.owner
    ?? null

  const repo = process.env['GITHUB_REPO']
    ?? kapJson?.repo
    ?? gitRemote?.repo
    ?? null

  // Project ID: env var, then owner/repo, then directory name
  const projectId = process.env['KAP_PROJECT_ID']
    ?? (owner && repo ? `${owner}/${repo}` : null)
    ?? basename(cwd)

  const name    = kapJson?.name  ?? repo ?? basename(cwd)
  const pitch   = kapJson?.pitch ?? ''
  const dataDir = process.env['KAP_DATA_DIR'] ?? join(cwd, '.kap')

  const githubToken = process.env['GITHUB_TOKEN']
    ?? process.env['GITHUB_APP_TOKEN']
    ?? null

  return { projectId, owner, repo, name, pitch, dataDir, githubToken }
}

/** Singleton — detected once at startup */
let _ctx: ProjectContext | null = null

export function getProjectContext(): ProjectContext {
  if (!_ctx) _ctx = detectProjectContext()
  return _ctx
}
