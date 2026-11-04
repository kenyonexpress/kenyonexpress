/**
 * NO E2E WRITE EVER REACHES PRODUCTION (C202).
 *
 * On 2026-11-04 production held 1032 orders and every one of them was an E2E
 * fixture: 714 from e2e-customer, 4 from checkout-e2e, 314 anonymous guest
 * checkouts of e2e-test-* products. They were quarantined (status cancelled,
 * note e2e-fixture, orders.is_e2e_fixture, see docs/C202-test-orders.md).
 *
 * From now on:
 *  - against a production host only READ_ONLY_SPECS run (playwright.config.ts
 *    narrows testMatch to them, so a write spec named on the command line
 *    matches nothing);
 *  - every helper that writes (sign-in, cart, checkout, service-role seeding)
 *    calls assertWritableTarget() first and throws on a production host.
 *
 * The full suite runs on localhost or a Vercel preview URL.
 */

export const PRODUCTION_HOSTS: readonly string[] = [
  'www.kenyonexpress.co.il',
  'kenyonexpress.co.il',
  'kenyonexpress.vercel.app',
]

/**
 * Specs that only read: page loads, navigation clicks, local UI state. None of
 * them signs in, adds to cart, checks out or seeds the database.
 */
export const READ_ONLY_SPECS: readonly string[] = [
  'prod-readonly.spec.ts',
  'home.spec.ts',
  'product.spec.ts',
  'category.spec.ts',
  'render-mode.spec.ts',
]

export function isProductionBaseUrl(url: string | undefined): boolean {
  if (!url) return false
  try {
    return PRODUCTION_HOSTS.includes(new URL(url).hostname.toLowerCase())
  } catch {
    return false
  }
}

/** The base URL the suite is aimed at, as playwright.config.ts resolves it. */
export function e2eBaseUrl(): string | undefined {
  return process.env.E2E_BASE_URL
}

export function assertWritableTarget(what: string, baseUrl: string | undefined = e2eBaseUrl()) {
  if (isProductionBaseUrl(baseUrl)) {
    throw new Error(
      `E2E write refused on production (${baseUrl}): ${what}. Production gets read-only smoke only; run the full suite on a preview URL.`,
    )
  }
}
