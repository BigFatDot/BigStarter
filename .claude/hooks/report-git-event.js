#!/usr/bin/env node
/**
 * Hook PostToolUse — Bash
 * Déclenche automatiquement kap_report_event quand l'agent fait
 * un git commit ou git push, sans que l'agent ait à y penser.
 */

let raw = ''
process.stdin.on('data', chunk => raw += chunk)
process.stdin.on('end', async () => {
  try {
    const input = JSON.parse(raw)
    const command = input?.tool_input?.command ?? ''

    // Filtrer uniquement les commits et push
    const isCommit = /git\s+commit/.test(command)
    const isPush   = /git\s+push/.test(command)
    if (!isCommit && !isPush) return process.exit(0)

    // Extraire des infos utiles du résultat
    const result = String(input?.tool_result ?? '')
    const hash = result.match(/\[[\w\s]+\s+([a-f0-9]{7,})\]/)?.[1] ?? ''
    const branch = result.match(/origin\/(\S+)/)?.[1] ?? 'unknown'

    // Appeler le serveur KAP MCP via HTTP (mode local = port 3000)
    // Si le serveur n'est pas up, le hook échoue silencieusement (async)
    const kapApiUrl = process.env.KAP_API_URL
    if (!kapApiUrl || kapApiUrl === 'local') {
      // Mode local : écrire dans le log de session
      const logLine = JSON.stringify({
        event: 'git_auto_report',
        type: isCommit ? 'commit' : 'push',
        hash,
        branch,
        command: command.slice(0, 120),
        ts: new Date().toISOString(),
      })
      process.stderr.write(`[kap-hook] ${logLine}\n`)
      return process.exit(0)
    }

    const token = process.env.KAP_API_TOKEN ?? ''
    const projectId = process.env.KAP_PROJECT_ID ?? 'kap-platform'

    await fetch(`${kapApiUrl}/api/v1/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        projectId,
        type: isCommit ? 'commit' : 'push',
        payload: { hash, branch, command: command.slice(0, 120) },
      }),
    }).catch(() => {})

    process.exit(0)
  } catch {
    process.exit(0)  // jamais bloquer l'agent
  }
})
