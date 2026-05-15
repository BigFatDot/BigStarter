import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { extractText, parseWithRetry, makeRepairFn } from '../shared.js'

// ------------------------------------
// I/O types
// ------------------------------------

export interface VerifierInput {
  featureId: string
  diff:      string
  acceptanceCriteria: { id: string; description: string }[]
  ciResults?: { passed: number; failed: number; coverage: number }
}

const VerifierCoreSchema = z.object({
  status:          z.enum(['pass', 'partial', 'fail']),
  score:           z.number().int().min(0).max(100),
  criteriaMet:     z.array(z.string()),
  criteriaPartial: z.array(z.string()),
  criteriaFailed:  z.array(z.string()),
  notes:           z.string().min(10).max(600),
})

export const ProofBundleSchema = z.object({
  verifierScore:             z.number().int().min(0).max(100),
  acceptanceCriteriaMet:     z.array(z.string()),
  acceptanceCriteriaPartial: z.array(z.string()),
  acceptanceCriteriaFailed:  z.array(z.string()),
  timestamp:                 z.date(),
})

export type VerificationStatus = 'pass' | 'partial' | 'fail'
export type VerifierOutput = z.infer<typeof VerifierCoreSchema> & {
  proofBundle: z.infer<typeof ProofBundleSchema>
}

// ------------------------------------
// Agent — intentionally isolated from Builder context
// ------------------------------------

const claude = new Anthropic()

const SYSTEM = `\
You are an independent code verifier. You review code diffs against acceptance criteria.
You have ZERO context about who wrote the code, why, or under what constraints.
Judge code quality objectively.

SCORING RUBRIC:
- PASS   (score 90-100): ALL criteria met, CI green, no blocking issues
- PARTIAL (score 50-89): MOST criteria met but gaps exist, OR some CI failures
- FAIL   (score 0-49):  Critical criteria unmet, OR major test failures, OR security issues

OUTPUT FORMAT — respond with ONLY this JSON structure, no markdown:
{
  "status": "pass" | "partial" | "fail",
  "score": <0-100 integer>,
  "criteriaMet":     ["AC-1", "AC-2"],
  "criteriaPartial": ["AC-3"],
  "criteriaFailed":  ["AC-4"],
  "notes": "Concise explanation (2-4 sentences) of gaps, issues, or why it passed"
}`

function buildUserPrompt(input: VerifierInput): string {
  const diff = input.diff.length > 8000
    ? input.diff.slice(0, 8000) + '\n[... diff truncated for length ...]'
    : input.diff

  const ci = input.ciResults
    ? `Tests: ${input.ciResults.passed} passed / ${input.ciResults.failed} failed | Coverage: ${input.ciResults.coverage}%`
    : 'CI results: not available'

  return `FEATURE: ${input.featureId}

ACCEPTANCE CRITERIA:
${input.acceptanceCriteria.map(c => `[${c.id}] ${c.description}`).join('\n')}

CI RESULTS: ${ci}

DIFF TO REVIEW:
\`\`\`
${diff}
\`\`\`

TASK: Evaluate this diff against EACH criterion. Be strict.
Output ONLY valid JSON.`
}

function buildFallback(input: VerifierInput): VerifierOutput {
  const allIds = input.acceptanceCriteria.map(c => c.id)
  return {
    status:          'fail',
    score:           0,
    criteriaMet:     [],
    criteriaPartial: [],
    criteriaFailed:  allIds,
    notes:           'Verification unavailable — conservative fail applied. Manual review required.',
    proofBundle: {
      verifierScore:             0,
      acceptanceCriteriaMet:     [],
      acceptanceCriteriaPartial: [],
      acceptanceCriteriaFailed:  allIds,
      timestamp:                 new Date(),
    },
  }
}

export async function runVerifierAgent(input: VerifierInput): Promise<VerifierOutput> {
  try {
    const response = await claude.messages.create({
      model:      'claude-sonnet-4-5',
      max_tokens: 1024,
      // Isolated system prompt — no project context, no builder context
      system:     SYSTEM,
      messages:   [{ role: 'user', content: buildUserPrompt(input) }],
    })

    const parsed = await parseWithRetry(
      extractText(response),
      VerifierCoreSchema,
      makeRepairFn(claude, 'claude-haiku-4-5'),
    )

    return {
      ...parsed,
      proofBundle: {
        verifierScore:             parsed.score,
        acceptanceCriteriaMet:     parsed.criteriaMet,
        acceptanceCriteriaPartial: parsed.criteriaPartial,
        acceptanceCriteriaFailed:  parsed.criteriaFailed,
        timestamp:                 new Date(),
      },
    }
  } catch (err) {
    console.error('[Verifier] Failed, using conservative fallback:', err instanceof Error ? err.message : err)
    return buildFallback(input)
  }
}
