/**
 * Category buyer guides (STEP 65): the typed shape and the one choice.
 *
 * Pure. Imported by the storefront read, the admin read, the server action
 * and the tests, so nothing here may touch a client or a cookie.
 */

/** The length an editor is asked for; the admin counter shows words / this. */
export const GUIDE_TARGET_WORDS = 300

/** A guide that is "ready" by the word count. Below this the admin counter turns amber. */
export const GUIDE_MIN_WORDS = 250

/** The database's CHECK on body_md, mirrored so the form refuses before the round trip. */
export const GUIDE_BODY_MAX = 20000

export const GUIDE_TITLE_MAX = 120

export type CategoryGuide = {
  category_id: string
  /** H2 over the guide; null renders the default. */
  title_he: string | null
  body_md: string
  is_published: boolean
  /** 'row' when an editor saved it, 'authored' when it is the repo's fallback. */
  source: 'row' | 'authored'
}

export type CategoryGuideRow = {
  category_id: string
  title_he: string | null
  body_md: string
  is_published: boolean
}

/** PostgREST / Postgres codes for "the schema is not there": the table (42P01, PGRST205) or a column (42703). */
const MISSING_CODES = new Set(['42P01', 'PGRST205', '42703'])

export function isMissingGuideSchema(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false
  if (error.code && MISSING_CODES.has(error.code)) return true
  return /relation .* does not exist|could not find the (table|column)/i.test(error.message ?? '')
}

/**
 * The guide a category page shows: the row when one exists (and nothing at
 * all when that row is unpublished, which is how an editor hides a guide),
 * else the authored fallback, else nothing.
 */
export function resolveGuide(
  row: CategoryGuideRow | null,
  authored: { title_he: string | null; body_md: string } | null,
  categoryId: string,
): CategoryGuide | null {
  if (row) {
    if (!row.is_published) return null
    const body = row.body_md.trim()
    if (!body) return null
    return {
      category_id: row.category_id,
      title_he: row.title_he?.trim() ? row.title_he.trim() : null,
      body_md: body,
      is_published: true,
      source: 'row',
    }
  }
  if (!authored) return null
  return {
    category_id: categoryId,
    title_he: authored.title_he,
    body_md: authored.body_md,
    is_published: true,
    source: 'authored',
  }
}

/** The H2 the section renders. */
export function guideHeading(guide: Pick<CategoryGuide, 'title_he'>, categoryName: string): string {
  return guide.title_he ?? `מדריך קנייה: ${categoryName}`
}
