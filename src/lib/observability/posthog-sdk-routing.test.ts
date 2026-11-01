/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Which pipe an event leaves through, once the session-replay SDK is mounted.
 *
 * The point of routing through the SDK is `$session_id`: an event the SDK
 * sends is linked to the recording it happened inside, one a bare fetch sends
 * is not. The trap on the other side is the server: trackServerEvent passes an
 * explicit distinctId, and the SDK would override it with the browser's, so an
 * explicit id must stay on the fetch path. Both directions are pinned here.
 *
 * The module reads NEXT_PUBLIC_POSTHOG_KEY at import, so each test imports a
 * fresh copy behind resetModules.
 */

type PostHogModule = typeof import('./posthog')

const parkedWindow = window as unknown as { __ke_posthog?: { capture: ReturnType<typeof vi.fn> } }

async function freshModule(key: string): Promise<PostHogModule> {
  vi.resetModules()
  // An empty string is how "unset" is simulated: assigning undefined to
  // process.env coerces to the string "undefined", and the module only asks
  // Boolean(KEY).
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', key)
  return await import('./posthog')
}

const fetchSpy = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })))

beforeEach(() => {
  fetchSpy.mockClear()
  vi.stubGlobal('fetch', fetchSpy)
  parkedWindow.__ke_posthog = undefined
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  parkedWindow.__ke_posthog = undefined
})

describe('trackEvent routing', () => {
  it('goes through the parked SDK client when one is mounted', async () => {
    const { trackEvent } = await freshModule('phc_test')
    const capture = vi.fn()
    parkedWindow.__ke_posthog = { capture }

    trackEvent('add_to_cart', { product_id: 'p1' })

    expect(capture).toHaveBeenCalledTimes(1)
    expect(capture).toHaveBeenCalledWith('add_to_cart', {
      product_id: 'p1',
      $lib: 'kenyonexpress-fetch',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('keeps an explicit distinctId on the fetch path, SDK or no SDK', async () => {
    const { trackEvent } = await freshModule('phc_test')
    const capture = vi.fn()
    parkedWindow.__ke_posthog = { capture }

    trackEvent('purchase', { order_id: 'o1' }, { distinctId: 'server-chosen' })

    expect(capture).not.toHaveBeenCalled()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const requestInit = (fetchSpy.mock.calls[0] as unknown[])[1] as { body: string }
    const body = JSON.parse(requestInit.body)
    expect(body.distinct_id).toBe('server-chosen')
    expect(body.event).toBe('purchase')
  })

  it('falls back to fetch when no SDK is mounted', async () => {
    const { trackEvent } = await freshModule('phc_test')

    trackEvent('checkout_step', { step: 'address' })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('sends through neither pipe without a key', async () => {
    const { trackEvent } = await freshModule('')
    const capture = vi.fn()
    parkedWindow.__ke_posthog = { capture }

    trackEvent('add_to_cart', { product_id: 'p1' })

    expect(capture).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('folds person properties into $set on the fetch path', async () => {
    const { trackEvent } = await freshModule('phc_test')

    trackEvent('$set', {}, { distinctId: 'user-9', set: { cashback_tier: 'gold' } })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const requestInit = (fetchSpy.mock.calls[0] as unknown[])[1] as { body: string }
    const body = JSON.parse(requestInit.body)
    expect(body.properties.$set).toEqual({ cashback_tier: 'gold' })
    expect(body.distinct_id).toBe('user-9')
  })

  it('folds person properties into $set on the SDK path too', async () => {
    const { trackEvent } = await freshModule('phc_test')
    const capture = vi.fn()
    parkedWindow.__ke_posthog = { capture }

    trackEvent('page_view', { route: '/' }, { set: { cashback_tier: 'bronze' } })

    expect(capture).toHaveBeenCalledTimes(1)
    const properties = (capture.mock.calls[0] as unknown[])[1] as Record<string, unknown>
    expect(properties.$set).toEqual({ cashback_tier: 'bronze' })
  })

  it('hands the replay loader the same id events are keyed on', async () => {
    const { currentDistinctId } = await freshModule('phc_test')

    const first = currentDistinctId()
    expect(window.localStorage.getItem('ke_ph_distinct_id')).toBe(first)
    expect(currentDistinctId()).toBe(first)
  })
})
