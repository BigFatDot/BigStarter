/**
 * MCP Resources — expose le PKG comme données lisibles et navigables.
 *
 * Les Resources sont "application-controlled" : l'agent les inclut via @mention
 * plutôt que de faire un tool call actif.
 *
 * URIs exposées :
 *   kap://decisions          — décisions architecturales et techniques récentes
 *   kap://vision             — décisions fondatrices sprint 0/1 (vision projet)
 *   kap://constraints        — contraintes actives (hard et soft)
 *   kap://signals            — signaux communautaires non traités
 *   kap://artifacts          — historique des artifacts (commits, deploys, runs)
 *
 * Spec MCP 2025-11-25 : resources/list, resources/read, resources/subscribe
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { getLocalPKG } from "./local-pkg.js"

function projectId(): string {
  return process.env["KAP_PROJECT_ID"] ?? "default"
}

export function registerResources(server: McpServer): void {

  // ----------------------------------------------------------------
  // kap://decisions
  // ----------------------------------------------------------------
  server.resource(
    "kap-decisions",
    "kap://decisions",
    {
      description: "Décisions architecturales et techniques du projet, ordonnées par date (les plus récentes en premier). Inclure dans le contexte avant toute tâche d'implémentation.",
      mimeType: "application/json",
    },
    async (_uri) => {
      const pkg = await getLocalPKG(projectId())
      const decisions = await pkg.getRecentDecisions(20)
      return {
        contents: [{
          uri: "kap://decisions",
          mimeType: "application/json",
          text: JSON.stringify(decisions, null, 2),
        }],
      }
    },
  )

  // ----------------------------------------------------------------
  // kap://vision
  // ----------------------------------------------------------------
  server.resource(
    "kap-vision",
    "kap://vision",
    {
      description: "Vision fondatrice du projet — décisions sprint 0 et 1 à haute confiance. Lire avant toute décision architecturale ou de produit.",
      mimeType: "text/markdown",
    },
    async (_uri) => {
      const pkg = await getLocalPKG(projectId())
      const vision = await pkg.getProjectVision()

      const md = [
        "# Vision Projet\n",
        ...vision.map((d: Record<string, unknown>) => [
          `## ${String(d["d.title"] ?? "Décision")}`,
          `**Domaine :** ${String(d["d.domain"] ?? "-")} | **Confiance :** ${String(d["d.confidence"] ?? "-")}`,
          "",
          String(d["d.description"] ?? ""),
          "",
          `**Rationale :** ${String(d["d.rationale"] ?? "-")}`,
          "",
        ].join("\n")),
      ].join("\n")

      return {
        contents: [{
          uri: "kap://vision",
          mimeType: "text/markdown",
          text: md,
        }],
      }
    },
  )

  // ----------------------------------------------------------------
  // kap://signals
  // ----------------------------------------------------------------
  server.resource(
    "kap-signals",
    "kap://signals",
    {
      description: "Signaux communautaires non traités, ordonnés par financement puis votes. Consulter avant de planifier un sprint.",
      mimeType: "application/json",
    },
    async (_uri) => {
      const pkg = await getLocalPKG(projectId())
      const signals = await pkg.getPendingSignals()

      const summary = signals.map(s => ({
        id: s["s.id"],
        type: s["s.signal_type"],
        content: s["s.content"],
        votes: s["s.votes"],
        funding_eur: s["s.funding_amount"],
        source: s["s.source"],
        timestamp: s["s.timestamp"],
      }))

      return {
        contents: [{
          uri: "kap://signals",
          mimeType: "application/json",
          text: JSON.stringify({ total: summary.length, signals: summary }, null, 2),
        }],
      }
    },
  )

  // ----------------------------------------------------------------
  // kap://artifacts
  // ----------------------------------------------------------------
  server.resource(
    "kap-artifacts",
    "kap://artifacts",
    {
      description: "Historique des artifacts du projet : commits, deploys, test runs, proof bundles. Utile pour comprendre l'état récent du projet.",
      mimeType: "application/json",
    },
    async (_uri) => {
      const pkg = await getLocalPKG(projectId())
      const artifacts = await pkg.getArtifacts(30)

      return {
        contents: [{
          uri: "kap://artifacts",
          mimeType: "application/json",
          text: JSON.stringify(artifacts, null, 2),
        }],
      }
    },
  )
}

/**
 * Notifie le client qu'une resource a changé.
 * À appeler après chaque writeNode dans le PKG.
 */
export async function notifyResourceUpdated(
  server: McpServer,
  uri: string,
): Promise<void> {
  // MCP spec : notifications/resources/updated
  // McpServer expose sendResourceUpdated ou équivalent selon la version du SDK
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (server as any).server?.notification({
      method: "notifications/resources/updated",
      params: { uri },
    })
  } catch {
    // Notification optionnelle — ne pas bloquer si le client ne supporte pas
  }
}
