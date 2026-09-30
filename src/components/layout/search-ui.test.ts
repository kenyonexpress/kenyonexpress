import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE SITE HAS ONE SEARCH FIELD, AND THIS IS THE GATE THAT PINS ITS SHAPE.
 *
 * HISTORY, because the rule flipped. This file was `no-search-ui.test.ts`
 * from 04.09 to 30.09: Ofir reported the deployed masthead field as defect 1
 * on 04.09, the field was removed rather than hidden, and the test asserted
 * that no search-shaped control existed anywhere in `src/`. STEP 08 (30.09)
 * asked for the instant-results dropdown in the header, the /search page with
 * facets and keyboard navigation, so the absence rule became a shape rule.
 * Live has the field (MEASURED-LIVE.md rows 23-36), so this also closes the
 * one section-level delta docs/LIVE-DELTA.md recorded.
 *
 * WHAT IT CHECKS, and why each check is a test and not a comment:
 *
 *   1. ONE IMPLEMENTATION. `type="search"` appears in exactly one component,
 *      `search/SiteSearch.tsx`. Three files once carried three copies of the
 *      same widget (HeaderSearch, DeferredHeaderSearch, SearchBox), two dead,
 *      and the a11y wiring was missing from the live one. A second copy is how
 *      that happens again.
 *   2. THREE MOUNTS, FIXED IDS. The masthead, the handheld row and the results
 *      page mount it, with the ids `e2e/a11y.spec.ts` walks. Two mounts in the
 *      same DOM with the same id would be a duplicate id and a broken
 *      `aria-controls`.
 *   3. THE COMBOBOX WIRING. `role="combobox"`, `aria-activedescendant`,
 *      `aria-controls`, a `role="listbox"` popup of `role="option"` rows, and
 *      handlers for every key the pattern names. axe has no rule for a missing
 *      activedescendant; this does.
 *   4. THE SHELL CARRIES NO OTHER INPUT than the newsletter's email field: the
 *      search field arrives through `SiteSearch`, not as a second `<input>`
 *      written into a shell file.
 *   5. THE LISTING AUTOCOMPLETE STAYS WHERE IT WAS: category-scoped, sidebar
 *      only, `type="text"`. It is a filter on one archive, not a site search,
 *      and a shell file may not reach it.
 *   6. THE RESULTS PAGE still answers through `facetedSearchCached`, so the
 *      dropdown and the page cannot disagree about a query.
 */

const ROOT = process.cwd()

/** The one search field, and where it is allowed to be mounted. */
const SITE_SEARCH = 'src/components/search/SiteSearch.tsx'
const HANDHELD = 'src/components/search/HandheldSearch.tsx'
const RESULTS_PAGE = 'src/app/(store)/search/page.tsx'
const MOUNTS: Record<string, string> = {
  'src/components/layout/MastheadNav.tsx': 'masthead-search',
  [HANDHELD]: 'handheld-search',
  [RESULTS_PAGE]: 'page-search',
}

/** The listing page's category-scoped field, and its one host. */
const AUTOCOMPLETE = 'src/components/category/CategoryAutocomplete.tsx'
const AUTOCOMPLETE_HOST = 'src/components/category/CategoryFilterSidebar.tsx'

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
 * The one raw input the shell is allowed to write itself. The footer's
 * newsletter field posts an address to the mailing list and never queries the
 * catalogue; the search field is a component the shell mounts, not an
 * `<input>` it declares.
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

describe('the site search field', () => {
  const files = walk(resolve(ROOT, 'src'))

  it('is implemented once, in SiteSearch.tsx', () => {
    const declaring = files.filter((f) => /type="search"|role="searchbox"/.test(markup(f)))
    expect(declaring, 'files declaring a search-typed control').toEqual([SITE_SEARCH])
  })

  it('is mounted by the masthead, the handheld row and the results page, each with its own id', () => {
    const importers = files.filter((f) => f !== SITE_SEARCH && /\bSiteSearch\b/.test(markup(f)))
    expect(importers.sort()).toEqual(Object.keys(MOUNTS).sort())
    for (const [file, id] of Object.entries(MOUNTS)) {
      const source = markup(file)
      expect(source, `${file} mounts SiteSearch with id="${id}"`).toMatch(
        new RegExp(`<SiteSearch[^>]*\\bid="${id}"`),
      )
      expect(source.match(/<SiteSearch\b/g) ?? [], `${file} mounts it once`).toHaveLength(1)
    }
    const ids = Object.values(MOUNTS)
    expect(new Set(ids).size, 'the three ids are distinct').toBe(ids.length)
    // The handheld row is the header's, and only the header's.
    const handheldHosts = files.filter(
      (f) => f !== HANDHELD && /\bHandheldSearch\b/.test(markup(f)),
    )
    expect(handheldHosts).toEqual(['src/components/layout/Header.tsx'])
  })

  it('is a combobox with the listbox wiring and every key the pattern names', () => {
    const source = markup(SITE_SEARCH)
    expect(source).toContain("'use client'")
    expect(source).toContain('type="search"')
    expect(source).toContain('role="combobox"')
    expect(source).toContain('aria-autocomplete="list"')
    expect(source).toContain('aria-controls={listId}')
    expect(source).toContain('aria-activedescendant={activeId}')
    expect(source).toContain('aria-expanded={expanded}')
    expect(source).toContain('role="listbox"')
    expect(source).toContain('role="option"')
    expect(source).toContain('aria-selected={i === active}')
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape', 'Tab']) {
      expect(source, `handles ${key}`).toContain(`case '${key}'`)
    }
    // Suggestions come through our own route, never from the engine directly:
    // the key is a server secret and the CSP's connect-src is our origin only.
    expect(source).toContain('/api/search/suggest?')
    expect(source).toContain('/api/search/quick-links')
    expect(source).not.toMatch(/MEILISEARCH|meilisearch/)
  })

  it('leaves the shell with no raw text input but the newsletter address field', () => {
    const offenders: string[] = []
    for (const file of SHELL) {
      const source = markup(file)
      for (const tag of source.match(/<input[^>]*>/g) ?? []) {
        if (!NEWSLETTER_INPUT.test(tag)) offenders.push(`${file}: ${tag.slice(0, 80)}`)
      }
    }
    expect(offenders, `unexpected inputs in the shell:\n  ${offenders.join('\n  ')}`).toEqual([])
  })

  it('keeps the listing autocomplete category-scoped, in the sidebar, and out of the shell', () => {
    const importers = files.filter(
      (f) => f !== AUTOCOMPLETE && /CategoryAutocomplete/.test(markup(f)),
    )
    expect(importers).toEqual([AUTOCOMPLETE_HOST])
    const source = markup(AUTOCOMPLETE)
    expect(source).toContain('type="text"')
    expect(source).toContain('role="combobox"')
    for (const file of SHELL) {
      expect(markup(file)).not.toMatch(/CategoryAutocomplete|CategoryFilterSidebar/)
    }
  })

  it('keeps the results page on the faceted engine, with the field seeded from the query', () => {
    const page = markup(RESULTS_PAGE)
    expect(page).toContain('facetedSearchCached')
    expect(page).toMatch(/<SiteSearch[^>]*initialQuery=\{q\}/)
    expect(page).toContain('SearchEmptyState')
  })
})
