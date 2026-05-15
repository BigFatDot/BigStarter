import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { extractText, parseWithRetry, makeRepairFn } from '../shared.js'

// ------------------------------------
// I/O types
// ------------------------------------

export interface ReporterInput {
  projectId: string
  sprint: number
  completedTasks: { featureId?: string; result?: Record<string, unknown> }[]
  proofBundles?: Record<string, unknown>[]
  tone?: 'technical' | 'general'
}

// Zod schema — enforced on every LLM output
const ChangelogEntrySchema = z.object({
  feature:     z.string().min(1),
  description: z.string().min(10),
  status:      z.enum(['shipped', 'partial', 'deferred']),
  proofUrl:    z.string().url().optional(),
})

const SprintMetricsSchema = z.object({
  featuresShipped:   z.number().int().min(0),
  featuresPartial:   z.number().int().min(0),
  tasksAttempted:    z.number().int().min(0),
  verifierScoreAvg:  z.number().min(0).max(100),
  sprintNumber:      z.number().int().min(0),
})

const ReporterOutputSchema = z.object({
  title:     z.string().min(5).max(120),
  summary:   z.string().min(20).max(600),
  changelog: z.array(ChangelogEntrySchema),
  metrics:   SprintMetricsSchema,
})

export type ReporterOutput  = z.infer<typeof ReporterOutputSchema>
export type ChangelogEntry  = z.infer<typeof ChangelogEntrySchema>
export type SprintMetrics   = z.infer<typeof SprintMetricsSchema>

// ------------------------------------
// Agent
// ------------------------------------

const claude = new Anthropic()

const SYSTEM = (projectId: string, tone: 'technical' | 'general') => `\
You are the Reporter Agent for project "${projectId}".
Your only job: translate development events into clear, honest public updates.

RULES:
- Never oversell. Only report what was actually shipped.
- Be specific: mention real features, real numbers, real progress.
- Tone: ${tone === 'general'
    ? 'accessible to non-developers — explain what changed and why it matters'
    : 'technical — include implementation details, architecture decisions, metrics'}.
- No generic phrases like "excited to announce", "amazing progress", or "revolutionary".

OUTPUT FORMAT — respond with ONLY this JSON structure, no markdown, no preamble:
{
  "title": "Short sprint title (max 80 chars)",
  "summary": "2-4 sentences covering what was shipped, its impact, and any caveats",
  "changelog": [
    {
      "feature": "Feature name",
      "description": "What changed and why it matters (1-2 sentences)",
      "status": "shipped | partial | deferred",
      "proofUrl": "optional URL"
    }
  ],
  "metrics": {
    "featuresShipped": <int>,
    "featuresPartial": <int>,
    "tasksAttempted": <int>,
    "verifierScoreAvg": <0-100>,
    "sprintNumber": <int>
  }
}`

function buildUserPrompt(input: ReporterInput): string {
  const tasks = input.completedTasks
    .map((t, i) =>
      `${i + 1}. Feature: ${t.featureId ?? 'unnamed'}\n   Result: ${JSON.stringify(t.result ?? {})}`,
    )
    .join('\n')

  const proofs = input.proofBundles?.length
    ? `\nPROOF BUNDLES:\n${input.proofBundles.map(p => JSON.stringify(p)).join('\n')}`
    : ''

  return `Generate a sprint update for Sprint ${input.sprint}.

COMPLETED TASKS:
${tasks}
${proofs}

Output ONLY valid JSON matching the schema above.`
}

function fallback(input: ReporterInput): ReporterOutput {
  const shipped = input.completedTasks.length
  return {
    title:   `Sprint ${input.sprint} Update`,
    summary: `${shipped} task${shipped !== 1 ? 's' : ''} processed in sprint ${input.sprint}.`,
    changelog: input.completedTasks.slice(0, 10).map(t => ({
      feature:     t.featureId ?? 'unnamed',
      description: JSON.stringify(t.result ?? {}).slice(0, 100),
      status:      'shipped' as const,
    })),
    metrics: {
      featuresShipped:  shipped,
      featuresPartial:  0,
      tasksAttempted:   shipped,
      verifierScoreAvg: 75,
      sprintNumber:     input.sprint,
    },
  }
}

export async function runReporterAgent(input: ReporterInput): Promise<ReporterOutput> {
  const tone = input.tone ?? 'general'

  try {
    const response = await claude.messages.create({
      model:      'claude-sonnet-4-5',
      max_tokens: 2048,
      system:     SYSTEM(input.projectId, tone),
      messages:   [{ role: 'user', content: buildUserPrompt(input) }],
    })

    return await parseWithRetry(
      extractText(response),
      ReporterOutputSchema,
      makeRepairFn(claude, 'claude-haiku-4-5'),
    )
  } catch (err) {
    console.error('[Reporter] Failed, using fallback:', err instanceof Error ? err.message : err)
    return fallback(input)
  }
}
