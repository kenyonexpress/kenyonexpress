#!/usr/bin/env node
/**
 * Regression-scoped Biome lint gate.
 *
 * A repo-wide `pnpm lint` reports 45 pre-existing errors, all of them in
 * scripts/*.mjs. Gating CI on that number would make every PR red on arrival,
 * and a check that is always red is a check everyone learns to route around.
 *
 * Naive "lint only changed files" is not enough either. A PR from a long-lived
 * working branch into the default branch legitimately "changes" hundreds of
 * files, so the changed-file set sweeps the whole backlog back in.
 *
 * So this gate compares, per file: how many diagnostics does the file produce
 * now, versus how many did the same file produce at the merge base? It fails
 * only on an increase. A new file with any violation blocks (base count 0); a
 * legacy file dragged along by a wide diff does not, unless the branch made it
 * worse. Fixing violations is always allowed.
 *
 * Base ref resolution, in order:
 *   1. --base=<ref> / LINT_BASE_REF
 *   2. GITHUB_BASE_REF (pull_request runs)
 *   3. the repo's default branch
 *
 * Exit codes: 0 clean or nothing to lint, 1 a file got worse.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const DEFAULT_BASE = 'cursor/add-supabase-3c830'
const LINTABLE = /\.(?:ts|tsx|js|jsx|mjs|cjs|json|jsonc|css)$/

/**
 * Advisory-only paths: reported, never blocking.
 *
 * scripts/ holds every one of the 45 pre-existing Biome errors, and it is
 * one-off tooling — scrapers, pixel-measuring probes, one-shot data fixes.
 * It is also the reason the regression comparison alone is not enough here:
 * the default branch predates essentially the whole application, so at that
 * merge base every file reads as "new" and a strict gate would demand the
 * backlog be cleared before the first PR could ever go green.
 *
 * Application code (src/, e2e/, configs) is clean as of this branch, so it is
 * gated strictly and stays that way.
 */
const ADVISORY_PREFIXES = ['scripts/']

const isAdvisory = (file) => ADVISORY_PREFIXES.some((prefix) => file.startsWith(prefix))

function git(args, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
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

function changedFiles(mergeBase) {
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

/**
 * Runs Biome over the given paths and returns diagnostic counts keyed by the
 * path Biome reports. `strip` removes a temp-dir prefix so baseline counts key
 * on the same repo-relative paths as the current ones.
 */
function countDiagnostics(paths, { cwd = process.cwd(), extraArgs = [], strip = '' } = {}) {
  if (paths.length === 0) return {}

  let stdout = ''
  try {
    stdout = execFileSync(
      'pnpm',
      [
        'exec',
        'biome',
        'check',
        '--reporter=json',
        '--no-errors-on-unmatched',
        ...extraArgs,
        ...paths,
      ],
      { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] },
    )
  } catch (error) {
    // Biome exits non-zero whenever it finds anything; the JSON is still on stdout.
    stdout = error.stdout ?? ''
  }

  let report
  try {
    report = JSON.parse(stdout)
  } catch {
    console.error('lint-changed: could not parse Biome JSON output; failing closed.')
    process.exit(1)
  }

  const counts = {}
  for (const diagnostic of report.diagnostics ?? []) {
    let file = diagnostic.location?.path?.file
    if (!file) continue
    if (strip && file.startsWith(strip)) file = file.slice(strip.length).replace(/^\//, '')
    counts[file] = (counts[file] ?? 0) + 1
  }
  return counts
}

/** Materialises each file as it existed at `ref` into a temp tree. */
function materialiseBaseline(files, ref, root) {
  const present = []
  for (const file of files) {
    const content = git(['show', `${ref}:${file}`], { allowFailure: true })
    if (content === null) continue // added on this branch — no baseline
    const target = join(root, file)
    mkdirSync(dirname(target), { recursive: true })
    // git() trims; restore a trailing newline so the formatter is not tripped
    // by a difference this script introduced rather than the branch.
    writeFileSync(target, content.endsWith('\n') ? content : `${content}\n`)
    present.push(file)
  }
  return present
}

const base = resolveBase()
const mergeBase = git(['merge-base', base, 'HEAD'], { allowFailure: true }) ?? base
const files = changedFiles(mergeBase)

if (files.length === 0) {
  console.log(`lint-changed: no lintable files changed against ${base}`)
  process.exit(0)
}

console.log(
  `lint-changed: ${files.length} changed file(s) against ${base} (merge base ${mergeBase.slice(0, 8)})`,
)

const current = countDiagnostics(files)

const tmpRoot = mkdtempSync(join(tmpdir(), 'ke-lint-baseline-'))
let baseline = {}
try {
  const materialised = materialiseBaseline(files, mergeBase, tmpRoot)
  baseline = countDiagnostics(
    materialised.map((file) => join(tmpRoot, file)),
    // Point Biome at the repo's own config; disable VCS discovery so the temp
    // tree is not measured against a .gitignore it has no business obeying.
    { extraArgs: [`--config-path=${process.cwd()}`, '--vcs-enabled=false'], strip: tmpRoot },
  )
} finally {
  rmSync(tmpRoot, { recursive: true, force: true })
}

const regressions = []
const advisory = []
let carried = 0

for (const file of files) {
  const now = current[file] ?? 0
  const before = baseline[file] ?? 0

  if (now <= before) {
    carried += now
    continue
  }
  if (isAdvisory(file)) advisory.push({ file, now, before })
  else regressions.push({ file, now, before })
}

if (carried > 0) {
  console.log(`lint-changed: ${carried} pre-existing diagnostic(s) carried unchanged, not blocking`)
}

if (advisory.length > 0) {
  const total = advisory.reduce((sum, a) => sum + a.now, 0)
  console.log(
    `lint-changed: ${total} diagnostic(s) across ${advisory.length} advisory file(s) ` +
      `(${ADVISORY_PREFIXES.join(', ')}) — reported, not blocking:`,
  )
  for (const { file, now } of advisory) console.log(`  ${file}  ${now}`)
}

if (regressions.length === 0) {
  console.log('lint-changed: no new violations in gated paths')
  process.exit(0)
}

console.error('\nlint-changed: these gated files got worse on this branch:\n')
for (const { file, now, before } of regressions) {
  console.error(`  ${file}  ${before} -> ${now}`)
}
console.error(
  '\nRun `pnpm check` to autofix, or fix them by hand.\n' +
    'Only increases block, and only outside the advisory paths.',
)

// Print the human-readable diagnostics for just the regressed files.
try {
  execFileSync(
    'pnpm',
    ['exec', 'biome', 'check', '--no-errors-on-unmatched', ...regressions.map((r) => r.file)],
    { stdio: 'inherit' },
  )
} catch {
  // Expected: Biome exits non-zero. The output above is the point.
}

process.exit(1)
