import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  PRODUCTION_PROJECT_REF,
  checkSeedTarget,
  projectRefOf,
  refusalMessage,
} from './seed-target-guard.mjs'

/**
 * THE SEED COULD CREATE AN ADMIN ACCOUNT IN PRODUCTION.
 *
 * `seed-test-data.mjs` reads NEXT_PUBLIC_SUPABASE_URL and a service-role key
 * out of the environment and writes fixtures to whatever project that URL
 * names. Until 2026-09-09 it had no check of any kind on which project that
 * was, and among the things it writes are auth users with passwords committed
 * to this repository:
 *
 *     e2e-admin@test.kenyonexpress.local / E2eAdmin!pass1   role: admin
 *
 * Pointed at production that is not untidy test data. It is an administrator
 * account whose password is public, with a Hebrew display name that looks like
 * it belongs.
 *
 * AND THIS IS WHY A GATE IS CURRENTLY OFF. ci.yml skips both E2E jobs when
 * CI_SUPABASE_URL is empty, and it is empty, because the seed runs first and
 * nothing stopped it writing wherever it was pointed. The cost is that
 * e2e/a11y.spec.ts -- axe across 19 routes in two viewports -- has never run.
 * See docs/ACCESSIBILITY-GATE.md. The guard is what makes "set CI_SUPABASE_URL"
 * a decision somebody can take without auditing the seed line by line first.
 *
 * THE TRAP HELD SHUT HERE IS URL EQUALITY. `https://REF.supabase.co`,
 * `https://REF.supabase.in`, and the same project behind a custom domain are
 * one database. A guard comparing whole URL strings passes two of those three.
 * So the check is on the project REF taken out of the hostname.
 */

describe('reading the project ref out of a URL', () => {
  it('finds it in the ordinary hostname', () => {
    expect(projectRefOf('https://ixvwfbuvfxxsjiywhbbb.supabase.co')).toBe('ixvwfbuvfxxsjiywhbbb')
    expect(projectRefOf('https://ixvwfbuvfxxsjiywhbbb.supabase.co/rest/v1/')).toBe(
      'ixvwfbuvfxxsjiywhbbb',
    )
  })

  it('is not fooled by a different TLD for the same project', () => {
    // The URL string differs; the database does not.
    expect(projectRefOf('https://ixvwfbuvfxxsjiywhbbb.supabase.in')).toBe('ixvwfbuvfxxsjiywhbbb')
  })

  it('returns null rather than guessing', () => {
    expect(projectRefOf('https://db.example.com')).toBeNull()
    expect(projectRefOf('http://localhost:54321')).toBeNull()
    expect(projectRefOf('not a url')).toBeNull()
    expect(projectRefOf('')).toBeNull()
    expect(projectRefOf(undefined)).toBeNull()
  })
})

describe('what may be seeded', () => {
  const PROD = `https://${PRODUCTION_PROJECT_REF}.supabase.co`

  it('ADMIN_BACKDOOR: refuses production', () => {
    const verdict = checkSeedTarget({ url: PROD })
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toBe('production')
    expect(verdict.ref).toBe(PRODUCTION_PROJECT_REF)
  })

  it('refuses production however the URL is spelled', () => {
    expect(checkSeedTarget({ url: `https://${PRODUCTION_PROJECT_REF}.supabase.in` }).allowed).toBe(
      false,
    )
    expect(
      checkSeedTarget({ url: `https://${PRODUCTION_PROJECT_REF}.supabase.co/rest/v1` }).allowed,
    ).toBe(false)
  })

  it('allows a preview project and a local stack', () => {
    expect(checkSeedTarget({ url: 'https://abcdefghijklmnopqrst.supabase.co' }).allowed).toBe(true)
    expect(checkSeedTarget({ url: 'http://localhost:54321' }).allowed).toBe(true)
  })

  it('does not refuse a host it cannot recognise', () => {
    // Refusing every custom domain would make the guard the thing people work
    // around, and a worked-around guard protects nothing.
    const verdict = checkSeedTarget({ url: 'https://db.internal.example.com' })
    expect(verdict.allowed).toBe(true)
    expect(verdict.reason).toBe('unrecognised-host')
  })

  it('takes an override, and only the exact ugly one', () => {
    expect(checkSeedTarget({ url: PROD, override: 'i-understand' }).allowed).toBe(true)
    // Not a value anybody sets by reflex, and not one that `true` reaches.
    for (const wrong of ['true', '1', 'yes', 'I-UNDERSTAND', '']) {
      expect(checkSeedTarget({ url: PROD, override: wrong }).allowed).toBe(false)
    }
  })
})

describe('what the refusal tells the reader', () => {
  const message = refusalMessage(PRODUCTION_PROJECT_REF)

  it('names the project, the danger and the way out', () => {
    // A refusal that says only "refusing" gets the override set immediately.
    expect(message).toContain(PRODUCTION_PROJECT_REF)
    expect(message).toContain('admin')
    expect(message).toContain('SEED_ALLOW_PRODUCTION=i-understand')
    expect(message).toContain('rotate')
  })
})

describe('the seed actually calls it', () => {
  it('checks the target before it constructs a client', () => {
    // Ordering is the assertion. A guard that runs after the first write is
    // not a guard, and this one has to precede even the client construction.
    const source = readFileSync('scripts/seed-test-data.mjs', 'utf8')
    const guard = source.indexOf('assertSeedTargetAllowed(env)')
    const client = source.indexOf('createClient(url, key')
    expect(guard).toBeGreaterThan(-1)
    expect(client).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(client)
  })
})
