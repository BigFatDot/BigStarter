#!/usr/bin/env node
/**
 * VALIDATION — Auto test runner.
 *
 * PostToolUse(Edit|Write) : si l'agent modifie un fichier TypeScript source,
 * déclenche un typecheck rapide. Si erreurs → injecte les erreurs dans le contexte.
 *
 * Ce hook agit comme un CI local instantané :
 * l'agent voit les erreurs immédiatement sans avoir à lancer les tests lui-même.
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

// Fichiers qui déclenchent le typecheck
const TS_PATTERN = /\.(ts|tsx)$/
// Fichiers qui déclenchent les tests
const TEST_TRIGGER_PATTERN = /\/(routes|agents|orchestrator|pkg)\//

let raw = ''
process.stdin.on('data', c => raw += c)
process.stdin.on('end', async () => {
  try {
    const input    = JSON.parse(raw)
    const filePath = input?.tool_input?.file_path ?? input?.tool_input?.path ?? ''

    if (!TS_PATTERN.test(filePath)) return process.exit(0)

    // Déterminer quel package vérifier
    const pkgMatch = filePath.match(/packages\/(\w+)\/src/)
      ?? filePath.match(/apps\/(\w+)\/src/)
    if (!pkgMatch) return process.exit(0)

    const pkgName  = pkgMatch[1]
    const tscPath  = join(PROJECT_ROOT, 'packages', pkgName, 'tsconfig.json')
    const appPath  = join(PROJECT_ROOT, 'apps', pkgName, 'tsconfig.json')
    const tscConf  = existsSync(tscPath) ? tscPath : existsSync(appPath) ? appPath : null

    if (!tscConf) return process.exit(0)

    let typecheckResult = '✓ typecheck passed'
    let hasErrors = false

    try {
      execSync(`npx tsc -p "${tscConf}" --noEmit 2>&1`, {
        cwd: PROJECT_ROOT,
        timeout: 20_000,
        stdio: 'pipe',
      })
    } catch (e) {
      const output = e.stdout?.toString() ?? e.stderr?.toString() ?? 'unknown error'
      typecheckResult = `✗ typecheck failed:\n${output.slice(0, 800)}`
      hasErrors = true
    }

    if (hasErrors) {
      // Injecter les erreurs dans le contexte Claude — l'agent les voit et les corrige
      const ctx = {
        hookSpecificOutput: {
          additionalContext:
            `[KAP TypeCheck] After editing ${filePath}:\n${typecheckResult}\n` +
            `Fix these errors before proceeding.`,
        },
      }
      process.stdout.write(JSON.stringify(ctx))
      return process.exit(0)
    }

    // Si le fichier est dans une zone testée, suggérer de lancer les tests
    if (TEST_TRIGGER_PATTERN.test(filePath)) {
      const ctx = {
        hookSpecificOutput: {
          additionalContext:
            `[KAP TypeCheck] ${typecheckResult} on ${pkgName}. ` +
            `Consider running the test suite: npm test --workspace=${pkgName}`,
        },
      }
      process.stdout.write(JSON.stringify(ctx))
    }

    process.exit(0)
  } catch {
    process.exit(0)
  }
})
