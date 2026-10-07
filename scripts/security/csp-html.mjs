/**
 * The HTML side of the Content-Security-Policy, shared by the build gate
 * (`csp-shell-gate.mjs`, on the prerendered shells) and the runtime probe
 * (`csp-probe.mjs`, on a served page). Pure functions, no I/O.
 */
import { createHash } from 'node:crypto'

const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
const ATTR = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g

/** Every <script> element: its attributes (lower-cased names) and its text. */
export function scriptTags(html) {
  const out = []
  for (const match of html.matchAll(SCRIPT_TAG)) {
    const attrs = {}
    for (const a of (match[1] ?? '').matchAll(ATTR)) {
      attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? ''
    }
    out.push({ attrs, body: match[2] ?? '' })
  }
  return out
}

const NON_EXECUTABLE_TYPES = new Set(['application/ld+json', 'application/json', 'text/template'])

/** Does the browser run this element as script? Data blocks do not count. */
export function isExecutable(tag) {
  const type = (tag.attrs.type ?? '').trim().toLowerCase()
  if (type === '' || type === 'module' || type === 'text/javascript') return true
  if (type === 'application/javascript' || type === 'text/babel') return true
  return !NON_EXECUTABLE_TYPES.has(type) && !type.includes('json')
}

/** The CSP hash source of an inline script's text, as the policy spells it. */
export function sha256Source(text) {
  return `sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}`
}

/** The sources of one directive of a policy, or null when it is absent. */
export function directiveSources(csp, name) {
  for (const raw of csp.split(';')) {
    const parts = raw.trim().split(/\s+/)
    if (parts[0] === name) return parts.slice(1)
  }
  return null
}

/** The nonce a policy's script-src names, or null. */
export function nonceOf(csp) {
  const src = directiveSources(csp, 'script-src') ?? directiveSources(csp, 'default-src') ?? []
  for (const s of src) {
    const m = s.match(/^'nonce-([A-Za-z0-9+/_-]+={0,2})'$/)
    if (m) return m[1]
  }
  return null
}

/**
 * Audit one HTML document against a policy's nonce and hash list. Returns
 * the inline executable scripts the policy would BLOCK: no nonce (or the
 * wrong one), and a text whose hash is not allowed.
 */
export function blockedInlineScripts(html, { nonce, hashes }) {
  const allowed = new Set(hashes)
  const blocked = []
  for (const tag of scriptTags(html)) {
    if ('src' in tag.attrs || !isExecutable(tag)) continue
    if (nonce && tag.attrs.nonce === nonce) continue
    const hash = sha256Source(tag.body)
    if (allowed.has(hash)) continue
    blocked.push({ hash, preview: tag.body.slice(0, 80), nonce: tag.attrs.nonce ?? null })
  }
  return blocked
}
