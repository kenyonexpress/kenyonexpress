import { describe, expect, it } from 'vitest'
import { LANDING_BUCKET_COOKIE_PATH, landingBucketCookieOptions } from './bucket-cookie'
import { LANDING_BUCKET_MAX_AGE_SECONDS } from './variant'

describe('landingBucketCookieOptions', () => {
  it('is httpOnly, lax, scoped to /lp and secure only over https', () => {
    expect(landingBucketCookieOptions('https')).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      maxAge: LANDING_BUCKET_MAX_AGE_SECONDS,
      path: LANDING_BUCKET_COOKIE_PATH,
      secure: true,
    })
    expect(landingBucketCookieOptions('http:').secure).toBe(false)
    expect(landingBucketCookieOptions(null).secure).toBe(false)
  })

  it('lives 90 days, the figure the cookie policy prints', () => {
    expect(LANDING_BUCKET_MAX_AGE_SECONDS).toBe(60 * 60 * 24 * 90)
    expect(LANDING_BUCKET_COOKIE_PATH).toBe('/lp')
  })
})
