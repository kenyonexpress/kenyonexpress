// FIXTURE, not shipped code. A cached reader with no cacheTag: it can expire on
// its timer and no write path can flush it. scripts/cache-invalidation-gate.test.mjs
// asserts that untaggedCachedScopes() reports exactly this.
import { cacheLife } from 'next/cache'

export async function readSomething() {
  'use cache'
  cacheLife('hours')
  return { rows: [] }
}
