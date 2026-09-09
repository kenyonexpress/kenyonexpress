/**
 * Every PostgREST `.or(...)` built from a template literal, and whether the
 * values interpolated into it were sanitized first.
 *
 * WHY THIS EXISTS. `.or()` does not take values, it takes a FILTER EXPRESSION,
 * and in that expression `, ( ) " \ % _ *` are structural. So this
 *
 *     .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
 *
 * is not a search for `q`. A `q` containing a comma appends a condition of the
 * caller's choosing, and a `q` containing `(` opens a nested group. It does not
 * reach raw SQL -- PostgREST still parameterizes the values -- so it is not
 * SQL injection and RLS still holds. What it changes is WHICH ROWS MATCH, on a
 * query whose whole job is to decide which rows the caller may see.
 *
 * MEASURED 2026-09-09: nine `.or()` call sites in `src/`, and all nine are
 * already safe. Six pass a value through `sanitizeOrTerm`, two interpolate one
 * of two hardcoded literals in `category-page.ts`, and one interpolates
 * `user.id` from the session. Three of the six carry a comment naming this
 * exact defect, which means the project has already paid to learn it.
 *
 * So, like the raw-HTML gate, this holds a property rather than repairing one.
 * The tenth call site is the one it exists for.
 *
 * WHAT COUNTS AS SANITIZED, and it is deliberately syntactic:
 *
 *   an identifier containing "safe" or "sanitiz", case-insensitive
 *   `sanitizeOrTerm(...)` inline
 *   a member expression rooted at a session object (`user.id`, `session.user.id`)
 *
 * A syntactic rule cannot follow `const q = sanitize(searchParams.get('q'))`
 * across lines, and that is the shape SIX of the nine safe call sites use. So
 * the scan reads the whole file, not the line: when the file both imports
 * `sanitizeOrTerm` and assigns the interpolated identifier from a sanitizing
 * call, the site passes. A file that interpolates an identifier it never
 * sanitizes anywhere is the violation.
 *
 * THIS IS A LINT, NOT A PROOF. It can be fooled by an identifier that is
 * sanitized on one branch and not another. It is aimed at the accident, which
 * is a new `.or()` written by copying a neighbouring one and dropping the
 * `sanitizeOrTerm` call.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'

const ROOT = 'src'
const EXTENSIONS = new Set(['.ts', '.tsx'])

/** Interpolations inside a template literal: the `x` of every `${x}`. */
export function interpolationsIn(template) {
  return [...template.matchAll(/\$\{([^}]+)\}/g)].map((match) => match[1].trim())
}

/** Session-derived values. An id from the session is not caller-controlled. */
const SESSION_ROOTED = /^(user|session|profile|auth)\b/

const LOOKS_SANITIZED = /safe|sanitiz/i

/**
 * Call sites read in full and found safe for a reason no syntactic rule can
 * see. Keyed by file so an identically named expression elsewhere is still
 * caught, and kept to the smallest possible set.
 *
 * `category-page.ts` interpolates `facet.value`, and `facet` is not derived
 * from a request at all: it is one of exactly two object literals declared at
 * lines 223-224 of that same file,
 *
 *   { column: 'or',  value: 'type.eq.coupon,is_coupon_enabled.is.true' }
 *   { column: 'and', value: 'type.neq.coupon,is_coupon_enabled.is.false' }
 *
 * chosen by a boolean. Both contain a comma ON PURPOSE, which is why they
 * cannot go through `sanitizeOrTerm`: that function replaces commas with
 * spaces and would destroy the filter. Renaming the variable to something
 * matching /safe/ would have silenced the gate and taught the next reader
 * that the name is what makes it safe, so it is listed here instead.
 */
export const REVIEWED_EXPRESSIONS = new Map([
  ['src/lib/category-page.ts', new Set(['facet.value'])],
])

/**
 * Classifies one interpolated expression, given what the whole file does.
 *
 * `fileSource` is passed rather than read here so the test can drive every
 * branch with a string.
 */
export function classifyInterpolation(expression, fileSource = '', file = '') {
  const value = expression.trim()
  if (REVIEWED_EXPRESSIONS.get(file)?.has(value)) return { ok: true, reason: 'reviewed' }
  if (LOOKS_SANITIZED.test(value)) return { ok: true, reason: 'sanitized-name' }
  if (SESSION_ROOTED.test(value)) return { ok: true, reason: 'session-derived' }

  // The cross-line case: `const q = sanitize(...)` earlier in the same file.
  // Anchored to this identifier's own assignment, so an unrelated
  // `const safeX = sanitizeOrTerm(...)` elsewhere does not launder it.
  const identifier = value.match(/^[A-Za-z_$][\w$]*/)?.[0]
  if (identifier) {
    const assignment = new RegExp(
      `\\b(?:const|let|var)\\s+${identifier}\\s*=\\s*[^\\n]*(?:sanitiz\\w*|safe\\w*)\\s*\\(`,
      'i',
    )
    if (assignment.test(fileSource)) return { ok: true, reason: 'sanitized-on-assignment' }
    const forOf = new RegExp(`\\bfor\\s*\\(\\s*(?:const|let)\\s+${identifier}\\s+of\\b`, 'i')
    if (forOf.test(fileSource) && /sanitiz/i.test(fileSource)) {
      // `for (const word of params.q.split(' '))` where params.q was sanitized
      // at the entry point. facets/route.ts and search-server.ts are this shape.
      return { ok: true, reason: 'iterated-from-sanitized-source' }
    }
  }
  return { ok: false, reason: 'unsanitized-interpolation' }
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue
      walk(full, files)
    } else if (EXTENSIONS.has(extname(entry))) {
      files.push(full)
    }
  }
  return files
}

export function scanPostgrestOr(root = ROOT) {
  const offenders = []
  for (const file of walk(root)) {
    if (/\.test\.tsx?$/.test(file)) continue
    const source = readFileSync(file, 'utf8')
    if (!source.includes('.or(`')) continue
    source.split('\n').forEach((line, index) => {
      const call = line.match(/\.or\(`([^`]*)`/)
      if (!call) return
      for (const expression of interpolationsIn(call[1])) {
        const { ok, reason } = classifyInterpolation(expression, source, file)
        if (!ok) offenders.push({ file, line: index + 1, expression, reason })
      }
    })
  }
  return offenders
}

export function formatPostgrestOr(offenders) {
  return offenders
    .map((o) => `  ${o.file}:${o.line}  ${o.reason}\n    \${${o.expression}}`)
    .join('\n')
}
