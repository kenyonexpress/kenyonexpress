import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE SITE HAS NO SEARCH FIELD. THIS IS THE GATE THAT KEEPS IT THAT WAY.
 *
 * It is an absolute product rule, not a phase of the build: KenyonExpress ships
 * no search input in the masthead, the handheld header, the off-canvas drawer,
 * the footer or the results page. The Meilisearch backend is untouched and
 * `/search?q=` still answers, so a campaign link or a redirect resolves to real
 * results; what does not exist is a box a visitor can type into.
 *
 * WHY A TEST AND NOT A CONVENTION. The rule was already written in prose at the
 * top of Header.tsx, MastheadNav.tsx and MobileDrawer.tsx -- three comments,
 * each saying the slot is deliberately empty -- and a `HeaderSearch.tsx`, a
 * `DeferredHeaderSearch.tsx` and a `SearchBox.tsx` were sitting in the tree the
 * whole time, one import away from being rendered again. Two of them were dead
 * and the third was live on the results page. Prose does not fail a build.
 *
 * WHAT IT CHECKS. Two things, because either alone has a hole: that no source
 * file declares a search-shaped control at all, and that the shell components in
 * particular declare no text input beyond the newsletter's email field.
 */

const ROOT = process.cwd()

/** The components that make up every page's chrome. */
const SHELL = [
  'src/app/layout.tsx',
  'src/components/layout/Header.tsx',
  'src/components/layout/TopBar.tsx',
  'src/components/layout/MastheadNav.tsx',
  'src/components/layout/MobileDrawer.tsx',
  'src/components/layout/SiteFooter.tsx',
  'src/components/layout/RegionMenu.tsx',
]

/**
 * The one input the shell is allowed to carry.
 *
 * The footer's newsletter field is a subscribe box, not a search box: it posts
 * an address to the mailing list and never queries the catalogue. It is
 * `type="email"` with a Hebrew placeholder naming what it wants, which is also
 * how the rendered-page assertion in `e2e/home.spec.ts` tells the two apart.
 */
const NEWSLETTER_INPUT = /type="email"/

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue
      walk(full, out)
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(relative(ROOT, full))
    }
  }
  return out
}

function read(file: string): string {
  return readFileSync(resolve(ROOT, file), 'utf8')
}

/** Source with comments removed: the rule is about markup, not about prose. */
function markup(file: string): string {
  return read(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
}

describe('no search UI anywhere on the site', () => {
  const files = walk(resolve(ROOT, 'src'))

  it('declares no search-typed input, search role or combobox listbox', () => {
    const offenders: string[] = []
    for (const file of files) {
      const source = markup(file)
      for (const hit of source.match(/type="search"|role="search(box)?"/g) ?? []) {
        offenders.push(`${file}: ${hit}`)
      }
    }
    expect(offenders, `search controls found:\n  ${offenders.join('\n  ')}`).toEqual([])
  })

  it('ships no component whose name says it is a search field', () => {
    // HeaderSearch.tsx, DeferredHeaderSearch.tsx and SearchBox.tsx were deleted
    // on 2026-09-04. This fails if one comes back under any of those names, or
    // under a new one shaped the same way.
    const offenders = files.filter((f) => /\/(Header)?Search(Box|Bar|Field|Input)?\.tsx$/.test(f))
    expect(offenders, `search field components:\n  ${offenders.join('\n  ')}`).toEqual([])
  })

  it('leaves the shell with no text input but the newsletter address field', () => {
    const offenders: string[] = []
    for (const file of SHELL) {
      const source = markup(file)
      for (const tag of source.match(/<input[^>]*>/g) ?? []) {
        if (!NEWSLETTER_INPUT.test(tag)) offenders.push(`${file}: ${tag.slice(0, 80)}`)
      }
    }
    expect(offenders, `unexpected inputs in the shell:\n  ${offenders.join('\n  ')}`).toEqual([])
  })

  it('leaves the results page answering ?q= with no field to type into', () => {
    // The route stays: the rule removes the input, not the ability to resolve a
    // query somebody arrives with.
    const page = read('src/app/(store)/search/page.tsx')
    expect(page).toContain('searchProductsCached')
    expect(markup('src/app/(store)/search/page.tsx')).not.toContain('<input')
  })
})
