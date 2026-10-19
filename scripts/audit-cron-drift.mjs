#!/usr/bin/env node
/**
 * THE CRON LIST THAT RUNS IS THE DEFAULT BRANCH'S, NOT THIS ONE'S.
 *
 * GitHub fires `schedule:` triggers from the DEFAULT branch only. `cron.yml`
 * therefore executes `scripts/run-cron-jobs.sh` against
 * `scripts/cron-jobs.json` AS IT EXISTS ON `main`, whatever this branch says.
 *
 * `src/__tests__/cron-schedule-inventory.test.ts` is a good test and cannot see
 * this. It checks THIS branch's json against THIS branch's routes, and they
 * agree - twelve jobs, twelve routes. The drift is between branches, and
 * nothing looked across.
 *
 * MEASURED 2026-09-08:
 *
 *   only on main            whatsapp
 *   only on closeout        retention, weekly-digest
 *
 * Which produces two distinct failures, both live:
 *
 *   1. `whatsapp` is CALLED and 404s on the deployed build. Six of the last
 *      thirty runs red - exactly 20% - most recently 04:53 the same day. An
 *      alarm that is red one run in five for a known reason is an alarm nobody
 *      reads, and the retention route's own docblock says so in as many words:
 *      "a red cron for a known pending file teaches everyone to ignore red
 *      crons."
 *
 *   2. `retention` is NEVER CALLED. It ages `audit_log` IP addresses older than
 *      365 days to NULL through `fn_audit_retention_sweep()`, and migration 157
 *      IS APPLIED in production, so the function exists and is simply never
 *      invoked. This is the half nobody had noticed: a red alarm is at least
 *      visible, and a job that was never scheduled is silent.
 *
 * NOT WIRED INTO CI ON PURPOSE. It would be red on every run until the branch
 * question is settled, which is the exact mistake above. Run it by hand, and
 * run it again the day the mainline is chosen:
 *
 *   node scripts/audit-cron-drift.mjs
 *
 * Exit: 0 when the lists agree, 1 when they drift, 2 when it cannot compare.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/** The branch GitHub schedules from, asked rather than assumed. */
function defaultBranch() {
  try {
    const ref = execFileSync('git', ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], {
      encoding: 'utf8',
    }).trim()
    return ref.replace('refs/remotes/origin/', '')
  } catch {
    return 'main'
  }
}

function names(json) {
  const parsed = typeof json === 'string' ? JSON.parse(json) : json
  const jobs = Array.isArray(parsed) ? parsed : (parsed.jobs ?? [])
  return jobs.map((job) => job.name).sort()
}

const branch = defaultBranch()
let theirs
try {
  theirs = names(
    execFileSync('git', ['show', `origin/${branch}:scripts/cron-jobs.json`], { encoding: 'utf8' }),
  )
} catch {
  console.error(`audit-cron-drift: cannot read scripts/cron-jobs.json on origin/${branch}.`)
  console.error('Fetch the default branch first; refusing to report agreement it did not check.')
  process.exit(2)
}

const ours = names(readFileSync('scripts/cron-jobs.json', 'utf8'))
const onlyTheirs = theirs.filter((n) => !ours.includes(n))
const onlyOurs = ours.filter((n) => !theirs.includes(n))

console.log(`scheduler runs from: origin/${branch}  (${theirs.length} jobs)`)
console.log(`this branch:                            ${ours.length} jobs\n`)

if (onlyTheirs.length === 0 && onlyOurs.length === 0) {
  console.log('audit-cron-drift: the two lists agree')
  process.exit(0)
}

for (const name of onlyTheirs) {
  console.error(`  CALLED, NOT HERE   ${name}`)
  console.error(`    origin/${branch} schedules it; this branch has no such route, so the`)
  console.error('    deployed build answers 404 and the alarm goes red on every run it is due.')
}
for (const name of onlyOurs) {
  console.error(`  HERE, NEVER CALLED  ${name}`)
  console.error(`    this branch defines the job and origin/${branch} does not schedule it,`)
  console.error('    so it has never run. No alarm fires: a job nobody scheduled is silent.')
}
console.error('\nThe fix is the mainline decision, not an edit to either list.')
console.error('See docs/MIGRATION-NUMBER-COLLISIONS.md for the same root cause.')
process.exit(1)
