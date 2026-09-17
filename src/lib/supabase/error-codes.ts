/**
 * PostgREST and Postgres error codes this codebase branches on.
 *
 * These lived in `lib/reviews/reviews.ts` until the reviews feature was
 * removed. They were never about reviews: `wishlist.ts` reads the same
 * `TABLE_MISSING` to stay quiet on a deployment where its table has not been
 * created yet, and importing that from a module named after a different
 * feature was only ever an accident of which file needed it first.
 */

/** PostgREST cannot find the table: the migration that creates it is unapplied. */
export const TABLE_MISSING = 'PGRST205'

/** Postgres `undefined_column`: the column exists in a later migration only. */
export const UNDEFINED_COLUMN = '42703'
