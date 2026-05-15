#!/usr/bin/env node
/**
 * Hook PostToolUse — mcp__kap__report_event
 * Déclenché après chaque appel réussi à kap_report_event.
 * Envoie une notification webhook vers la plateforme publique.
 *
 * En mode local, log uniquement.
 * En mode remote, POST vers le webhook de la plateforme.
 */

let raw = ''
process.stdin.on('data', chunk => raw += chunk)
process.stdin.on('end', async () => {
  try {
    const input  = JSON.parse(raw)
    const result = input?.tool_result

    const kapApiUrl = process.env.KAP_API_URL
    if (!kapApiUrl || kapApiUrl === 'local') {
      process.stderr.write(`[kap-notify] Event reported (local mode): ${JSON.stringify(result)?.slice(0, 100)}\n`)
      return process.exit(0)
    }

    const webhookUrl = process.env.KAP_PLATFORM_WEBHOOK_URL
    if (!webhookUrl) return process.exit(0)

    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-KAP-Secret': process.env.KAP_WEBHOOK_SECRET ?? '',
        'X-KAP-Project': process.env.KAP_PROJECT_ID ?? '',
      },
      body: JSON.stringify({
        event: 'report_event_fired',
        result,
        ts: new Date().toISOString(),
      }),
    }).catch(() => {})

    process.exit(0)
  } catch {
    process.exit(0)
  }
})
