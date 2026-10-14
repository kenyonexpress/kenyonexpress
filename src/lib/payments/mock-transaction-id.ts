/**
 * The one fact that separates a rehearsal from a sale.
 *
 * `MockCardcom` stamps every id it mints with this prefix (`mock-txn-3`,
 * `mock-tok-7`, `mock-refund-2`). Production has carried such rows: on
 * 2026-09-25 all 18 orders paid in the trailing week had a `mock-` payment
 * behind them, from the period the storefront ran on the mock provider. Any
 * public number derived from "paid orders" - the bought-this-week line above
 * the buy button - has to refuse those rows, or it advertises a test run as
 * demand.
 *
 * Pure, so the storefront read and the mock provider can share it without the
 * storefront importing the provider.
 */
export const MOCK_TRANSACTION_PREFIX = 'mock-'

/** True for an id the mock provider minted; false for null, which is "unknown", not "mock". */
export function isMockTransactionId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(MOCK_TRANSACTION_PREFIX)
}

/** A charge counts as real money only with a provider id that is not the mock's. */
export function isRealChargeId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.length > 0 && !isMockTransactionId(id)
}
