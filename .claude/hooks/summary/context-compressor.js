#!/usr/bin/env node
/**
 * SUMMARY — Context compressor (PreCompact).
 *
 * Déclenché avant que Claude Code compresse le contexte de la session.
 * Sauvegarde l'essentiel dans le PKG avant que ça disparaisse :
 * - Ce qui a été décidé
 * - Ce qui a été implémenté
 * - Ce qui était en cours
 *
 * Cela permet à la prochaine session de récupérer ce contexte
 * via kap_pkg_build_context, même après une compression.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT  = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const STATE_FILE    = join(PROJECT_ROOT, '.kap', 'session-state.json')
const COMPRESS_DIR  = join(PROJECT_ROOT, '.kap', 'compressions')

let raw = ''
process.stdin.on('data', c => raw += c)
process.stdin.on('end', async () => {
  try {
    const input          = JSON.parse(raw)
    const transcriptPath = input?.transcript_path
    const sessionId      = input?.session_id ?? 'unknown'

    // Lire le transcript pour extraire l'essentiel
    let decisions = []
    let implementations = []
    let pending = []

    if (transcriptPath) {
      try {
        const lines = readFileSync(transcriptPath, 'utf-8')
          .split('\n').filter(l => l.trim())

        for (const line of lines) {
          try {
            const msg = JSON.parse(line)
            const tool = msg?.tool_name ?? ''
            const inp  = msg?.tool_input ?? {}

            if (tool === 'mcp__kap__kap_pkg_write' && inp.node_type === 'decision') {
              decisions.push(inp.title ?? inp.description ?? '?')
            }
            if ((tool === 'Edit' || tool === 'Write') && inp.file_path) {
              implementations.push(inp.file_path)
            }
            if (tool === 'mcp__kap__kap_escalate_to_admin') {
              pending.push(inp.title ?? '?')
            }
          } catch { /* skip */ }
        }
      } catch { /* transcript not readable */ }
    }

    // Créer un checkpoint
    const checkpoint = {
      session_id:       sessionId,
      compressed_at:    new Date().toISOString(),
      decisions_made:   decisions.slice(-10),
      files_modified:   [...new Set(implementations)].slice(-20),
      pending_escalations: pending,
    }

    mkdirSync(COMPRESS_DIR, { recursive: true })
    writeFileSync(
      join(COMPRESS_DIR, `${sessionId}.json`),
      JSON.stringify(checkpoint, null, 2),
    )

    process.stderr.write(`[kap-compress] Context checkpoint saved: ${decisions.length} decisions, ${implementations.length} files\n`)

    // Injecter un résumé dans le nouveau contexte post-compression
    const summary = [
      `[KAP Session Checkpoint — context was compressed]`,
      decisions.length > 0 ? `Decisions made: ${decisions.join(', ')}` : '',
      implementations.length > 0 ? `Files modified: ${[...new Set(implementations)].slice(-5).join(', ')}` : '',
      pending.length > 0 ? `Pending escalations: ${pending.join(', ')}` : '',
      `Run kap_pkg_build_context to restore full project context.`,
    ].filter(Boolean).join('\n')

    const output = {
      hookSpecificOutput: { additionalContext: summary },
    }
    process.stdout.write(JSON.stringify(output))
    process.exit(0)
  } catch {
    process.exit(0)
  }
})
