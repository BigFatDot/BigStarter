#!/usr/bin/env node
/**
 * bigstarter init — onboarding CLI
 * Creates .kap/kap.json, .mcp.json (gitignored), and .github/workflows/bigstarter-reporter.yml
 *
 * Usage: npx bigstarter init
 */

import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as readline from 'node:readline/promises'

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

async function prompt(q: string, fallback = ''): Promise<string> {
  const answer = (await rl.question(q)).trim()
  return answer || fallback
}

async function main(): Promise<void> {
  const cwd = process.cwd()

  console.log('\n🚀 BigStarter — Connect your project\n')
  console.log('This will create 3 files in your project:')
  console.log('  .kap/kap.json          — project metadata (committed)')
  console.log('  .mcp.json              — MCP server config (gitignored, has token)')
  console.log('  .github/workflows/     — auto-reporter on push/PR/release\n')

  // Detect GitHub info from git remote
  let detectedOwner = ''
  let detectedRepo  = ''
  try {
    const remote = await import('node:child_process')
      .then(m => m.execSync('git remote get-url origin 2>/dev/null').toString().trim())
    const match = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)/)
    if (match) { detectedOwner = match[1] ?? ''; detectedRepo = match[2] ?? '' }
  } catch { /* no git or no remote */ }

  const name    = await prompt('Project name: ')
  const pitch   = await prompt('One-line pitch: ')
  const owner   = await prompt(`GitHub owner [${detectedOwner}]: `, detectedOwner)
  const repo    = await prompt(`GitHub repo  [${detectedRepo}]: `, detectedRepo)
  const tags    = await prompt('Tags (comma-separated, e.g. saas,ai): ')
  const token   = await prompt('GitHub token (ghp_xxx, stored in .mcp.json only): ')

  rl.close()

  // ── 1. .kap/kap.json ──────────────────────────────────────────
  mkdirSync(join(cwd, '.kap', 'updates'),   { recursive: true })
  mkdirSync(join(cwd, '.kap', 'decisions'), { recursive: true })

  writeFileSync(
    join(cwd, '.kap', 'kap.json'),
    JSON.stringify({
      name,
      pitch,
      owner,
      repo,
      visibility: 'public',
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      autonomy_level: 1,
      version: '0.1.0',
    }, null, 2) + '\n',
  )
  console.log('\n✓ .kap/kap.json created')

  // ── 2. .mcp.json (gitignored) ─────────────────────────────────
  const mcpServerPath = join(cwd, 'node_modules', '@bigstarter', 'mcp-server', 'dist', 'index.js')
  const useFallback   = !existsSync(mcpServerPath)

  writeFileSync(
    join(cwd, '.mcp.json'),
    JSON.stringify({
      mcpServers: {
        bigstarter: {
          command: 'node',
          args: [useFallback
            ? 'node_modules/bigstarter/dist/index.js'
            : mcpServerPath,
          ],
          env: {
            KAP_API_URL:    'local',
            KAP_PROJECT_ID: `${owner}/${repo}`,
            KAP_DATA_DIR:   './.kap',
            GITHUB_TOKEN:   token,
            GITHUB_OWNER:   owner,
            GITHUB_REPO:    repo,
          },
        },
      },
    }, null, 2) + '\n',
  )
  console.log('✓ .mcp.json created')

  // ── 3. .gitignore — add .mcp.json if not already there ────────
  const gitignorePath = join(cwd, '.gitignore')
  const gitignore = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : ''
  if (!gitignore.includes('.mcp.json')) {
    writeFileSync(gitignorePath, gitignore + '\n# BigStarter — local config with token\n.mcp.json\n')
    console.log('✓ .mcp.json added to .gitignore')
  }

  // ── 4. GitHub Actions workflow ─────────────────────────────────
  mkdirSync(join(cwd, '.github', 'workflows'), { recursive: true })
  const workflowPath = join(cwd, '.github', 'workflows', 'bigstarter-reporter.yml')
  if (!existsSync(workflowPath)) {
    writeFileSync(workflowPath, `name: BigStarter Reporter

on:
  push:
    branches: [main]
    paths-ignore: ['.kap/updates/**']
  pull_request:
    types: [closed]
  release:
    types: [published]

jobs:
  report:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npx bigstarter report
        env:
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`)
    console.log('✓ .github/workflows/bigstarter-reporter.yml created')
  }

  // ── 5. Register on BigStarter — open PR on registry ──────────────
  console.log('\nRegistering on BigStarter platform...')
  let registered = false
  try {
    // Dynamically import octokit to avoid hard dependency
    const { Octokit } = await import('@octokit/rest' as string)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const octokit = new (Octokit as any)({ auth: token })

    const REGISTRY_OWNER = 'BigFatDot'
    const REGISTRY_REPO  = 'BigStarter'

    // 1. Fork BigFatDot/BigStarter (idempotent — safe to call multiple times)
    await octokit.repos.createFork({ owner: REGISTRY_OWNER, repo: REGISTRY_REPO })
      .catch(() => { /* already forked is fine */ })

    // Poll until fork is ready (up to 30s) instead of arbitrary timeout
    let forkFile = null
    for (let attempt = 0; attempt < 6; attempt++) {
      await new Promise(r => setTimeout(r, attempt === 0 ? 2000 : 5000))
      forkFile = await octokit.repos.getContent({
        owner, repo: REGISTRY_REPO, path: 'registry.json',
      }).catch(() => null)
      if (forkFile) break
    }

    // Always read from upstream as authoritative source for registry content
    const sourceFile = await octokit.repos.getContent({
      owner: REGISTRY_OWNER, repo: REGISTRY_REPO, path: 'registry.json',
    })

    const fileData = sourceFile.data as { content: string; sha: string }
    const registry = JSON.parse(Buffer.from(fileData.content.replace(/\n/g, ''), 'base64').toString()) as {
      projects: Array<{ owner: string; repo: string }>
    }

    // Check not already registered
    const alreadyIn = registry.projects.some(p => p.owner === owner && p.repo === repo)
    if (!alreadyIn) {
      registry.projects.push({ owner, repo })

      // 3. Update registry.json in user's fork
      await octokit.repos.createOrUpdateFileContents({
        owner, repo: REGISTRY_REPO,
        path: 'registry.json',
        message: `feat: add ${owner}/${repo} to BigStarter`,
        content: Buffer.from(JSON.stringify(registry, null, 2) + '\n').toString('base64'),
        sha: fileData.sha,
      })

      // 4. Create PR to BigFatDot/BigStarter
      await octokit.pulls.create({
        owner: REGISTRY_OWNER, repo: REGISTRY_REPO,
        title: `Add ${name} (${owner}/${repo})`,
        head: `${owner}:main`,
        base: 'main',
        body: `## New BigStarter project\n\n**${name}**\n${pitch}\n\nhttps://github.com/${owner}/${repo}`,
      })

      console.log(`✓ PR opened on BigFatDot/BigStarter to register your project`)
      console.log(`  github.com/${REGISTRY_OWNER}/${REGISTRY_REPO}/pulls`)
      registered = true
    } else {
      console.log('✓ Project already registered on BigStarter')
      registered = true
    }
  } catch (err) {
    console.warn(`  Could not auto-register (${(err as Error).message?.slice(0, 60)})`)
    console.warn('  → Open a PR manually: github.com/BigFatDot/BigStarter')
  }

  console.log(`
✅ BigStarter connected!

What was done:
  • .kap/kap.json          — project metadata
  • .mcp.json              — MCP server config (gitignored, has token)
  • .github/workflows/     — auto-reporter on push/PR/release
  ${registered ? '• PR opened on BigFatDot/BigStarter registry' : '• Registration pending (open PR manually)'}

Next:
  1. git add .kap/kap.json .github/ && git commit -m "feat: add BigStarter" && git push
  2. Restart Claude Code → BigStarter MCP loads automatically
  3. /mcp__bigstarter__agent_setup builder

Your project page (live after PR merge):
  https://BigFatDot.github.io/BigStarter/projects/${owner}/${repo}
`)
}

main().catch(err => { console.error(err); process.exit(1) })
