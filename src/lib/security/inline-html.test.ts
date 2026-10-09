import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { CONSENT_PREPAINT_SCRIPT } from '@/lib/analytics/consent'
import { jsonLdScript } from '@/lib/seo/json-ld'
import { describe, expect, it } from 'vitest'

/**
 * Every `dangerouslySetInnerHTML` in the app, and what may feed it.
 *
 * The CSP still allows inline scripts (frame-policy.ts explains why a nonce
 * cannot land while the storefront is served from the static cache), so the
 * XSS control on this site is React's escaping plus a short list of places
 * that opt out of it. This test is that list. A new opt-out either goes
 * through one of the two producers below, which are each tested for what
 * they escape, or it fails here and has to be argued for.
 *
 *   jsonLdScript     JSON-LD for search engines. `<` is written as `\\u003c`
 *                    so a product name containing `</script>` cannot close
 *                    the block and start a script.
 *   CONSENT_PREPAINT_SCRIPT   a constant with no interpolated data other
 *                    than the cookie name and the wording version, both
 *                    module constants.
 */

const ROOT = process.cwd()

function sourcesUnder(dir: string): { path: string; source: string }[] {
  const out: { path: string; source: string }[] = []
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourcesUnder(path))
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push({ path, source: readFileSync(resolve(ROOT, path), 'utf8') })
    }
  }
  return out
}

/** `dangerouslySetInnerHTML={{ __html: <expression> }}`, expression captured. */
const OPT_OUT = /dangerouslySetInnerHTML=\{\{\s*__html:\s*([^}]+?)\s*\}\}/g

const ALLOWED_PRODUCERS = [/^jsonLdScript\(/, /^CONSENT_PREPAINT_SCRIPT$/]

type OptOut = { path: string; line: number; expression: string }

function optOuts(): OptOut[] {
  const found: OptOut[] = []
  for (const { path, source } of sourcesUnder('src')) {
    for (const match of source.matchAll(OPT_OUT)) {
      found.push({
        path,
        line: source.slice(0, match.index).split('\n').length,
        expression: (match[1] ?? '').trim(),
      })
    }
  }
  return found
}

const OPT_OUTS = optOuts()

describe('every dangerouslySetInnerHTML goes through an escaping producer', () => {
  it('finds the opt-outs at all', () => {
    expect(OPT_OUTS.length).toBeGreaterThanOrEqual(8)
  })

  it.each(OPT_OUTS.map((o) => [`${o.path}:${o.line}`, o] as const))('%s', (_label, optOut) => {
    const allowed = ALLOWED_PRODUCERS.some((producer) => producer.test(optOut.expression))
    expect(
      allowed,
      `${optOut.path}:${optOut.line} feeds dangerouslySetInnerHTML with "${optOut.expression}". Use jsonLdScript() for structured data; anything else is an XSS sink and needs its own escaping and its own entry here.`,
    ).toBe(true)
  })

  it('no source mentions innerHTML outside the JSX attribute', () => {
    // `.innerHTML =` and `insertAdjacentHTML` are the same sink without the
    // React name on it.
    const offenders = sourcesUnder('src')
      .filter(({ source }) => /\.innerHTML\s*=|insertAdjacentHTML\(|document\.write\(/.test(source))
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })
})

describe('jsonLdScript cannot close its own script block', () => {
  it('escapes < so </script> in a product name stays inside the JSON', () => {
    const out = jsonLdScript({ name: '</script><script>alert(1)</script>' })
    expect(out).not.toContain('</script>')
    expect(out).not.toContain('<')
    expect(JSON.parse(out)).toEqual({ name: '</script><script>alert(1)</script>' })
  })

  it('escapes the same in nested values and arrays', () => {
    const out = jsonLdScript({ '@type': 'Thing', a: { b: ['<x>'] } })
    expect(out).not.toContain('<')
    expect(JSON.parse(out)).toEqual({ '@type': 'Thing', a: { b: ['<x>'] } })
  })
})

describe('the consent snippet interpolates constants only', () => {
  it('contains no request data and no HTML', () => {
    expect(CONSENT_PREPAINT_SCRIPT).not.toContain('<')
    expect(CONSENT_PREPAINT_SCRIPT).not.toMatch(/\$\{/)
    expect(CONSENT_PREPAINT_SCRIPT).toMatch(/^\(function\(\)\{/)
  })
})
