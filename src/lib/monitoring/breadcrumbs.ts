import { getRequestContext } from '@/lib/observability/request-context'
import { redact } from '@/lib/observability/scrub'
import * as Sentry from '@sentry/nextjs'

/**
 * The trail a checkout leaves behind, for reading AFTER something has failed.
 *
 * WHAT A BREADCRUMB IS FOR, AND WHY THE LOG LINES WERE NOT ENOUGH. The log
 * already carries `checkout.reserve_failed` and its request id, and a drain can
 * find every line for that request. That works when there IS a drain, when the
 * failure produced a line, and when whoever is looking already knows which
 * request to look for. The case this covers is the other one: a Sentry issue
 * arrives saying `finalize exploded`, and the question is what the shopper had
 * done up to that point -- wallet or card, saved token or hosted page, one
 * attempt or a retry of an order that already existed. Breadcrumbs ride ON the
 * event, so that answer is in the report rather than in another system.
 *
 * WHY THIS IS A CHECKOUT-SHAPED FUNCTION AND NOT A THIN addBreadcrumb WRAPPER.
 * A free-form wrapper gets called with whatever each site felt like passing,
 * and the trail becomes twelve spellings of the same step. The step names are
 * therefore a closed union: adding one is a deliberate edit here, and a typo at
 * a call site does not compile.
 *
 * WHAT MAY BE IN `data`. Identifiers, counts and amounts in agorot. Never an
 * address, a name, an email or a card. Breadcrumbs are attached to an event
 * that leaves the process, so this goes through the same `redact()` as
 * everything else -- belt and braces, since the union above already keeps the
 * shape narrow.
 */

const DSN = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN

/**
 * Every step a checkout can pass through, in the order it happens.
 *
 * The three-way split after `order_created` is the point of the whole list: a
 * wallet-covered order never touches a provider, a saved token charges
 * server-to-server, and a hosted page hands the shopper to Cardcom and waits.
 * Those are three different failure surfaces, and from the outside all three
 * produce "the order did not complete".
 */
export type CheckoutStep =
  | 'cart_validated'
  | 'order_created'
  | 'wallet_covered'
  | 'saved_token_charge'
  | 'hosted_page_created'
  | 'submitted'
  | 'provider_returned'
  | 'webhook_received'
  | 'finalize_started'
  | 'finalize_completed'

export type BreadcrumbData = Record<string, string | number | boolean | null | undefined>

/**
 * Records one step. Never throws: this is instrumentation on the money path,
 * and instrumentation that can fail a checkout is worse than no instrumentation.
 *
 * `level: 'info'` on every step, including the ones that precede a failure. A
 * breadcrumb is a fact about what happened, not a judgement about it; the event
 * it is attached to carries the severity.
 */
export function checkoutStep(step: CheckoutStep, data: BreadcrumbData = {}): void {
  if (!DSN) return
  try {
    Sentry.addBreadcrumb({
      // One category, so a Sentry search for `category:checkout` is the whole
      // funnel rather than ten things that have to be remembered by name.
      category: 'checkout',
      type: 'info',
      level: 'info',
      message: step,
      data: {
        // The join to the log lines, if anyone wants them after all.
        request_id: getRequestContext()?.requestId ?? null,
        ...((redact(data) as Record<string, unknown>) ?? {}),
      },
    })
  } catch {
    // Best effort by definition.
  }
}
