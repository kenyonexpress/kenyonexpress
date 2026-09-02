import { AI_AGENTS, agentEnabled, costUsdMicros, runAgent } from '@/server/ai/client'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/observability/log', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const OFF = {} as NodeJS.ProcessEnv
const ON = (agent: string) =>
  ({ AI_AGENTS_ENABLED: 'true', [agent]: 'true', ANTHROPIC_API_KEY: 'k' }) as NodeJS.ProcessEnv

describe('off by default, twice over', () => {
  it('every agent is disabled with an empty environment', () => {
    for (const agent of AI_AGENTS) expect(agentEnabled(agent, OFF)).toBe(false)
  })

  it('the master flag alone is not enough, and neither is the agent flag alone', () => {
    expect(agentEnabled('support_chat', { AI_AGENTS_ENABLED: 'true' } as NodeJS.ProcessEnv)).toBe(
      false,
    )
    expect(
      agentEnabled('support_chat', { AI_AGENT_SUPPORT_CHAT: 'true' } as NodeJS.ProcessEnv),
    ).toBe(false)
    expect(agentEnabled('support_chat', ON('AI_AGENT_SUPPORT_CHAT'))).toBe(true)
  })

  it('only a plainly-true value counts, same rule as the kill switches', () => {
    for (const raw of ['yes!', 'enabled', 'TRUE ', '0', '']) {
      expect(
        agentEnabled('support_chat', {
          AI_AGENTS_ENABLED: raw,
          AI_AGENT_SUPPORT_CHAT: raw,
        } as NodeJS.ProcessEnv),
        raw,
      ).toBe(raw.trim().toLowerCase() === 'true')
    }
  })
})

describe('a disabled agent never reaches the network', () => {
  it('refuses before constructing a client', async () => {
    const result = await runAgent(
      { agent: 'pricing_advisor', system: 's', prompt: 'p' },
      { env: OFF },
    )
    expect(result).toEqual({
      ok: false,
      reason: 'disabled',
      message: 'agent pricing_advisor is off',
    })
  })

  it('an enabled agent with no key refuses loudly rather than throwing vaguely', async () => {
    const env = { AI_AGENTS_ENABLED: 'true', AI_AGENT_SUPPORT_CHAT: 'true' } as NodeJS.ProcessEnv
    const result = await runAgent({ agent: 'support_chat', system: 's', prompt: 'p' }, { env })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('no_api_key')
  })
})

describe('every shekel counted', () => {
  // sonnet-4-6 first-party rates: $3/$15 per MTok = 3/15 micro-USD per token.
  it('prices sonnet-4-6 at its first-party rates', () => {
    expect(costUsdMicros('claude-sonnet-4-6', 1_000_000, 0)).toBe(3_000_000) // $3
    expect(costUsdMicros('claude-sonnet-4-6', 0, 1_000_000)).toBe(15_000_000) // $15
    expect(costUsdMicros('claude-sonnet-4-6', 1000, 500)).toBe(3_000 + 7_500)
  })

  it('an unknown model prices at zero rather than at a guess', () => {
    expect(costUsdMicros('some-future-model', 1000, 1000)).toBe(0)
  })
})
