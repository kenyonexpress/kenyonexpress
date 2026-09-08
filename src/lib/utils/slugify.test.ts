import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { slugify } from './slugify'

/**
 * THE FUNCTION THAT MINTS EVERY NEW PRODUCT AND CATEGORY URL, PREVIOUSLY
 * UNTESTED.
 *
 * `src/` held TWO slugify implementations until 2026-09-08 and neither had a
 * test. The other one, in `src/lib/utils.ts`, stripped with `/[^\w\s-]/g` -
 * ASCII-only, because `\w` without the `u` flag is `[A-Za-z0-9_]`. Measured
 * against real catalogue names it returned the EMPTY STRING for
 * 'עיסוי מפנק לגבר' and '45-108' for 'עיסוי 45 דקות רק ב108₪'.
 *
 * It had no callers, which is the only reason it never shipped an empty slug.
 * Sixteen files import from `@/lib/utils` for `cn` and `formatPrice`, so it was
 * one autocomplete away from being used, and the failure would have been a
 * blank URL rather than an error.
 */

describe('slugify transliterates Hebrew rather than deleting it', () => {
  it('produces a Latin slug for a Hebrew product name', () => {
    // The bug in one assertion: the old implementation returned ''.
    const slug = slugify('עיסוי מפנק לגבר')
    expect(slug).not.toBe('')
    expect(slug).toMatch(/^[a-z0-9-]+$/)
  })

  it.each([
    'ארוחת בוקר זוגית בקפה גן סיפור',
    'חבילות עיסוי זוגיות בסוויטה',
    'מלון 5 כוכבים בטבריה',
    'טיפול פנים עמוק',
  ])('never returns an empty slug for a real catalogue name: %s', (name) => {
    expect(slugify(name)).not.toBe('')
  })

  it('keeps Latin names readable', () => {
    expect(slugify('Apple Watch Series 7')).toBe('apple-watch-series-7')
  })

  it('keeps digits, which are half the meaning in a deal name', () => {
    expect(slugify('מלון 5 כוכבים')).toContain('5')
  })
})

describe('the characters that must not reach a URL', () => {
  it('strips the shekel sign', () => {
    // Not hypothetical. Production carries two ACTIVE products whose slugs
    // contain a raw `₪`, and each is a duplicate of another active product
    // with the same name and the same slug minus the sign - two live URLs for
    // one deal. Those rows came from the WordPress import, not from here, and
    // this test is what keeps this path from ever adding a third.
    expect(slugify('עיסוי מפנק לגבר 45 דקות רק ב108₪')).not.toContain('₪')
  })

  it.each(['₪', '?', '#', '&', '/', ' ', '%', '"', "'"])('never emits %s', (char) => {
    expect(slugify(`מוצר ${char} כלשהו`)).not.toContain(char)
  })

  it('emits only lowercase letters, digits and hyphens', () => {
    expect(slugify('!! צימר מאסטר -- 2026 ??')).toMatch(/^[a-z0-9-]+$/)
  })

  it('does not start or end with a hyphen', () => {
    const slug = slugify('  ...עיסוי מפנק...  ')
    expect(slug.startsWith('-')).toBe(false)
    expect(slug.endsWith('-')).toBe(false)
  })

  it('caps length, because a URL is not a description', () => {
    expect(slugify('א'.repeat(500)).length).toBeLessThanOrEqual(80)
  })
})

/**
 * One implementation. The duplicate that was removed differed from this one in
 * behaviour, not just in style, and the two were reachable by import paths that
 * differ by a single directory segment.
 */
describe('src holds exactly one slugify', () => {
  const SRC = resolve(process.cwd(), 'src')

  function tsFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) tsFiles(full, out)
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
    }
    return out
  }

  it('defines slugify in one file only', () => {
    const definers = tsFiles(SRC)
      .filter((file) => {
        const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
        return /function slugify\s*\(|const slugify\s*=/.test(src)
      })
      .map((file) => relative(process.cwd(), file))

    expect(definers, `a second slugify diverges silently:\n  ${definers.join('\n  ')}`).toEqual([
      'src/lib/utils/slugify.ts',
    ])
  })
})
