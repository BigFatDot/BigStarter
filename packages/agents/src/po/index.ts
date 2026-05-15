import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { SignalNode, FeatureNode } from '@kap/pkg'
import { extractText, parseWithRetry, makeRepairFn } from '../shared.js'

// ------------------------------------
// I/O types
// ------------------------------------

export interface POInput {
  projectId:             string
  signals:               SignalNode[]
  existingFeatures:      Pick<FeatureNode, 'id' | 'title' | 'status'>[]
  projectVisionSummary:  string
  architectureNotes?:    string
}

const ACSchema = z.object({
  id:          z.string().min(1),
  description: z.string().min(10),
  testable:    z.boolean(),
})

const POFeatureSchema = z.object({
  title:                  z.string().min(5).max(100),
  communitySignalSummary: z.string().min(10).max(300),
  votes:                  z.number().int().min(0),
  fundingAmountEur:       z.number().min(0),
  feasibilityNote:        z.string().min(10).max(400),
  estimatedEffortHours:   z.number().int().min(1).max(500),
  acceptanceCriteria:     z.array(ACSchema).min(1).max(8),
  priority:               z.enum(['critical', 'high', 'medium', 'low']),
  requiresAdminDecision:  z.boolean(),
  adminDecisionReason:    z.string().optional(),
})

const POBriefSchema = z.object({
  topFeatures:      z.array(POFeatureSchema).min(1).max(10),
  archivedSignals:  z.array(z.string()),
  trendsDetected:   z.array(z.string()).max(5),
})

export type POBrief        = z.infer<typeof POBriefSchema> & { generatedAt: Date }
export type POFeatureBrief = z.infer<typeof POFeatureSchema>

// ------------------------------------
// Agent
// ------------------------------------

const claude = new Anthropic()

const SYSTEM = `\
You are the Product Owner Agent. Your role: transform community signals into prioritized, actionable feature briefs.

RULES:
1. DEDUPLICATION: Merge similar signals into one feature. Explain the merge.
2. SCORING FORMULA: rank = votes + (fundingAmountEur * 10). Higher = higher priority.
3. ACCEPTANCE CRITERIA: Each criterion must be testable (can be verified by code or QA).
4. PRIORITY ASSIGNMENT:
   - critical: rank > 500 AND aligns with vision
   - high: rank > 100 OR urgent user need
   - medium: rank 10-100
   - low: rank < 10 or speculative
5. ADMIN FLAG: Set requiresAdminDecision=true if:
   - Feature requires major architectural change
   - Conflicts with stated project vision
   - Estimated effort > 40 hours
   - Requires new external service or API

OUTPUT FORMAT — ONLY this JSON structure, no markdown, no preamble:
{
  "topFeatures": [
    {
      "title": "Short feature title",
      "communitySignalSummary": "1-2 sentences: what users want and why",
      "votes": <int>,
      "fundingAmountEur": <float>,
      "feasibilityNote": "Technical feasibility assessment (1-2 sentences)",
      "estimatedEffortHours": <int 1-500>,
      "acceptanceCriteria": [
        { "id": "AC-1", "description": "User can do X when Y", "testable": true }
      ],
      "priority": "critical|high|medium|low",
      "requiresAdminDecision": <bool>,
      "adminDecisionReason": "Only if requiresAdminDecision=true"
    }
  ],
  "archivedSignals": ["id1", "id2"],
  "trendsDetected": ["trend description 1"]
}`

function buildUserPrompt(input: POInput): string {
  const existingList = input.existingFeatures.length
    ? input.existingFeatures.map(f => `  [${f.status}] ${f.id}: ${f.title}`).join('\n')
    : '  (none yet)'

  const signalsList = input.signals.map((s, i) => {
    const votes = s.votes ?? 0
    const funding = s.funding_amount ?? 0
    const rank = votes + funding * 10
    return `[${i + 1}] ID:${s.id} | Rank:${rank.toFixed(0)} | "${s.content}"
    Votes:${votes} | Funding:€${funding} | Type:${s.signal_type} | Source:${s.source}`
  }).join('\n\n')

  return `PROJECT: ${input.projectId}
VISION: ${input.projectVisionSummary}
ARCHITECTURE: ${input.architectureNotes ?? 'No notes provided'}

EXISTING FEATURES:
${existingList}

COMMUNITY SIGNALS (${input.signals.length} total):
${signalsList}

TASK: Process ALL signals above. Deduplicate, score, generate ACs, flag architectural concerns.
Output ONLY valid JSON.`
}

function buildFallback(input: POInput): POBrief {
  return {
    topFeatures: input.signals.slice(0, 3).map((s, i) => ({
      title:                  s.content.slice(0, 60),
      communitySignalSummary: s.content.slice(0, 200),
      votes:                  s.votes ?? 0,
      fundingAmountEur:       s.funding_amount ?? 0,
      feasibilityNote:        'Requires detailed analysis',
      estimatedEffortHours:   20,
      acceptanceCriteria:     [{ id: 'AC-1', description: 'Feature is implemented and functional', testable: true }],
      priority:               i === 0 ? 'high' : 'medium',
      requiresAdminDecision:  false,
    })),
    archivedSignals: [],
    trendsDetected:  [],
    generatedAt:     new Date(),
  }
}

export async function runPOAgent(input: POInput): Promise<POBrief> {
  if (input.signals.length === 0) {
    return { topFeatures: [], archivedSignals: [], trendsDetected: [], generatedAt: new Date() }
  }

  try {
    const response = await claude.messages.create({
      model:      'claude-sonnet-4-5',
      max_tokens: 4096,
      system:     SYSTEM,
      messages:   [{ role: 'user', content: buildUserPrompt(input) }],
    })

    const parsed = await parseWithRetry(
      extractText(response),
      POBriefSchema,
      makeRepairFn(claude, 'claude-haiku-4-5'),
    )

    return { ...parsed, generatedAt: new Date() }
  } catch (err) {
    console.error('[PO] Failed, using fallback:', err instanceof Error ? err.message : err)
    return buildFallback(input)
  }
}
