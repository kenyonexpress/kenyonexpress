import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Redis mirror of the outbox retry schedule and the dead-letter list.
 *
 * Two things are proven here: the exact Redis command that leaves for each
 * operation (the wire is the contract, since the admin page and the drain
 * both read these keys), and that an unconfigured or failing transport
 * degrades to "no answer" instead of throwing into a send path.
 */

const upstashConfig = vi.fn()
const tryCommand = vi.fn()
const logWarn = vi.fn()

vi.mock('@/lib/rate-limit/upstash', () => ({
  upstashConfig: () => upstashConfig(),
  tryCommand: (...args: unknown[]) => tryCommand(...args),
}))
vi.mock('@/lib/observability/log', () => ({
  log: { warn: (...a: unknown[]) => logWarn(...a), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const {
  DLQ_CAP,
  DLQ_KEY,
  RETRY_KEY,
  backoffMinutes,
  clearRetry,
  deadLetterCount,
  dueRetries,
  listDeadLetters,
  listRetries,
  pushDeadLetter,
  removeDeadLetter,
  retryQueueSize,
  scheduleRetry,
} = await import('./redis-queue')

type Command = (args: readonly string[], event: string) => Promise<unknown>

/** A fake transport that records every command and answers from a script. */
function fakeCommand(answer: (args: readonly string[]) => unknown) {
  const calls: { args: readonly string[]; event: string }[] = []
  const command: Command = async (args, event) => {
    calls.push({ args, event })
    return answer(args)
  }
  return { command, calls }
}

const CONFIG = { url: 'https://r.upstash.test', token: 't', timeoutMs: 1000 }

beforeEach(() => {
  upstashConfig.mockReset()
  upstashConfig.mockReturnValue(null)
  tryCommand.mockReset()
  logWarn.mockReset()
})

describe('without Upstash configured', () => {
  it('every function answers "no answer" and sends nothing', async () => {
    expect(await scheduleRetry('id', 1)).toBe(false)
    expect(await clearRetry('id')).toBe(false)
    expect(await dueRetries(1)).toEqual([])
    expect(await listRetries()).toEqual([])
    expect(await retryQueueSize()).toBeNull()
    expect(
      await pushDeadLetter({
        outboxId: 'o',
        dedupeKey: null,
        kind: null,
        source: 'manual',
        reason: 'r',
        status: null,
      }),
    ).toBeNull()
    expect(await listDeadLetters()).toEqual([])
    expect(await deadLetterCount()).toBeNull()
    expect(await removeDeadLetter('x')).toBe(false)
    expect(tryCommand).not.toHaveBeenCalled()
  })
})

describe('the default transport', () => {
  it('routes through tryCommand with the resolved config', async () => {
    upstashConfig.mockReturnValue(CONFIG)
    tryCommand.mockResolvedValue(1)

    expect(await scheduleRetry('ob-1', 1_700_000_000_500.7)).toBe(true)
    expect(tryCommand).toHaveBeenCalledWith(
      CONFIG,
      ['ZADD', RETRY_KEY, '1700000000500', 'ob-1'],
      'notifications.retry_schedule_failed',
    )
  })

  it('reports false when the transport answered null', async () => {
    upstashConfig.mockReturnValue(CONFIG)
    tryCommand.mockResolvedValue(null)
    expect(await scheduleRetry('ob-1', 1)).toBe(false)
    expect(await clearRetry('ob-1')).toBe(false)
  })
})

describe('retry schedule', () => {
  it('clearRetry removes the member from the sorted set', async () => {
    const { command, calls } = fakeCommand(() => 1)
    expect(await clearRetry('ob-9', command)).toBe(true)
    expect(calls).toEqual([
      { args: ['ZREM', RETRY_KEY, 'ob-9'], event: 'notifications.retry_clear_failed' },
    ])
  })

  it('dueRetries asks for everything scored at or before now, oldest first', async () => {
    const { command, calls } = fakeCommand(() => ['a', '100', 'b', '200'])
    const due = await dueRetries(250.9, 10, command)
    expect(calls[0]?.args).toEqual([
      'ZRANGEBYSCORE',
      RETRY_KEY,
      '-inf',
      '250',
      'WITHSCORES',
      'LIMIT',
      '0',
      '10',
    ])
    expect(due).toEqual([
      { outboxId: 'a', dueAtMs: 100 },
      { outboxId: 'b', dueAtMs: 200 },
    ])
  })

  it('listRetries defaults to +inf and 50, and clamps the limit to 1..500', async () => {
    const { command, calls } = fakeCommand(() => [])
    await listRetries({}, command)
    expect(calls[0]?.args.slice(3)).toEqual(['+inf', 'WITHSCORES', 'LIMIT', '0', '50'])
    await listRetries({ limit: 0 }, command)
    expect(calls[1]?.args.at(-1)).toBe('1')
    await listRetries({ limit: 9_999 }, command)
    expect(calls[2]?.args.at(-1)).toBe('500')
  })

  it('skips malformed pairs and a non-array answer', async () => {
    const bad = fakeCommand(() => ['a', 'not-a-number', 7, '3', 'c', '30', 'dangling'])
    expect(await listRetries({}, bad.command)).toEqual([{ outboxId: 'c', dueAtMs: 30 }])
    const notArray = fakeCommand(() => null)
    expect(await listRetries({}, notArray.command)).toEqual([])
  })

  it('retryQueueSize parses ZCARD and refuses a non-numeric answer', async () => {
    const ok = fakeCommand(() => 12)
    expect(await retryQueueSize(ok.command)).toBe(12)
    expect(ok.calls[0]?.args).toEqual(['ZCARD', RETRY_KEY])
    const bad = fakeCommand(() => 'many')
    expect(await retryQueueSize(bad.command)).toBeNull()
  })
})

describe('dead letters', () => {
  const ENTRY = {
    outboxId: 'ob-1',
    dedupeKey: 'order:1:paid',
    kind: 'order_paid',
    source: 'qstash' as const,
    reason: 'worker 503',
    status: 503,
  }

  it('pushDeadLetter LPUSHes the JSON and trims to the cap', async () => {
    const { command, calls } = fakeCommand(() => 1)
    const full = await pushDeadLetter(
      { ...ENTRY, id: 'dl_fixed', at: '2026-09-17T00:00:00.000Z' },
      command,
    )

    expect(full).toEqual({ id: 'dl_fixed', at: '2026-09-17T00:00:00.000Z', ...ENTRY })
    expect(calls).toEqual([
      { args: ['LPUSH', DLQ_KEY, JSON.stringify(full)], event: 'notifications.dlq_push_failed' },
      {
        args: ['LTRIM', DLQ_KEY, '0', String(DLQ_CAP - 1)],
        event: 'notifications.dlq_trim_failed',
      },
    ])
  })

  it('mints an id and a timestamp when none are given, and caps the reason at 500', async () => {
    const { command } = fakeCommand(() => 1)
    const full = await pushDeadLetter({ ...ENTRY, reason: 'x'.repeat(600) }, command)
    expect(full?.id).toMatch(/^dl_[0-9a-z]+_[0-9a-z]+$/)
    expect(() => new Date(full?.at ?? '').toISOString()).not.toThrow()
    expect(full?.reason).toHaveLength(500)
  })

  it('does not trim when the push itself failed', async () => {
    const { command, calls } = fakeCommand(() => null)
    expect(await pushDeadLetter(ENTRY, command)).toBeNull()
    expect(calls).toHaveLength(1)
  })

  it('listDeadLetters parses entries, skips corrupt ones and clamps the window', async () => {
    const good = JSON.stringify({ id: 'a', reason: 'r', source: 'email', status: 500, at: 't' })
    const foreign = JSON.stringify({ id: 'b', reason: 'r', source: 'other', status: 'x' })
    const { command, calls } = fakeCommand(() => [
      good,
      'not json',
      JSON.stringify(null),
      JSON.stringify({ reason: 'no id' }),
      42,
      foreign,
    ])

    const entries = await listDeadLetters(5_000, command)
    expect(calls[0]?.args).toEqual(['LRANGE', DLQ_KEY, '0', String(DLQ_CAP - 1)])
    expect(entries).toEqual([
      {
        id: 'a',
        outboxId: null,
        dedupeKey: null,
        kind: null,
        source: 'email',
        reason: 'r',
        status: 500,
        at: 't',
      },
      {
        id: 'b',
        outboxId: null,
        dedupeKey: null,
        kind: null,
        source: 'manual',
        reason: 'r',
        status: null,
        at: '',
      },
    ])

    await listDeadLetters(0, command)
    expect(calls[1]?.args).toEqual(['LRANGE', DLQ_KEY, '0', '0'])
    const notArray = fakeCommand(() => 'nope')
    expect(await listDeadLetters(10, notArray.command)).toEqual([])
  })

  it('deadLetterCount parses LLEN', async () => {
    const ok = fakeCommand(() => '3')
    expect(await deadLetterCount(ok.command)).toBe(3)
    expect(ok.calls[0]?.args).toEqual(['LLEN', DLQ_KEY])
    const bad = fakeCommand(() => undefined)
    expect(await deadLetterCount(bad.command)).toBeNull()
  })

  it('removeDeadLetter finds the entry by id and LREMs the exact stored string', async () => {
    const stored = JSON.stringify({ id: 'dl_1', reason: 'r', source: 'push' })
    const { command, calls } = fakeCommand((args) => (args[0] === 'LREM' ? 1 : ['junk', stored]))

    expect(await removeDeadLetter('dl_1', command)).toBe(true)
    expect(calls[1]?.args).toEqual(['LREM', DLQ_KEY, '1', stored])
  })

  it('removeDeadLetter reports false for an unknown id, a bad list, or a missed LREM', async () => {
    const stored = JSON.stringify({ id: 'dl_1', reason: 'r' })
    const unknown = fakeCommand(() => [stored])
    expect(await removeDeadLetter('dl_2', unknown.command)).toBe(false)
    expect(unknown.calls).toHaveLength(1)

    const badList = fakeCommand(() => null)
    expect(await removeDeadLetter('dl_1', badList.command)).toBe(false)

    const missed = fakeCommand((args) => (args[0] === 'LREM' ? 0 : [stored]))
    expect(await removeDeadLetter('dl_1', missed.command)).toBe(false)
    expect(logWarn).toHaveBeenCalledWith('notifications.dlq_remove_missed', { id: 'dl_1' })
  })
})

describe('backoffMinutes', () => {
  it('is 2, 8, 32, 128 minutes and never below the first step', () => {
    expect([0, 1, 2, 3, 4].map(backoffMinutes)).toEqual([2, 2, 8, 32, 128])
  })
})
