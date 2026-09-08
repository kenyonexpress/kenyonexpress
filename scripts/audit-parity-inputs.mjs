#!/usr/bin/env node
/**
 * IS THE PARITY REFERENCE STILL REPRODUCIBLE?
 *
 * `refs/` is gitignored, so the evidence the whole UI-parity programme is
 * measured against lives outside version control. That is `docs/REFS-POLICY.md`
 * on purpose: `refs/localized/` is a PRODUCT, derived by
 * localize-live-refs.mjs from `refs/ke_live_*.html` plus `refs/live-assets/`.
 *
 * The policy only holds while the derivation still works, and nothing checked
 * that. Verified by hand 2026-09-08: regenerating into a scratch directory
 * reproduced `refs/localized/` byte for byte, and the seven source snapshots
 * are present in all three desktop backups. A hand check is a check that
 * happened once; this is the one that happens nightly.
 *
 * What would break it silently: a source snapshot deleted or truncated, the
 * asset crawl emptied, or an edit to the localizer that changes its output
 * without anyone rerunning it. In each case the gate keeps producing a
 * percentage from a stale `refs/localized/`, which is the failure this repo
 * keeps finding in other shapes - a number that no longer means what it says.
 *
 * Exit codes, following the house rule that "cannot run" is not "passed":
 *   0  reproducible
 *   1  drift: regeneration differs from the committed-to-disk copy
 *   2  cannot check: inputs missing, so no verdict is possible
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const REFS = resolve('refs')
const SNAPSHOTS = [
  'ke_live_cart.html',
  'ke_live_category.html',
  'ke_live_checkout.html',
  'ke_live_home.html',
  'ke_live_product.html',
  'ke_live_products.html',
  'ke_live_search.html',
]

/** A snapshot small enough to be a stub is as useless as an absent one. */
const MIN_SNAPSHOT_BYTES = 50_000

const problems = []

for (const name of SNAPSHOTS) {
  const path = join(REFS, name)
  if (!existsSync(path)) {
    problems.push(`missing source snapshot: refs/${name}`)
    continue
  }
  const size = statSync(path).size
  if (size < MIN_SNAPSHOT_BYTES) {
    problems.push(`refs/${name} is ${size} bytes, below ${MIN_SNAPSHOT_BYTES}`)
  }
}

const assets = join(REFS, 'live-assets')
if (!existsSync(assets)) {
  problems.push('missing refs/live-assets/, so the localizer has nothing to point at')
}

if (problems.length > 0) {
  console.error('audit-parity-inputs: CANNOT CHECK')
  for (const p of problems) console.error(`  ${p}`)
  console.error('  The parity gate cannot be rebuilt from this working tree.')
  process.exit(2)
}

const out = mkdtempSync(join(tmpdir(), 'parity-inputs-'))
try {
  execFileSync(process.execPath, [resolve('scripts/localize-live-refs.mjs')], {
    env: { ...process.env, LOCALIZE_OUT: out },
    stdio: ['ignore', 'ignore', 'pipe'],
  })

  const current = join(REFS, 'localized')
  if (!existsSync(current)) {
    console.log('audit-parity-inputs: refs/localized/ was absent and has been regenerated')
    console.log(`  ${readdirSync(out).length} page(s) written from the source snapshots`)
    process.exit(0)
  }

  const drifted = []
  for (const name of readdirSync(out)) {
    const fresh = readFileSync(join(out, name))
    const onDisk = existsSync(join(current, name)) ? readFileSync(join(current, name)) : null
    if (onDisk === null || !fresh.equals(onDisk)) drifted.push(name)
  }

  if (drifted.length > 0) {
    console.error('audit-parity-inputs: DRIFT')
    for (const name of drifted) console.error(`  ${name} differs from a fresh regeneration`)
    console.error(
      '  Run `node scripts/localize-live-refs.mjs` and re-measure before quoting a number.',
    )
    process.exit(1)
  }

  console.log(`audit-parity-inputs: reproducible (${readdirSync(out).length} pages, byte for byte)`)
} finally {
  rmSync(out, { recursive: true, force: true })
}
