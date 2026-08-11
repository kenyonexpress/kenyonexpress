/**
 * Turns the two database errors that PENDING-109 causes into one sentence an
 * admin can act on.
 *
 * The recurring product type ships as code before it ships as schema: the
 * migration is in `supabase/migrations/PENDING-109-recurring-subscriptions.sql`
 * and applying it is Ofir's call, not this session's. Until it is applied, an
 * admin who picks "חיוב חודשי קבוע" and saves gets one of two raw PostgREST
 * messages, both of which read like a crash:
 *
 *   invalid input value for enum product_type: "recurring"
 *   column products.recurring_amount_agorot does not exist   (PGRST204)
 *
 * Neither tells the person at the screen that the feature is simply not turned
 * on yet, or what turns it on. This module is the difference between "the admin
 * is broken" and "this needs the migration applied".
 *
 * It is pure and takes the message as a string, so it is tested without a
 * database and cannot itself become a reason a save fails.
 */

/** Named here so the message and the file cannot drift apart. */
export const RECURRING_MIGRATION_FILE = 'PENDING-109-recurring-subscriptions.sql'

// One template literal, not three joined with `+`. Concatenating template
// literals has already corrupted a production build in this repo once: the
// served bundle lost text and shipped broken JS with a 200 and no log entry.
const RECURRING_MIGRATION_NOTICE = `סוג המוצר "חיוב חודשי קבוע" עדיין לא מופעל במסד הנתונים. יש להחיל את המיגרציה ${RECURRING_MIGRATION_FILE} ואז לשמור שוב. שאר סוגי המוצרים עובדים כרגיל.`

/**
 * The enum label and the three columns PENDING-109 adds. Listed explicitly
 * rather than matched by a loose /recurring/ pattern, so an unrelated failure
 * that happens to mention the word is not swallowed and reported as a missing
 * migration.
 */
const MISSING_SCHEMA_MARKERS = [
  'invalid input value for enum product_type',
  'recurring_amount_agorot',
  'billing_interval_count',
  'billing_interval',
  'subscriptions',
  'subscription_charges',
] as const

/**
 * Returns the admin-facing notice when `message` is PENDING-109 not being
 * applied, and null when it is any other failure.
 *
 * Returning null rather than a generic fallback is deliberate: a caller that
 * gets null must surface the real error. Collapsing every database failure into
 * "apply the migration" would hide a genuine constraint violation behind advice
 * that does not fix it.
 */
export function recurringSchemaError(message: string | null | undefined): string | null {
  if (typeof message !== 'string' || message.length === 0) return null
  const lower = message.toLowerCase()

  // The enum message is unambiguous on its own.
  if (lower.includes('invalid input value for enum product_type')) {
    return RECURRING_MIGRATION_NOTICE
  }

  // For the rest, the message must ALSO look like a missing-object error.
  // `subscriptions` appearing inside a foreign-key violation is a real error
  // about real rows and must not be rewritten into migration advice.
  const looksMissing =
    lower.includes('does not exist') ||
    lower.includes('could not find') ||
    lower.includes('schema cache')
  if (!looksMissing) return null

  return MISSING_SCHEMA_MARKERS.some((marker) => lower.includes(marker))
    ? RECURRING_MIGRATION_NOTICE
    : null
}
