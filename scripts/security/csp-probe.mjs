#!/usr/bin/env node
/**
 * Does a served page actually satisfy its own Content-Security-Policy?
 *
 *   node scripts/security/csp-probe.mjs http://localhost:3311 [/path ...]
 *
 * For each path: fetches it, reads the policy off the response, and checks
 * that every inline script in the document carries the policy's nonce or
 * hashes to one of its sources, that every external script is same-origin or
 * on a listed host, and that the companion headers are the ones STEP 30
 * specifies. The build gate proves the shells; this proves the response,
 * which is the thing a deployment can get wrong without changing a byte of
 * the build (a resume that lost the request header, a CDN that dropped it).
 * Run it against a preview deployment before promoting, and against
 * production after.
 *
 * Exit: 0 every path clean, 1 a finding, 2 could not fetch.
 */
import { blockedInlineScripts, directiveSources, nonceOf, scriptTags } from './csp-html.mjs'

const EXPECTED_HEADERS = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin',
}

const DEFAULT_PATHS = ['/', '/cart', '/about', '/login', '/checkout/frame-return', '/no-such-page']

/** Audit one response. Exported for the test. */
export function auditResponse({ url, headers, html }) {
  const findings = []
  const csp = headers.get('content-security-policy')
  if (!csp) return [`${url}: no Content-Security-Policy header`]
  const policies = csp.split(',').map((p) => p.trim())
  if (policies.length > 1) findings.push(`${url}: ${policies.length} policies on one response`)
  const script = directiveSources(csp, 'script-src') ?? []
  if (script.includes("'unsafe-inline'"))
    findings.push(`${url}: script-src carries 'unsafe-inline'`)
  if (script.includes("'strict-dynamic'")) {
    findings.push(
      `${url}: script-src carries 'strict-dynamic', which blocks the shell's bootstrap tags`,
    )
  }
  const nonce = nonceOf(csp)
  if (!nonce) findings.push(`${url}: script-src names no nonce`)
  const hashes = script.filter((s) => /^'sha(256|384|512)-/.test(s)).map((s) => s.slice(1, -1))
  for (const b of blockedInlineScripts(html, { nonce, hashes })) {
    const why = b.nonce ? `nonce ${JSON.stringify(b.nonce)} is not the header's` : 'no nonce'
    findings.push(`${url}: inline script blocked (${why}, ${b.hash}): ${JSON.stringify(b.preview)}`)
  }
  const origin = new URL(url).origin
  const hosts = script.filter((s) => s.startsWith('https://') || s.startsWith('http://'))
  for (const tag of scriptTags(html)) {
    const src = tag.attrs.src
    if (!src) continue
    if (src.startsWith('/') && !src.startsWith('//')) continue
    let target
    try {
      target = new URL(src, origin)
    } catch {
      findings.push(`${url}: unparseable script src ${JSON.stringify(src)}`)
      continue
    }
    if (target.origin === origin) continue
    const allowed = hosts.some((h) => hostMatches(h, target))
    if (!allowed) findings.push(`${url}: external script ${target.origin} is not in script-src`)
  }
  const frameAncestors = directiveSources(csp, 'frame-ancestors')
  if (!frameAncestors) findings.push(`${url}: no frame-ancestors`)
  for (const [name, expected] of Object.entries(EXPECTED_HEADERS)) {
    const actual = headers.get(name)
    if (actual !== expected)
      findings.push(
        `${url}: ${name} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
      )
  }
  const xfo = headers.get('x-frame-options')
  if (xfo !== 'DENY' && xfo !== 'SAMEORIGIN')
    findings.push(`${url}: x-frame-options is ${JSON.stringify(xfo)}`)
  const pp = headers.get('permissions-policy') ?? ''
  if (!pp.includes('microphone=()'))
    findings.push(`${url}: permissions-policy does not deny the microphone`)
  return findings
}

function hostMatches(source, target) {
  const pattern = source.replace(/\/$/, '')
  if (pattern.startsWith('https://*.')) {
    return (
      target.protocol === 'https:' &&
      target.hostname.endsWith(pattern.slice('https://*.'.length - 1))
    )
  }
  return target.origin === pattern
}

async function main() {
  const [base, ...rest] = process.argv.slice(2)
  if (!base) {
    console.error('usage: node scripts/security/csp-probe.mjs <base url> [/path ...]')
    process.exit(2)
  }
  const paths = rest.length > 0 ? rest : DEFAULT_PATHS
  let findings = []
  for (const path of paths) {
    const url = new URL(path, base).toString()
    let response
    try {
      response = await fetch(url, { redirect: 'manual', headers: { accept: 'text/html' } })
    } catch (error) {
      console.error(`csp probe: cannot fetch ${url}: ${error.message}`)
      process.exit(2)
    }
    const html = (response.headers.get('content-type') ?? '').includes('text/html')
      ? await response.text()
      : ''
    const here = auditResponse({ url, headers: response.headers, html })
    const scripts = scriptTags(html).length
    console.log(
      `${response.status} ${url}  scripts=${scripts}  ${here.length === 0 ? 'ok' : `${here.length} finding(s)`}`,
    )
    findings = findings.concat(here)
  }
  if (findings.length === 0) {
    console.log(`csp probe: clean (${paths.length} path(s))`)
    return
  }
  console.error(`\ncsp probe: ${findings.length} finding(s)`)
  for (const f of findings) console.error(`  ${f}`)
  process.exit(1)
}

if (
  process.argv[1] &&
  new URL(import.meta.url).pathname.endsWith('csp-probe.mjs') &&
  process.argv[1].endsWith('csp-probe.mjs')
) {
  main()
}
