#!/usr/bin/env node
/**
 * kap hook <event> — called by git hooks installed by `kap init`
 * Never throws — a failing hook must never block a git commit.
 */

import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

interface KAPConfig {
  projectId: string
  apiUrl: string
  transparency: { level: string; excludePatterns: string[] }
}

const event = process.argv[2]
const cwd   = process.cwd()

function loadConfig(): KAPConfig | null {
  const p = join(cwd, 'kap.config.json')
  if (!existsSync(p)) return null
  try { return JSON.parse(readFileSync(p, 'utf8')) as KAPConfig } catch { return null }
}

async function send(config: KAPConfig, type: string, payload: unknown): Promise<void> {
  const token = process.env['KAP_API_TOKEN']
  if (!token) return
  await fetch(`${config.apiUrl}/api/v1/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ projectId: config.projectId, type, payload }),
  })
}

async function run(): Promise<void> {
  const config = loadConfig()
  if (!config) return

  if (event === 'post-commit') {
    const hash    = execSync('git rev-parse HEAD').toString().trim()
    const message = execSync('git log -1 --pretty=%s').toString().trim()
    const author  = execSync('git log -1 --pretty=%ae').toString().trim()
    const files   = execSync('git diff-tree --no-commit-id -r --name-only HEAD')
                      .toString().trim().split('\n').filter(Boolean)

    const exclude: string[] = config.transparency.excludePatterns ?? []
    const filtered = files.filter((f: string) =>
      !exclude.some((p: string) =>
        new RegExp(p.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')).test(f),
      ),
    )

    await send(config, 'commit', { hash, message, author, filesChanged: filtered, ts: new Date().toISOString() })
  }

  if (event === 'post-push') {
    const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim()
    await send(config, 'push', { branch, ts: new Date().toISOString() })
  }
}

run().catch(() => {})  // never block git operations
