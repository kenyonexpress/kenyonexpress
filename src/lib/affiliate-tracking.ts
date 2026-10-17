// Affiliate tracking utility for client-side attribution

export const AFFILIATE_COOKIE_NAME = 'aff_ref'
export const AFFILIATE_SESSION_COOKIE_NAME = 'aff_session'
export const AFFILIATE_COOKIE_DURATION_DAYS = 30

/**
 * Get or create session ID for affiliate tracking
 */
export function getOrCreateSessionId(): string {
  let sessionId = sessionStorage.getItem(AFFILIATE_SESSION_COOKIE_NAME)
  if (!sessionId) {
    // Generate a unique session ID
    sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    sessionStorage.setItem(AFFILIATE_SESSION_COOKIE_NAME, sessionId)
  }
  return sessionId
}

/**
 * Set affiliate cookie from URL parameter
 */
export function initializeAffiliateTracking(): void {
  // Check for affiliate code in URL query parameter or fragment
  const params = new URLSearchParams(window.location.search)
  const affiliateCode = params.get('aff') || params.get('affiliate')

  if (affiliateCode) {
    setCookie(AFFILIATE_COOKIE_NAME, affiliateCode, AFFILIATE_COOKIE_DURATION_DAYS)

    // Track the initial click
    trackAffiliateClick(affiliateCode)
  }
}

/**
 * Set a cookie with expiration
 */
function setCookie(name: string, value: string, days: number): void {
  const date = new Date()
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000)
  const expires = `expires=${date.toUTCString()}`
  document.cookie = `${name}=${encodeURIComponent(value)};${expires};path=/`
}

/**
 * Get cookie value
 */
function getCookie(name: string): string | null {
  const nameEQ = `${name}=`
  const cookies = document.cookie.split(';')
  for (const cookie of cookies) {
    const trimmed = cookie.trim()
    if (trimmed.startsWith(nameEQ)) {
      return decodeURIComponent(trimmed.substring(nameEQ.length))
    }
  }
  return null
}

/**
 * Track affiliate click
 */
export async function trackAffiliateClick(
  affiliateCode: string,
  productId?: number,
  categoryId?: number,
): Promise<void> {
  try {
    const sessionId = getOrCreateSessionId()

    const response = await fetch('/api/affiliate/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        affiliate_code: affiliateCode,
        session_id: sessionId,
        product_id: productId,
        category_id: categoryId,
        ip_address: null,
        user_agent: navigator.userAgent,
        referrer: document.referrer,
      }),
    })

    if (!response.ok) {
      console.error('Failed to track affiliate click:', await response.text())
    }
  } catch (error) {
    console.error('Error tracking affiliate click:', error)
    // Silently fail - don't break user experience
  }
}

/**
 * Get active affiliate code from cookie
 */
export function getActiveAffiliateCode(): string | null {
  return getCookie(AFFILIATE_COOKIE_NAME)
}

/**
 * Track affiliate click if code is present in cookie
 */
export function trackPageView(productId?: number, categoryId?: number): void {
  const affiliateCode = getActiveAffiliateCode()
  if (affiliateCode) {
    trackAffiliateClick(affiliateCode, productId, categoryId)
  }
}

/**
 * Attribute order to affiliate based on session
 * (Called server-side during order creation)
 */
export async function attributeOrderToAffiliate(
  orderId: number,
  sessionId?: string,
): Promise<boolean> {
  try {
    const sid = sessionId || sessionStorage.getItem(AFFILIATE_SESSION_COOKIE_NAME)
    if (!sid) {
      return false
    }

    const response = await fetch('/api/affiliate/attribute-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: orderId,
        session_id: sid,
      }),
    })

    if (!response.ok) {
      console.error('Failed to attribute order:', await response.text())
      return false
    }

    const result = await response.json()
    return result.data?.attributed === true
  } catch (error) {
    console.error('Error attributing order:', error)
    return false
  }
}
