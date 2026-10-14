import { describe, expect, it } from 'vitest'
import {
  STAGING_GATE_EXEMPT_EXACT,
  STAGING_GATE_EXEMPT_PREFIXES,
  STAGING_PASSWORD_HEADER,
  STAGING_REALM,
  basicAuthPassword,
  constantTimeEqual,
  isStagingGateExempt,
  stagingChallengeResponse,
  stagingGateDecision,
  stagingPasswordFromEnv,
} from './gate'

const PASSWORD = 'correct-horse-battery'

function headers(init: Record<string, string> = {}) {
  return new Headers(init)
}

function basic(user: string, password: string) {
  return `Basic ${btoa(`${user}:${password}`)}`
}

describe('stagingPasswordFromEnv', () => {
  it('is null for every environment but staging', () => {
    expect(stagingPasswordFromEnv({})).toBeNull()
    expect(stagingPasswordFromEnv({ STAGING_PASSWORD: '' })).toBeNull()
    expect(stagingPasswordFromEnv({ STAGING_PASSWORD: '   ' })).toBeNull()
  })

  it('trims the value it finds', () => {
    expect(stagingPasswordFromEnv({ STAGING_PASSWORD: ` ${PASSWORD} ` })).toBe(PASSWORD)
  })
})

describe('constantTimeEqual', () => {
  it('agrees with === on equal and unequal strings', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true)
    expect(constantTimeEqual('abc', 'abd')).toBe(false)
    expect(constantTimeEqual('abc', 'ab')).toBe(false)
    expect(constantTimeEqual('', '')).toBe(true)
    expect(constantTimeEqual('', 'a')).toBe(false)
  })

  it('a prefix of the password is not the password', () => {
    expect(constantTimeEqual(PASSWORD.slice(0, 5), PASSWORD)).toBe(false)
    expect(constantTimeEqual(`${PASSWORD}x`, PASSWORD)).toBe(false)
  })

  it('handles non-ASCII', () => {
    expect(constantTimeEqual('סיסמה', 'סיסמה')).toBe(true)
    expect(constantTimeEqual('סיסמה', 'סיסמא')).toBe(false)
  })
})

describe('basicAuthPassword', () => {
  it('takes the password after the first colon, any user', () => {
    expect(basicAuthPassword(basic('ofir', PASSWORD))).toBe(PASSWORD)
    expect(basicAuthPassword(basic('', PASSWORD))).toBe(PASSWORD)
    expect(basicAuthPassword(basic('a', 'p:with:colons'))).toBe('p:with:colons')
  })

  it('a token without a colon is the password alone', () => {
    expect(basicAuthPassword(`Basic ${btoa(PASSWORD)}`)).toBe(PASSWORD)
  })

  it('rejects anything that is not Basic', () => {
    expect(basicAuthPassword(null)).toBeNull()
    expect(basicAuthPassword('')).toBeNull()
    expect(basicAuthPassword('Bearer abc')).toBeNull()
    expect(basicAuthPassword('Basic')).toBeNull()
    expect(basicAuthPassword('Basic not*base64')).toBeNull()
  })

  it('is case-insensitive on the scheme, as RFC 7235 says', () => {
    expect(basicAuthPassword(`basic ${btoa(`u:${PASSWORD}`)}`)).toBe(PASSWORD)
  })
})

describe('isStagingGateExempt', () => {
  it('lets every machine-credentialed path through', () => {
    for (const path of [
      '/monitoring',
      '/monitoring/',
      '/api/cron',
      '/api/cron/health',
      '/api/payments/cardcom',
      '/api/webhooks/twilio-sms',
      '/api/alerts/sentry',
      '/api/jobs/run',
      '/api/app/session',
      '/api/supplier/app',
      '/api/health',
      '/api/ready',
      '/api/revalidate',
    ]) {
      expect(isStagingGateExempt(path), path).toBe(true)
    }
  })

  it('gates the pages and the browser-facing API', () => {
    for (const path of [
      '/',
      '/product/x',
      '/checkout',
      '/admin',
      '/api/search',
      '/api/cart/sync',
      '/api/supplier/redeem',
      '/api/healthz',
      '/api/health/',
      '/monitoring-x',
    ]) {
      expect(isStagingGateExempt(path), path).toBe(false)
    }
  })

  it('every exempt prefix ends with a slash, every exact path has none', () => {
    for (const prefix of STAGING_GATE_EXEMPT_PREFIXES) {
      expect(prefix.endsWith('/'), prefix).toBe(true)
    }
    for (const exact of STAGING_GATE_EXEMPT_EXACT) {
      expect(exact.endsWith('/'), exact).toBe(false)
    }
  })
})

describe('stagingGateDecision', () => {
  it('challenges a bare browser request', () => {
    expect(stagingGateDecision({ pathname: '/', headers: headers() }, PASSWORD)).toEqual({
      kind: 'challenge',
      reason: 'missing',
    })
  })

  it('passes a Basic credential with the right password and any user', () => {
    expect(
      stagingGateDecision(
        { pathname: '/', headers: headers({ authorization: basic('anyone', PASSWORD) }) },
        PASSWORD,
      ),
    ).toEqual({ kind: 'pass', via: 'basic' })
  })

  it('challenges a wrong Basic password', () => {
    expect(
      stagingGateDecision(
        { pathname: '/', headers: headers({ authorization: basic('anyone', 'nope') }) },
        PASSWORD,
      ),
    ).toEqual({ kind: 'challenge', reason: 'wrong' })
  })

  it('passes the machine header and refuses a wrong one', () => {
    expect(
      stagingGateDecision(
        { pathname: '/api/search', headers: headers({ [STAGING_PASSWORD_HEADER]: PASSWORD }) },
        PASSWORD,
      ),
    ).toEqual({ kind: 'pass', via: 'header' })
    expect(
      stagingGateDecision(
        { pathname: '/api/search', headers: headers({ [STAGING_PASSWORD_HEADER]: 'nope' }) },
        PASSWORD,
      ),
    ).toEqual({ kind: 'challenge', reason: 'wrong' })
  })

  it('a wrong machine header is not rescued by a right Basic one', () => {
    // The header is the explicit claim; a client that sends it is a machine
    // and gets judged on it.
    expect(
      stagingGateDecision(
        {
          pathname: '/',
          headers: headers({
            [STAGING_PASSWORD_HEADER]: 'nope',
            authorization: basic('u', PASSWORD),
          }),
        },
        PASSWORD,
      ),
    ).toEqual({ kind: 'challenge', reason: 'wrong' })
  })

  it('a Bearer header on a gated path is not a password', () => {
    expect(
      stagingGateDecision(
        { pathname: '/api/search', headers: headers({ authorization: `Bearer ${PASSWORD}` }) },
        PASSWORD,
      ),
    ).toEqual({ kind: 'challenge', reason: 'missing' })
  })

  it('an exempt path passes with no credential at all', () => {
    expect(
      stagingGateDecision({ pathname: '/api/cron/health', headers: headers() }, PASSWORD),
    ).toEqual({
      kind: 'pass',
      via: 'exempt',
    })
  })
})

describe('stagingChallengeResponse', () => {
  it('is a 401 with a Basic challenge the browser can answer', async () => {
    const response = stagingChallengeResponse()
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe(
      `Basic realm="${STAGING_REALM}", charset="UTF-8"`,
    )
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(response.headers.get('content-type')).toContain('text/html')
  })

  it('is Hebrew, RTL, and carries no script or inline style for the CSP to refuse', async () => {
    const body = await stagingChallengeResponse().text()
    expect(body).toContain('dir="rtl"')
    expect(body).toContain('lang="he"')
    expect(body).toContain('סביבת הבדיקות')
    expect(body).not.toMatch(/<script|style=|<style/i)
  })

  it('has mutable headers, so the proxy can stamp the CSP and request id on it', () => {
    const response = stagingChallengeResponse()
    response.headers.set('x-request-id', 'r1')
    expect(response.headers.get('x-request-id')).toBe('r1')
  })
})
