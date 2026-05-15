/**
 * Sampling client — demande des completions LLM au client MCP (Claude Code).
 *
 * En mode local, le serveur KAP n'a pas besoin de clé Anthropic.
 * Les sous-agents délèguent les appels LLM au client via sampling/createMessage.
 * Le client (Claude Code) fait l'appel et retourne la réponse.
 *
 * Spec MCP 2025-11-25 : sampling/createMessage
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

export type ModelHint =
  | "claude-opus-4-7"
  | "claude-sonnet-4-5"
  | "claude-haiku-4-5"
  | "claude"

/**
 * Profils de sampling pré-configurés selon le type de tâche.
 * Haiku pour la génération rapide, Sonnet pour le jugement, Opus pour la planification complexe.
 */
export const SAMPLING_PROFILES = {
  /** Génération de texte court, éditoriale, résumé — vitesse prioritaire */
  fast: { hints: [{ name: "claude-haiku-4-5" as ModelHint }], speedPriority: 0.9, intelligencePriority: 0.4, costPriority: 0.7, maxTokens: 256 },
  /** Analyse, synthèse de contexte — équilibré */
  balanced: { hints: [{ name: "claude-haiku-4-5" as ModelHint }], speedPriority: 0.6, intelligencePriority: 0.7, costPriority: 0.5, maxTokens: 512 },
  /** Jugement critique, évaluation, escalade — intelligence prioritaire */
  careful: { hints: [{ name: "claude-sonnet-4-5" as ModelHint }], speedPriority: 0.3, intelligencePriority: 0.9, costPriority: 0.3, maxTokens: 1024 },
} as const

export type SamplingProfile = keyof typeof SAMPLING_PROFILES

export interface SamplingMessage {
  role: "user" | "assistant"
  content: { type: "text"; text: string }
}

export interface SamplingTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface SamplingResult {
  role: "assistant"
  content: { type: "text"; text: string }
  model: string
  stopReason: "endTurn" | "toolUse" | "maxTokens" | "stopSequence"
}

/**
 * Accède au Server sous-jacent de McpServer pour createMessage.
 * McpServer est un wrapper haut niveau — le sampling est sur l'instance Server interne.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getUnderlyingServer(mcp: McpServer): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (mcp as any).server
}

/**
 * Appel LLM simple via sampling — une question, une réponse.
 * Délègue au client MCP (Claude Code) — pas de clé Anthropic requise côté serveur.
 */
export async function sampleText(
  server: McpServer,
  prompt: string,
  opts?: {
    system?: string
    model?: ModelHint
    maxTokens?: number
    profile?: SamplingProfile
  },
): Promise<string> {
  const underlying = getUnderlyingServer(server)
  if (!underlying?.createMessage) {
    throw new Error("Sampling not available — client does not support it")
  }

  // Utiliser le profil si fourni, sinon les valeurs explicites ou les défauts
  const profile = opts?.profile ? SAMPLING_PROFILES[opts.profile] : null

  const params: Record<string, unknown> = {
    messages: [{ role: "user", content: { type: "text", text: prompt } }],
    maxTokens: opts?.maxTokens ?? profile?.maxTokens ?? 1024,
    modelPreferences: {
      hints: [{ name: opts?.model ?? profile?.hints[0]?.name ?? "claude-haiku-4-5" }],
      speedPriority:        profile?.speedPriority        ?? 0.7,
      intelligencePriority: profile?.intelligencePriority ?? 0.6,
      costPriority:         profile?.costPriority         ?? 0.5,
    },
  }
  if (opts?.system) params["systemPrompt"] = opts.system

  const result = await underlying.createMessage(params) as SamplingResult
  return result.content.text
}
