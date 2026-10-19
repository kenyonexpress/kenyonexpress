import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE GATE IN FRONT OF EVERY VERCEL BUILD, AND IT HAD NO TESTS.
 *
 * `vercel.json` runs this as `buildCommand`: `node scripts/deploy-preflight.mjs
 * && pnpm build`. A silent regression here does not fail loudly -- it ships.
 * That is the same shape as every other defect found in this project's audit
 * pass: a control that reports success while checking nothing.
 *
 * Run as a SUBPROCESS rather than imported. The script is a top-level program
 * that reads `process.env` and calls `process.exit`; importing it would run it
 * against the test runner's own environment on the first import and be
 * uncacheable after that. Spawning it is also what Vercel does, so this
 * measures the real thing rather than a rearranged copy of it.
 */

const SCRIPT = resolve(process.cwd(), 'scripts/deploy-preflight.mjs')

/**
 * A deployment environment that should pass. Values are syntactically
 * plausible and deliberately NOT real: `compromised-keys.mjs` compares SHA-256
 * digests, so an invented string can never collide with a flagged key.
 */
const CLEAN = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-for-tests-only',
  SUPABASE_SECRET_KEY: 'secret-key-for-tests-only',
  CARDCOM_TERMINAL_NUMBER: '1000',
  CARDCOM_API_NAME: 'test-api-name',
  CARDCOM_API_PASSWORD: 'test-api-password',
  CARDCOM_WEBHOOK_SECRET: 'test-webhook-secret',
  VOUCHER_QR_SECRET: 'test-voucher-secret-32-bytes-long',
  CRON_SECRET: 'test-cron-secret',
  SENTRY_DSN: 'https://public@o1.ingest.sentry.io/2',
}

/** A copy of `env` with `names` absent. Rebuilt rather than `delete`d. */
function without(env, ...names) {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !names.includes(key)))
}

/** @returns {{ code: number, stdout: string, stderr: string }} */
function run(env) {
  try {
    const stdout = execFileSync('node', [SCRIPT], {
      // PATH only: an inherited environment would let the developer's own
      // .env leak in and make a "missing variable" test pass by accident.
      env: { PATH: process.env.PATH, ...env },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, stdout, stderr: '' }
  } catch (error) {
    return { code: error.status, stdout: error.stdout ?? '', stderr: error.stderr ?? '' }
  }
}

describe('a complete deployment environment passes', () => {
  it('exits 0 and says so', () => {
    const { code, stdout } = run(CLEAN)
    expect(code).toBe(0)
    expect(stdout).toContain('clean')
  })
})

describe('every required variable is actually required', () => {
  // Derived from the fixture rather than re-listed, so a variable added to the
  // script and to CLEAN is covered here without a third edit, and one added to
  // the script alone fails the clean-environment test above.
  const REQUIRED = Object.keys(CLEAN).filter((name) => name !== 'SUPABASE_SECRET_KEY')

  it.each(REQUIRED)('refuses to ship without %s', (name) => {
    const { code, stderr } = run(without(CLEAN, name))
    expect(code).toBe(1)
    expect(stderr).toContain(name)
  })

  it('accepts either name for the admin key, and refuses with neither', () => {
    const withServiceRole = {
      ...without(CLEAN, 'SUPABASE_SECRET_KEY'),
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-for-tests-only',
    }
    expect(run(withServiceRole).code).toBe(0)

    expect(run(without(CLEAN, 'SUPABASE_SECRET_KEY')).code).toBe(1)
  })
})

/**
 * The reason SENTRY_DSN was added on 2026-09-08, kept as an executable
 * statement rather than only as a comment.
 *
 * Sentry held 49 error events over 90 days and every one came from
 * `MacBook-Air.local`. Production had never reported. An unmonitored deploy
 * answers every request correctly, so nothing else in the stack can notice it.
 */
describe('a deployment that reports its errors nowhere is refused', () => {
  it('names SENTRY_DSN rather than failing vaguely', () => {
    const { code, stderr } = run(without(CLEAN, 'SENTRY_DSN'))
    expect(code).toBe(1)
    expect(stderr).toContain('SENTRY_DSN')
  })

  it('is a DEPLOY gate only, and not part of pnpm build', () => {
    // Error reporting is deliberately inert without a DSN so that tests, CI
    // and a local `next start` need no Sentry account. If `pnpm build` ever
    // gained this check, every one of those would break.
    const pkg = JSON.parse(execFileSync('cat', ['package.json'], { encoding: 'utf8' }))
    expect(pkg.scripts.build).not.toContain('deploy-preflight')
  })
})

describe('the two settings that are correct locally and wrong on a deploy', () => {
  it('refuses a sandbox terminal, which takes real money nowhere', () => {
    const { code, stderr } = run({ ...CLEAN, CARDCOM_SANDBOX: 'true' })
    expect(code).toBe(1)
    expect(stderr).toContain('SANDBOX')
  })

  it('refuses the local waiver, which would disarm every check above it', () => {
    const { code, stderr } = run({ ...CLEAN, ALLOW_INCOMPLETE_ENV: 'true' })
    expect(code).toBe(1)
    expect(stderr).toContain('WAIVER')
  })
})
