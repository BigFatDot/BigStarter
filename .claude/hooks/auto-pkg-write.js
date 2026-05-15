#!/usr/bin/env node
/**
 * Hook PostToolUse — Edit|Write
 * Enregistre automatiquement dans le PKG quand l'agent modifie
 * un fichier d'architecture ou de configuration significatif.
 *
 * Ne gère pas tous les fichiers — uniquement les fichiers "structurants"
 * selon des patterns configurables.
 */

const STRUCTURAL_PATTERNS = [
  // Architecture
  /ARCHITECTURE\.md$/i,
  /CONCEPT\.md$/i,
  /DEPLOYMENT\.md$/i,
  // Config applicative
  /\.config\.(ts|js|json)$/,
  /docker-compose/i,
  /Dockerfile/i,
  /Caddyfile/i,
  // Schémas
  /schema\.(ts|prisma|sql)$/i,
  /migrations?\/.*\.sql$/,
  // Types partagés (packages/*/src/types.ts ou index.ts)
  /packages\/\w+\/src\/(types|schema|index)\.ts$/,
]

let raw = ''
process.stdin.on('data', chunk => raw += chunk)
process.stdin.on('end', async () => {
  try {
    const input = JSON.parse(raw)
    const filePath = input?.tool_input?.file_path
      ?? input?.tool_input?.path
      ?? ''

    const isStructural = STRUCTURAL_PATTERNS.some(p => p.test(filePath))
    if (!isStructural) return process.exit(0)

    const logEntry = {
      event: 'structural_file_modified',
      file: filePath,
      ts: new Date().toISOString(),
      session_id: input?.session_id ?? 'unknown',
    }

    // Mode local : log vers stderr (visible dans Claude Code)
    // Le signal est disponible pour l'agent s'il regarde ses logs
    process.stderr.write(`[kap-auto-pkg] Structural file modified: ${filePath}\n`)
    process.stderr.write(`[kap-auto-pkg] Consider calling kap_pkg_write to record this decision.\n`)

    // Mode remote : envoyer signal au backend
    const kapApiUrl = process.env.KAP_API_URL
    if (kapApiUrl && kapApiUrl !== 'local') {
      const token = process.env.KAP_API_TOKEN ?? ''
      await fetch(`${kapApiUrl}/api/v1/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          projectId: process.env.KAP_PROJECT_ID ?? 'kap-platform',
          type: 'structural_edit',
          payload: logEntry,
        }),
      }).catch(() => {})
    }

    // Injecter un rappel dans le contexte Claude
    // (additionalContext est disponible dans les hooks command)
    const output = {
      hookSpecificOutput: {
        additionalContext: `[KAP] Structural file modified: ${filePath}. If this represents an architectural decision, call kap_pkg_write to record it in the project knowledge graph.`,
      },
    }
    process.stdout.write(JSON.stringify(output))
    process.exit(0)
  } catch {
    process.exit(0)
  }
})
