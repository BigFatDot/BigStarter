#!/usr/bin/env node
/**
 * AUDIT — Trace immuable de chaque tool call.
 *
 * Déclenché sur PostToolUse pour TOUS les tools.
 * Écrit une ligne JSONL dans .kap/audit/YYYY-MM-DD.jsonl
 * Jamais bloquant. Jamais en erreur visible.
 *
 * Format JSONL — une entrée par tool call :
 * {
 *   "ts":         "2026-05-14T18:00:00Z",
 *   "session_id": "abc123",
 *   "seq":        42,            // numéro séquentiel dans la session
 *   "tool":       "Bash",
 *   "input":      { ... },       // tronqué à 500 chars
 *   "output":     "...",         // tronqué à 500 chars
 *   "success":    true,
 *   "duration_ms": 234
 * }
 */

import { mkdirSync, appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const AUDIT_DIR    = join(PROJECT_ROOT, '.kap', 'audit')
const STATE_FILE   = join(PROJECT_ROOT, '.kap', 'session-state.json')

function today() {
  return new Date().toISOString().slice(0, 10)
}

function truncate(val, max = 500) {
  const s = typeof val === 'string' ? val : JSON.stringify(val)
  return s.length > max ? s.slice(0, max) + '…' : s
}

function getSeq(sessionId) {
  try {
    const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
    if (state.session_id !== sessionId) {
      const next = { session_id: sessionId, seq: 1, start_ts: new Date().toISOString(), tool_calls: 0, errors: 0, cost_usd: 0 }
      writeFileSync(STATE_FILE, JSON.stringify(next))
      return 1
    }
    state.seq++
    state.tool_calls++
    writeFileSync(STATE_FILE, JSON.stringify(state))
    return state.seq
  } catch {
    const init = { session_id: sessionId, seq: 1, start_ts: new Date().toISOString(), tool_calls: 1, errors: 0, cost_usd: 0 }
    writeFileSync(STATE_FILE, JSON.stringify(init))
    return 1
  }
}

let raw = ''
process.stdin.on('data', c => raw += c)
process.stdin.on('end', () => {
  try {
    const input      = JSON.parse(raw)
    const sessionId  = input?.session_id ?? 'unknown'
    const tool       = input?.tool_name  ?? 'unknown'
    const toolInput  = input?.tool_input ?? {}
    const toolResult = input?.tool_result
    const success    = input?.tool_result !== null && !input?.error

    const seq = getSeq(sessionId)

    const entry = {
      ts:         new Date().toISOString(),
      session_id: sessionId,
      seq,
      tool,
      input:      truncate(toolInput),
      output:     truncate(toolResult ?? ''),
      success,
      project_id: process.env.KAP_PROJECT_ID ?? 'unknown',
    }

    mkdirSync(AUDIT_DIR, { recursive: true })
    appendFileSync(
      join(AUDIT_DIR, `${today()}.jsonl`),
      JSON.stringify(entry) + '\n',
    )
  } catch { /* never fail */ }
  process.exit(0)
})
