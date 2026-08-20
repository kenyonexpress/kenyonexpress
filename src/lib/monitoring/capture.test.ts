import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The DSN is read at module load, so every test here imports the module AFTER
 * deciding what the environment says. `vi.resetModules()` in beforeEach is what
 * makes that a decision per test rather than per file.
 */

const captureException = vi.fn()
const captureMessage = vi.fn()

class FakeScope {
  tags: Record<string, string> = {}
  contexts: Record<string, unknown> = {}
  fingerprint: string[] | null = null
  level: string | null = null
  setTag(key: string, value: string) {
    this.tags[key] = value
  }
  setContext(key: string, value: unknown) {
    this.contexts[key] = value
  }
  setFingerprint(value: string[]) {
    this.fingerprint = value
  }
  setLevel(value: string) {
    this.level = value
  }
}

let scope: FakeScope

vi.mock('@sentry/nextjs', () => ({
  withScope: (fn: (s: FakeScope) => void) => fn(scope),
  captureException: (...args: unknown[]) => captureException(...args),
  captureMessage: (...args: unknown[]) => captureMessage(...args),
}))

async function load() {
  return await import('./capture')
}

beforeEach(() => {
  vi.resetModules()
  scope = new FakeScope()
  captureException.mockClear()
  captureMessage.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('without a DSN', () => {
  it('reports nothing at all', async () => {
    vi.stubEnv('SENTRY_DSN', '')
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')
    const { captureRouteError, captureRouteFailure } = await load()

    captureRouteError(new Error('boom'), { route: '/api/search' })
    captureRouteFailure('/api/search responded 500', { route: '/api/search', status: 500 })

    // Not "queued for later": nothing is built, so a test run and a laptop make
    // no network call and need no credential.
    expect(captureException).not.toHaveBeenCalled()
    expect(captureMessage).not.toHaveBeenCalled()
  })
})

describe('captureRouteError', () => {
  beforeEach(() => {
    vi.stubEnv('SENTRY_DSN', 'https://public@example.ingest.sentry.io/1')
  })

  it('tags the route and the area so payments stay a separate channel', async () => {
    const { captureRouteError } = await load()
    captureRouteError(new Error('meili down'), {
      route: '/api/search/suggest',
      stage: 'search_products',
      status: 200,
    })

    expect(captureException).toHaveBeenCalledTimes(1)
    expect(scope.tags.area).toBe('api')
    expect(scope.tags.route).toBe('/api/search/suggest')
    expect(scope.tags.stage).toBe('search_products')
    expect(scope.tags.status).toBe('200')
  })

  it('wraps a thrown non-Error, because catch blocks receive anything', async () => {
    const { captureRouteError } = await load()
    captureRouteError('a string was thrown', { route: '/api/cart' })

    const reported = captureException.mock.calls[0]?.[0]
    expect(reported).toBeInstanceOf(Error)
    expect((reported as Error).message).toBe('a string was thrown')
  })

  it('redacts the detail bag through the shared scrubber', async () => {
    const { captureRouteError } = await load()
    captureRouteError(new Error('x'), {
      route: '/api/app/session',
      detail: { user_ref: 'abc', access_token: 'live-token' },
    })

    const context = scope.contexts.route as Record<string, unknown>
    expect(context.user_ref).toBe('abc')
    expect(context.access_token).toBe('[redacted]')
  })

  it('never throws, whatever the SDK does', async () => {
    const { captureRouteError } = await load()
    captureException.mockImplementationOnce(() => {
      throw new Error('sentry itself failed')
    })

    // The whole contract: every call site is already on a failure branch, so an
    // error raised while reporting becomes the error the customer sees.
    expect(() => captureRouteError(new Error('x'), { route: '/api/cart' })).not.toThrow()
  })
})

describe('captureRouteFailure', () => {
  beforeEach(() => {
    vi.stubEnv('SENTRY_DSN', 'https://public@example.ingest.sentry.io/1')
  })

  it('is a message, not a synthesised exception', async () => {
    const { captureRouteFailure } = await load()
    captureRouteFailure('/api/cron/invoices responded 500', {
      route: '/api/cron/invoices',
      status: 500,
    })

    // A stack manufactured here would point at the reporter rather than the
    // fault, and Sentry would then group unrelated 500s together.
    expect(captureMessage).toHaveBeenCalledWith('/api/cron/invoices responded 500', 'error')
    expect(captureException).not.toHaveBeenCalled()
  })

  it('fingerprints by route and status, so one flapping route is one issue', async () => {
    const { captureRouteFailure } = await load()
    captureRouteFailure('anything', { route: '/api/cron/invoices', status: 503 })

    expect(scope.fingerprint).toEqual(['api-failure', '/api/cron/invoices', '503'])
  })
})
