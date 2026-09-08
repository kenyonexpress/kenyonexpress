import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * AN AUDIT NOTHING RUNS IS A COMMENT WITH AN EXIT CODE.
 *
 * Counted 2026-09-08: nine audit and measurement scripts in `scripts/`, and six
 * were named by no workflow and no package script. Four of the six had been
 * added in the six passes immediately before, by the same work that keeps
 * removing this shape from elsewhere in the repo - the "THREE GATES THAT
 * EXISTED AND NOTHING RAN" block in ci.yml, and the product-image audit wired
 * in pass 43 after it was written in an earlier one and forgotten.
 *
 * This is the counter. A new audit is either wired somewhere, or listed below
 * as a deliberate exception with the reason, and there is no third state where
 * it quietly exists.
 */
const ROOT = resolve(__dirname, '..', '..')
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), 'utf8')

/**
 * Comments stripped, because a mention is not an invocation.
 *
 * `nightly-health.sh` explains in a comment WHY `measure-route-js.mjs` is not
 * wired, and the raw text of that sentence made this file read it as wired -
 * so the consistency check below flagged it as excused-and-wired. That is the
 * same prose-versus-directive mistake `migration-lint.mjs` once made against
 * its own documentation, caught here by an assertion I wrote in the same pass.
 */
function code(text: string): string {
  return text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      return !trimmed.startsWith('#') && !trimmed.startsWith('//') && !trimmed.startsWith('*')
    })
    .join('\n')
}

/** Every place that could invoke one. */
const RUNNERS = [
  read('scripts', 'nightly-health.sh'),
  read('.github', 'workflows', 'ci.yml'),
  read('.github', 'workflows', 'cron.yml'),
  read('.github', 'workflows', 'nightly-health.yml'),
  read('package.json'),
]
  .map(code)
  .join('\n')

/**
 * Scripts that are tools rather than gates. Each needs a reason, and the reason
 * has to be about what the script IS, not about it being inconvenient.
 */
const DELIBERATELY_MANUAL: Record<string, string> = {
  'measure-route-js.mjs':
    'needs a built server and a browser; the thing it would gate is already gated by route-bundle-gate.mjs in CI, which needs neither',
  'import-images.ts': 'a content pipeline run by hand, not a check',
  'localize-live-refs.mjs': 'rebuilds the pixel-gate reference; run when the reference changes',
  'audit-data-integrity.mjs':
    'self-described one-off: counts rows and spot-checks image and supplier locations, with no pass or fail to gate on',
  'audit-launch-bar.mjs':
    'prints the catalogue launch bar or the SQL behind it; connects to nothing and asserts nothing',
  'measure-coupon-page.mjs':
    'writes docs/coupon-page-measured.md from a live page; a measurement session, like compare.mjs',
  'measure-electro.mjs':
    'opens the Electro reference theme beside our build; a measurement session, and its reference is a local file',
  'measure-live.mjs':
    'measures a live product page against ours; superseded as a gate by compare.mjs, kept for investigation',
  'measure-live-checkout.mjs':
    'the checkout half of the same investigation; needs a seeded cart and a browser',
  'measure-mobile.mjs':
    'a 380px measurement session; the gate it would duplicate is e2e/touch-targets.spec.ts, which runs in CI',
}

/**
 * Listed one by one rather than excused by a `measure-*` rule. A family rule
 * would have silently absorbed `measure-live-vitals.mjs`, which IS wired, and
 * `measure-route-js.mjs`, whose exception is about a specific gate replacing
 * it. Both distinctions are the point.
 */

function auditScripts(): string[] {
  return readdirSync(join(ROOT, 'scripts'))
    .filter((f) => /^(audit|measure)-.*\.(mjs|ts)$/.test(f))
    .filter((f) => !f.endsWith('.test.mjs') && !f.endsWith('.test.ts'))
}

describe('every audit script is run by something', () => {
  for (const script of auditScripts()) {
    it(`${script} is wired, or is a named exception`, () => {
      const wired = RUNNERS.includes(script)
      const excused = script in DELIBERATELY_MANUAL
      expect(
        wired || excused,
        `scripts/${script} is invoked by no workflow, no nightly step and no package script. Wire it, or add it to DELIBERATELY_MANUAL with the reason it is a tool rather than a gate.`,
      ).toBe(true)
    })
  }
})

describe('the exceptions stay honest', () => {
  it('every excused script actually exists', () => {
    // An exception for a deleted file is how the list stops meaning anything.
    const present = new Set(readdirSync(join(ROOT, 'scripts')))
    for (const name of Object.keys(DELIBERATELY_MANUAL)) {
      expect(present.has(name), `${name} is excused but not present`).toBe(true)
    }
  })

  it('no excused script is also wired, which would mean the reason is stale', () => {
    for (const name of Object.keys(DELIBERATELY_MANUAL)) {
      if (!/^(audit|measure)-/.test(name)) continue
      expect(RUNNERS.includes(name), `${name} is excused AND wired`).toBe(false)
    }
  })
})

describe('the report-only audits say why they are report-only', () => {
  it('names the re-arm condition rather than just suppressing', () => {
    const nightly = read('scripts', 'nightly-health.sh')
    expect(nightly).toContain('RE-ARM THEM ONE AT A TIME')
    // The precedent it follows, so the choice is traceable.
    expect(nightly).toContain('red nightly that')
  })
})
