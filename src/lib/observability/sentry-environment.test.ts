import { describe, expect, it } from 'vitest'
import { sentryEnvironment } from './sentry-environment'

describe('sentryEnvironment', () => {
  it('the platform value wins over a hand-set variable', () => {
    expect(sentryEnvironment({ VERCEL_ENV: 'preview', SENTRY_ENVIRONMENT: 'production' })).toBe(
      'preview',
    )
    expect(sentryEnvironment({ VERCEL_ENV: 'production' })).toBe('production')
  })

  it('a hand-set variable is the fallback off the platform', () => {
    expect(sentryEnvironment({ SENTRY_ENVIRONMENT: 'shop-b' })).toBe('shop-b')
  })

  it('staging is the one hand-set value that outranks the platform', () => {
    // The staging project's production branch is the staging deployment, so
    // the platform says `production` about the one host that is not.
    expect(sentryEnvironment({ VERCEL_ENV: 'production', SENTRY_ENVIRONMENT: 'staging' })).toBe(
      'staging',
    )
    expect(sentryEnvironment({ VERCEL_ENV: 'preview', SENTRY_ENVIRONMENT: ' staging ' })).toBe(
      'staging',
    )
    expect(sentryEnvironment({ SENTRY_ENVIRONMENT: 'staging' })).toBe('staging')
  })

  it('a laptop with neither is local, never production', () => {
    expect(sentryEnvironment({})).toBe('local')
    expect(sentryEnvironment({ VERCEL_ENV: '', SENTRY_ENVIRONMENT: '  ' })).toBe('local')
  })
})
