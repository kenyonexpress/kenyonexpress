import { log } from '@/lib/observability/log'
import { redact } from '@/lib/observability/scrub'
import { createAdminClient } from '@/lib/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'

/**
 * The AI runtime's single door. Every agent call in this repository goes
 * through `runAgent`, because the four properties the runtime must have are
 * properties of the DOOR, not of any one caller:
 *
 *   1. OFF BY DEFAULT. `AI_AGENTS_ENABLED` must be plainly true AND the
 *      per-agent flag must be, or the call refuses before any network. The
 *      same strict truthiness as the kill switches, inverted: an agent that is
 *      on by accident spends money and talks to customers.
 *   2. PII NEVER LEAVES. Inputs pass through the same `redact` the Sentry
 *      path uses. Whatever it scrubs for crash reports, it scrubs here.
 *   3. EVERY SHEKEL COUNTED. Usage lands in `ai_usage` (migration 153) with
 *      the token counts and a computed micro-USD cost. Best effort, like every
 *      observer of a money-adjacent path: a logging failure must not fail the
 *      call that already succeeded and was already paid for.
 *   4. AGENTS ADVISE, NEVER WRITE. Nothing here touches the database beyond
 *      the usage row. An agent that wants to change a product produces a DRAFT
 *      for an admin; the write stays human. (The pricing agent especially:
 *      it may never touch platform_percent.)
 *
 * The model is claude-sonnet-4-6 by the brief's explicit naming, overridable
 * per call. Costs below are that model's first-party rates.
 */

export const AI_AGENTS = [
  'product_description',
  'support_chat',
  'pricing_advisor',
  'fraud_signals',
] as const
export type AiAgent = (typeof AI_AGENTS)[number]

const AGENT_FLAG: Record<AiAgent, string> = {
  product_description: 'AI_AGENT_PRODUCT_DESCRIPTION',
  support_chat: 'AI_AGENT_SUPPORT_CHAT',
  pricing_advisor: 'AI_AGENT_PRICING_ADVISOR',
  fraud_signals: 'AI_AGENT_FRAUD_SIGNALS',
}

const DEFAULT_MODEL = 'claude-sonnet-4-6'

/** First-party $/MTok, in micro-USD per token, for the models we may run. */
const PRICE_MICROS: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-haiku-4-5': { input: 1, output: 5 },
}

function plainlyTrue(raw: string | undefined): boolean {
  return !!raw && ['1', 'true', 'on', 'yes'].includes(raw.trim().toLowerCase())
}

export function agentEnabled(agent: AiAgent, env: NodeJS.ProcessEnv = process.env): boolean {
  return plainlyTrue(env.AI_AGENTS_ENABLED) && plainlyTrue(env[AGENT_FLAG[agent]])
}

export function costUsdMicros(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICE_MICROS[model]
  if (!price) return 0
  return Math.round(inputTokens * price.input + outputTokens * price.output)
}

export type AgentResult =
  | { ok: true; text: string; inputTokens: number; outputTokens: number }
  | { ok: false; reason: 'disabled' | 'no_api_key' | 'api_error'; message: string }

type UsageAdmin = {
  from: (t: 'ai_usage') => {
    insert: (r: Record<string, unknown>) => Promise<{ error: { message: string } | null }>
  }
}

export async function runAgent(
  input: {
    agent: AiAgent
    system: string
    /** User-side content. Scrubbed with the Sentry redactor before sending. */
    prompt: string
    model?: string
    maxTokens?: number
  },
  deps: { client?: Anthropic; admin?: UsageAdmin; env?: NodeJS.ProcessEnv } = {},
): Promise<AgentResult> {
  const env = deps.env ?? process.env
  if (!agentEnabled(input.agent, env)) {
    return { ok: false, reason: 'disabled', message: `agent ${input.agent} is off` }
  }
  if (!env.ANTHROPIC_API_KEY) {
    // Refuse loudly rather than let the SDK throw a less specific error: an
    // enabled agent with no key is a misconfiguration someone should hear about.
    log.error('ai.no_api_key', { agent: input.agent })
    return { ok: false, reason: 'no_api_key', message: 'ANTHROPIC_API_KEY is not set' }
  }

  const model = input.model ?? DEFAULT_MODEL
  const scrubbed = String(redact(input.prompt))
  const client = deps.client ?? new Anthropic()
  const started = Date.now()
  try {
    const response = await client.messages.create({
      model,
      max_tokens: input.maxTokens ?? 2048,
      system: input.system,
      messages: [{ role: 'user', content: scrubbed }],
    })
    const text = response.content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
    await recordUsage(deps.admin, {
      agent: input.agent,
      model,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cost_usd_micros: costUsdMicros(
        model,
        response.usage.input_tokens,
        response.usage.output_tokens,
      ),
      ok: true,
      latency_ms: Date.now() - started,
    })
    return {
      ok: true,
      text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    }
  } catch (err) {
    await recordUsage(deps.admin, {
      agent: input.agent,
      model,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd_micros: 0,
      ok: false,
      error: err instanceof Anthropic.APIError ? `${err.status}: ${err.message}` : String(err),
      latency_ms: Date.now() - started,
    })
    log.error('ai.call_failed', { agent: input.agent, err: String(err) })
    return { ok: false, reason: 'api_error', message: 'קריאת ה-AI נכשלה' }
  }
}

async function recordUsage(
  admin: UsageAdmin | undefined,
  row: Record<string, unknown>,
): Promise<void> {
  try {
    const client = admin ?? (createAdminClient() as unknown as UsageAdmin)
    const { error } = await client.from('ai_usage').insert(row)
    // Until migration 153 applies the table does not exist; that is a known
    // state, logged at warn rather than error, and never a failure of the call.
    if (error) log.warn('ai.usage_not_recorded', { reason: error.message })
  } catch (err) {
    log.warn('ai.usage_not_recorded', { err: String(err) })
  }
}
