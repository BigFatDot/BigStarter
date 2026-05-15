#!/usr/bin/env node
/**
 * CONTROL — Error tracker (PostToolUseFailure).
 *
 * Incrémente le compteur d'erreurs consécutives.
 * Utilisé par le circuit-breaker pour décider de bloquer.
 * Logge aussi l'erreur dans l'audit trail.
 */

import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const STATE_FILE   = join(PROJECT_ROOT, '.kap', 'session-state.json')
const AUDIT_DIR    = join(PROJECT_ROOT, '.kap', 'audit')

function today() { return new Date().toISOString().slice(0, 10) }

let raw = ''
process.stdin.on('data', c => raw += c)
process.stdin.on('end', () => {
  try {
    const input     = JSON.parse(raw)
    const sessionId = input?.session_id ?? 'unknown'
    const tool      = input?.tool_name  ?? 'unknown'
    const error     = input?.error      ?? 'unknown error'

    // Mise à jour du state
    let state = { session_id: sessionId, seq: 0, errors: 0, last_error_ts: null, tool_calls: 0, cost_usd: 0, start_ts: new Date().toISOString() }
    try {
      const saved = JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
      // Réinitialiser si nouvelle session
      state = saved.session_id === sessionId
        ? saved
        : { ...state }  // fresh state for new session
    } catch { /* no state file yet */ }

    state.errors++
    state.last_error_ts = new Date().toISOString()
    writeFileSync(STATE_FILE, JSON.stringify(state))

    // Log dans l'audit trail
    mkdirSync(AUDIT_DIR, { recursive: true })
    appendFileSync(
      join(AUDIT_DIR, `${today()}.jsonl`),
      JSON.stringify({
        ts:         new Date().toISOString(),
        session_id: sessionId,
        type:       'error',
        tool,
        error:      String(error).slice(0, 300),
        consecutive_errors: state.errors,
        project_id: process.env.KAP_PROJECT_ID ?? 'unknown',
      }) + '\n',
    )

    process.stderr.write(`[kap-error-tracker] Error #${state.errors} on "${tool}": ${String(error).slice(0, 100)}\n`)
  } catch { /* never fail */ }
  process.exit(0)
})
