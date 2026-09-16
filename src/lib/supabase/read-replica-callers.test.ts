import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A module that reads from the replica must not also write.
 *
 * The replica lags the primary by up to a few seconds. A module that inserts a
 * row and then reads it back through `createCatalogueReadClient()` reads the
 * table as it was BEFORE its own write, with no error and no way to tell. The
 * header of `read-replica.ts` names the paths this rules out (cart, checkout,
 * auth); this test is what keeps a future edit from moving one of them over.
 *
 * The rule is on the FILE, not the call: a file that holds both a replica read
 * and any write is refused, even if the two never meet, because the next edit
 * to that file is the one that makes them meet.
 */

const SRC = resolve(process.cwd(), 'src')
const REPLICA_IMPORT = /from '@\/lib\/supabase\/read-replica'/
const WRITE = /\.(insert|upsert|update|delete)\(/

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

describe('read replica callers', () => {
  const callers = sourceFiles(SRC).filter((file) => REPLICA_IMPORT.test(readFileSync(file, 'utf8')))

  it('finds the catalogue readers, so a rename cannot empty this test', () => {
    const names = callers.map((file) => relative(SRC, file))
    expect(names).toContain('lib/category-page.ts')
    expect(names).toContain('lib/product-detail.ts')
    expect(names.length).toBeGreaterThanOrEqual(8)
  })

  it('never writes from a module that reads through the replica', () => {
    const offenders = callers
      .filter((file) => WRITE.test(readFileSync(file, 'utf8')))
      .map((file) => relative(process.cwd(), file))
    expect(
      offenders,
      'these files import createCatalogueReadClient and also write; move the write-adjacent read to createPublicClient/createAdminClient',
    ).toEqual([])
  })

  it('keeps the write-adjacent paths on the primary', () => {
    for (const path of [
      'server/actions/cart.ts',
      'server/actions/auth.ts',
      'lib/cart/load-products.ts',
    ]) {
      const source = readFileSync(resolve(SRC, path), 'utf8')
      expect(REPLICA_IMPORT.test(source), `${path} must not read from the replica`).toBe(false)
    }
  })
})
