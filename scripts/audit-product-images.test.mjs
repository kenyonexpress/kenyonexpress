import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE TOOL THAT NOTICES BROKEN PRODUCT IMAGES COULD NOT BE RUN BY ANYONE.
 *
 * It demanded a service key and refused to start without one. Measured
 * 2026-09-08: the only admin key in this checkout answers `401 Invalid API
 * key`, and rotating it is a MANUAL item nobody has done. So the audit written
 * because "thirty-six broken images and nothing in the repo noticed" was itself
 * something nothing could run.
 *
 * Most of what it reads is public - `products.images` is the catalogue every
 * visitor loads. It now accepts the anon key, and the cost is stated instead of
 * hidden: a table anon cannot read is reported UNCHECKED and the run exits
 * non-zero. Run that way on 2026-09-08 it read 49 references, all resolving,
 * with nothing unchecked.
 */

const SCRIPT = resolve(process.cwd(), 'scripts/audit-product-images.mjs')
const SRC = readFileSync(SCRIPT, 'utf8')

function run(env) {
  try {
    return { code: 0, out: execFileSync('node', [SCRIPT], { env, encoding: 'utf8' }) }
  } catch (error) {
    return { code: error.status, out: `${error.stdout ?? ''}${error.stderr ?? ''}` }
  }
}

describe('credentials', () => {
  it('accepts an anon key, not only a service key', () => {
    expect(SRC).toContain('SUPABASE_ANON_KEY')
    expect(SRC).toContain('usingAnon')
  })

  it('still refuses to start with no credential at all', () => {
    // Exit 2 is "could not run". An audit that cannot reach the database must
    // say so rather than report no problems.
    const { code, out } = run({ PATH: process.env.PATH })
    expect(code).toBe(2)
    expect(out).toContain('required')
  })
})

describe('coverage is reported, never assumed', () => {
  it('collects the tables it could not read', () => {
    expect(SRC).toContain('unchecked')
  })

  it('treats 401/403 as a coverage gap only under the anon key', () => {
    // With an admin key those statuses mean something is wrong, and staying
    // fatal there is the point.
    expect(SRC).toMatch(/usingAnon && \(res\.status === 401 \|\| res\.status === 403\)/)
  })

  it('exits non-zero when anything went unread', () => {
    // A partial audit that exits 0 is exactly the shape this script exists to
    // catch, applied to itself.
    expect(SRC).toContain('problems.length === 0 && unchecked.length === 0 ? 0 : 1')
  })

  it('never prints "all resolve" when something was unchecked', () => {
    expect(SRC).toContain(
      "problems.length === 0 && unchecked.length === 0) console.log('  all resolve')",
    )
  })
})

describe('something actually runs this audit', () => {
  // It was written after thirty-six production image URLs were found pointing
  // at a host that 403s, and was then referenced by no workflow and no package
  // script. This repo has shipped that shape before: the "THREE GATES THAT
  // EXISTED AND NOTHING RAN" block in .github/workflows/ci.yml.
  const nightly = readFileSync('scripts/nightly-health.sh', 'utf8')

  it('is invoked by the nightly health loop', () => {
    expect(nightly).toContain('node scripts/audit-product-images.mjs')
  })

  it('says out loud when it could not read the catalogue', () => {
    // A nightly that prints nothing and stays green would mean "clean" to a
    // reader, which is the failure this whole file exists to prevent.
    expect(nightly).toContain('This is NOT a pass')
  })

  it('records why it is not in ci.yml', () => {
    // No workflow here carries production credentials; CI_SUPABASE_* names a
    // disposable database that pnpm seed:test writes to, so auditing it in CI
    // would audit fixtures.
    expect(nightly).toMatch(/disposable database/)
  })
})
