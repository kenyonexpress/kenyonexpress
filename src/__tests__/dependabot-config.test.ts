import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * DEPENDABOT LOOKED ALIVE WHILE THE THING IT DOES HAD STOPPED.
 *
 * `open-pull-requests-limit` counts every open PR Dependabot holds for one
 * ecosystem and directory, across target branches - including ones opened by a
 * configuration that no longer exists. Measured 2026-09-08: six open npm PRs
 * against a limit of five, three of them (#12, #13, #14) targeting
 * `phase5/homepage`, a branch nothing merges. The scheduled Monday run opened
 * nothing, while `pnpm outdated` listed patch updates waiting across react,
 * react-dom, @sentry/* and tailwindcss - the exact group the auto-merge
 * workflow lands unattended.
 *
 * The newest PR was three days old, so nothing looked broken.
 */
const ROOT = resolve(__dirname, '..', '..')
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), 'utf8')

const config = read('.github', 'dependabot.yml')
const autoMerge = read('.github', 'workflows', 'dependabot-auto-merge.yml')

describe('the npm queue cannot be starved by stranded pull requests', () => {
  it('leaves headroom above the three PRs stranded on a dead branch', () => {
    const npmLimit = Number(config.match(/open-pull-requests-limit: (\d+)/)?.[1])
    // Three strays plus a weekly grouping needs more than five.
    expect(npmLimit).toBeGreaterThanOrEqual(8)
  })

  it('records why the limit was raised instead of closing them', () => {
    // Closing a Dependabot PR suppresses that version, and one of the three
    // carries a bump wanted on main as well.
    expect(config).toMatch(/stop offering that version/)
  })
})

describe('the patch group and the auto-merge gate still agree', () => {
  // The config says in its own words that these two definitions must keep
  // agreeing. If the group widened to minors while the workflow kept merging
  // whatever the group produced, behaviour changes would land unattended.
  it('groups only patch updates under the auto-merged name', () => {
    const patchGroup = config.slice(
      config.indexOf('      patch:'),
      config.indexOf('      minor-dev:'),
    )
    // Read the DIRECTIVES, not the prose. A sweep for the word "minor" over
    // this slice matches the comment explaining why minors are excluded, which
    // is the same mistake scripts/migration-lint.mjs once made against its own
    // documentation.
    const directives = patchGroup
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
    expect(directives).toContain('update-types: [patch]')
    expect(directives.filter((line) => line.includes('update-types'))).toHaveLength(1)
  })

  it('merges only semver-patch unattended', () => {
    expect(autoMerge).toContain('version-update:semver-patch')
    // And says so out loud when it declines, so a silent stop is visible.
    expect(autoMerge).toContain('Not auto-merged')
  })

  it('never merges a pull request Dependabot did not open', () => {
    expect(autoMerge).toContain("github.event.pull_request.user.login == 'dependabot[bot]'")
    expect(autoMerge).toContain("github.actor == 'dependabot[bot]'")
  })
})

describe('the deliberate exclusions are still deliberate', () => {
  it('keeps next, react, react-dom and supabase off the bot path', () => {
    for (const name of ['next', 'react', 'react-dom', "'@supabase/*'"]) {
      expect(config).toContain(`dependency-name: ${name}`)
    }
  })

  it('keeps sharp majors pinned, because a bump there fails silently', () => {
    // sharp 0.34.5 cannot decode this repo's AVIF images and serves the source
    // bytes instead, with a 200 and no log.
    expect(config).toContain('dependency-name: sharp')
  })
})
