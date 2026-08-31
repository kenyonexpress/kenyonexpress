/**
 * Turns the one database error that 003-products-whatsapp-enabled causes into a
 * sentence an admin can act on.
 *
 * Same shape and same reason as `recurring-schema-error.ts`: the WhatsApp
 * toggle ships as code before it ships as schema. The migration is
 * `migrations/pending/123_products_whatsapp_enabled.sql` and applying it is
 * Ofir's call, not this session's.
 *
 * WHAT AN ADMIN SEES WITHOUT THIS. Ticking the box and saving returns the raw
 * PostgREST string:
 *
 *   Could not find the 'whatsapp_enabled' column of 'products' in the schema
 *   cache   (PGRST204)
 *
 * which reads like the admin is broken rather than like a feature that is not
 * switched on yet.
 *
 * WHY AN UNTICKED BOX NEVER GETS HERE. The column is sent only when the admin
 * ticks it or the row already carries it (see `admin/products.ts`). A normal
 * save of a physical product sends no column the un-migrated database has never
 * heard of, so this error is reachable only by someone deliberately turning the
 * feature on.
 *
 * Pure, takes the message as a string, tested without a database.
 */

/** Named here so the message and the file cannot drift apart. */
export const WHATSAPP_MIGRATION_FILE = 'migrations/pending/123_products_whatsapp_enabled.sql'

// One template literal, not several joined with `+`. Concatenating template
// literals has already corrupted a production build in this repo once: the
// served bundle lost text and shipped broken JS with a 200 and no log entry.
const WHATSAPP_MIGRATION_NOTICE = `כפתור הוואטסאפ עדיין לא מופעל במסד הנתונים. יש להחיל את המיגרציה ${WHATSAPP_MIGRATION_FILE} ואז לשמור שוב. שאר שדות המוצר נשמרים כרגיל.`

/**
 * Returns the admin-facing notice when `message` is the missing column, and
 * null for every other failure.
 *
 * Null rather than a generic fallback, for the same reason as the recurring
 * version: a caller that gets null must surface the real error. Collapsing
 * every database failure into "apply the migration" hides genuine constraint
 * violations behind advice that does not fix them.
 */
export function whatsappSchemaError(message: string | null | undefined): string | null {
  if (typeof message !== 'string' || message.length === 0) return null
  const lower = message.toLowerCase()

  if (!lower.includes('whatsapp_enabled')) return null

  // The column name alone is not enough. A CHECK constraint named after the
  // column, or a NOT NULL violation on it, both mention it and are real errors
  // about real rows -- rewriting those into migration advice would send an
  // admin to apply a migration that is already applied.
  const looksMissing =
    lower.includes('does not exist') ||
    lower.includes('could not find') ||
    lower.includes('schema cache')

  return looksMissing ? WHATSAPP_MIGRATION_NOTICE : null
}
