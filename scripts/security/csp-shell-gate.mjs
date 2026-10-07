#!/usr/bin/env node
/**
 * The build-blocking half of the nonce policy. Runs after `next build`
 * (`pnpm build` chains it) over every prerendered shell in `.next/server/app`.
 *
 * WHAT IT PROVES
 *
 * The document policy (`src/lib/security/frame-policy.ts`) allows inline
 * script by per-request nonce or by one of two hashes, and nothing else. A
 * prerendered shell is written with no request, so any inline script in it
 * either hashes to an allowed value or is blocked in every browser. Two ways
 * that happens, both silent in production and both loud here:
 *
 *   1. React or Next changes the text of a shell script (a React upgrade
 *      rewrites the `$RT` probe, say). The hash in
 *      `src/lib/security/shell-script-hashes.mjs` goes stale.
 *   2. A page's tree stops reading anything at request time, so Next
 *      prerenders it WHOLE, flight data and all, as nonce-less inline
 *      scripts. The page paints and never hydrates. The root layout's
 *      `PerRequestScripts` is what prevents this; the gate is what notices
 *      if it is removed.
 *
 * `_global-error.html` is the one shell excluded, with the cost stated: it
 * replaces the root layout, so it cannot carry the request read, it is
 * prerendered whole, and under the policy its "try again" button does not
 * hydrate. The text renders. That is the last-resort page, and it is the
 * trade taken rather than 'unsafe-inline' for every page to keep one button.
 *
 * Exit: 0 clean, 1 violations, 2 no build to read.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { SHELL_INLINE_SCRIPT_HASHES } from '../../src/lib/security/shell-script-hashes.mjs'
import { blockedInlineScripts } from './csp-html.mjs'

const APP = resolve(process.cwd(), '.next/server/app')
const EXCLUDED = new Set(['_global-error.html'])

function htmlFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...htmlFiles(path))
    else if (entry.endsWith('.html')) out.push(path)
  }
  return out
}

/** Audit the built shells. Exported for the test; `main` prints. */
export function auditBuiltShells(appDir = APP) {
  const files = htmlFiles(appDir)
  const findings = []
  let whole = 0
  for (const file of files) {
    const name = relative(appDir, file)
    if (EXCLUDED.has(name)) continue
    const html = readFileSync(file, 'utf8')
    const blocked = blockedInlineScripts(html, { nonce: null, hashes: SHELL_INLINE_SCRIPT_HASHES })
    const meta = file.replace(/\.html$/, '.meta')
    const postponed = existsSync(meta) && 'postponed' in JSON.parse(readFileSync(meta, 'utf8'))
    if (!postponed) whole += 1
    if (blocked.length > 0 || !postponed) findings.push({ name, blocked, postponed })
  }
  return { files: files.length, findings, whole }
}

function main() {
  if (!existsSync(APP)) {
    console.error(`csp shell gate: no build at ${APP}; run next build first`)
    process.exit(2)
  }
  const { files, findings, whole } = auditBuiltShells()
  if (findings.length === 0) {
    console.log(
      `csp shell gate: clean (${files} shells, every inline script hashed, every page on the resume path)`,
    )
    process.exit(0)
  }
  console.error(`csp shell gate: ${findings.length} shell(s) the nonce policy would break\n`)
  for (const f of findings) {
    const why = f.postponed ? '' : ' [prerendered WHOLE: no request read in its tree]'
    console.error(`  ${f.name}${why}`)
    for (const b of f.blocked.slice(0, 3)) {
      console.error(`      blocked ${b.hash}  ${JSON.stringify(b.preview)}`)
    }
    if (f.blocked.length > 3) console.error(`      ... and ${f.blocked.length - 3} more`)
  }
  if (whole > 0) {
    console.error(
      `\n${whole} shell(s) prerendered whole. components/security/PerRequestScripts.tsx must stay in`,
    )
    console.error(
      'the root layout, inside its Suspense boundary; that read is what keeps every page',
    )
    console.error('on the resume path, where the flight data is written with the nonce on it.')
  }
  console.error('\nA new constant shell script is registered by hash in')
  console.error(
    'src/lib/security/shell-script-hashes.mjs, with its text, not by widening the policy.',
  )
  process.exit(1)
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) main()
