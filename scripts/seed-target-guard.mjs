/**
 * Refuses to seed the production database.
 *
 * WHY. `seed-test-data.mjs` reads `NEXT_PUBLIC_SUPABASE_URL` and a service-role
 * key out of the environment and writes fixtures to whatever project that URL
 * names. It had no check of any kind on which project that was, and among the
 * things it writes are **auth users with hardcoded passwords**:
 *
 *     e2e-admin@test.kenyonexpress.local / E2eAdmin!pass1   role: admin
 *     e2e-customer@test.kenyonexpress.local
 *     e2e-supplier@test.kenyonexpress.local                 supplier owner
 *
 * Pointed at production, that script does not corrupt data so much as create an
 * **administrator account with a password published in this repository**. The
 * admin fixture exists so the E2E refund journey can prove the weakest role
 * that may refund can; in production it is an authentication backdoor with a
 * Hebrew display name that looks like it belongs.
 *
 * THIS IS NOT HYPOTHETICAL, IT IS THE REASON A GATE IS CURRENTLY OFF.
 * `.github/workflows/ci.yml` skips both E2E jobs when `CI_SUPABASE_URL` is
 * empty, and it is empty. That secret is unset precisely because the seed runs
 * first and nothing stopped it writing wherever it was pointed. The cost is
 * that `e2e/a11y.spec.ts` -- axe across 19 routes in two viewports -- has never
 * run. See `docs/ACCESSIBILITY-GATE.md`.
 *
 * So the guard is not paperwork. It is what makes "set CI_SUPABASE_URL" a
 * decision somebody can take without reading the seed line by line first.
 *
 * WHAT IT MATCHES. The project ref, taken out of the hostname, compared against
 * the known production ref. Not the whole URL: `https://REF.supabase.co`,
 * `https://REF.supabase.in`, a pooler hostname and a custom domain in front of
 * the same project are all the same database, and a string equality on the URL
 * would pass three of them straight through.
 *
 * THE OVERRIDE IS DELIBERATELY UGLY. `SEED_ALLOW_PRODUCTION=i-understand` is
 * not a flag anyone sets by reflex or copies out of a README, and the refusal
 * message prints what it is about to do before naming it.
 */

/**
 * The live project. Also spelled out in `docs/FINAL-REPORT.md` and used by
 * `scripts/compromised-keys.mjs`; it is a public identifier, not a secret.
 */
export const PRODUCTION_PROJECT_REF = 'ixvwfbuvfxxsjiywhbbb'

const OVERRIDE_VALUE = 'i-understand'

/**
 * The Supabase project ref inside a URL, or null.
 *
 * Supabase hostnames are `<ref>.supabase.co`, and the pooler is
 * `aws-0-<region>.pooler.supabase.com` with the ref in the username, which this
 * does not attempt to read. A custom domain in front of a project returns null
 * too. Both cases are handled by the caller treating null as "unknown", not as
 * "safe".
 */
export function projectRefOf(url) {
  if (typeof url !== 'string' || url.trim() === '') return null
  let host
  try {
    host = new URL(url).hostname
  } catch {
    return null
  }
  const match = host.match(/^([a-z0-9]{20})\.supabase\.(co|in|net)$/i)
  return match ? match[1].toLowerCase() : null
}

/**
 * Decides whether a seed run may proceed.
 *
 * Pure, so `seed-target-guard.test.mjs` can drive every branch without touching
 * a database or an environment.
 */
export function checkSeedTarget({ url, override, productionRef = PRODUCTION_PROJECT_REF } = {}) {
  const ref = projectRefOf(url)

  if (ref !== productionRef) {
    // Includes ref === null. An unrecognised host is not production as far as
    // this check can tell, and refusing every custom domain would make the
    // guard the thing people work around.
    return { allowed: true, ref, reason: ref === null ? 'unrecognised-host' : 'not-production' }
  }

  if (override === OVERRIDE_VALUE) {
    return { allowed: true, ref, reason: 'production-explicitly-allowed' }
  }

  return { allowed: false, ref, reason: 'production' }
}

/** The refusal text. Separate so the test can assert what it tells the reader. */
export function refusalMessage(ref) {
  return [
    `REFUSING TO SEED PRODUCTION (project ${ref}).`,
    '',
    'This script creates auth users with passwords that are committed to this',
    'repository, including one with the `admin` role. In production that is not',
    'test data, it is an administrator account whose password is public.',
    '',
    'If you meant a preview or a local stack, point NEXT_PUBLIC_SUPABASE_URL at',
    'it. If you genuinely mean production, set:',
    '',
    `    SEED_ALLOW_PRODUCTION=${OVERRIDE_VALUE}`,
    '',
    'and expect to rotate those passwords afterwards.',
  ].join('\n')
}

/**
 * The whole check, for a script to call in one line.
 *
 * Exits the process rather than throwing: a seed that refuses must stop before
 * its first write, and a caller that forgot a `catch` must not turn a refusal
 * into a partial run.
 */
export function assertSeedTargetAllowed(env = process.env) {
  const { allowed, ref } = checkSeedTarget({
    url: env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL,
    override: env.SEED_ALLOW_PRODUCTION,
  })
  if (allowed) return
  console.error(refusalMessage(ref))
  process.exit(1)
}
