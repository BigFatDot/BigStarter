#!/usr/bin/env node
/**
 * Hook PreToolUse — Edit|Write
 * Protège les fichiers critiques selon la politique d'escalade KAP.
 * Bloque (exit 2) si un fichier protégé est modifié sans approbation.
 *
 * En mode local (pas de backend KAP), se contente de logger l'accès.
 * En mode remote, vérifie la politique d'escalade du projet.
 */

const PROTECTED_PATTERNS = [
  /\/auth\//,
  /\/payments?\//,
  /\/stripe/i,
  /migrations?\//,
  /\.env/,
  /secrets?\//,
]

let raw = ''
process.stdin.on('data', chunk => raw += chunk)
process.stdin.on('end', async () => {
  try {
    const input = JSON.parse(raw)
    const filePath = input?.tool_input?.file_path
      ?? input?.tool_input?.path
      ?? ''

    const isProtected = PROTECTED_PATTERNS.some(p => p.test(filePath))
    if (!isProtected) return process.exit(0)

    const kapApiUrl = process.env.KAP_API_URL
    const autonomyLevel = Number(process.env.KAP_AUTONOMY_LEVEL ?? '1')

    // Niveau 0 : bloquer toujours, demander à l'Admin
    if (autonomyLevel === 0) {
      process.stderr.write(
        `[kap-guard] BLOCKED: "${filePath}" is a protected file.\n` +
        `Autonomy level 0 — Admin approval required via kap_escalate_to_admin.\n`
      )
      process.exit(2)
    }

    // Niveau 1 : avertir mais laisser passer
    if (autonomyLevel === 1) {
      process.stderr.write(
        `[kap-guard] WARNING: Modifying protected file "${filePath}".\n` +
        `Remember to call kap_escalate_to_admin if this is an architectural change.\n`
      )
      return process.exit(0)
    }

    // Niveau 2+ : vérifier via API si available
    if (kapApiUrl && kapApiUrl !== 'local') {
      try {
        const token = process.env.KAP_API_TOKEN ?? ''
        const res = await fetch(
          `${kapApiUrl}/api/v1/projects/${process.env.KAP_PROJECT_ID}/policy/check`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ action: 'edit_file', target: filePath }),
          }
        )
        const data = await res.json().catch(() => ({ allowed: true }))
        if (!data.allowed) {
          process.stderr.write(`[kap-guard] Policy check denied: ${data.reason ?? 'no reason'}\n`)
          process.exit(2)
        }
      } catch {
        // API unreachable — laisser passer avec avertissement
        process.stderr.write(`[kap-guard] Policy API unreachable — proceeding with warning.\n`)
      }
    }

    process.exit(0)
  } catch {
    process.exit(0)
  }
})
