import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE ROUTE MUST SURVIVE THE FUNCTION SIGNATURE THAT IS ACTUALLY DEPLOYED.
 *
 * `fn_due_abandoned_carts` gained a third parameter in pending/190. Production
 * still has the two-parameter version, and PostgREST resolves a routine by the
 * exact SET of argument names it is given - so a call naming
 * `p_second_after_hours` matches no candidate and comes back PGRST202. Measured
 * against production, where the two-argument call returns rows and the
 * three-argument call raises `undefined_function`.
 *
 * The route used to make only the wide call, behind a comment asserting the
 * narrow function would "ignore" the extra argument. It does not, so the route
 * returned 500 on every run and not one recovery email was ever sent. Nothing
 * failed loudly, because a cron nobody calls cannot report that it is broken.
 *
 * These tests pin both directions, because fixing this in one direction only is
 * how it comes back: a deployment WITH 190 must not pay for a second round trip.
 */

const { createAdminClient, sendEmail } = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  sendEmail: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))
vi.mock('@/lib/growth/resend', () => ({ sendEmail }))

import { GET } from './route'

function request(): NextRequest {
  return new NextRequest('https://example.test/api/cron/abandoned-cart', {
    headers: { authorization: 'Bearer s3cret' },
  })
}

/** `noUncheckedIndexedAccess` is on, and a missing call should fail as a
 *  missing call rather than as a type error at the assertion. */
function argNames(calls: Record<string, unknown>[], index: number): string[] {
  const call = calls[index]
  if (!call) throw new Error(`expected an rpc call at index ${index}, saw ${calls.length}`)
  return Object.keys(call).sort()
}

/** Records every rpc call so the argument SETS can be asserted, not just counts. */
function client(responder: (args: Record<string, unknown>) => { data: unknown; error: unknown }) {
  const calls: Record<string, unknown>[] = []
  return {
    calls,
    client: {
      rpc: (_fn: string, args: Record<string, unknown>) => {
        calls.push(args)
        return Promise.resolve(responder(args))
      },
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
      }),
    },
  }
}

const PGRST202 = { code: 'PGRST202', message: 'Could not find the function in the schema cache' }

describe('abandoned-cart cron against the deployed signature', () => {
  beforeEach(() => {
    createAdminClient.mockReset()
    sendEmail.mockReset()
    vi.stubEnv('CRON_SECRET', 's3cret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('retries without p_second_after_hours when the routine is the pre-190 one', async () => {
    const { calls, client: c } = client((args) =>
      'p_second_after_hours' in args ? { data: null, error: PGRST202 } : { data: [], error: null },
    )
    createAdminClient.mockReturnValue(c)

    const response = await GET(request())

    // The bug was that this was a 500.
    expect(response.status).toBe(200)
    expect(calls).toHaveLength(2)
    expect(argNames(calls, 0)).toEqual(['p_limit', 'p_older_than_hours', 'p_second_after_hours'])
    // The retry must DROP the argument, not merely set it to null: PostgREST
    // matches on the presence of the name, so a null would fail identically.
    expect(argNames(calls, 1)).toEqual(['p_limit', 'p_older_than_hours'])
  })

  it('makes exactly one call when 190 is applied', async () => {
    const { calls, client: c } = client(() => ({ data: [], error: null }))
    createAdminClient.mockReturnValue(c)

    expect((await GET(request())).status).toBe(200)
    expect(calls).toHaveLength(1)
    expect(argNames(calls, 0)).toContain('p_second_after_hours')
  })

  it('still fails loudly on an error that is not a missing routine', async () => {
    // A connection failure must not be quietly retried into a narrower call and
    // then reported as a successful run over zero carts.
    const { calls, client: c } = client(() => ({
      data: null,
      error: { code: '08006', message: 'connection failure' },
    }))
    createAdminClient.mockReturnValue(c)

    expect((await GET(request())).status).toBe(500)
    expect(calls).toHaveLength(1)
  })

  it('treats 42883 the same as PGRST202, because both mean the routine is not there', async () => {
    const { calls, client: c } = client((args) =>
      'p_second_after_hours' in args
        ? { data: null, error: { code: '42883', message: 'function does not exist' } }
        : { data: [], error: null },
    )
    createAdminClient.mockReturnValue(c)

    expect((await GET(request())).status).toBe(200)
    expect(calls).toHaveLength(2)
  })
})
