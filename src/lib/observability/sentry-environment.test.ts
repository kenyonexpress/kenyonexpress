import { sentryEnvironment } from '@/lib/observability/sentry-environment'
import { describe, expect, it } from 'vitest'

describe('sentryEnvironment', () => {
  it('separates a preview deployment from the shop', () => {
    // The whole point. `NODE_ENV` is `production` in both, so the previous
    // expression tagged them identically and one alert rule covered two very
    // different deployments.
    expect(sentryEnvironment({ VERCEL_ENV: 'production', NODE_ENV: 'production' })).toBe(
      'production',
    )
    expect(sentryEnvironment({ VERCEL_ENV: 'preview', NODE_ENV: 'production' })).toBe('preview')
  })

  it('lets the platform value beat a hand-set one', () => {
    // A preview environment that inherited production's variable list carries
    // SENTRY_ENVIRONMENT=production. VERCEL_ENV cannot be inherited, so it
    // wins. Same argument deploy-environment.ts makes for the staging banner.
    expect(sentryEnvironment({ VERCEL_ENV: 'preview', SENTRY_ENVIRONMENT: 'production' })).toBe(
      'preview',
    )
  })

  it('falls back to an explicit variable only off Vercel', () => {
    expect(sentryEnvironment({ SENTRY_ENVIRONMENT: 'staging' })).toBe('staging')
    expect(sentryEnvironment({ SENTRY_ENVIRONMENT: '  ' })).toBe('local')
  })

  it('calls a laptop local, and never production', () => {
    // `next start` on a laptop sets NODE_ENV=production. Reading that would
    // file a developer's errors beside the shop's, which is how the 203
    // development events in Sentry would have looked had NODE_ENV been used.
    expect(sentryEnvironment({ NODE_ENV: 'production' })).toBe('local')
    expect(sentryEnvironment({})).toBe('local')
  })

  it('does not guess at a value outside Vercel vocabulary', () => {
    // `deployEnvironment` refuses `prod` and `staging` on purpose; without an
    // explicit variable the answer stays `local` rather than being coerced.
    expect(sentryEnvironment({ VERCEL_ENV: 'prod' })).toBe('local')
    expect(sentryEnvironment({ VERCEL_ENV: 'prod', SENTRY_ENVIRONMENT: 'staging' })).toBe('staging')
  })
})
