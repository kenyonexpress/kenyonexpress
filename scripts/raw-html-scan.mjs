/**
 * Every `dangerouslySetInnerHTML` in `src/`, and whether its value is one this
 * repository has decided is safe.
 *
 * WHY THIS EXISTS. Measured 2026-09-09: ten files in `src/` name
 * `dangerouslySetInnerHTML`, and the posture is already correct. Eight of them
 * pass `jsonLdScript(...)`, which is `JSON.stringify(node).replace(/</g,
 * '\\u003c')` and is exactly the escape that stops a `</script>` breakout out
 * of a JSON-LD block. One passes `CONSENT_PREPAINT_SCRIPT`, a module constant.
 * The other two hits are comments in the legal renderer saying it deliberately
 * does NOT use raw HTML.
 *
 * So this gate does not fix anything. It holds a property that is currently
 * true and that nothing was checking, and the thing it is aimed at is one line
 * in a future commit:
 *
 *     <div dangerouslySetInnerHTML={{ __html: `<p>${product.description_he}</p>` }} />
 *
 * That is stored XSS through the admin product form, it looks exactly like the
 * eight lines around it, and `biome` has no opinion about it. Hebrew catalogue
 * copy is authored in an admin panel and rendered RTL, which is precisely the
 * content the section that asked for this audit named.
 *
 * WHAT COUNTS AS SAFE, and the list is deliberately short:
 *
 *   jsonLdScript(...)   escapes `<`, and is the only sanctioned serializer
 *   a SCREAMING_CASE identifier passed alone, i.e. a module constant with no
 *   interpolation reachable from a request
 *
 * Anything else -- a template literal, a concatenation, a bare variable, a
 * property access, a call to any other function -- is a violation and has to
 * be argued for by being added to `SAFE_CONSTANTS` in a commit somebody reads.
 * A bare variable is refused even when it happens to hold a constant today,
 * because the whole failure mode is that the value stops being constant later
 * and the call site does not change.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'

const ROOT = 'src'
const EXTENSIONS = new Set(['.ts', '.tsx'])

/**
 * Module constants allowed to be injected directly. Each one is a literal with
 * no request-derived input; adding to this list is the review step.
 */
export const SAFE_CONSTANTS = new Set(['CONSENT_PREPAINT_SCRIPT'])

/** The one sanctioned serializer. See `src/lib/seo/json-ld.ts`. */
const SAFE_CALL = /^jsonLdScript\(/

const SCREAMING_CASE = /^[A-Z][A-Z0-9_]*$/

/**
 * Classifies the expression assigned to `__html`.
 *
 * Kept pure and exported so `raw-html-scan.test.mjs` can drive every branch
 * without a filesystem.
 */
export function classifyHtmlValue(expression) {
  const value = expression.trim()
  if (value === '') return { ok: false, reason: 'empty' }
  if (SAFE_CALL.test(value)) return { ok: true, reason: 'jsonLdScript' }
  if (SCREAMING_CASE.test(value)) {
    return SAFE_CONSTANTS.has(value)
      ? { ok: true, reason: 'allowlisted-constant' }
      : { ok: false, reason: 'constant-not-in-allowlist' }
  }
  if (value.startsWith('`')) return { ok: false, reason: 'template-literal' }
  if (value.includes('+')) return { ok: false, reason: 'concatenation' }
  return { ok: false, reason: 'unreviewed-expression' }
}

/**
 * Pulls the `__html:` value out of a line.
 *
 * Returns null when the line names `dangerouslySetInnerHTML` without assigning
 * on the same line, which is how the two comments in the legal renderer are
 * skipped: they are prose about not doing this, not a call site.
 */
export function htmlValueOnLine(line) {
  const match = line.match(/__html:\s*(.+?)\s*\}\}/)
  if (match) return match[1]
  const open = line.match(/__html:\s*(.+)$/)
  return open ? open[1].replace(/\s*\}+\s*$/, '') : null
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

export function scanRawHtml(root = ROOT) {
  const offenders = []
  for (const file of walk(root)) {
    // Tests are allowed to build hostile HTML; that is what they are for.
    if (/\.test\.tsx?$/.test(file)) continue
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, index) => {
      if (!line.includes('__html')) return
      const expression = htmlValueOnLine(line)
      if (expression === null) return
      const { ok, reason } = classifyHtmlValue(expression)
      if (!ok) offenders.push({ file, line: index + 1, expression, reason })
    })
  }
  return offenders
}

export function formatRawHtml(offenders) {
  return offenders
    .map((o) => `  ${o.file}:${o.line}  ${o.reason}\n    __html: ${o.expression}`)
    .join('\n')
}
