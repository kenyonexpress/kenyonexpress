import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE TELEMETRY MUST NOT BE ABLE TO BREAK THE JOB IT WATCHES.
 *
 * `withJobRun` sits between the scheduler and seventeen handlers, three of
 * which are on the money path. Everything worth testing here is a way for a
 * recorder to become an outage: a table that does not exist yet (the normal
 * state until 228 is approved), a database that is down, a response body it
 * reads and thereby consumes. Each of those has its own case below, and in
 * every one the handler's own response has to come back untouched.
 *
 * The second thing under test is what the wrapper declines to record. Every
 * cron route is a public URL, so a recorder that wrote a row per request would
 * be a table anyone on the internet can fill.
 */

const SECRET = 'test-cron-secret'

const insert = vi.fn()
const update = vi.fn()
const eq = vi.fn()
const single = vi.fn()
const select = vi.fn()
const from = vi.fn()
const createAdminClient = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => createAdminClient() }))

import { summariseBody, withJobRun } from './job-run'

/**
 * Wires the query-builder chain once. The leaf mocks (`single`, `eq`) are what
 * a test overrides to make the database misbehave, so this must not re-arm them
 * lazily: `createAdminClient` is called from inside the code under test, and a
 * factory that reset the chain there would silently undo the test's setup.
 */
function armWorkingClient() {
  single.mockResolvedValue({ data: { id: 'run-1' }, error: null })
  select.mockReturnValue({ single })
  insert.mockReturnValue({ select })
  eq.mockResolvedValue({ error: null })
  update.mockReturnValue({ eq })
  from.mockReturnValue({ insert, update })
}

function authorised(): NextRequest {
  return new NextRequest('https://shop.test/api/cron/x', {
    headers: { authorization: `Bearer ${SECRET}` },
  })
}

function anonymous(): NextRequest {
  return new NextRequest('https://shop.test/api/cron/x')
}

/** The patch passed to the nth `update`, asserted to exist. */
function updatePatch(nth = 0): Record<string, unknown> {
  const call = update.mock.calls[nth]
  expect(call).toBeDefined()
  return (call as unknown[])[0] as Record<string, unknown>
}

/** The row passed to the nth `insert`, asserted to exist. */
function insertedRow(nth = 0): Record<string, unknown> {
  const call = insert.mock.calls[nth]
  expect(call).toBeDefined()
  return (call as unknown[])[0] as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = SECRET
  armWorkingClient()
  createAdminClient.mockImplementation(() => ({ from }))
})

describe('withJobRun: it never changes what the handler returns', () => {
  it('passes the response through, status and body intact', async () => {
    const wrapped = withJobRun('x', async () => Response.json({ processed: 3 }, { status: 200 }))
    const res = await wrapped(authorised())

    expect(res.status).toBe(200)
    // The wrapper reads the body to record the counts. If it read the original
    // instead of a clone, this line would throw "Body is unusable".
    await expect(res.json()).resolves.toEqual({ processed: 3 })
  })

  it('runs the handler and records nothing when the table does not exist', async () => {
    // PGRST205 is what PostgREST answers for a table absent from the schema
    // cache, and it is the state of production until 228 is approved.
    single.mockResolvedValue({ data: null, error: { code: 'PGRST205', message: 'no such table' } })
    const handler = vi.fn(async () => Response.json({ ok: true }))
    const wrapped = withJobRun('x', handler)

    const res = await wrapped(authorised())

    expect(handler).toHaveBeenCalledOnce()
    expect(res.status).toBe(200)
    // No id came back, so there is nothing to close.
    expect(update).not.toHaveBeenCalled()
  })

  it('runs the handler when the database throws outright', async () => {
    createAdminClient.mockImplementation(() => {
      throw new Error('connection refused')
    })
    const wrapped = withJobRun('x', async () => Response.json({ ok: true }, { status: 200 }))

    await expect(wrapped(authorised())).resolves.toMatchObject({ status: 200 })
  })

  it('re-throws a handler error after recording it', async () => {
    const boom = new Error('handler exploded')
    const wrapped = withJobRun('x', async () => {
      throw boom
    })

    await expect(wrapped(authorised())).rejects.toThrow('handler exploded')
    expect(update).toHaveBeenCalledOnce()
    expect(updatePatch()).toMatchObject({ status: 'failed' })
  })
})

describe('withJobRun: what counts as a run, and what counts as success', () => {
  it('records nothing at all for a request without the secret', async () => {
    const handler = vi.fn(async () => Response.json({ ok: false }, { status: 401 }))
    const wrapped = withJobRun('x', handler)

    const res = await wrapped(anonymous())

    expect(res.status).toBe(401)
    expect(handler).toHaveBeenCalledOnce()
    // The whole point: a public URL must not let a stranger write rows.
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('records nothing when CRON_SECRET is unset, rather than recording everything', async () => {
    process.env.CRON_SECRET = undefined
    const wrapped = withJobRun('x', async () => Response.json({ ok: false }, { status: 401 }))

    await wrapped(
      new NextRequest('https://shop.test/api/cron/x', { headers: { authorization: 'Bearer ' } }),
    )

    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('opens the row as running before the handler runs', async () => {
    let insertedBeforeHandler = false
    const wrapped = withJobRun('nightly', async () => {
      insertedBeforeHandler = insert.mock.calls.length === 1
      return Response.json({ ok: true })
    })

    await wrapped(authorised())

    expect(insertedBeforeHandler).toBe(true)
    expect(insertedRow()).toEqual({ job_name: 'nightly', status: 'running' })
  })

  it('closes an ok run with a duration and the counts the job reported', async () => {
    const wrapped = withJobRun('x', async () => Response.json({ processed: 7, note: 'drained' }))

    await wrapped(authorised())

    const patch = updatePatch()
    expect(patch.status).toBe('ok')
    expect(patch.http_status).toBe(200)
    expect(patch.duration_ms).toBeGreaterThanOrEqual(0)
    expect(patch.detail).toEqual({ processed: 7, note: 'drained' })
    expect(eq).toHaveBeenCalledWith('id', 'run-1')
  })

  it('calls a 503 a failed run, whatever the body says', async () => {
    // /api/cron/health answers 503 by design when a dependency is down. That is
    // a job that did not do its work, and a green row there is the exact lie
    // this table exists to stop telling.
    const wrapped = withJobRun('health', async () => Response.json({ ok: false }, { status: 503 }))

    await wrapped(authorised())

    expect(updatePatch()).toMatchObject({ status: 'failed', http_status: 503 })
  })

  it('leaves the row running when the close fails, rather than losing the run', async () => {
    eq.mockResolvedValue({ error: { code: '08006', message: 'connection lost' } })
    const wrapped = withJobRun('x', async () => Response.json({ ok: true }))

    // The job still succeeds. The row stays `running` and job_runs_health()
    // reads it as a failure once it goes stale, which is the loud direction.
    await expect(wrapped(authorised())).resolves.toMatchObject({ status: 200 })
  })
})

describe('summariseBody', () => {
  it('keeps the counts and drops everything with structure', () => {
    expect(
      summariseBody({
        processed: 4,
        ok: true,
        note: 'fine',
        rows: [{ email: 'shopper@example.com' }],
        nested: { customer_id: 'abc' },
        nothing: null,
      }),
    ).toEqual({ processed: 4, ok: true, note: 'fine' })
  })

  it('truncates a long string instead of storing it', () => {
    const out = summariseBody({ message: 'x'.repeat(1000) })
    expect((out.message as string).length).toBe(200)
  })

  it('caps the number of keys', () => {
    const wide = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`k${i}`, i]))
    expect(Object.keys(summariseBody(wide)).length).toBe(24)
  })

  it('returns an empty object for anything that is not a plain object', () => {
    expect(summariseBody(null)).toEqual({})
    expect(summariseBody('text')).toEqual({})
    expect(summariseBody([1, 2, 3])).toEqual({})
    expect(summariseBody(undefined)).toEqual({})
  })
})
