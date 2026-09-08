import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Two invariants about the Sentry packages, both learned by breaking them.
 *
 * EXACT, NOT A RANGE. 10.72.0 and 10.73.0 pull `@sentry/server-utils`, whose
 * bundler plugin throws `TypeError: The URL must be of scheme file` while it is
 * being imported - not when it is called. Any test that reaches
 * `@sentry/nextjs` therefore fails to collect at all, including the four that
 * cover the alarm for "the card was charged and the order did not close".
 * Bisected 2026-09-08: 10.70 and 10.71 are clean, 10.72 and 10.73 are not. A
 * caret range would let a fresh install take 10.73 on a machine where the
 * lockfile is not honoured, so the range is the pin.
 *
 * ONE VERSION, NOT TWO. `@sentry/nextjs` depends on `@sentry/node` at its own
 * version. When the direct dependency names a different one - as it did, 10.68
 * against 10.69 - pnpm installs both, and two copies of the instrumentation
 * core in one process do not share an OpenTelemetry context.
 *
 * Read from the raw manifest rather than from the installed tree, because the
 * thing under test is what the manifest ASKS FOR.
 */
const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>
}

const SENTRY_PACKAGES = ['@sentry/nextjs', '@sentry/node'] as const

describe('the Sentry packages', () => {
  it.each(SENTRY_PACKAGES)('%s is pinned exactly, with no range', (name) => {
    const range = manifest.dependencies[name]
    expect(range, `${name} is not a dependency`).toBeDefined()
    expect(range).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('names the same version for both, so one core is installed and not two', () => {
    const [nextjs, node] = SENTRY_PACKAGES.map((name) => manifest.dependencies[name])
    expect(nextjs).toBe(node)
  })

  it('has not been moved past the last version that can be imported under vitest', () => {
    // Raise this deliberately, with the alarm tests run, and update the note above.
    expect(manifest.dependencies['@sentry/nextjs']).toBe('10.71.0')
  })
})
