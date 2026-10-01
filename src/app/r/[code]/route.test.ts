import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const checkRateLimit = vi.fn()
const getClientIp = vi.fn()

vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  getClientIp: () => getClientIp(),
}))

const { GET } = await import('./route')

function get(code: string): Promise<Response> {
  const request = new NextRequest(`https://kenyonexpress.co.il/r/${code}`)
  return GET(request, { params: Promise.resolve({ code }) })
}

async function location(code: string): Promise<URL> {
  const res = await get(code)
  expect(res.status).toBe(307)
  return new URL(res.headers.get('location') ?? '')
}

beforeEach(() => {
  checkRateLimit.mockReset()
  getClientIp.mockReset()
  checkRateLimit.mockResolvedValue(true)
  getClientIp.mockResolvedValue('203.0.113.9')
})

describe('/r/[code]', () => {
  it('forwards a well formed code to the home page as ?ref=', async () => {
    const url = await location('AB12CD34')
    expect(url.pathname).toBe('/')
    expect(url.searchParams.get('ref')).toBe('AB12CD34')
  })

  it('normalises the code the same way a typed one would be', async () => {
    const url = await location('ab12cd34')
    expect(url.searchParams.get('ref')).toBe('AB12CD34')
  })

  it('carries no UTM campaign, because the same code also shares the affiliate programme', async () => {
    const url = await location('AB12CD34')
    expect(url.searchParams.get('utm_campaign')).toBeNull()
  })

  it('sends a malformed code home with no ref param, same as a bad coupon code', async () => {
    const url = await location('not-a-code')
    expect(url.pathname).toBe('/')
    expect(url.searchParams.has('ref')).toBe(false)
  })

  it('does not spend the rate limit budget on a malformed code', async () => {
    await get('not-a-code')
    expect(checkRateLimit).not.toHaveBeenCalled()
  })

  it('refuses a well formed code once the per-IP budget is spent', async () => {
    checkRateLimit.mockResolvedValue(false)
    const url = await location('AB12CD34')
    expect(url.pathname).toBe('/')
    expect(url.searchParams.has('ref')).toBe(false)
  })

  it('spends the budget keyed on the visitor IP', async () => {
    await get('AB12CD34')
    expect(checkRateLimit).toHaveBeenCalledWith('referral_link_visit:ip:203.0.113.9', 60, 3600)
  })

  it('never sets a cookie: the proxy is the only capture point', async () => {
    const res = await get('AB12CD34')
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})
