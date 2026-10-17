import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AFFILIATE_COOKIE_NAME,
  AFFILIATE_SESSION_COOKIE_NAME,
  getActiveAffiliateCode,
  getOrCreateSessionId,
  initializeAffiliateTracking,
  trackAffiliateClick,
  trackPageView,
} from './affiliate-tracking'

describe('Affiliate Tracking', () => {
  beforeEach(() => {
    // Clear cookies and session storage
    for (const c of document.cookie.split(';')) {
      const eqPos = c.indexOf('=')
      const name = eqPos > -1 ? c.substring(0, eqPos).trim() : c.trim()
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
    }
    sessionStorage.clear()

    // Mock fetch
    vi.stubGlobal('fetch', vi.fn())
  })

  it('should generate and store a session ID', async () => {
    const sessionId1 = getOrCreateSessionId()
    const sessionId2 = getOrCreateSessionId()

    expect(sessionId1).toBeDefined()
    expect(sessionId1).toBe(sessionId2) // Should return same ID on second call
    expect(sessionStorage.getItem(AFFILIATE_SESSION_COOKIE_NAME)).toBe(sessionId1)
  })

  it('should initialize affiliate tracking from URL parameter', () => {
    // Mock URL with affiliate parameter
    Object.defineProperty(window, 'location', {
      value: {
        search: '?aff=TEST123',
      },
      writable: true,
    })

    initializeAffiliateTracking()

    // Check that cookie was set
    const cookies = document.cookie.split(';').map((c) => c.trim())
    const affiliateCookie = cookies.find((c) => c.startsWith(AFFILIATE_COOKIE_NAME))
    expect(affiliateCookie).toBeDefined()
  })

  it('should track affiliate click with product ID', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { click_id: 1, affiliate_id: 1 } }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await trackAffiliateClick('TESTCODE', 123)

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/affiliate/track',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const call = mockFetch.mock.calls[0]
    expect(call).toBeDefined()
    const body = JSON.parse(call![1].body as string)
    expect(body.affiliate_code).toBe('TESTCODE')
    expect(body.product_id).toBe(123)
  })

  it('should track page view with active affiliate code', async () => {
    // Set affiliate cookie
    document.cookie = `${AFFILIATE_COOKIE_NAME}=AFFCODE123;path=/`

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    })
    vi.stubGlobal('fetch', mockFetch)

    trackPageView(456)

    expect(mockFetch).toHaveBeenCalled()
    const call = mockFetch.mock.calls[0]
    expect(call).toBeDefined()
    const body = JSON.parse(call![1].body as string)
    expect(body.affiliate_code).toBe('AFFCODE123')
    expect(body.category_id).toBe(456)
  })

  it('should not track if no affiliate code is present', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    trackPageView()

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('should get active affiliate code from cookie', () => {
    document.cookie = `${AFFILIATE_COOKIE_NAME}=TESTAFFCODE;path=/`

    const code = getActiveAffiliateCode()
    expect(code).toBe('TESTAFFCODE')
  })

  it('should return null when no affiliate code cookie exists', () => {
    const code = getActiveAffiliateCode()
    expect(code).toBeNull()
  })

  it('should handle fetch errors gracefully', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))
    vi.stubGlobal('fetch', mockFetch)

    // Should not throw
    await trackAffiliateClick('TESTCODE')

    expect(mockFetch).toHaveBeenCalled()
  })

  it('should handle failed fetch responses gracefully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => 'Server error',
    })
    vi.stubGlobal('fetch', mockFetch)

    // Should not throw
    await trackAffiliateClick('TESTCODE')

    expect(mockFetch).toHaveBeenCalled()
  })

  it('should encode special characters in cookie values', () => {
    const specialCode = 'TEST&CODE=123'
    document.cookie = `${AFFILIATE_COOKIE_NAME}=${encodeURIComponent(specialCode)};path=/`

    const code = getActiveAffiliateCode()
    expect(code).toBe(specialCode)
  })

  it('should include all tracking parameters in request', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await trackAffiliateClick('CODE123', 456, 789)

    const call = mockFetch.mock.calls[0]
    expect(call).toBeDefined()
    const body = JSON.parse(call![1].body as string)

    expect(body).toEqual(
      expect.objectContaining({
        affiliate_code: 'CODE123',
        product_id: 456,
        category_id: 789,
        user_agent: navigator.userAgent,
        referrer: document.referrer,
      }),
    )
  })
})
