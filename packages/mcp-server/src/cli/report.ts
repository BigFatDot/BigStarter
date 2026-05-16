#!/usr/bin/env node
/**
 * bigstarter report — generate and publish a project update
 *
 * Called by: bigstarter-reporter.yml GitHub Actions workflow
 * Also usable manually: npx bigstarter report
 *
 * Flow:
 *   1. Read project context (.kap/kap.json + git remote)
 *   2. Build update content from recent git activity
 *   3. Generate editorial via Anthropic API (if key available) or template
 *   4. Commit to .kap/updates/ on GitHub
 *   5. Trigger BigStarter platform dispatch
 */

import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { detectProjectContext } from '../project-context.js'

const cwd = process.cwd()
const ctx = detectProjectContext(cwd)

// ── Gather git context ────────────────────────────────────────────

function git(cmd: string): string {
  try { return execSync(cmd, { cwd, timeout: 5000 }).toString().trim() } catch { return '' }
}

const eventType  = process.env['GITHUB_EVENT_NAME'] ?? 'custom'
const branch     = process.env['GITHUB_REF_NAME']   ?? git('git rev-parse --abbrev-ref HEAD')
const sha        = (process.env['GITHUB_SHA']        ?? git('git rev-parse HEAD')).slice(0, 7)
const repoFull   = process.env['GITHUB_REPOSITORY']  ?? `${ctx.owner}/${ctx.repo}`

// Last 3 commit messages for context
const recentCommits = git('git log -3 --oneline').split('\n').filter(Boolean)

// Read kap.json for project info
interface KapJson { name?: string; pitch?: string }
let kapJson: KapJson = {}
try {
  const raw = readFileSync(join(cwd, '.kap', 'kap.json'), 'utf8')
  kapJson = JSON.parse(raw) as KapJson
} catch { /* use defaults */ }

const projectName = kapJson.name ?? ctx.repo ?? 'Project'
const pitch       = kapJson.pitch ?? ''

// ── Generate editorial ────────────────────────────────────────────

async function generateEditorial(): Promise<string> {
  const context = [
    `Project: ${projectName}${pitch ? ` — ${pitch}` : ''}`,
    `Event: ${eventType} on ${branch}${sha ? ` (${sha})` : ''}`,
    `Recent commits:`,
    ...recentCommits.map(c => `  ${c}`),
  ].join('\n')

  // Use Anthropic API if key available
  const apiKey = process.env['ANTHROPIC_API_KEY']
  if (apiKey) {
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk' as string)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const claude = new (Anthropic as any)({ apiKey })
      const response = await claude.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 220,
        system: 'Write a 2-3 sentence honest project update. Specific, no hype, plain text, no markdown.',
        messages: [{ role: 'user', content: context }],
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const block = (response.content as any[]).find((b: any) => b.type === 'text')
      if (block?.text && block.text.length > 20) return block.text.trim()
    } catch { /* fall through to template */ }
  }

  // Template fallback — always works, no API needed
  const eventLabel: Record<string, string> = {
    push:          'New commits pushed',
    pull_request:  'Pull request merged',
    release:       'New release published',
    workflow_run:  'CI pipeline completed',
    custom:        'Update',
  }
  const label = eventLabel[eventType] ?? 'Update'
  const commitLine = recentCommits[0] ? ` Latest: ${recentCommits[0].replace(/^[a-f0-9]+ /, '')}` : ''
  return `${label} on ${projectName}.${commitLine}${recentCommits.length > 1 ? ` ${recentCommits.length} commits since last update.` : ''}`
}

// ── Commit update to GitHub ───────────────────────────────────────

async function commitUpdate(editorial: string): Promise<boolean> {
  const token = ctx.githubToken
  const owner = ctx.owner
  const repo  = ctx.repo
  if (!token || !owner || !repo) {
    console.log('[bigstarter] No GitHub credentials — writing locally only')
    return false
  }

  const date     = new Date().toISOString().slice(0, 10)
  const slug     = editorial.slice(0, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')
  const filename = `${date}-${slug}.md`
  const path     = `.kap/updates/${filename}`
  const content  = [
    '---',
    `title: "${editorial.slice(0, 80).replace(/"/g, "'")}"`,
    `summary: "${editorial.replace(/"/g, "'")}"`,
    `date: "${new Date().toISOString()}"`,
    `event_type: "${eventType}"`,
    `branch: "${branch}"`,
    `sha: "${sha}"`,
    '---',
    '',
    editorial,
    '',
  ].join('\n')

  try {
    const { Octokit } = await import('@octokit/rest' as string)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const octokit = new (Octokit as any)({ auth: token })

    // Check if file exists (get SHA for update)
    let sha_file: string | undefined
    try {
      const existing = await octokit.repos.getContent({ owner, repo, path })
      sha_file = (existing.data as { sha: string }).sha
    } catch { /* new file */ }

    await octokit.repos.createOrUpdateFileContents({
      owner, repo, path,
      message: `bigstarter: ${editorial.slice(0, 60)}`,
      content: Buffer.from(content).toString('base64'),
      ...(sha_file ? { sha: sha_file } : {}),
    })

    console.log(`[bigstarter] ✓ Update committed: ${path}`)

    // Trigger BigStarter platform rebuild
    try {
      await octokit.repos.createDispatchEvent({
        owner: 'BigFatDot',
        repo:  'BigStarter',
        event_type: 'project-updated',
        client_payload: { project: `${owner}/${repo}`, filename },
      })
      console.log('[bigstarter] ✓ Platform rebuild triggered')
    } catch { /* optional */ }

    return true
  } catch (err) {
    console.error('[bigstarter] GitHub commit failed:', (err as Error).message)
    return false
  }
}

// ── Also write locally (for local runs) ──────────────────────────

function writeLocally(editorial: string): void {
  const dir      = join(cwd, '.kap', 'updates')
  const date     = new Date().toISOString().slice(0, 10)
  const slug     = editorial.slice(0, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')
  const filename = `${date}-${slug}.md`
  mkdirSync(dir, { recursive: true })
  const content = `---\ntitle: "${editorial.slice(0, 80).replace(/"/g, "'")}"\nsummary: "${editorial.replace(/"/g, "'")}"\ndate: "${new Date().toISOString()}"\nevent_type: "${eventType}"\n---\n\n${editorial}\n`
  writeFileSync(join(dir, filename), content)
  console.log(`[bigstarter] ✓ Update saved locally: .kap/updates/${filename}`)
}

// ── Main ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`[bigstarter] report — ${repoFull} (${eventType} on ${branch})`)

  if (!existsSync(join(cwd, '.kap', 'kap.json'))) {
    console.error('[bigstarter] No .kap/kap.json found. Run: npx bigstarter init')
    process.exit(1)
  }

  const editorial = await generateEditorial()
  console.log(`[bigstarter] Generated: "${editorial.slice(0, 80)}..."`)

  const committed = await commitUpdate(editorial)
  if (!committed) writeLocally(editorial)
}

main().catch(err => { console.error(err); process.exit(1) })
