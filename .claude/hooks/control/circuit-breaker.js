#!/usr/bin/env node
/**
 * CONTROL — Circuit breaker.
 *
 * PreToolUse : vérifie que l'agent n'est pas en spirale d'échecs.
 * Si trop d'erreurs consécutives → bloque et force une escalade.
 *
 * Paramètres (env) :
 *   KAP_CB_MAX_ERRORS     — seuil d'erreurs consécutives (default: 3)
 *   KAP_CB_WINDOW_MS      — fenêtre de temps en ms (default: 300000 = 5min)
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const STATE_FILE   = join(PROJECT_ROOT, '.kap', 'session-state.json')
const MAX_ERRORS   = Number(process.env.KAP_CB_MAX_ERRORS  ?? 3)
const WINDOW_MS    = Number(process.env.KAP_CB_WINDOW_MS   ?? 300_000)

let raw = ''
process.stdin.on('data', c => raw += c)
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw)
    const sessionId = input?.session_id ?? 'unknown'

    let state = { session_id: sessionId, seq: 0, errors: 0, last_error_ts: null, tool_calls: 0, cost_usd: 0, start_ts: new Date().toISOString() }
    try { state = JSON.parse(readFileSync(STATE_FILE, 'utf-8')) } catch { /* first run */ }

    if (state.session_id !== sessionId) return process.exit(0)

    // Vérifier si on est dans la fenêtre d'erreurs
    const now = Date.now()
    const lastErrorAge = state.last_error_ts
      ? now - new Date(state.last_error_ts).getTime()
      : Infinity

    // Si la dernière erreur date de plus de WINDOW_MS, réinitialiser le compteur
    if (lastErrorAge > WINDOW_MS) {
      state.errors = 0
      writeFileSync(STATE_FILE, JSON.stringify(state))
      return process.exit(0)
    }

    if (state.errors >= MAX_ERRORS) {
      process.stderr.write(
        `[kap-circuit-breaker] OPEN — ${state.errors} consecutive errors in ${Math.round(lastErrorAge / 1000)}s.\n` +
        `Agent is in a failure loop. Blocking next tool call.\n` +
        `Resolution: call kap_escalate_to_admin or restart the session.\n`
      )
      // Exit 2 bloque le tool call
      process.exit(2)
    }
  } catch { /* never fail hard */ }
  process.exit(0)
})
