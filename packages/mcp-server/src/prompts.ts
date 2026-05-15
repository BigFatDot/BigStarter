/**
 * MCP Prompts — templates d'instructions versionnés, accessibles via slash commands.
 *
 * Dans Claude Code, ces prompts deviennent des slash commands :
 *   /mcp__kap__agent_setup reporter
 *   /mcp__kap__sprint_plan "sprint 2"
 *   /mcp__kap__review_decision <decision_id>
 *
 * Spec MCP 2025-11-25 : prompts/list, prompts/get
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { getLocalPKG } from "./local-pkg.js"

function projectId(): string {
  return process.env["KAP_PROJECT_ID"] ?? "default"
}

export function registerPrompts(server: McpServer): void {

  // ----------------------------------------------------------------
  // agent_setup — prépare un agent pour une session de travail
  // Usage : /mcp__kap__agent_setup reporter
  // ----------------------------------------------------------------
  server.prompt(
    "agent_setup",
    "Génère les instructions de démarrage pour un agent KAP selon son rôle. Utiliser en début de session.",
    {
      agent_type: z.string().describe("Type d'agent : orchestrator | reporter | verifier | po | promoter | builder"),
    },
    async ({ agent_type }) => {
      const pkg = await getLocalPKG(projectId())
      const decisions = await pkg.getRecentDecisions(5)
      const signals = await pkg.getPendingSignals()

      const decisionSummary = decisions
        .map(d => `- ${d["d.title"]}: ${d["d.rationale"]}`)
        .join("\n")

      const signalSummary = signals
        .slice(0, 3)
        .map(s => `- [${s["s.signal_type"]}] ${s["s.content"]} (${s["s.votes"]} votes)`)
        .join("\n")

      const roleInstructions: Record<string, string> = {
        orchestrator: `Tu es l'Orchestrateur Agent du projet KAP.
Tu coordonnes les sous-agents (Reporter, Verifier, PO, Promoter, Builder).
Tu maintiens le plan projet et arbitres les priorités.
Tu escalades à l'Admin via kap_escalate_to_admin quand nécessaire.
Commence chaque session par kap_pkg_build_context pour récupérer ton contexte.`,

        reporter: `Tu es le Reporter Agent du projet KAP.
Tu traduis l'avancement technique en mises à jour lisibles pour la communauté.
Tu es honnête sur les retards et les dettes techniques.
Tu ne génères jamais de contenu trompeur. Tu publies uniquement ce qui est vérifié.`,

        verifier: `Tu es le Verifier Agent du projet KAP.
Tu évalues indépendamment les livraisons par rapport aux acceptance criteria.
Tu n'as AUCUN contexte sur le Builder qui a produit le code.
Tu juges uniquement le code contre les critères. Sois strict.`,

        po: `Tu es le Product Owner Agent du projet KAP.
Tu transformes les signaux communautaires en briefs actionnables.
Tu priorises par : financement × votes × alignement vision.
Tu identifies les conflits avec l'architecture existante.`,

        promoter: `Tu es le Promoter Agent du projet KAP.
Tu crées du contenu promotionnel authentique et spécifique.
Jamais de hype générique. Uniquement des faits réels et des progrès concrets.
Tu adaptes le ton par canal (Twitter bref, LinkedIn formel, HN technique).`,

        builder: `Tu es un Builder Agent du projet KAP.
Tu implémendes des features selon les acceptance criteria définis.
Commence chaque tâche par kap_pkg_build_context.
Enregistre chaque décision technique via kap_pkg_write.
Signale les blocages via kap_escalate_to_admin.`,
      }

      const instructions = roleInstructions[agent_type] ?? roleInstructions["builder"] ?? ""

      return {
        messages: [{
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `# Setup agent : ${agent_type}

${instructions}

## Contexte projet actuel

### Décisions récentes
${decisionSummary || "Aucune décision enregistrée."}

### Signaux communautaires en attente
${signalSummary || "Aucun signal en attente."}

## Outils MCP disponibles
- kap_pkg_build_context — contexte PKG pour une tâche
- kap_pkg_write — enregistrer une décision
- kap_pkg_query — chercher dans le PKG
- kap_report_event — signaler un événement
- kap_fetch_feedback — récupérer les signaux communautaires
- kap_escalate_to_admin — décision hors autonomie

Tu es prêt. Quelle est ta tâche ?`,
          },
        }],
      }
    },
  )

  // ----------------------------------------------------------------
  // sprint_plan — prépare un plan de sprint basé sur le backlog et les signaux
  // Usage : /mcp__kap__sprint_plan "sprint 2"
  // ----------------------------------------------------------------
  server.prompt(
    "sprint_plan",
    "Génère un plan de sprint structuré à partir du backlog et des signaux communautaires.",
    {
      sprint_name: z.string().describe("Nom ou numéro du sprint (ex: sprint 2, Q2-W3)"),
    },
    async ({ sprint_name }) => {
      const pkg = await getLocalPKG(projectId())
      const signals = await pkg.getPendingSignals()
      const decisions = await pkg.getRecentDecisions(3)

      return {
        messages: [{
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `# Plan de sprint : ${sprint_name}

## Signaux communautaires (top par financement)
${signals.slice(0, 5).map(s =>
  `- ${s["s.content"]} | votes: ${s["s.votes"]} | €${s["s.funding_amount"]}`
).join("\n") || "Aucun signal."}

## Décisions architecturales récentes à respecter
${decisions.map(d => `- ${d["d.title"]}: ${d["d.rationale"]}`).join("\n") || "Aucune."}

## Ta mission
1. Propose un objectif de sprint en une phrase
2. Liste 3-5 features à livrer, par priorité décroissante
3. Pour chaque feature : titre, description courte, acceptance criteria (testables), effort estimé en heures
4. Identifie les dépendances entre features
5. Identifie les risques et les points d'escalade potentiels

Format de sortie : JSON valide.`,
          },
        }],
      }
    },
  )

  // ----------------------------------------------------------------
  // review_decision — évalue une décision passée avec le recul actuel
  // Usage : /mcp__kap__review_decision
  // ----------------------------------------------------------------
  server.prompt(
    "review_decision",
    "Évalue une décision passée : tient-elle toujours ? Doit-elle être revisée ?",
    {
      decision_title: z.string().describe("Titre ou mots-clés de la décision à évaluer"),
    },
    async ({ decision_title }) => {
      const pkg = await getLocalPKG(projectId())
      const results = await pkg.searchNodes(decision_title)

      return {
        messages: [{
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `# Revue de décision : "${decision_title}"

## Nœuds PKG trouvés
${JSON.stringify(results, null, 2)}

## Questions à traiter
1. Cette décision tient-elle toujours compte du contexte actuel ?
2. Y a-t-il des signaux communautaires qui la remettent en question ?
3. Des alternatives rejetées à l'époque valent-elles d'être reconsidérées ?
4. Si elle doit être révisée : propose la nouvelle décision avec rationale.

Si la décision est toujours valide, dis-le clairement.
Si elle doit être révisée, enregistre la nouvelle via kap_pkg_write avec superseded_by.`,
          },
        }],
      }
    },
  )
}
