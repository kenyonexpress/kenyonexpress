import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The two signals a Hebrew RTL store cannot be wrong about: the document's
 * language and direction, and the market its prices are for.
 *
 * READ FROM SOURCE, not imported. `layout.tsx` calls `next/font`, which is a
 * build-time transform: importing the module under vitest fails with
 * "(0 , Heebo) is not a function" before any assertion runs. The same reason
 * `content-pages.test.ts` reads its files as text.
 */

const source = readFileSync(resolve(process.cwd(), 'src/app/layout.tsx'), 'utf8')

describe('the root document', () => {
  it('declares Hebrew and RTL on <html>', () => {
    expect(source).toContain('<html lang="he" dir="rtl"')
  })

  it('carries a self-referencing he-IL hreflang', () => {
    // Language alone leaves the market open. Every price on the site is in
    // shekels, and the region half is what says so to a crawler.
    expect(source).toMatch(/languages:\s*\{\s*'he-IL':\s*'\/',?\s*\}/)
  })

  it('names no alternate language it cannot serve', () => {
    // A row for a language that does not exist points a crawler at a page that
    // answers in Hebrew, which is worse than no hreflang at all.
    const block = source.match(/languages:\s*\{([\s\S]*?)\}/)?.[1] ?? ''
    const codes = [...block.matchAll(/'([a-z]{2}(?:-[A-Z]{2})?|x-default)'\s*:/g)].map((m) => m[1])
    expect(codes).toEqual(['he-IL'])
  })

  it('keeps the canonical and the Hebrew locale it already had', () => {
    expect(source).toMatch(/canonical:\s*'\/'/)
    expect(source).toContain("locale: 'he_IL'")
  })
})
