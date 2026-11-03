#!/usr/bin/env node

/**
 * M04 for the M-cycle: E2E health from the newest finished CI run on this branch.
 *
 * parse-e2e-results.mjs parses one Playwright log and defaulted to a tmp file
 * from a session that no longer exists, so M04 failed on "file not found" every
 * cycle. The E2E suite that runs on every push is CI's; this reads its jobs.
 *
 *   node scripts/m-cycle-e2e-health.mjs
 *
 * Exit: 0 every E2E job that ran passed and at least one ran; 1 an E2E job
 * failed, or none ran (skipped behind a red upstream job is no evidence);
 * 2 could not read CI.
 */

import { execFileSync } from 'node:child_process'

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

let branch
let runs
try {
  branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim()
  runs = JSON.parse(
    gh([
      'run',
      'list',
      '--workflow=ci.yml',
      `--branch=${branch}`,
      '--status=completed',
      '--limit=20',
      '--json=databaseId,conclusion,headSha,createdAt',
    ]),
  ).filter((r) => r.conclusion !== 'cancelled')
} catch (error) {
  console.error(`m-cycle-e2e-health: cannot read CI: ${error.message}`)
  process.exit(2)
}

if (runs.length === 0) {
  console.error(`m-cycle-e2e-health: no finished CI run on ${branch}`)
  process.exit(2)
}

const run = runs[0]
const jobs = JSON.parse(gh(['run', 'view', String(run.databaseId), '--json=jobs'])).jobs.filter(
  (j) => /e2e/i.test(j.name),
)

console.log(`CI run ${run.databaseId} on ${branch} @ ${run.headSha.slice(0, 9)} (${run.createdAt})`)
for (const j of jobs) console.log(`  ${j.conclusion.padEnd(8)} ${j.name}`)

const ran = jobs.filter((j) => j.conclusion !== 'skipped')
const failed = ran.filter((j) => j.conclusion !== 'success')
if (failed.length > 0) {
  console.error(`m-cycle-e2e-health: ${failed.length} E2E job(s) not green`)
  process.exit(1)
}
if (ran.length === 0) {
  console.error('m-cycle-e2e-health: no E2E job ran')
  process.exit(1)
}
console.log(`m-cycle-e2e-health: ${ran.length}/${jobs.length} E2E job(s) ran, all green`)
