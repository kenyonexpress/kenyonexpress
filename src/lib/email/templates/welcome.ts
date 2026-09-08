import { buildWelcomeEmail as buildFromPayload } from '@/lib/email/notifications'
import type { BuiltEmail } from '@/lib/email/voucher-email'

/**
 * Welcome template, the typed entry point.
 *
 * Delegates to `buildWelcomeEmail` in `../notifications.ts`, which is what the
 * outbox drain renders; see `./order-confirmation.ts` for why the HTML is not
 * duplicated here. This module only replaces the drain's frozen
 * `Record<string, unknown>` payload with a compile-checked interface.
 *
 * SENT ONCE, AND NOT BECAUSE THIS MODULE CHECKS.
 *
 * Nothing here dedupes, and a caller must not add its own "has this user been
 * welcomed" flag. The enqueue uses `welcome:<user id>` as the outbox dedupe
 * key, which carries a UNIQUE constraint with ON CONFLICT DO NOTHING, so the
 * auth callback can run on every single sign-in and only the first one ever
 * produces a row. A column somebody has to remember to set is the version of
 * this that eventually sends a second welcome.
 *
 * CARRIES NO OFFER, ON PURPOSE. A welcome mail that opens with a discount
 * trains the reader to file this sender under marketing, and the same address
 * has to carry voucher codes and refund confirmations later.
 */

export interface WelcomeInput {
  /**
   * Display name for the greeting. Omit when unknown - the builder falls back
   * to a bare "שלום," rather than greeting an empty string.
   */
  fullName?: string | null
  /** Origin with no trailing slash, e.g. https://kenyonexpress.co.il */
  siteUrl: string
}

export function buildWelcomeEmail(input: WelcomeInput): BuiltEmail | null {
  return buildFromPayload({ full_name: input.fullName ?? undefined }, input.siteUrl)
}
