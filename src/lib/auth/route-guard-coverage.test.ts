import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every page in the panel groups must call a guard of its own.
 *
 * WHY THIS TEST EXISTS, AND WHY THE LAYOUT IS NOT THE ANSWER.
 *
 * `src/app/(admin)/layout.tsx` calls requirePanelSession() and its comment used
 * to claim that the boundary "also covers every page in the group". It does
 * not. In the App Router a layout and the page beneath it render in PARALLEL:
 * `children` is an element the layout is HANDED, already constructed, and
 * rendering it is not what triggers the page's own async work. A redirect() in
 * the layout throws away the output; it does not stop the page function from
 * running and querying first.
 *
 * So the layout is a display gate, and the per-page guard is the access gate.
 * Both are wanted, which is why the layout keeps its call, but only the second
 * one is load-bearing.
 *
 * Measured when this test was written (2026-08-19): 38 admin pages, of which
 * `admin/products/page.tsx` had NO guard and queried `products` through the
 * caller's own client. RLS kept a stranger from reading drafts, so this was
 * not an open door -- it was the last page relying on RLS alone, in a group
 * where every one of its 37 siblings states its own requirement.
 */

const GUARD_CALLS = [
  'requireAdminPage',
  'requireAdminSession',
  'requireStaffSession',
  'requirePanelSession',
  'requireSection',
  'requireSupplierMember',
  'requireSupplierRole',
]

/**
 * Pages that legitimately need no guard: they render nothing and read nothing,
 * they only redirect. The test does not take this on trust -- it asserts the
 * file contains no data access, so a stub that later grows a query stops being
 * exempt automatically.
 */
const REDIRECT_ONLY = ['src/app/(supplier)/supplier/scan/page.tsx']

/** Anything that reaches the database or the session from a page. */
const DATA_ACCESS = ['createClient', 'createAdminClient', 'supabase', 'auth.getUser', 'fetch(']

/**
 * Strips comments and string literals before matching.
 *
 * THIS IS THE WHOLE TEST. Without it the check is a substring search over the
 * raw file, and a page that merely MENTIONS a guard in a comment passes while
 * being wide open. That is not hypothetical: the first version of this test
 * passed a deliberately unguarded `admin/products/page.tsx`, because the
 * comment explaining why the layout is not a guard contains the word
 * `requirePanelSession`. A guard-coverage test that cannot see a missing guard
 * is worse than no test, because it is also a claim.
 */
function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments, including JSDoc
    .replace(/\/\/[^\n]*/g, ' ') // line comments
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''") // single-quoted strings
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""') // double-quoted strings
    .replace(/`(?:[^`\\]|\\.)*`/g, '``') // template literals
}

function pagesUnder(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry === 'page.tsx') out.push(full)
    }
  }
  walk(dir)
  return out
}

describe('panel route guard coverage', () => {
  const adminPages = pagesUnder('src/app/(admin)')
  const supplierPages = pagesUnder('src/app/(supplier)')

  it('finds the panel groups at all, so a move cannot make this test vacuous', () => {
    // A rename of the route group would leave both arrays empty and every
    // assertion below would pass over nothing.
    expect(adminPages.length).toBeGreaterThan(20)
    expect(supplierPages.length).toBeGreaterThan(3)
  })

  it.each([...adminPages, ...supplierPages])('%s calls a guard', (page) => {
    const source = readFileSync(page, 'utf8')
    if (REDIRECT_ONLY.includes(page)) {
      // Exempt, but only for as long as it stays a stub.
      const stubCode = stripCommentsAndStrings(source)
      for (const marker of DATA_ACCESS) {
        expect(stubCode, `${page} is on the redirect-only allowlist but reads data`).not.toContain(
          marker,
        )
      }
      expect(stripCommentsAndStrings(source)).toContain('redirect(')
      return
    }
    // Comments and strings removed, and the guard must be CALLED, not named.
    const code = stripCommentsAndStrings(source)
    const guarded = GUARD_CALLS.some((guard) => new RegExp(`\\b${guard}\\s*\\(`).test(code))
    expect(guarded, `${page} has no guard call. Add one from: ${GUARD_CALLS.join(', ')}`).toBe(true)
  })

  it('does not count a guard named in a comment or a string as a guard', () => {
    // The regression this pins, verbatim in shape: a page whose only mention of
    // a guard is prose.
    const decoy = [
      '// `(admin)/layout.tsx` calls requirePanelSession(), but a layout does',
      '/** requireSection is not called here. */',
      "const help = 'call requireAdminPage() first'",
      'export default async function Page() { return null }',
    ].join('\n')
    const code = stripCommentsAndStrings(decoy)
    const guarded = GUARD_CALLS.some((guard) => new RegExp(`\\b${guard}\\s*\\(`).test(code))
    expect(guarded).toBe(false)

    // And a real call is still seen.
    const real = 'export default async function Page() { await requireSection("catalog") }'
    const realGuarded = GUARD_CALLS.some((guard) =>
      new RegExp(`\\b${guard}\\s*\\(`).test(stripCommentsAndStrings(real)),
    )
    expect(realGuarded).toBe(true)
  })

  it('keeps the allowlist honest: every entry exists', () => {
    for (const page of REDIRECT_ONLY) {
      expect(() => readFileSync(page, 'utf8')).not.toThrow()
    }
  })
})
