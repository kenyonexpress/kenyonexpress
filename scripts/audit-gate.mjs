#!/usr/bin/env node
/**
 * `pnpm audit`, turned into a gate that can only go red when somebody can act.
 *
 * WHY NOT JUST `pnpm audit --audit-level high`. That was considered and
 * rejected in `scripts/nightly-health.sh`, whose comment is right and is worth
 * repeating: the fix for a transitive advisory is a dependency PR, not a red
 * nightly that trains everyone to ignore red nightlies. An advisory with no
 * published patch cannot be resolved by anyone reading the failure, so failing
 * on it produces a permanent red that teaches people to skip the check.
 *
 * WHY LEAVING IT REPORT-ONLY WAS ALSO WRONG. The nightly runs it as
 * `pnpm audit ... || true`, so its result never reaches the FAILED list. It
 * cannot fail. Nothing in `ci.yml` runs it at all. The whole detection story
 * therefore rested on Dependabot alerts being read by a person, and on
 * 2026-09-08 that is exactly what did not happen in time: two CRITICAL
 * unauthenticated Next.js RCEs, one of them in the Image Optimizer and so
 * reachable on a live site, sat with their patches WRITTEN AND UNMERGEABLE
 * while every gate in the repository was green. What surfaced them was a human
 * looking, not a check.
 *
 * THE LINE THIS DRAWS. Fail on a high or critical advisory THAT HAS A FIX.
 * That is precisely the set where a red is actionable: someone can bump a
 * version today. An advisory with no patched version is reported, loudly and by
 * name, and does not fail the run, because there is nothing to do about it
 * except wait and it should not sit on top of the merge queue while everyone
 * waits.
 *
 *   node scripts/audit-gate.mjs           human output, exit 1 on fixable high+
 *   node scripts/audit-gate.mjs --json    the parsed verdict
 *
 * Advisories with no patch appear under "known and unfixable" every run, so
 * "we have no vulnerabilities" never gets said when what is true is "we have
 * some we decided not to fail on".
 */

import { execFileSync } from 'node:child_process'

const BLOCKING_SEVERITIES = new Set(['high', 'critical'])

/**
 * Does this advisory have a version anyone could move to?
 *
 * npm's audit format spells "no patch exists" as the empty semver range `<0`,
 * and pnpm passes it through. Treating an absent or empty field as fixable
 * would be the wrong way round: it would fail the build over an advisory that
 * cannot be fixed, which is the failure mode this whole file exists to avoid.
 */
export function hasFix(advisory) {
  const patched = advisory?.patched_versions
  if (typeof patched !== 'string') return false
  const range = patched.trim()
  if (range === '' || range === '<0' || range === '<0.0.0') return false
  return true
}

/**
 * Splits advisories into what blocks and what is merely reported.
 *
 * Pure, so `audit-gate.test.mjs` can drive every branch without a registry.
 */
export function classifyAdvisories(report) {
  const advisories = Object.values(report?.advisories ?? {})
  const blocking = []
  const unfixable = []
  for (const advisory of advisories) {
    if (!BLOCKING_SEVERITIES.has(advisory.severity)) continue
    ;(hasFix(advisory) ? blocking : unfixable).push({
      id: advisory.id,
      module: advisory.module_name,
      severity: advisory.severity,
      title: advisory.title,
      url: advisory.url,
      patched: advisory.patched_versions ?? null,
      vulnerable: advisory.vulnerable_versions ?? null,
    })
  }
  const order = { critical: 0, high: 1 }
  const bySeverity = (a, b) => order[a.severity] - order[b.severity]
  return { blocking: blocking.sort(bySeverity), unfixable: unfixable.sort(bySeverity) }
}

export function summarize(report) {
  const { blocking, unfixable } = classifyAdvisories(report)
  return { blocking, unfixable, exitCode: blocking.length === 0 ? 0 : 1 }
}

function runAudit() {
  try {
    // `pnpm audit` exits non-zero whenever it finds anything, so a throw here
    // is the normal path and the JSON is on stdout either way.
    const stdout = execFileSync('pnpm', ['audit', '--prod', '--json'], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
    return JSON.parse(stdout)
  } catch (error) {
    const stdout = error?.stdout
    if (typeof stdout === 'string' && stdout.trim().startsWith('{')) return JSON.parse(stdout)
    throw error
  }
}

function describe(entry) {
  return [
    `  ${entry.severity.toUpperCase().padEnd(8)} ${entry.module}`,
    `    ${entry.title}`,
    `    vulnerable ${entry.vulnerable ?? '?'}   patched ${entry.patched ?? 'none published'}`,
    `    ${entry.url ?? ''}`,
  ].join('\n')
}

function main() {
  const report = runAudit()
  const { blocking, unfixable, exitCode } = summarize(report)

  if (unfixable.length > 0) {
    console.log(`known and unfixable (${unfixable.length}), reported and not blocking:\n`)
    for (const entry of unfixable) console.log(describe(entry))
    console.log('')
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ blocking, unfixable }, null, 2))
    return exitCode
  }

  if (exitCode === 0) {
    const tail = unfixable.length > 0 ? ` (${unfixable.length} unfixable, listed above)` : ''
    console.log(`audit gate: no fixable high or critical advisory${tail}`)
    return 0
  }

  console.error(`audit gate: ${blocking.length} fixable high/critical advisory(ies)\n`)
  for (const entry of blocking) console.error(describe(entry))
  console.error('\nEach one has a published patch, so each one is a version bump somebody can make')
  console.error('today. Check Dependabot for an open PR before writing one by hand, and if a PR')
  console.error('exists and cannot merge, that is the finding: on 2026-09-08 two critical')
  console.error('unauthenticated RCEs sat behind exactly that while every gate was green.')
  return 1
}

if (process.argv[1]?.endsWith('audit-gate.mjs')) {
  process.exitCode = main()
}
