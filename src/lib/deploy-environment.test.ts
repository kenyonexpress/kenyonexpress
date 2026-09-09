import { describe, expect, it } from 'vitest'
import { deployEnvironment, shouldShowEnvironmentBanner } from './deploy-environment'

/**
 * The two failures this distinction exists to keep apart are not symmetric.
 *
 * A production shop wearing a "test environment" ribbon teaches every customer
 * to ignore the ribbon, which costs the warning its meaning everywhere. A
 * staging shop with no ribbon takes a real card number. So production is the
 * one value that suppresses the banner, and everything else -- including a
 * value nobody recognises -- shows it.
 */

describe('deployEnvironment', () => {
  it('takes Vercel’s own per-deployment value', () => {
    expect(deployEnvironment({ VERCEL_ENV: 'production' })).toBe('production')
    expect(deployEnvironment({ VERCEL_ENV: 'preview' })).toBe('preview')
    expect(deployEnvironment({ VERCEL_ENV: 'development' })).toBe('development')
  })

  it('is local off the platform', () => {
    expect(deployEnvironment({})).toBe('local')
    expect(deployEnvironment({ NODE_ENV: 'production' })).toBe('local')
  })

  it('does not trust a value it does not recognise', () => {
    // `VERCEL_ENV=prod` is not production. Guessing would suppress the banner
    // on a deployment nobody has identified, which is the one direction that
    // costs a real card number.
    expect(deployEnvironment({ VERCEL_ENV: 'prod' })).toBe('local')
    expect(deployEnvironment({ VERCEL_ENV: 'staging' })).toBe('local')
  })

  it('cannot be set by a copied variable list', () => {
    // The reason this reads VERCEL_ENV and not something an operator types:
    // copying production's variables into the preview environment must not
    // make the preview claim to be production.
    expect(deployEnvironment({ VERCEL_ENV: 'preview', NEXT_PUBLIC_ENV_LABEL: 'production' })).toBe(
      'preview',
    )
  })
})

describe('shouldShowEnvironmentBanner', () => {
  it('is silent only on production', () => {
    expect(shouldShowEnvironmentBanner({ VERCEL_ENV: 'production' })).toBe(false)
  })

  it('speaks everywhere else, including where the value is missing', () => {
    for (const env of [{}, { VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'development' }]) {
      expect(shouldShowEnvironmentBanner(env)).toBe(true)
    }
  })
})
