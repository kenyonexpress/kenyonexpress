/**
 * Safety gates for the load suite.
 *
 * docs/ARCHITECTURE-TESTING.md section 5.4 says, in bold: never against
 * production and never against the real Cardcom. A comment saying that is not a
 * gate -- the whole point of a load script is that someone runs it in a hurry,
 * from a shell whose environment they did not read, right before a launch. So
 * the rule is enforced here, at init time, where k6 aborts the run before a
 * single request leaves the machine.
 *
 * Two independent gates:
 *  - the production host list, which no flag can unlock;
 *  - LOAD_ALLOW_WRITES, required by every scenario that creates an order, a
 *    payment event or a redemption, because those leave rows behind.
 */

/** Trailing slash stripped so `${BASE}/path` never doubles it. */
export const BASE = (__ENV.LOAD_BASE ?? 'http://localhost:3000').replace(/\/+$/, '')

/**
 * Deliberately not read from the environment: an allowlist that the caller can
 * edit is not a guard. `NEXT_PUBLIC_APP_URL` defaults to the first of these in
 * src/app/sitemap.ts, which is what makes it the live storefront.
 */
const PRODUCTION_HOSTS = ['kenyonexpress.co.il', 'www.kenyonexpress.co.il']

function hostOf(url) {
  const match = /^https?:\/\/([^/:]+)/.exec(url)
  return match ? match[1].toLowerCase() : ''
}

/** Every scenario calls this, read-only ones included. */
export function assertNotProduction() {
  const host = hostOf(BASE)
  if (!host) {
    throw new Error(`LOAD_BASE is not an absolute http(s) URL: ${BASE}`)
  }
  if (PRODUCTION_HOSTS.includes(host)) {
    throw new Error(
      `Refusing to load-test production (${host}). ARCHITECTURE-TESTING.md 5.4: staging only. This gate has no override flag.`,
    )
  }
}

/**
 * For scenarios that write. `LOAD_ALLOW_WRITES=1` is the same shape as
 * `WP_IMPORT_ALLOW_WRITES` in the import harness, so the two behave alike.
 */
export function assertWritesAllowed(scenario) {
  assertNotProduction()
  if (__ENV.LOAD_ALLOW_WRITES !== '1') {
    throw new Error(
      `${scenario} writes to the database. Re-run with LOAD_ALLOW_WRITES=1 against a staging project, never against the hosted one.`,
    )
  }
}

/** Required env var, failing at init rather than as a wall of 401s. */
export function required(name) {
  const value = __ENV[name]
  if (!value) throw new Error(`${name} is required for this scenario`)
  return value
}
