/**
 * Postgres / PostgREST error codes shared by the wishlist code.
 *
 * The site has no reviews UI: the schema, the form and the rating summary were
 * removed together with the admin moderation screen. Only these codes survive
 * because the wishlist queries and actions still branch on them.
 */

/** PostgREST: relation does not exist. */
export const TABLE_MISSING = 'PGRST205'

/** Unique violation -- the row is already there. */
export const ALREADY_REVIEWED = '23505'
