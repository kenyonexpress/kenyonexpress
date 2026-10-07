import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The deferred browser SDK loader (STEP 34). What it has to guarantee:
 *
 *  1. one import and one `init()` however many callers race for it;
 *  2. an error thrown BEFORE the SDK arrived is still reported, once;
 *  3. the router hook is a silent no-op until the SDK is in, then forwards;
 *  4. a caller that never registered options (a unit test) gets the module
 *     without `init()`, so `vi.mock('@sentry/nextjs')` keeps working.
 */

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
  setTag: vi.fn(),
  setUser: vi.fn(),
  withScope: vi.fn(),
}))

vi.mock('@sentry/nextjs', () => sdk)

import {
  installEarlyErrorBuffer,
  isSentryLoaded,
  loadSentry,
  registerSentryOptions,
  resetSentryBrowserForTests,
  routerTransitionStart,
  scheduleSentryLoad,
  withSentry,
} from './sentry-browser'

beforeEach(() => {
  resetSentryBrowserForTests()
  sdk.init.mockClear()
  sdk.captureException.mockClear()
  sdk.captureRouterTransitionStart.mockClear()
  sdk.setUser.mockClear()
})

afterEach(() => {
  resetSentryBrowserForTests()
  vi.useRealTimers()
})

describe('loadSentry', () => {
  it('imports once and runs init() once with the registered options, however many callers', async () => {
    registerSentryOptions({ dsn: 'https://k@o.ingest.sentry.io/1', tracesSampleRate: 0.1 })
    const [a, b, c] = await Promise.all([loadSentry(), loadSentry(), loadSentry()])
    expect(a).toBe(b)
    expect(b).toBe(c)
    expect(sdk.init).toHaveBeenCalledTimes(1)
    expect(sdk.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://k@o.ingest.sentry.io/1', tracesSampleRate: 0.1 }),
    )
    expect(isSentryLoaded()).toBe(true)
    await loadSentry()
    expect(sdk.init).toHaveBeenCalledTimes(1)
  })

  it('returns the module without init() when nothing registered options', async () => {
    const module = await loadSentry()
    expect(module.setUser).toBe(sdk.setUser)
    expect(sdk.init).not.toHaveBeenCalled()
    expect(isSentryLoaded()).toBe(false)
  })

  it('withSentry runs the callback against the loaded module and swallows a throwing one', async () => {
    withSentry((Sentry) => Sentry.setUser({ id: 'u1' }))
    withSentry(() => {
      throw new Error('callback bug')
    })
    await vi.waitFor(() => expect(sdk.setUser).toHaveBeenCalledWith({ id: 'u1' }))
  })
})

describe('the early error buffer', () => {
  // A detached target rather than `window`: jsdom forwards a dispatched
  // ErrorEvent to vitest's own uncaught-exception hook, which would report the
  // very error this test is about as a failure of the run.
  const target = () => new EventTarget() as unknown as Window

  it('replays an error thrown before the SDK arrived, once, and stops listening', async () => {
    registerSentryOptions({ dsn: 'https://k@o.ingest.sentry.io/1' })
    const win = target()
    installEarlyErrorBuffer(win)

    const early = new Error('hydration crashed')
    win.dispatchEvent(new ErrorEvent('error', { error: early, message: early.message }))

    await vi.waitFor(() => expect(sdk.captureException).toHaveBeenCalledWith(early))
    expect(sdk.captureException).toHaveBeenCalledTimes(1)
    // init() ran before the replay, so the SDK's own handlers were in place.
    expect(sdk.init.mock.invocationCallOrder[0]).toBeLessThan(
      sdk.captureException.mock.invocationCallOrder[0] ?? 0,
    )

    // After the flush the buffer's listeners are gone: a later error is the
    // SDK's to catch, not ours to duplicate.
    win.dispatchEvent(new ErrorEvent('error', { error: new Error('later'), message: 'later' }))
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(sdk.captureException).toHaveBeenCalledTimes(1)
  })

  it('wraps an unhandled rejection reason that is not an Error', async () => {
    registerSentryOptions({ dsn: 'https://k@o.ingest.sentry.io/1' })
    const win = target()
    installEarlyErrorBuffer(win)
    // jsdom has no PromiseRejectionEvent constructor; a plain Event with the
    // field the handler reads is what the browser hands over.
    const event = Object.assign(new Event('unhandledrejection'), { reason: 'string reason' })
    win.dispatchEvent(event)
    await vi.waitFor(() => expect(sdk.captureException).toHaveBeenCalledTimes(1))
    const sent = sdk.captureException.mock.calls[0]?.[0] as Error
    expect(sent).toBeInstanceOf(Error)
    expect(sent.message).toBe('string reason')
  })
})

describe('scheduling and the router hook', () => {
  it('routerTransitionStart drops the call before load and forwards after', async () => {
    routerTransitionStart('/cart', 'push')
    expect(sdk.captureRouterTransitionStart).not.toHaveBeenCalled()
    await loadSentry()
    routerTransitionStart('/checkout', 'push')
    expect(sdk.captureRouterTransitionStart).toHaveBeenCalledWith('/checkout', 'push')
  })

  it('uses requestIdleCallback with a timeout when the browser has it', () => {
    const ric = vi.fn()
    scheduleSentryLoad({ requestIdleCallback: ric, setTimeout: vi.fn() } as unknown as Window)
    expect(ric).toHaveBeenCalledWith(expect.any(Function), { timeout: 3000 })
  })

  it('falls back to a timer where requestIdleCallback is missing (Safari)', () => {
    const timer = vi.fn()
    scheduleSentryLoad({ setTimeout: timer } as unknown as Window)
    expect(timer).toHaveBeenCalledWith(expect.any(Function), 1500)
  })
})
