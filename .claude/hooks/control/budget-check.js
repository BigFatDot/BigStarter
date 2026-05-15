#!/usr/bin/env node
/**
 * CONTROL — Budget check.
 *
 * PreToolUse : vérifie que la session n'a pas dépassé le budget estimé.
 * Le coût est estimé depuis l'audit log (tokens in/out × tarif).
 *
 * Paramètres (env) :
 *   KAP_SESSION_BUDGET_USD — budget max par session (default: 2.00)
 */

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const STATE_FILE   = join(PROJECT_ROOT, '.kap', 'session-state.json')
const MAX_USD      = Number(process.env.KAP_SESSION_BUDGET_USD ?? 2.00)

let raw = ''
process.stdin.on('data', c => raw += c)
process.stdin.on('end', () => {
  try {
    const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
    const cost = state.cost_usd ?? 0

    if (cost >= MAX_USD) {
      process.stderr.write(
        `[kap-budget] SESSION BUDGET EXCEEDED: $${cost.toFixed(4)} >= $${MAX_USD}\n` +
        `Tool call blocked. Call kap_escalate_to_admin or restart session.\n`
      )
      process.exit(2)
    }

    if (cost >= MAX_USD * 0.8) {
      process.stderr.write(
        `[kap-budget] WARNING: $${cost.toFixed(4)} / $${MAX_USD} (${Math.round(cost / MAX_USD * 100)}%)\n`
      )
    }
  } catch { /* first call, no state yet */ }
  process.exit(0)
})
