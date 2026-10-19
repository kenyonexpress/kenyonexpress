import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ONE MAJOR PER ACTION, ACROSS EVERY WORKFLOW.
 *
 * MEASURED 2026-09-08. Every job in `ci.yml` carried the same annotation:
 *
 *   Node.js 20 is deprecated. The following actions target Node.js 20 but are
 *   being forced to run on Node.js 24: actions/checkout@v4,
 *   actions/setup-node@v4, pnpm/action-setup@v4
 *
 * "Being forced" is the load-bearing word. The pins still declared
 * `runs.using: node20`; the runner was overriding them. That override is
 * temporary by announcement, and the day it stops, every gate in this repo
 * fails at once - not on anything this code did.
 *
 * The drift was already visible and nobody could see it: `load.yml` sat on
 * `actions/checkout@v5` while the other twelve checkouts sat on `v4`. Two
 * majors of the same action in one repo means one of them is wrong and there is
 * no way to tell which by reading either file.
 *
 * So this asserts CONSISTENCY, not a version. A list of blessed versions copied
 * into a test is a second source of truth that goes stale on its own schedule;
 * "the workflows agree with each other" is derived from the workflows, needs no
 * maintenance, and catches exactly the half-finished bump that produced the v5.
 * Upgrading is still a human decision - this only refuses to let it be a
 * partial one.
 */
const dir = resolve(process.cwd(), '.github/workflows')
const files = readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))

/** Every `uses: owner/repo@ref` in the workflows, with where it was found. */
function pins(): { action: string; ref: string; file: string; line: number }[] {
  const found: { action: string; ref: string; file: string; line: number }[] = []
  for (const file of files) {
    readFileSync(resolve(dir, file), 'utf8')
      .split('\n')
      .forEach((text, index) => {
        // Comments quote `uses:` lines when they explain one. Only real steps.
        if (text.trimStart().startsWith('#')) return
        const match = text.match(/uses:\s*([\w.-]+\/[\w.-]+)@([\w.-]+)/)
        if (match?.[1] && match[2]) {
          found.push({ action: match[1], ref: match[2], file, line: index + 1 })
        }
      })
  }
  return found
}

const all = pins()
const byAction = new Map<string, typeof all>()
for (const pin of all) {
  byAction.set(pin.action, [...(byAction.get(pin.action) ?? []), pin])
}

describe('third-party action pins', () => {
  it('found the workflows and their pins, so this cannot pass vacuously', () => {
    expect(files.length).toBeGreaterThan(0)
    expect(all.length).toBeGreaterThan(10)
  })

  it.each([...byAction.keys()].map((action) => [action] as const))(
    '%s is pinned to one ref everywhere',
    (action) => {
      const uses = byAction.get(action) ?? []
      const refs = [...new Set(uses.map((u) => u.ref))]
      expect(
        refs,
        `${action} is pinned to ${refs.join(' and ')}. ${uses
          .map((u) => `${u.file}:${u.line} -> @${u.ref}`)
          .join(
            ', ',
          )}. A half-finished bump leaves the repo running two majors of the same action, and neither file says which one is intended.`,
      ).toHaveLength(1)
    },
  )
})
