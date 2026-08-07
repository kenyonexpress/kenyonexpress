import '@/lib/observability/request-store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withActionContext } from './action-context'
import { log } from './log'
import { getRequestContext } from './request-context'

/**
 * The Server Function half of the request id, which route handlers get for free
 * and actions do not.
 *
 * What this pins down is the whole chain a `'use server'` module depends on:
 * the forwarded header is read, the id survives the same validation the proxy
 * applies, it reaches a module that holds no reference to any of this, and --
 * the assertion that caught the first implementation -- it is gone again
 * afterwards. The `enterWith` version passed nothing here: it returned the
 * right id and bound it to nothing, because a store entered inside an awaited
 * helper never reaches the caller.
 */

const headerStore = { value: null as string | null, outsideRequest: false }

vi.mock('next/headers', () => ({
  headers: async () => {
    // What Next actually does off a request, rather than returning empty.
    if (headerStore.outsideRequest) {
      throw new Error('`headers` was called outside a request scope.')
    }
    const headers = new Headers()
    if (headerStore.value !== null) headers.set('x-request-id', headerStore.value)
    return headers
  },
}))

describe('withActionContext', () => {
  let error: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    headerStore.value = null
    headerStore.outsideRequest = false
    error = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('adopts the id the proxy forwarded on the action POST', async () => {
    headerStore.value = 'proxy-minted-7'

    const seen = await withActionContext('checkout.begin', async () => getRequestContext())

    expect(seen?.requestId).toBe('proxy-minted-7')
  })

  it('names the action rather than the verb, since every action is a POST', async () => {
    const seen = await withActionContext('order.refund', async () => getRequestContext())

    expect(seen?.route).toBe('action')
    expect(seen?.method).toBe('order.refund')
  })

  it('mints when the header did not arrive', async () => {
    const seen = await withActionContext('checkout.submit', async () => getRequestContext())

    expect(seen?.requestId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('applies the same validation the proxy does to an inbound value', async () => {
    headerStore.value = 'not a valid id'

    const seen = await withActionContext('checkout.submit', async () => getRequestContext())

    expect(seen?.requestId).not.toBe('not a valid id')
  })

  it('returns what the action returned', async () => {
    const result = await withActionContext('order.refund', async () => ({ ok: true as const }))
    expect(result).toEqual({ ok: true })
  })

  it('re-throws, so a failing action still fails', async () => {
    await expect(
      withActionContext('checkout.begin', async () => {
        throw new Error('cardcom refused')
      }),
    ).rejects.toThrow('cardcom refused')
  })

  it('reaches a module that holds no reference to any of this', async () => {
    headerStore.value = 'action-trace-1'

    await withActionContext('checkout.begin', async () => {
      // What lib/email/resend.ts actually emits, six levels down.
      log.error('email.send_failed', { reason: 'resend refused' })
    })

    const line = JSON.parse((error.mock.calls[0] as [string])[0])
    expect(line.request_id).toBe('action-trace-1')
    expect(line.method).toBe('checkout.begin')
  })

  it('survives the awaits a real action is made of', async () => {
    headerStore.value = 'deep-1'

    const seen = await withActionContext('checkout.submit', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      return (async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        return getRequestContext()?.requestId
      })()
    })

    expect(seen).toBe('deep-1')
  })

  it('leaves nothing behind, which is what enterWith could not promise', async () => {
    headerStore.value = 'scoped-1'
    await withActionContext('checkout.begin', async () => getRequestContext())

    expect(getRequestContext()).toBeUndefined()

    log.error('after.action', {})
    expect(JSON.parse((error.mock.calls[0] as [string])[0]).request_id).toBeNull()
  })

  it('still runs the action when there is no request to read an id from', async () => {
    // `headers()` throws outside a request scope rather than returning empty.
    // Four contact.ts unit tests failed on this line, on the wrapper and not on
    // anything they were testing, the moment that action was wrapped. A script
    // or a seeder calling an action reaches the same throw.
    headerStore.outsideRequest = true

    const seen = await withActionContext('contact.submit', async () => ({
      ran: true,
      context: getRequestContext(),
    }))

    expect(seen.ran).toBe(true)
    // No id rather than a wrong one, which is the same answer getRequestId
    // gives outside a request.
    expect(seen.context).toBeUndefined()
  })

  it('keeps two overlapping actions apart', async () => {
    const run = async (id: string, delay: number) => {
      headerStore.value = id
      return withActionContext(`action.${id}`, async () => {
        await new Promise((resolve) => setTimeout(resolve, delay))
        return getRequestContext()?.requestId
      })
    }

    // Started before either awaits, so both are in flight at once.
    const [first, second] = await Promise.all([run('alpha', 10), run('beta', 2)])

    expect(second).toBe('beta')
    // `headerStore` is read at entry, and `alpha` entered before `beta` set it.
    expect(first).toBe('alpha')
  })
})
