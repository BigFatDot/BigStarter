import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { extractText, parseWithRetry, makeRepairFn } from '../shared.js'

// ------------------------------------
// I/O types
// ------------------------------------

export interface PromoterInput {
  projectId:      string
  projectName:    string
  projectPitch:   string
  latestUpdate:   { title: string; summary: string }
  channels:       PromoterChannel[]
  backerCount:    number
  progressPercent: number
}

export type PromoterChannel = 'twitter' | 'linkedin' | 'reddit' | 'hn' | 'newsletter'

const ChannelPostSchema = z.object({
  channel:       z.enum(['twitter', 'linkedin', 'reddit', 'hn', 'newsletter']),
  content:       z.string().min(20).max(2000),
  hashtags:      z.array(z.string().max(30)).max(5).optional(),
  callToAction:  z.string().min(3).max(100),
})

const PromoterOutputSchema = z.object({
  posts:             z.array(ChannelPostSchema).min(1),
  landingPageBlurb:  z.string().max(300).optional(),
})

export type PromoterOutput = z.infer<typeof PromoterOutputSchema>
export type ChannelPost    = z.infer<typeof ChannelPostSchema>

// ------------------------------------
// Agent
// ------------------------------------

const claude = new Anthropic()

const CHANNEL_GUIDELINES: Record<PromoterChannel, string> = {
  twitter:    'Max 280 chars. Punchy. 1-2 emojis optional. 2-3 hashtags. Include a link placeholder.',
  linkedin:   'Professional tone. 1-2 short paragraphs. Emphasize business impact. No hashtags in body.',
  reddit:     'Casual, community-first. No marketing speak. Explain why this matters. End with a question.',
  hn:         'Technical depth. Zero marketing. Explain HOW it works. "Ask HN:" or "Show HN:" format.',
  newsletter: 'Personal voice. 100-200 words. Tell the story behind the update. One clear CTA.',
}

const SYSTEM = `\
You are the Promoter Agent. Your role: create authentic, channel-specific promotional content.

ABSOLUTE RULES:
- NO hype. NO false claims. Only report real, verified progress.
- NO generic openers: "Excited to announce", "We're thrilled", "Big news".
- Each channel has a distinct audience and norms — adapt accordingly.
- Mention SPECIFIC details from the update (not vague summaries).
- Every post must have a clear call-to-action.

CHANNEL GUIDELINES:
${Object.entries(CHANNEL_GUIDELINES).map(([ch, guide]) => `- ${ch}: ${guide}`).join('\n')}

OUTPUT FORMAT — ONLY this JSON structure, no markdown:
{
  "posts": [
    {
      "channel": "twitter|linkedin|reddit|hn|newsletter",
      "content": "channel-appropriate post content",
      "hashtags": ["optional", "tags"],
      "callToAction": "specific CTA text"
    }
  ],
  "landingPageBlurb": "optional 50-100 word website summary"
}`

function buildUserPrompt(input: PromoterInput): string {
  return `PROJECT: ${input.projectName}
Pitch: ${input.projectPitch}
Progress: ${input.progressPercent}% | Backers: ${input.backerCount}

LATEST UPDATE:
Title: ${input.latestUpdate.title}
Summary: ${input.latestUpdate.summary}

WRITE POSTS FOR: ${input.channels.join(', ')}

CRITICAL: Mention specific details from the update above.
Each post must match the tone and length rules for its platform.
Output ONLY valid JSON.`
}

function buildFallback(input: PromoterInput): PromoterOutput {
  return {
    posts: input.channels.map(channel => ({
      channel,
      content: `${input.projectName}: ${input.latestUpdate.summary}`,
      callToAction: 'Learn more',
    })),
    landingPageBlurb: `${input.projectName} — ${input.projectPitch}`,
  }
}

export async function runPromoterAgent(input: PromoterInput): Promise<PromoterOutput> {
  try {
    const response = await claude.messages.create({
      model:      'claude-sonnet-4-5',
      max_tokens: 1500,
      system:     SYSTEM,
      messages:   [{ role: 'user', content: buildUserPrompt(input) }],
    })

    const parsed = await parseWithRetry(
      extractText(response),
      PromoterOutputSchema,
      makeRepairFn(claude, 'claude-haiku-4-5'),
    )

    // Ensure all requested channels are covered
    const missing = input.channels.filter(ch => !parsed.posts.find(p => p.channel === ch))
    if (missing.length > 0) {
      throw new Error(`Missing channels: ${missing.join(', ')}`)
    }

    return parsed
  } catch (err) {
    console.error('[Promoter] Failed, using fallback:', err instanceof Error ? err.message : err)
    return buildFallback(input)
  }
}
