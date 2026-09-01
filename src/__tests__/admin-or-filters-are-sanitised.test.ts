import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * No admin page may interpolate a raw search term into a PostgREST `.or()`.
 *
 * `.or()` takes an EXPRESSION string, not a value. `src/lib/utils/search-escape.ts`
 * says so at the top and exists for it: in that argument `, ( ) " \` are
 * structural, so a term carrying one does not search for it, it changes the
 * filter.
 *
 * The helper was already in the repo and already used by the vendors and
 * suppliers pages. Three others - orders, users and audit-log - built the same
 * expression by interpolating `params.q` directly. `baseListParamsSchema` caps
 * `q` at 100 characters and constrains nothing else, so every one of those
 * characters reached the query.
 *
 * This is a static read of the source, in the manner of the rate-limit policy
 * audit, because the failure is a shape rather than a behaviour: an admin page
 * is a server component and the cheapest way to keep the shape out is to refuse
 * to let it be written.
 */

const ADMIN_ROOT = 'src/app/(admin)'

const ADMIN_PAGES = readdirSync(resolve(process.cwd(), ADMIN_ROOT), {
  recursive: true,
  encoding: 'utf8',
})
  .filter((name) => name.endsWith('.tsx'))
  .map((name) => `${ADMIN_ROOT}/${name}`)
  .sort()

/**
 * `.or(` carrying a `${params.q}` interpolation.
 *
 * Deliberately matches `params.q` and not a bare `${q}`: a local named `q` or
 * `safeQ` is the OUTPUT of the sanitiser, and flagging it would make the only
 * way to pass this test the removal of the interpolation entirely. What is
 * being banned is the raw parsed parameter reaching the expression.
 */
const RAW_Q_IN_OR = /\.or\(\s*(?:\[)?\s*`[^`]*\$\{\s*params\.q\s*\}/

describe('admin .or() filters never carry a raw search term', () => {
  it('finds the admin pages at all, so a broken glob cannot pass silently', () => {
    expect(ADMIN_PAGES.length).toBeGreaterThan(15)
  })

  it.each(ADMIN_PAGES)('%s', (relative: string) => {
    const source = readFileSync(resolve(process.cwd(), relative), 'utf8')
    if (!source.includes('.or(')) return

    const offending = RAW_Q_IN_OR.test(source)
    expect(
      offending,
      `${relative} interpolates a search term straight into .or(). Pass it through sanitizeOrTerm from @/lib/utils/search-escape first: in an .or() expression , ( ) " and \\ are syntax, not text.`,
    ).toBe(false)
  })
})
