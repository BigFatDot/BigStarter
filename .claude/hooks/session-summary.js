#!/usr/bin/env node
/**
 * Hook Stop — fin de session Claude Code.
 * Lit le transcript, génère un résumé structuré,
 * l'enregistre dans le PKG et le log localement.
 *
 * Le transcript est un fichier JSONL avec tous les messages de la session.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..', '..')

let raw = ''
process.stdin.on('data', chunk => raw += chunk)
process.stdin.on('end', async () => {
  try {
    const input = JSON.parse(raw)
    const transcriptPath = input?.transcript_path
    const sessionId = input?.session_id ?? `session-${Date.now()}`

    // Parser le transcript
    let toolCalls = 0
    let bashCmds  = 0
    let filesEdited = 0
    let kapToolsCalled = 0
    let gitOps = 0

    if (transcriptPath) {
      try {
        const lines = readFileSync(transcriptPath, 'utf-8')
          .split('\n').filter(l => l.trim())

        for (const line of lines) {
          try {
            const msg = JSON.parse(line)
            const toolName = msg?.tool_name ?? msg?.name ?? ''
            if (toolName) toolCalls++
            if (toolName === 'Bash') {
              bashCmds++
              if (/git\s+(commit|push|merge)/.test(msg?.tool_input?.command ?? '')) gitOps++
            }
            if (toolName === 'Edit' || toolName === 'Write') filesEdited++
            if (toolName.startsWith('mcp__kap__')) kapToolsCalled++
          } catch { /* skip malformed line */ }
        }
      } catch { /* transcript not readable */ }
    }

    const summary = {
      session_id: sessionId,
      ts: new Date().toISOString(),
      tool_calls: toolCalls,
      bash_commands: bashCmds,
      git_operations: gitOps,
      files_edited: filesEdited,
      kap_tools_called: kapToolsCalled,
    }

    // Log local dans .kap/sessions/
    const sessionsDir = join(PROJECT_ROOT, '.kap', 'sessions')
    mkdirSync(sessionsDir, { recursive: true })
    writeFileSync(
      join(sessionsDir, `${sessionId}.json`),
      JSON.stringify(summary, null, 2),
    )

    process.stderr.write(`[kap-stop] Session summary: ${JSON.stringify(summary)}\n`)

    // Envoyer au backend si mode remote
    const kapApiUrl = process.env.KAP_API_URL
    if (kapApiUrl && kapApiUrl !== 'local') {
      const token = process.env.KAP_API_TOKEN ?? ''
      await fetch(`${kapApiUrl}/api/v1/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          projectId: process.env.KAP_PROJECT_ID ?? 'kap-platform',
          type: 'session_end',
          payload: summary,
        }),
      }).catch(() => {})
    }

    process.exit(0)
  } catch (err) {
    process.stderr.write(`[kap-stop] Error: ${err}\n`)
    process.exit(0)  // jamais bloquer
  }
})
