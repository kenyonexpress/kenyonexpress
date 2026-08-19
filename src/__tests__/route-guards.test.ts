import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every privileged page and route handler calls a guard of its own.
 *
 * WHY THIS TEST EXISTS AND WHY A LAYOUT IS NOT ENOUGH.
 *
 * `src/app/(admin)/layout.tsx` calls `requirePanelSession()`, and it is tempting
 * to read that as covering the whole group. It does not. In the App Router a
 * layout and the page beneath it render in PARALLEL: `children` is an element
 * the layout receives already built, so a `redirect()` in the layout discards
 * the page's output but does not prevent the page function from running and
 * querying. The layout is a display gate; the per-page call is the execution
 * gate. Both are wanted, which is why the guard layers are numbered 1-4 in
 * docs/AUTH-MODEL.md.
 *
 * The gap this pins: /admin/products was the one page in a group of 38 with no
 * guard of its own, including its own siblings products/new and
 * products/[id]/edit, which both gate on `catalog`. RLS meant it was never a
 * draft-product leak (public SELECT is `status = 'active' AND deleted_at IS
 * NULL`), but the panel shell rendered for anyone who reached it.
 *
 * The allowlist below is deliberately small and every entry states why. A file
 * that needs no guard is a file that reads nothing and decides nothing; if an
 * entry here ever grows a query, this test will not catch it, so the reason has
 * to be checkable by eye.
 */

const GUARD_CALLS = [
  'requireAdminPage',
  'requireAdminSession',
  'requireStaffSession',
  'requirePanelSession',
  'requireSection',
  'requireSupplierMember',
  'requireSupplierRole',
  // The scanner endpoints authenticate by DEVICE BEARER TOKEN, not by a cookie
  // session, because the caller is a phone on a shop counter rather than a
  // browser. `identityScopedClient` builds a Supabase client scoped to that
  // token, so every query it makes runs as the caller under RLS.
  //
  // That is not a weaker guard than the page ones, it is a stronger one: a page
  // guard is a check that can be forgotten one statement before a query, while
  // this is the client the query has to go through. It is also why these routes
  // are not CSRF-reachable -- no ambient cookie authenticates them.
  'identityScopedClient',
]

/** Files that legitimately carry no guard, each with the reason. */
const NO_GUARD_NEEDED: Record<string, string> = {
  'src/app/(supplier)/supplier/scan/page.tsx':
    'pure redirect stub to /scan; reads nothing, decides nothing',
  'src/app/api/supplier/redeem/route.ts':
    're-export alias; the guard lives in api/supplier/vouchers/redeem',
}

/**
 * Strips comments, string literals and template literals before matching.
 *
 * THIS IS WHAT MAKES THE TEST A TEST. Without it the check is a substring
 * search over the raw file, and a page that merely MENTIONS a guard in a
 * comment passes while being wide open.
 *
 * That is not hypothetical. Two agents wrote this suite independently on
 * 2026-08-19 and BOTH shipped the raw `source.includes(call)` form; both were
 * verified by mutation to pass a deliberately unguarded
 * `admin/products/page.tsx`, because the comment explaining why the layout is
 * not a guard contains the word `requirePanelSession`. The header of THIS file
 * contains it too.
 *
 * A guard-coverage test that cannot see a missing guard is worse than no test,
 * because it is also a claim.
 */
function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments, including JSDoc
    .replace(/\/\/[^\n]*/g, ' ') // line comments
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''") // single-quoted strings
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""') // double-quoted strings
    .replace(/`(?:[^`\\]|\\.)*`/g, '``') // template literals
}

/**
 * The redirect-free guard, used where a redirect would be the wrong answer.
 *
 * `src/app/api/admin/reports/[report]/route.ts` is the case: it is a DOWNLOAD.
 * `requireSection` ends in `redirect()`, and a 307 to /login in answer to a
 * download reaches the user as a file named `login` containing an HTML page.
 * So it reads the session and checks the matrix by hand, and answers 403 with a
 * body that says so.
 *
 * Both halves are required. `getSessionWithRole()` on its own is a READ with no
 * decision attached, so accepting it alone would let a route that merely looks
 * up who is calling count as guarded.
 */
function callsSessionPlusMatrixCheck(code: string): boolean {
  const readsSession = /\bgetSessionWithRole\s*\(/.test(code)
  const checksMatrix = /\b(canReadSection|canWriteSection)\s*\(/.test(code)
  return readsSession && checksMatrix
}

/** True when `source` CALLS a guard, rather than naming one. */
function callsAGuard(source: string): boolean {
  const code = stripCommentsAndStrings(source)
  if (GUARD_CALLS.some((call) => new RegExp(`\\b${call}\\s*\\(`).test(code))) return true
  return callsSessionPlusMatrixCheck(code)
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

function privilegedFiles(): string[] {
  const roots = [
    'src/app/(admin)',
    'src/app/(supplier)',
    'src/app/api/admin',
    'src/app/api/supplier',
  ]
  return roots
    .flatMap((root) => {
      try {
        return walk(root)
      } catch {
        return []
      }
    })
    .filter((f) => f.endsWith('page.tsx') || f.endsWith('route.ts'))
    .filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'))
}

describe('privileged routes call a guard of their own', () => {
  const files = privilegedFiles()

  it('finds the admin and supplier surface at all', () => {
    // A refactor that moves these directories must not turn this suite into a
    // vacuous pass over zero files.
    expect(files.length).toBeGreaterThan(30)
  })

  it.each(files)('%s', (file) => {
    if (file in NO_GUARD_NEEDED) return
    const source = readFileSync(file, 'utf8')
    expect(callsAGuard(source), `${file} calls no guard from ${GUARD_CALLS.join(', ')}`).toBe(true)
  })

  it('does not accept a guard named in a comment or a string as a guard', () => {
    const decoy = [
      '// the layout calls requirePanelSession(), which does not cover children',
      '/** requireSection is deliberately not called here. */',
      "const hint = 'call requireAdminPage() first'",
      'export default async function Page() { return null }',
    ].join('\n')
    expect(callsAGuard(decoy)).toBe(false)

    // And a real call is still seen, so the strip is not simply eating everything.
    expect(
      callsAGuard('export default async function P(){ await requireSection("catalog") }'),
    ).toBe(true)
  })

  it('accepts the redirect-free guard only when the matrix is actually checked', () => {
    const both =
      'const s = await getSessionWithRole(); if (!s || !canReadSection(s.role, "payments")) return new Response("", { status: 403 })'
    expect(callsAGuard(both)).toBe(true)

    // Reading who is calling, and then doing nothing with it, is not a guard.
    const sessionOnly = 'const s = await getSessionWithRole(); return Response.json(await rows())'
    expect(callsAGuard(sessionOnly)).toBe(false)
  })

  it('keeps the allowlist honest', () => {
    // An allowlisted file that has grown a database read is no longer the
    // trivial stub it was allowlisted as.
    for (const [file, reason] of Object.entries(NO_GUARD_NEEDED)) {
      const source = stripCommentsAndStrings(readFileSync(file, 'utf8'))
      expect(source, `${file} was allowlisted as: ${reason}`).not.toContain('createClient')
      expect(source, `${file} was allowlisted as: ${reason}`).not.toContain('createAdminClient')
    }
  })
})
