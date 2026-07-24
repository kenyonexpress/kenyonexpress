#!/usr/bin/env node
/**
 * Diff-scoped Biome lint gate.
 *
 * `pnpm lint` over the whole repo currently reports 45 pre-existing errors
 * (hardcoded hex colours, px units, and friends). Gating CI on that number
 * would mean every PR is red on day one and the gate gets ignored — the worst
 * possible outcome for a lint rule. So CI lints only the files a PR actually
 * touches: new violations block, the existing backlog does not, and the
 * backlog can be paid down separately without holding anyone up.
 *
 * Base ref resolution, in order:
 *   1. --base=<ref> / LINT_BASE_REF
 *   2. GITHUB_BASE_REF (pull_request runs)
 *   3. the repo's default branch, then the merge base with HEAD
 *
 * Exit codes: 0 clean or nothing to lint, 1 violations in changed files.
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const DEFAULT_BASE = 'cursor/add-supabase-3c830'
const LINTABLE = /\.(?:ts|tsx|js|jsx|mjs|cjs|json|jsonc)$/

function git(args, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch (error) {
    if (allowFailure) return null
    throw error
  }
}

function resolveBase() {
  const flag = process.argv.find((arg) => arg.startsWith('--base='))
  if (flag) return flag.slice('--base='.length)
  if (process.env.LINT_BASE_REF) return process.env.LINT_BASE_REF
  if (process.env.GITHUB_BASE_REF) return `origin/${process.env.GITHUB_BASE_REF}`
  return git(['rev-parse', '--verify', `origin/${DEFAULT_BASE}`], { allowFailure: true })
    ? `origin/${DEFAULT_BASE}`
    : DEFAULT_BASE
}

function changedFiles(base) {
  // Merge base, so a stale branch is not blamed for drift on the target branch.
  const mergeBase = git(['merge-base', base, 'HEAD'], { allowFailure: true }) ?? base

  const committed = git(['diff', '--name-only', '--diff-filter=ACMR', mergeBase, 'HEAD'], {
    allowFailure: true,
  })
  // Uncommitted work matters when a developer runs this locally.
  const working = git(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD'], { allowFailure: true })
  const untracked = git(['ls-files', '--others', '--exclude-standard'], { allowFailure: true })

  const all = [committed, working, untracked]
    .filter(Boolean)
    .flatMap((out) => out.split('\n'))
    .map((line) => line.trim())
    .filter(Boolean)

  return [...new Set(all)].filter((file) => LINTABLE.test(file) && existsSync(file))
}

const base = resolveBase()
const files = changedFiles(base)

if (files.length === 0) {
  console.log(`lint-changed: no lintable files changed against ${base}`)
  process.exit(0)
}

console.log(`lint-changed: ${files.length} changed file(s) against ${base}`)
for (const file of files) console.log(`  ${file}`)

try {
  execFileSync('pnpm', ['exec', 'biome', 'check', '--no-errors-on-unmatched', ...files], {
    stdio: 'inherit',
  })
} catch {
  console.error(
    '\nlint-changed: Biome reported problems in files this branch changed.\n' +
      'Run `pnpm check` to autofix, or fix them by hand. Pre-existing violations\n' +
      'in files you did not touch are not counted here.',
  )
  process.exit(1)
}

console.log('lint-changed: clean')
