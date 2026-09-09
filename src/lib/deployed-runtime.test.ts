import { isDeployedRuntime } from '@/lib/deployed-runtime'
import { describe, expect, it } from 'vitest'

/**
 * THE REGRESSION THIS FILE EXISTS TO PREVENT.
 *
 * A boot-time guard was keyed on `NODE_ENV === 'production'` on the reasoning
 * that production means a deployment. It does not: `next start` on a laptop is
 * `NODE_ENV=production`, and that is the exact command every local gate uses to
 * measure a production build. The guard threw, `pnpm start` answered 500 on
 * every route, and the homepage pixel gate read 26.30% at 380 against an 11%
 * ceiling -- it had measured an error page.
 *
 * So the first test below is the one that matters, and it is written as the
 * scenario rather than as a truth-table row.
 */
describe('isDeployedRuntime', () => {
  it('does not call a local `next start` a deployment', () => {
    // `pnpm start` on this machine, with .env.local loaded. NODE_ENV is
    // production because `next start` sets it, and the waiver marks the run as
    // local. If this ever returns true again, every local production-mode gate
    // is measuring an error page.
    expect(isDeployedRuntime({ NODE_ENV: 'production', ALLOW_INCOMPLETE_ENV: 'true' })).toBe(false)
  })

  it('calls a production server without the local waiver a deployment', () => {
    // Fail closed. Absent any marker at all, production is treated as real.
    expect(isDeployedRuntime({ NODE_ENV: 'production' })).toBe(true)
    expect(isDeployedRuntime({ NODE_ENV: 'production', ALLOW_INCOMPLETE_ENV: 'false' })).toBe(true)
  })

  it('lets the platform marker outrank the local waiver', () => {
    // The waiver must not be usable to disarm a guard by pasting it into the
    // project's environment variables on the platform.
    expect(isDeployedRuntime({ VERCEL: '1', ALLOW_INCOMPLETE_ENV: 'true' })).toBe(true)
    expect(
      isDeployedRuntime({
        VERCEL_ENV: 'production',
        NODE_ENV: 'production',
        ALLOW_INCOMPLETE_ENV: 'true',
      }),
    ).toBe(true)
    // A preview deploy is still a deploy, and still reachable.
    expect(isDeployedRuntime({ VERCEL_ENV: 'preview', ALLOW_INCOMPLETE_ENV: 'true' })).toBe(true)
  })

  it('does not call development or test a deployment', () => {
    expect(isDeployedRuntime({ NODE_ENV: 'development' })).toBe(false)
    expect(isDeployedRuntime({ NODE_ENV: 'test' })).toBe(false)
    expect(isDeployedRuntime({})).toBe(false)
  })

  it('reads the live environment when given no argument', () => {
    // The default parameter is the whole call site in `src/lib/env.ts`, so it
    // has to be exercised rather than assumed. Under vitest NODE_ENV is `test`.
    expect(isDeployedRuntime()).toBe(false)
  })
})
