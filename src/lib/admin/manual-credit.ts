/**
 * The ceiling on a manual goodwill credit, in agorot.
 *
 * =========================================================================
 * WHY THIS IS ITS OWN MODULE AND NOT A CONST IN THE ACTION
 * =========================================================================
 *
 * It lived in `server/actions/admin/customer.ts` for exactly as long as it took
 * `pnpm build` to run. A `'use server'` module may export nothing but async
 * functions, and exporting one const does not fail that export -- it ZEROES THE
 * WHOLE MODULE:
 *
 *   The export startCustomerViewAs was not found in module .../customer.ts
 *   The module has no exports at all.
 *
 * Every action in the file becomes unimportable, and the page importing them
 * fails to build. `lib/observability/action-context.ts` records the same
 * measurement from [10], where it took out both newsletter pages; this is the
 * second time and the note there is what named it in one read.
 *
 * NOTHING ELSE CATCHES IT. `pnpm test`, `pnpm type-check` and `pnpm lint` were
 * all green with the const in place -- tsc resolves the export perfectly well,
 * and the zeroing happens in the bundler's `'use server'` transform. The build
 * is a separate gate and this is what it is for.
 *
 * =========================================================================
 * WHY A CEILING AT ALL, AND WHY 2,000
 * =========================================================================
 *
 * A CEILING RATHER THAN AN APPROVAL QUEUE, because an approval queue for a
 * goodwill credit is a queue nobody drains while the customer waits. The number
 * is the point at which a mistake stops being a mistake: 2,000 shekels is more
 * than any order this catalogue can produce, so a credit above it is a missing
 * decimal point far more often than it is a decision.
 *
 * It bounds the SIZE of one credit. `admin-wallet-credit` in
 * `lib/rate-limit/policies.ts` bounds the RATE, and neither alone is enough:
 * twenty credits of 1,999 shekels an hour is the hole the ceiling leaves, and
 * one credit of 200,000 is the hole the rate limit leaves.
 */
export const MAX_MANUAL_CREDIT_AGOROT = 200_000

/** The same number in shekels, for the form's `max` and the note beside it. */
export const MAX_MANUAL_CREDIT_ILS = MAX_MANUAL_CREDIT_AGOROT / 100
