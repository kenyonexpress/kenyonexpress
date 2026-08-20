import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const addBreadcrumb = vi.fn()

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: (...args: unknown[]) => addBreadcrumb(...args),
}))

async function load() {
  return await import('./breadcrumbs')
}

beforeEach(() => {
  vi.resetModules()
  addBreadcrumb.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('checkoutStep', () => {
  it('records nothing without a DSN', async () => {
    vi.stubEnv('SENTRY_DSN', '')
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')
    const { checkoutStep } = await load()

    checkoutStep('order_created', { order_id: 'ord-1' })
    expect(addBreadcrumb).not.toHaveBeenCalled()
  })

  describe('with a DSN', () => {
    beforeEach(() => {
      vi.stubEnv('SENTRY_DSN', 'https://public@example.ingest.sentry.io/1')
    })

    it('files every step under one category', async () => {
      const { checkoutStep } = await load()
      checkoutStep('order_created', { order_id: 'ord-1' })

      const crumb = addBreadcrumb.mock.calls[0]?.[0] as {
        category: string
        message: string
        data: Record<string, unknown>
      }
      // So that `category:checkout` in Sentry is the whole funnel, rather than
      // ten names somebody has to remember.
      expect(crumb.category).toBe('checkout')
      expect(crumb.message).toBe('order_created')
      expect(crumb.data.order_id).toBe('ord-1')
    })

    it('carries the request id, so the trail joins the log lines', async () => {
      const { checkoutStep } = await load()
      checkoutStep('cart_validated', { items: 2 })

      const crumb = addBreadcrumb.mock.calls[0]?.[0] as { data: Record<string, unknown> }
      // Null outside a request rather than absent: the field is always present,
      // which is what lets a search on it mean something.
      expect(crumb.data).toHaveProperty('request_id')
    })

    it('redacts, because a breadcrumb leaves the process with the event', async () => {
      const { checkoutStep } = await load()
      // Not reachable from the call sites today, and that is the point: the
      // guard has to hold for the field somebody adds next year.
      checkoutStep('saved_token_charge', {
        order_id: 'ord-1',
        cardcom_token: 'tok_live_abc',
      } as never)

      const crumb = addBreadcrumb.mock.calls[0]?.[0] as { data: Record<string, unknown> }
      expect(crumb.data.order_id).toBe('ord-1')
      expect(crumb.data.cardcom_token).toBe('[redacted]')
    })

    it('never throws, even if the SDK does', async () => {
      const { checkoutStep } = await load()
      addBreadcrumb.mockImplementationOnce(() => {
        throw new Error('sdk broke')
      })
      // Instrumentation that can fail a checkout is worse than none.
      expect(() => checkoutStep('finalize_started', {})).not.toThrow()
    })
  })
})

/**
 * The regression this file exists to catch is not a wrong crumb, it is a
 * MISSING one: someone rewrites a branch of checkout and the trail silently
 * loses the step that told the three payment routes apart. A unit test on the
 * helper cannot see that, so this walks the call sites.
 */
describe('the checkout trail', () => {
  const SRC = resolve(__dirname, '../..')

  function sources(dir: string): string[] {
    const found: string[] = []
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) found.push(...sources(path))
      else if (/\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path)) found.push(path)
    }
    return found
  }

  it('is recorded at every step the union names', () => {
    const called = new Set<string>()
    for (const file of sources(SRC)) {
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(/checkoutStep\(\s*'([a-z_]+)'/g)) {
        called.add(match[1] as string)
      }
    }

    const declared = readFileSync(join(__dirname, 'breadcrumbs.ts'), 'utf8')
      .split('export type CheckoutStep =')[1]
      ?.split('export type BreadcrumbData')[0]
    const union = [...(declared ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string)

    expect(union.length).toBeGreaterThan(0)
    expect([...union].sort()).toEqual([...called].sort())
  })
})
