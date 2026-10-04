/**
 * @vitest-environment jsdom
 */
import { CONSENT_COOKIE, CONSENT_WORDING_VERSION } from '@/lib/analytics/consent'
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
  // trackEvent gates itself on the consent cookie in a browser (W02). These
  // tests are about ROUTING after consent, so consent is given up front.
  document.cookie = `${CONSENT_COOKIE}=granted.${CONSENT_WORDING_VERSION}`
  fetchSpy.mockClear()
  vi.stubGlobal('fetch', fetchSpy)
  parkedWindow.__ke_posthog = undefined
})

afterEach(() => {
  document.cookie = `${CONSENT_COOKIE}=; Max-Age=0`
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

  it('hands the replay loader the same id events are keyed on', async () => {
    const { currentDistinctId } = await freshModule('phc_test')

    const first = currentDistinctId()
    expect(window.localStorage.getItem('ke_ph_distinct_id')).toBe(first)
    expect(currentDistinctId()).toBe(first)
  })
})

describe('trackEvent before consent, in a browser', () => {
  /**
   * The gate every client caller used to carry is now inside trackEvent. A
   * caller that forgets `trackingAllowed()` therefore sends nothing, mints no
   * distinct id and writes no mirror cookie: the three things a visitor who
   * has not clicked אישור must never get.
   */
  it.each([
    ['no decision', null],
    ['declined', `denied.${CONSENT_WORDING_VERSION}`],
    ['granted against superseded wording', `granted.${CONSENT_WORDING_VERSION - 1}`],
  ])('sends nothing when %s', async (_label, cookie) => {
    document.cookie = `${CONSENT_COOKIE}=; Max-Age=0`
    if (cookie) document.cookie = `${CONSENT_COOKIE}=${cookie}`
    // jsdom keeps document.cookie across tests; the routing tests above mint
    // an id legitimately, so start this one clean.
    document.cookie = 'ke_ph_id=; Max-Age=0'
    window.localStorage.removeItem('ke_ph_distinct_id')
    const capture = vi.fn()
    parkedWindow.__ke_posthog = { capture }
    const mod = await freshModule('phc_test')
    mod.trackEvent('view_product', { product_id: 'p1' })
    expect(capture).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(window.localStorage.getItem('ke_ph_distinct_id')).toBeNull()
    expect(document.cookie).not.toContain('ke_ph_id=')
  })
})
