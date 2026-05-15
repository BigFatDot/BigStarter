/**
 * Shared utilities for all KAP agents.
 * - extractText : extract text content from Claude response
 * - parseWithRetry : parse + Zod validate LLM JSON output with retry
 */

import Anthropic from '@anthropic-ai/sdk'
import type { ZodSchema } from 'zod'

export function extractText(response: Anthropic.Message): string {
  const block = response.content.find(b => b.type === 'text')
  return block?.type === 'text' ? block.text.trim() : ''
}

/**
 * Parse + validate LLM JSON output against a Zod schema.
 * Strips markdown code fences if present.
 * Retries once with a repair prompt if validation fails.
 */
export async function parseWithRetry<T>(
  rawText: string,
  schema: ZodSchema<T>,
  repairFn?: (rawText: string, error: string) => Promise<string>,
): Promise<T> {
  // Strip markdown fences
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim()

  // First attempt
  try {
    return schema.parse(JSON.parse(cleaned))
  } catch (firstError) {
    if (!repairFn) throw firstError

    // Retry with repair
    try {
      const repaired = await repairFn(
        cleaned,
        firstError instanceof Error ? firstError.message : String(firstError),
      )
      const repairedCleaned = repaired
        .replace(/^```(?:json)?\s*/m, '')
        .replace(/\s*```\s*$/m, '')
        .trim()
      return schema.parse(JSON.parse(repairedCleaned))
    } catch {
      throw firstError // surface the original error
    }
  }
}

/** Simple repair prompt: ask the model to fix its own JSON */
export function makeRepairFn(
  claude: Anthropic,
  model: string,
): (raw: string, error: string) => Promise<string> {
  return async (raw: string, error: string) => {
    const response = await claude.messages.create({
      model,
      max_tokens: 2048,
      system: 'You are a JSON repair assistant. Fix the provided JSON to match the expected schema. Output ONLY valid JSON, no explanation.',
      messages: [{
        role: 'user',
        content: `This JSON is invalid: ${error}\n\nOriginal:\n${raw}\n\nOutput ONLY the corrected JSON.`,
      }],
    })
    const block = response.content.find(b => b.type === 'text')
    return block?.type === 'text' ? block.text : raw
  }
}
