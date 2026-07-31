#!/usr/bin/env node
/**
 * Diff-scoped Biome gate (format + lint via `biome check`).
 *
 * Default file set: `git diff HEAD~1..HEAD --name-only` (see ci-diff-files.mjs).
 * Pre-existing diagnostics in unchanged files are ignored. Only files in the
 * tip commit (or CI_DIFF_RANGE) are checked. A non-zero Biome exit on those
 * files blocks the gate.
 *
 * scripts/ is advisory: reported, never blocking (legacy tooling backlog).
 *
 * Exit: 0 clean / nothing to lint, 1 new diagnostics in gated paths.
 */

import { execFileSync } from 'node:child_process'
import { changedFiles, resolveRange } from './ci-diff-files.mjs'

const LINTABLE = /\.(?:ts|tsx|js|jsx|mjs|cjs|json|jsonc|css)$/
const ADVISORY_PREFIXES = ['scripts/']

const isAdvisory = (file) => ADVISORY_PREFIXES.some((prefix) => file.startsWith(prefix))

const range = resolveRange()
const files = changedFiles({
  range,
  includeWorkingTree: !process.env.CI,
  predicate: (file) => LINTABLE.test(file),
})

if (files.length === 0) {
  console.log(`lint-changed: no lintable files in ${range}`)
  process.exit(0)
}

const gated = files.filter((file) => !isAdvisory(file))
const advisory = files.filter((file) => isAdvisory(file))

console.log(`lint-changed: range ${range}`)
console.log(`lint-changed: ${gated.length} gated + ${advisory.length} advisory file(s)`)

if (advisory.length > 0) {
  console.log('lint-changed: advisory paths (reported, not blocking):')
  for (const file of advisory) console.log(`  ${file}`)
  try {
    execFileSync('pnpm', ['exec', 'biome', 'check', '--no-errors-on-unmatched', ...advisory], {
      stdio: 'inherit',
    })
  } catch {
    console.log('lint-changed: advisory Biome findings ignored')
  }
}

if (gated.length === 0) {
  console.log('lint-changed: nothing gated to check')
  process.exit(0)
}

try {
  execFileSync('pnpm', ['exec', 'biome', 'check', '--no-errors-on-unmatched', ...gated], {
    stdio: 'inherit',
  })
  console.log('lint-changed: Biome clean on gated changed files')
  process.exit(0)
} catch {
  console.error('\nlint-changed: Biome failed on gated files from this commit.')
  process.exit(1)
}
