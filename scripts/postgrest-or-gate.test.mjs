import { describe, expect, it } from 'vitest'
import {
  REVIEWED_EXPRESSIONS,
  classifyInterpolation,
  interpolationsIn,
  scanPostgrestOr,
} from './postgrest-or-scan.mjs'

/**
 * THE GATE FOR POSTGREST FILTER INJECTION.
 *
 * `.or()` takes a filter EXPRESSION, not a value, and in that expression
 * `, ( ) " \ % _ *` are structural. So
 *
 *     .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
 *
 * is not a search for `q`: a comma in `q` appends a condition of the caller's
 * choosing and a `(` opens a nested group. PostgREST still parameterizes the
 * values, so this is not SQL injection and RLS still holds. What it changes is
 * WHICH ROWS MATCH, on queries whose entire job is deciding what a caller sees.
 *
 * MEASURED 2026-09-09: nine call sites in `src/`, all nine already safe. Six
 * sanitize with `sanitizeOrTerm`, two interpolate a hardcoded literal, one
 * interpolates `user.id`. Three of the nine carry a comment naming this exact
 * defect, so the project has already paid to learn it once. This gate is what
 * stops the tenth.
 *
 * WHY THE SCAN READS THE WHOLE FILE. Six of the nine safe sites look like
 * `.or(`...${q}...`)` on their own line, with `const q = sanitize(...)` sixty
 * lines up. A line-scoped rule would call all six violations, and a gate that
 * is wrong six times out of nine on the day it ships is a gate somebody
 * deletes.
 */

describe('what may be interpolated into a filter expression', () => {
  it('accepts a name that says it was sanitized', () => {
    expect(classifyInterpolation('safeQ')).toEqual({ ok: true, reason: 'sanitized-name' })
    expect(classifyInterpolation('sanitizeOrTerm(q)').ok).toBe(true)
  })

  it('accepts a session-derived id, which no caller controls', () => {
    expect(classifyInterpolation('user.id')).toEqual({ ok: true, reason: 'session-derived' })
    expect(classifyInterpolation('session.user.id').ok).toBe(true)
  })

  it('FILTER_INJECTION: refuses a raw request value', () => {
    const verdict = classifyInterpolation('q', 'const q = searchParams.get("q") ?? ""')
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toBe('unsanitized-interpolation')
  })

  it('follows sanitization across lines, which is how six of the nine look', () => {
    const source = "const q = sanitize(searchParams.get('q') ?? '')\n.or(`a.ilike.%${q}%`)"
    expect(classifyInterpolation('q', source)).toEqual({
      ok: true,
      reason: 'sanitized-on-assignment',
    })
  })

  it('does not let an unrelated sanitized name launder a different identifier', () => {
    // The trap: one `const safeName = sanitizeOrTerm(x)` somewhere in a big
    // file would otherwise bless every other interpolation in it.
    const source = 'const safeName = sanitizeOrTerm(a)\nconst raw = params.get("q")'
    expect(classifyInterpolation('raw', source).ok).toBe(false)
  })

  it('accepts a loop variable taken from a source the file sanitized', () => {
    // facets/route.ts and search-server.ts: `for (const word of params.q.split(' '))`
    // where params.q was sanitized at the entry point.
    const source =
      "const params = { q: sanitizeOrTerm(input) }\nfor (const word of params.q.split(' ')) {}"
    expect(classifyInterpolation('word', source).ok).toBe(true)
  })

  it('honours the reviewed list only for the file it was reviewed in', () => {
    // `facet.value` is safe in category-page.ts because it is one of two
    // literals declared there. The same expression in another file has not
    // been read by anyone and must not inherit that.
    expect(classifyInterpolation('facet.value', '', 'src/lib/category-page.ts')).toEqual({
      ok: true,
      reason: 'reviewed',
    })
    expect(classifyInterpolation('facet.value', '', 'src/app/api/search/route.ts').ok).toBe(false)
  })

  it('keeps the reviewed list short enough to read', () => {
    expect(REVIEWED_EXPRESSIONS.size).toBeLessThanOrEqual(2)
  })
})

describe('reading the interpolations out of a template', () => {
  it('finds every one, not just the first', () => {
    expect(interpolationsIn('name_he.ilike.%${q}%,description_he.ilike.%${q}%')).toEqual(['q', 'q'])
  })

  it('returns nothing for a template with no interpolation', () => {
    expect(interpolationsIn('type.eq.coupon,is_coupon_enabled.is.true')).toEqual([])
  })
})

describe('the repository as it stands', () => {
  it('has no unsanitized .or() interpolation in src/', () => {
    expect(scanPostgrestOr()).toEqual([])
  })
})
