#!/usr/bin/env node
/**
 * The build-blocking half of the cache-invalidation rule. `pnpm lint` runs it.
 * The rule is in `scripts/cache-invalidation-scan.mjs`, shared with
 * `scripts/cache-invalidation-gate.test.mjs`.
 *
 * Exit: 0 clean, 1 violations.
 */
import {
  formatCacheInvalidation,
  scanCacheInvalidation,
  untaggedCachedScopes,
} from './cache-invalidation-scan.mjs'

const offenders = scanCacheInvalidation()
const untagged = untaggedCachedScopes()

if (offenders.length === 0 && untagged.length === 0) {
  console.log(
    'cache-invalidation gate: clean (every write to a cached table invalidates it, every cached scope carries a tag)',
  )
  process.exit(0)
}

if (untagged.length > 0) {
  console.error(`cache-invalidation gate: ${untagged.length} cached scope(s) carry no tag\n`)
  for (const scope of untagged) console.error(`  ${scope.file}:${scope.line}`)
  console.error('\nA cached scope with no cacheTag can only expire on its own timer: no write path')
  console.error('can flush it, because there is nothing to name. Add cacheTag(CATALOGUE_TAG), or')
  console.error('add the file to UNTAGGED_ON_PURPOSE with the argument for why no write can make')
  console.error('it stale.')
  if (offenders.length === 0) process.exit(1)
  console.error('')
}

console.error(`cache-invalidation gate: ${offenders.length} write path(s) leave the cache stale\n`)
console.error(formatCacheInvalidation(offenders))
console.error('\nsrc/lib/catalogue-cache.ts: "EVERY WRITE PATH THAT CHANGES WHAT A SHOPPER SEES')
console.error('MUST CALL updateTag(CATALOGUE_TAG)." The storefront read is cached for an hour and')
console.error('the admin panel is not, so the operator sees their own change and the shopper does')
console.error('not. Nothing reports it, and it looks like a database problem.')
console.error('\nAdd updateTag(CATALOGUE_TAG) after the write. If the write genuinely cannot make')
console.error('anything stale, add the file to DELIBERATE_EXCEPTIONS with the argument, and put')
console.error('the same argument in the file itself.')
process.exit(1)
