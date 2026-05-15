#!/usr/bin/env node
/**
 * VALIDATION — Conventional Commits enforcer.
 *
 * PreToolUse(Bash) : si l'agent fait un git commit avec un message
 * qui ne suit pas le format Conventional Commits, bloque et explique.
 *
 * Format attendu : type(scope?): description
 * Types valides : feat, fix, docs, style, refactor, test, chore, build, ci, perf
 *
 * Exemples valides :
 *   feat: add Kuzu PKGService
 *   fix(mcp): correct sampling fallback
 *   docs(arch): update deployment section
 */

const CONVENTIONAL_RE = /^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)(\(.+\))?: .{3,}/

let raw = ''
process.stdin.on('data', c => raw += c)
process.stdin.on('end', () => {
  try {
    const input   = JSON.parse(raw)
    const command = input?.tool_input?.command ?? ''

    if (!/git\s+commit/.test(command)) return process.exit(0)

    // Extraire le message du commit (-m "..." ou --message="...")
    const msgMatch = command.match(/-m\s+"([^"]+)"/)
      ?? command.match(/-m\s+'([^']+)'/)
      ?? command.match(/--message[= ]"([^"]+)"/)
    if (!msgMatch) return process.exit(0)

    const msg = msgMatch[1]

    if (!CONVENTIONAL_RE.test(msg)) {
      process.stderr.write(
        `[kap-convention] BLOCKED: commit message does not follow Conventional Commits.\n\n` +
        `Message: "${msg}"\n\n` +
        `Expected format: type(scope?): description\n` +
        `Valid types: feat, fix, docs, style, refactor, test, chore, build, ci, perf\n\n` +
        `Examples:\n` +
        `  feat: add sampling support to MCP server\n` +
        `  fix(pkg): correct Kuzu concurrent access guard\n` +
        `  refactor(orchestrator): extract budget wrapper\n`
      )
      process.exit(2)
    }

    process.exit(0)
  } catch {
    process.exit(0)
  }
})
