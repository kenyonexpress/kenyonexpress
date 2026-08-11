import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  type ExpoPushMessage,
  chunkPushMessages,
  isDeadTokenCode,
  isExpoPushToken,
  parseTickets,
  pushEnabled,
  sendExpoPush,
} from './expo'

function message(to: string): ExpoPushMessage {
  return { to, title: 'כותרת', body: 'גוף' }
}

afterEach(() => {
  // stubEnv, not assignment: `process.env.X = undefined` stores the STRING
  // "undefined", which `pushEnabled` would read as neither on nor absent.
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('isExpoPushToken', () => {
  it('accepts both spellings Expo has shipped', () => {
    expect(isExpoPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true)
    expect(isExpoPushToken('ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true)
  })

  it('rejects the values that actually get stored by mistake', () => {
    expect(isExpoPushToken('')).toBe(false)
    expect(isExpoPushToken('abcd-1234-device-id')).toBe(false)
    expect(isExpoPushToken('ExponentPushToken[]')).toBe(false)
    expect(isExpoPushToken(null)).toBe(false)
    expect(isExpoPushToken(42)).toBe(false)
  })
})

describe('chunkPushMessages', () => {
  it('splits at the documented ceiling', () => {
    const messages = Array.from({ length: 250 }, (_, i) => message(`ExponentPushToken[t${i}]`))
    const chunks = chunkPushMessages(messages)
    expect(chunks.map((c) => c.length)).toEqual([100, 100, 50])
  })

  it('returns nothing for an empty batch rather than one empty chunk', () => {
    expect(chunkPushMessages([])).toEqual([])
  })

  it('never produces a zero-length step from a bad size', () => {
    expect(chunkPushMessages([message('a'), message('b')], 0)).toHaveLength(2)
  })
})

describe('isDeadTokenCode', () => {
  it('only treats uninstall-class codes as fatal to the token', () => {
    expect(isDeadTokenCode('DeviceNotRegistered')).toBe(true)
    expect(isDeadTokenCode('MessageRateExceeded')).toBe(false)
    expect(isDeadTokenCode('MessageTooBig')).toBe(false)
    expect(isDeadTokenCode(null)).toBe(false)
    expect(isDeadTokenCode(undefined)).toBe(false)
  })
})

describe('parseTickets', () => {
  it('pairs errors back to the token that produced them', () => {
    const parsed = parseTickets(
      {
        data: [
          { status: 'ok', id: 'ticket-1' },
          { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
        ],
      },
      ['ExponentPushToken[a]', 'ExponentPushToken[b]'],
    )
    expect(parsed?.tickets[0]).toEqual({
      status: 'ok',
      id: 'ticket-1',
      to: 'ExponentPushToken[a]',
    })
    expect(parsed?.invalidTokens).toEqual(['ExponentPushToken[b]'])
  })

  it('does not disable a token over a transient error', () => {
    const parsed = parseTickets(
      {
        data: [
          { status: 'error', message: 'slow down', details: { error: 'MessageRateExceeded' } },
        ],
      },
      ['ExponentPushToken[a]'],
    )
    expect(parsed?.invalidTokens).toEqual([])
    expect(parsed?.tickets[0]).toMatchObject({ status: 'error', code: 'MessageRateExceeded' })
  })

  it('refuses a response whose length does not match what was sent', () => {
    // Mis-attributing DeviceNotRegistered to the wrong device would disable a
    // working phone, so a shape mismatch is a transport failure, not a parse.
    expect(parseTickets({ data: [{ status: 'ok', id: 'x' }] }, ['a', 'b'])).toBeNull()
    expect(parseTickets({}, ['a'])).toBeNull()
    expect(parseTickets(null, [])).toBeNull()
  })
})

describe('pushEnabled', () => {
  it('is off unless explicitly on', () => {
    expect(pushEnabled({} as NodeJS.ProcessEnv)).toBe(false)
    expect(pushEnabled({ PUSH_ENABLED: 'false' } as unknown as NodeJS.ProcessEnv)).toBe(false)
    expect(pushEnabled({ PUSH_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv)).toBe(true)
    expect(pushEnabled({ PUSH_ENABLED: '1' } as unknown as NodeJS.ProcessEnv)).toBe(true)
  })
})

describe('sendExpoPush', () => {
  it('skips rather than fails when push is off', async () => {
    vi.stubEnv('PUSH_ENABLED', 'false')
    const result = await sendExpoPush([message('ExponentPushToken[a]')])
    expect(result).toEqual({ ok: false, skipped: true, reason: 'push disabled' })
  })

  it('skips an empty recipient list without calling out', async () => {
    vi.stubEnv('PUSH_ENABLED', 'true')
    const fetchImpl = vi.fn()
    const result = await sendExpoPush([], { fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(result).toEqual({ ok: false, skipped: true, reason: 'no recipients' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('collects invalid tokens across chunks', async () => {
    vi.stubEnv('PUSH_ENABLED', 'true')
    const messages = Array.from({ length: 101 }, (_, i) => message(`ExponentPushToken[t${i}]`))
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const sent = JSON.parse(String(init?.body)) as ExpoPushMessage[]
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: sent.map((m) =>
            m.to === 'ExponentPushToken[t100]'
              ? { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }
              : { status: 'ok', id: `id-${m.to}` },
          ),
        }),
      } as unknown as Response
    })

    const result = await sendExpoPush(messages, { fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.tickets).toHaveLength(101)
      expect(result.invalidTokens).toEqual(['ExponentPushToken[t100]'])
    }
  })

  it('reports a non-2xx as a retryable failure, not a skip', async () => {
    vi.stubEnv('PUSH_ENABLED', 'true')
    const fetchImpl = vi.fn(
      async () => ({ ok: false, status: 503, json: async () => ({}) }) as unknown as Response,
    )
    const result = await sendExpoPush([message('ExponentPushToken[a]')], {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(result).toEqual({ ok: false, skipped: false, reason: 'expo push HTTP 503' })
  })

  it('never throws when the network does', async () => {
    vi.stubEnv('PUSH_ENABLED', 'true')
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNRESET')
    })
    const result = await sendExpoPush([message('ExponentPushToken[a]')], {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(result).toEqual({ ok: false, skipped: false, reason: 'ECONNRESET' })
  })

  it('sends the access token only when one is configured', async () => {
    vi.stubEnv('PUSH_ENABLED', 'true')
    const seen: Array<Record<string, string>> = []
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      seen.push((init?.headers ?? {}) as Record<string, string>)
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [{ status: 'ok', id: 'x' }] }),
      } as unknown as Response
    })

    await sendExpoPush([message('ExponentPushToken[a]')], {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await sendExpoPush([message('ExponentPushToken[a]')], {
      accessToken: 'secret',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(seen[0]?.authorization).toBeUndefined()
    expect(seen[1]?.authorization).toBe('Bearer secret')
  })
})
