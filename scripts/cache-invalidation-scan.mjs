/**
 * Every server action that writes a table the storefront caches, and whether
 * it invalidates the cache afterwards.
 *
 * WHY THIS EXISTS, in the words of the file that states the contract.
 * `src/lib/catalogue-cache.ts` says:
 *
 *   "EVERY WRITE PATH THAT CHANGES WHAT A SHOPPER SEES MUST CALL
 *    updateTag(CATALOGUE_TAG). A product saved without it stays invisible on
 *    the storefront for up to an hour, the admin sees their own change in the
 *    panel (which is uncached), and nothing anywhere reports a problem. That
 *    failure is silent, it is slow, and it looks like a database issue rather
 *    than a caching one."
 *
 * That is exactly right, it was written down in full, and nothing enforced it.
 * MEASURED 2026-09-09: `src/server/actions/admin/suppliers.ts` updates
 * `suppliers` on edit, on status change and on soft delete, and called no
 * `updateTag`. `src/lib/supplier-storefront.ts` reads that table inside
 * `use cache` with `cacheLife('hours')` and selects `status` and `deleted_at`
 * so it can return null for a supplier that is inactive or removed -- but that
 * filter runs when the entry is BUILT. So deactivating or deleting a supplier
 * left its public storefront serving, with its address and phone on it, for up
 * to an hour. The file's own list of write paths did not name it.
 *
 * HOW THE TABLE LIST IS DERIVED, and this is the part that has to stay true:
 * it is READ OUT OF THE CACHED SOURCE, not typed here. A hand-kept list would
 * drift the day somebody caches a new table, and the drifted-away table is
 * precisely the one nobody remembers to invalidate.
 *
 * THE `as never` TRAP, and it bit this file on the first run. A table outside
 * the generated Supabase types is written `.from('reviews' as never)`, so a
 * pattern anchored on `.from('x')` matches NOTHING for exactly the tables
 * least covered by type checking. `reviews` was missing from the derived list
 * until the cast was allowed for. Both patterns below permit it.
 *
 * WHAT IT CANNOT SEE. It matches `.from('x')` followed by a mutation, which
 * misses a write done through an `.rpc()` that mutates internally. Those exist
 * and they are not the accident this is aimed at: the accident is a new admin
 * CRUD action written by copying a neighbouring one that happened not to need
 * the tag.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'

const CACHED_ROOTS = ['src/lib', 'src/server/queries', 'src/app']
const ACTION_ROOT = 'src/server/actions'

/**
 * Write paths that deliberately do NOT invalidate, each with the argument.
 * Adding to this is the review step, and the argument has to be in the file
 * itself, not only here.
 */
export const DELIBERATE_EXCEPTIONS = new Map([
  [
    'src/server/actions/admin/images.ts',
    'Inserts a media_assets row for a freshly uploaded image. The cached reader ' +
      '(loadGalleryAssets) looks assets up BY URL, and a new asset is on no product ' +
      'until a separate save through admin/products.ts, which does invalidate. The ' +
      'insert alone can make nothing stale.',
  ],
  [
    'src/server/actions/reviews.ts',
    'A customer submitting a review inserts with no status, taking the column default, ' +
      "which migration 154 sets to 'pending' (NOT NULL DEFAULT 'pending' CHECK IN " +
      "(pending, approved, rejected)). The cached read filters status = 'approved', so a " +
      'fresh review is invisible to everyone until an admin approves it, and ' +
      'admin/reviews.ts DOES call updateTag on approval. Invalidating here would flush ' +
      'the whole catalogue cache on every submission to publish nothing.',
  ],
])

function walk(dir, files = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return files
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue
      walk(full, files)
    } else if (['.ts', '.tsx'].includes(extname(entry))) {
      files.push(full)
    }
  }
  return files
}

/**
 * Tables read inside a `'use cache'` scope, read out of the source itself.
 *
 * The scope is taken as running from the directive to the end of the function,
 * approximated by the next line at the same or lower indentation that closes
 * it. Approximate on purpose: over-collecting a table costs one extra name on
 * a list, and under-collecting costs the bug this file exists to catch.
 */
export function cachedTables(roots = CACHED_ROOTS) {
  const tables = new Set()
  for (const root of roots) {
    for (const file of walk(root)) {
      const source = readFileSync(file, 'utf8')
      if (!/^\s*'use cache'\s*$/m.test(source)) continue
      for (const match of source.matchAll(/\.from\('([a-z_]+)'(?:\s+as\s+never)?\)/g)) {
        tables.add(match[1])
      }
    }
  }
  return tables
}

/** Does this file mutate one of those tables, and does it invalidate? */
export function classifyAction(source, tables) {
  const written = new Set()
  // `.from('x')` then a mutation, allowing chained filters in between.
  const pattern =
    /\.from\('([a-z_]+)'(?:\s+as\s+never)?\)\s*(?:\.[a-zA-Z]+\([^)]*\)\s*)*?\.(update|insert|upsert|delete)\b/gs
  for (const match of source.matchAll(pattern)) {
    if (tables.has(match[1])) written.add(match[1])
  }
  if (written.size === 0) return { ok: true, reason: 'writes-nothing-cached', written: [] }
  const invalidates = /updateTag\(\s*CATALOGUE_TAG\s*\)|revalidateTag\(\s*CATALOGUE_TAG\s*\)/.test(
    source,
  )
  return {
    ok: invalidates,
    reason: invalidates ? 'invalidates' : 'writes-a-cached-table-without-invalidating',
    written: [...written].sort(),
  }
}

export function scanCacheInvalidation({ actionRoot = ACTION_ROOT, roots = CACHED_ROOTS } = {}) {
  const tables = cachedTables(roots)
  const offenders = []
  for (const file of walk(actionRoot)) {
    if (/\.test\.tsx?$/.test(file)) continue
    if (DELIBERATE_EXCEPTIONS.has(file)) continue
    const { ok, reason, written } = classifyAction(readFileSync(file, 'utf8'), tables)
    if (!ok) offenders.push({ file, reason, written })
  }
  return offenders
}

export function formatCacheInvalidation(offenders) {
  return offenders
    .map((o) => `  ${o.file}\n    writes ${o.written.join(', ')} and never invalidates`)
    .join('\n')
}
