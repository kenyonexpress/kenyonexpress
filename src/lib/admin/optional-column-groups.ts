/**
 * Writing columns that a pending migration adds, to a database that may not
 * have them yet, without breaking every save.
 *
 * THE PROBLEM, MEASURED. PostgREST answers PGRST204 ("Could not find the
 * 'x' column of 'products' in the schema cache") for the WHOLE write when
 * any one column is unknown. The product form carries columns from three
 * unapplied migrations (123 whatsapp_enabled, 242 original price source,
 * 243 product terms). Sent unconditionally, every product save on production
 * fails until all three are applied; sent never, the fields are decoration.
 *
 * THE RULE, generalised from the whatsapp_enabled fallback that lived inline
 * in `admin/products.ts`: each migration's columns form a GROUP. The write is
 * attempted with every group. On a missing-column error naming one group's
 * column, that group is dropped and the write retried, but ONLY when the
 * group is still at its defaults, so nothing the admin typed is written
 * nowhere and reported as saved. A group the admin filled in is reported with
 * the migration's filename instead. A migrated database costs one call.
 *
 * Pure apart from the `run` thunk the caller hands in, so the retry ladder is
 * tested without a database.
 */

export interface OptionalColumnGroup {
  /** For logs and tests. */
  key: string
  /** Every column the group writes; matched against the error text. */
  columns: readonly string[]
  /** What the group adds to the row spread. */
  fields: Record<string, unknown>
  /** True when dropping the group loses nothing the admin asked for. */
  atDefault: boolean
  /** Admin-facing sentence naming the migration, used when the group cannot be dropped. */
  notice: string
}

/** The three phrasings PostgREST and Postgres use for an unknown column. */
function looksLikeMissingColumn(lower: string): boolean {
  return (
    lower.includes('does not exist') ||
    lower.includes('could not find') ||
    lower.includes('schema cache')
  )
}

/**
 * The group whose column `message` reports as missing, or null when the
 * message is any other failure. A CHECK or NOT NULL violation that merely
 * mentions the column is a real error about real rows and stays null, so it
 * surfaces instead of being rewritten into migration advice.
 */
export function missingColumnGroup(
  message: string | null | undefined,
  groups: readonly OptionalColumnGroup[],
): OptionalColumnGroup | null {
  if (typeof message !== 'string' || message.length === 0) return null
  const lower = message.toLowerCase()
  if (!looksLikeMissingColumn(lower)) return null
  return groups.find((g) => g.columns.some((c) => lower.includes(c.toLowerCase()))) ?? null
}

export type OptionalWriteResult<T, E extends { message: string }> = {
  data: T | null
  error: E | null
  /** Group keys that were dropped to make the write succeed. Empty on a migrated database. */
  dropped: string[]
}

/**
 * Runs `run` with the merged fields of every group, dropping default groups
 * whose column the database lacks, one per retry, until the write succeeds or
 * a failure that is not a droppable missing column comes back.
 *
 * The error returned for a non-droppable group carries the group's notice as
 * its message and keeps the rest of the original error, so a caller that maps
 * messages to advice sees the advice and a caller that logs codes sees the code.
 */
export async function writeWithOptionalColumns<T, E extends { message: string }>(
  groups: readonly OptionalColumnGroup[],
  run: (extra: Record<string, unknown>) => Promise<{ data: T | null; error: E | null }>,
): Promise<OptionalWriteResult<T, E>> {
  let active = groups.filter((g) => Object.keys(g.fields).length > 0)
  const dropped: string[] = []

  // One attempt per group plus the final one: the ladder cannot loop.
  for (let attempt = 0; attempt <= groups.length; attempt += 1) {
    const extra = Object.assign({}, ...active.map((g) => g.fields)) as Record<string, unknown>
    const result = await run(extra)
    if (!result.error) return { ...result, dropped }

    const hit = missingColumnGroup(result.error.message, active)
    if (!hit) return { ...result, dropped }
    if (!hit.atDefault) {
      return { data: null, error: { ...result.error, message: hit.notice }, dropped }
    }
    dropped.push(hit.key)
    active = active.filter((g) => g !== hit)
  }

  // Unreachable in practice: every iteration either returns or shrinks `active`.
  const extra = Object.assign({}, ...active.map((g) => g.fields)) as Record<string, unknown>
  return { ...(await run(extra)), dropped }
}
