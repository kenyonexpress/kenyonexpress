import { afterEach, describe, expect, it, vi } from 'vitest'

const logged = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
vi.mock('@/lib/observability/log', () => ({ log: logged }))

const { newJobEnvelope, MAX_REPLAYS } = await import('./contracts')
const { deadLetterRow, decodeDeadJob, parkDeadJob, replayDeadJobs, replayEnvelope } = await import(
  './dlq'
)

type Row = {
  id: string
  job: unknown
  job_type: string | null
  status: string
  created_at: string
  replayed_at?: string | null
  resolved_at?: string | null
}

/** An in-memory job_dlq with exactly the query shapes dlq.ts issues. */
function fakeClient(rows: Row[]) {
  const inserted: unknown[] = []
  const client = {
    from: () => ({
      insert: async (values: unknown) => {
        inserted.push(values)
        return { error: null }
      },
      select: () => ({
        eq: (_c: string, status: string) => ({
          order: () => ({
            limit: async (n: number) => ({
              data: rows
                .filter((r) => r.status === status)
                .sort((a, b) => a.created_at.localeCompare(b.created_at))
                .slice(0, n),
              error: null,
            }),
          }),
        }),
      }),
      update: (values: Partial<Row>) => ({
        eq: async (_c: string, id: string) => {
          const row = rows.find((r) => r.id === id)
          if (row) Object.assign(row, values)
          return { error: null }
        },
      }),
    }),
  }
  return { client: client as never, inserted }
}

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64')
}

afterEach(() => {
  for (const fn of Object.values(logged)) fn.mockClear()
})

describe('deadLetterRow', () => {
  it('decodes the job out of sourceBody and lifts its type', () => {
    const envelope = newJobEnvelope('cache-warm', { paths: ['/'] })
    const row = deadLetterRow(
      JSON.stringify({ status: 500, sourceBody: b64(envelope), error: 'worker failed' }),
    )
    expect(row.job).toEqual(envelope)
    expect(row.job_type).toBe('cache-warm')
    expect(row.last_error).toBe('worker failed')
  })

  it('stores an unparseable callback verbatim rather than dropping it', () => {
    const row = deadLetterRow('not json at all')
    expect(row.callback).toEqual({ raw: 'not json at all' })
    expect(row.job).toBeNull()
    expect(row.job_type).toBeNull()
    expect(row.last_error).toBe('worker responded unknown')
  })

  it('keeps a callback whose job no longer parses', () => {
    const row = deadLetterRow(JSON.stringify({ status: 500, sourceBody: b64({ v: 9 }) }))
    expect(row.job).toBeNull()
    expect(row.callback).toEqual({ status: 500, sourceBody: b64({ v: 9 }) })
    expect(decodeDeadJob('!!!')).toBeNull()
  })
})

describe('parkDeadJob', () => {
  it('inserts the row and logs the death at error level', async () => {
    const { client, inserted } = fakeClient([])
    const envelope = newJobEnvelope('search-outbox-drain', {})
    const result = await parkDeadJob(
      client,
      JSON.stringify({ status: 503, sourceBody: b64(envelope), error: 'boom' }),
    )
    expect(result).toEqual({ ok: true })
    expect(inserted).toHaveLength(1)
    expect(logged.error).toHaveBeenCalledWith('jobs.dead_lettered', {
      type: 'search-outbox-drain',
      reason: 'boom',
    })
  })
})

describe('replayEnvelope', () => {
  it('mints a new id, bumps the replay count and points at the grave', () => {
    const original = newJobEnvelope('cache-warm', { paths: ['/'] })
    const replay = replayEnvelope({ id: 'row-1', job: original })
    expect(replay).not.toBeNull()
    expect(replay?.id).not.toBe(original.id)
    expect(replay?.replayCount).toBe(1)
    expect(replay?.replayOf).toBe('row-1')
    expect(replay?.payload).toEqual(original.payload)
  })

  it('is null for a row whose job did not decode', () => {
    expect(replayEnvelope({ id: 'row-1', job: null })).toBeNull()
  })
})

describe('replayDeadJobs', () => {
  it('re-publishes dead rows oldest first and stamps them replayed', async () => {
    const older = newJobEnvelope('cache-warm', { paths: ['/'] })
    const newer = newJobEnvelope('search-outbox-drain', {})
    const rows: Row[] = [
      { id: 'b', job: newer, job_type: newer.type, status: 'dead', created_at: '2026-09-17T02' },
      { id: 'a', job: older, job_type: older.type, status: 'dead', created_at: '2026-09-17T01' },
      { id: 'c', job: older, job_type: older.type, status: 'replayed', created_at: '2026-09-16' },
    ]
    const { client } = fakeClient(rows)
    const publish = vi.fn().mockResolvedValue({ transport: 'qstash', messageId: 'm' })
    const now = new Date('2026-09-17T10:00:00.000Z')

    const results = await replayDeadJobs(client, publish, { now })
    expect(results.map((r) => [r.id, r.outcome])).toEqual([
      ['a', 'replayed'],
      ['b', 'replayed'],
    ])
    expect(publish).toHaveBeenCalledTimes(2)
    expect(publish.mock.calls[0]?.[0]).toMatchObject({
      type: 'cache-warm',
      replayCount: 1,
      replayOf: 'a',
    })
    expect(rows.find((r) => r.id === 'a')).toMatchObject({
      status: 'replayed',
      replayed_at: now.toISOString(),
    })
  })

  it('marks a job past MAX_REPLAYS exhausted instead of looping it, and shouts', async () => {
    const spent = { ...newJobEnvelope('cache-warm', { paths: ['/'] }), replayCount: MAX_REPLAYS }
    const rows: Row[] = [
      { id: 'x', job: spent, job_type: 'cache-warm', status: 'dead', created_at: '2026-09-17' },
    ]
    const { client } = fakeClient(rows)
    const publish = vi.fn()
    const results = await replayDeadJobs(client, publish)
    expect(results).toEqual([
      { id: 'x', outcome: 'exhausted', detail: `${MAX_REPLAYS} replays spent` },
    ])
    expect(publish).not.toHaveBeenCalled()
    expect(rows[0]?.status).toBe('exhausted')
    expect(logged.error).toHaveBeenCalledWith(
      'jobs.dlq_exhausted',
      expect.objectContaining({ id: 'x', type: 'cache-warm' }),
    )
  })

  it('discards a row whose envelope no longer parses', async () => {
    const rows: Row[] = [
      { id: 'y', job: { v: 7 }, job_type: null, status: 'dead', created_at: '2026-09-17' },
    ]
    const { client } = fakeClient(rows)
    const results = await replayDeadJobs(client, vi.fn())
    expect(results[0]?.outcome).toBe('discarded')
    expect(rows[0]?.status).toBe('discarded')
  })

  it('leaves a row dead when the publish itself fails, so the next sweep tries again', async () => {
    const envelope = newJobEnvelope('cache-warm', { paths: ['/'] })
    const rows: Row[] = [
      { id: 'z', job: envelope, job_type: 'cache-warm', status: 'dead', created_at: '2026-09-17' },
    ]
    const { client } = fakeClient(rows)
    const results = await replayDeadJobs(client, vi.fn().mockRejectedValue(new Error('qstash 503')))
    expect(results).toEqual([{ id: 'z', outcome: 'failed', detail: 'qstash 503' }])
    expect(rows[0]?.status).toBe('dead')
  })
})
