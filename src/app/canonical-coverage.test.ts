import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A PAGE THAT READS THE QUERY STRING MUST SAY WHICH URL IS THE REAL ONE.
 *
 * A storefront route taking `searchParams` is reachable at an unbounded number
 * of URLs: `/products?sort=price&page=3`, `?sort=new&page=3`, and every other
 * combination are the same catalogue arranged differently, not separate
 * documents. Without `alternates.canonical` each permutation competes with the
 * others in the index, and the crawl budget for a catalogue this size is spent
 * on reorderings of pages already crawled.
 *
 * Two answers are correct, and this accepts either: declare the canonical, or
 * declare `robots: { index: false }` because the page should not be indexed at
 * all. `/search` takes the second, deliberately.
 *
 * HOW IT WAS FOUND. The category route carries both the canonical and a comment
 * explaining exactly this, and `/products` -- the shop, the largest listing on
 * the site -- carried neither. One route had learned the lesson and the one
 * beside it had not, which is the shape of defect a per-file convention cannot
 * prevent and a test can.
 *
 * A SOURCE SCAN, NOT AN IMPORT. Importing a page module here would drag server
 * components, `use cache` and the Supabase client into a unit run; what is
 * being asserted is a property of the file, and the file is readable.
 */

const STORE_DIR = resolve(process.cwd(), 'src/app/(store)')

function pageFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...pageFiles(full))
    else if (entry.name === 'page.tsx') found.push(full)
  }
  return found
}

/** Pages that read the query string at all. */
function readsSearchParams(source: string): boolean {
  return source.includes('searchParams')
}

function declaresCanonical(source: string): boolean {
  return source.includes('canonical')
}

/** `robots: { index: false ... }`, in either formatting biome produces. */
function declaresNoindex(source: string): boolean {
  // `[\s\S]` rather than the `s` flag: that flag needs an es2018 target and
  // this project's tsconfig is below it.
  return /robots:[\s\S]*?index:\s*false/.test(source)
}

describe('every storefront page that reads the query string declares a canonical', () => {
  const pages = pageFiles(STORE_DIR).map((file) => ({
    path: relative(process.cwd(), file),
    source: readFileSync(file, 'utf8'),
  }))

  it('finds the storefront pages at all', () => {
    // The guard on the guard. If the walk stops finding files, every assertion
    // below passes vacuously and the gate has quietly stopped being one.
    expect(pages.length).toBeGreaterThan(10)
    expect(pages.map((p) => p.path)).toContain('src/app/(store)/products/page.tsx')
  })

  it('leaves no query-string page without a canonical or a noindex', () => {
    const offenders = pages
      .filter((page) => readsSearchParams(page.source))
      .filter((page) => !declaresCanonical(page.source) && !declaresNoindex(page.source))
      .map((page) => page.path)

    expect(
      offenders,
      `these pages read searchParams but declare neither alternates.canonical nor robots index:false, so every query permutation competes as its own document:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})
