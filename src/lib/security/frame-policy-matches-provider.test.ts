import { loadCardcomEnv } from '@/lib/payments/env'
import { usesMockPaymentProvider } from '@/lib/security/frame-policy'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE CSP AND THE PAYMENT PROVIDER HAVE TO AGREE ABOUT THE MOCK.
 *
 * The mock provider's hosted page lives on OUR origin. The real one lives on
 * `secure.cardcom.solutions`. The checkout mounts whichever it is handed in an
 * iframe, so `frame-src` has to name the right one - and the two decisions are
 * made in different files, from the same environment, by different code.
 *
 * They disagreed. `frame-src` named Cardcom unconditionally while
 * `loadCardcomEnv().useMock` was picking the mock, and the result was measured
 * on 2026-09-10 against the production build:
 *
 *   Framing 'http://localhost:3311/checkout/frame-return?...' violates the
 *   following Content Security Policy directive: "frame-src
 *   https://secure.cardcom.solutions". The request has been blocked.
 *
 * An empty box under a filled-in checkout, an order stuck at `pending`, and
 * nothing in any server log - the browser is the only party that knows. Every
 * local checkout and every preview deployment was in that state.
 *
 * A DISAGREEMENT IN EITHER DIRECTION IS A BROKEN CHECKOUT, which is why this
 * is a matrix and not a single case. Closed while the mock serves is the frame
 * above. Open while the real provider serves is a needlessly loose CSP on a
 * page that takes card details.
 *
 * `frame-policy.ts` cannot import `loadCardcomEnv` - `next.config.ts` loads it
 * before the path aliases exist - so it restates the rule, and this file is
 * what keeps the restatement true.
 */

/**
 * A plain string map rather than `NodeJS.ProcessEnv`. The ambient type makes
 * `NODE_ENV` required and read-only, which is exactly what a matrix over it
 * cannot honour; `loadCardcomEnv` takes a `ProcessEnv` and reads it, so the
 * cast happens at the call.
 */
type EnvCase = Record<string, string | undefined>

const asProcessEnv = (env: EnvCase): NodeJS.ProcessEnv => env as NodeJS.ProcessEnv

const VARIABLES = ['CARDCOM_USE_MOCK', 'NODE_ENV', 'CARDCOM_TERMINAL_NUMBER'] as const

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  // `unstubAllEnvs` rather than a saved copy: NODE_ENV is read-only on the
  // ambient type and vitest's stub is the supported way to move it.
  vi.unstubAllEnvs()
})

/**
 * The rest of the Cardcom credentials, present in every case.
 *
 * `loadCardcomEnv` THROWS on a missing one once it has decided not to mock, so
 * without these the non-mock half of the matrix would fail on the credentials
 * rather than answer the question this file asks. They are constants because
 * none of them takes part in the decision: `useMock` is settled before the
 * first `required()` call.
 */
const CREDENTIALS: EnvCase = {
  CARDCOM_API_NAME: 'test-api-name',
  CARDCOM_API_PASSWORD: 'test-api-password',
  CARDCOM_WEBHOOK_SECRET: 'test-webhook-secret',
  NEXT_PUBLIC_APP_URL: 'https://example.test',
}

/** Every combination that decides which provider serves a request. */
const MATRIX: EnvCase[] = []
for (const useMock of ['true', 'false', undefined]) {
  for (const nodeEnv of ['production', 'development', 'test']) {
    for (const terminal of ['1000', undefined]) {
      MATRIX.push({
        ...CREDENTIALS,
        ...(useMock === undefined ? {} : { CARDCOM_USE_MOCK: useMock }),
        NODE_ENV: nodeEnv,
        ...(terminal === undefined ? {} : { CARDCOM_TERMINAL_NUMBER: terminal }),
      })
    }
  }
}

function describeEnv(env: EnvCase): string {
  return VARIABLES.map((name) => `${name}=${env[name] ?? '<unset>'}`).join(' ')
}

/**
 * What `loadCardcomEnv` says, or `'refuses'` when it will not say anything.
 *
 * Two cells of the matrix have no answer to compare against: production with
 * no terminal number, mock off. `loadCardcomEnv` reaches its `required()` calls
 * and throws, which is correct - a deployment configured that way cannot take a
 * payment at all. It only ever throws on the NON-mock branch, so a refusal is
 * itself the answer "not the mock", and that is what is asserted.
 */
function loaderSays(env: EnvCase): boolean | 'refuses' {
  try {
    return loadCardcomEnv(asProcessEnv(env)).useMock
  } catch {
    return 'refuses'
  }
}

describe('the CSP frame host and the payment provider', () => {
  it('covers a matrix that actually varies', () => {
    // A matrix that collapsed to one answer would pass every assertion below
    // while proving nothing about either side.
    const answers = new Set(MATRIX.map((env) => usesMockPaymentProvider(asProcessEnv(env))))
    expect(MATRIX).toHaveLength(18)
    expect(answers).toEqual(new Set([true, false]))
  })

  it.each(MATRIX)('agrees with loadCardcomEnv on %o', (env) => {
    const says = loaderSays(env)
    expect(usesMockPaymentProvider(asProcessEnv(env)), describeEnv(env)).toBe(
      says === 'refuses' ? false : says,
    )
  })

  it('reaches both of the loader answers and its refusal', () => {
    // Otherwise a change that made `loadCardcomEnv` throw everywhere would turn
    // the case above into a test that only ever asserts `false`.
    expect(new Set(MATRIX.map(loaderSays))).toEqual(new Set([true, false, 'refuses']))
  })

  it("names 'self' in frame-src exactly when the mock serves", async () => {
    for (const env of MATRIX) {
      vi.resetModules()
      for (const name of VARIABLES) {
        vi.stubEnv(name, env[name])
      }
      const { contentSecurityPolicyFor } = await import('@/lib/security/frame-policy')
      const frameSrc = contentSecurityPolicyFor('/checkout')
        .split('; ')
        .find((directive) => directive.startsWith('frame-src '))
      const says = loaderSays(env)
      expect(frameSrc, describeEnv(env)).toBeDefined()
      expect(frameSrc?.includes("'self'"), describeEnv(env)).toBe(says === 'refuses' ? false : says)
      // Cardcom's host is never dropped: a deployment can run the mock and
      // still be one env var away from charging real cards.
      expect(frameSrc, describeEnv(env)).toContain('https://secure.cardcom.solutions')
    }
  })
})
