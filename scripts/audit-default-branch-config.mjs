#!/usr/bin/env node
/**
 * CONFIGURATION GITHUB ONLY EVER READS FROM THE DEFAULT BRANCH.
 *
 * `scripts/audit-cron-drift.mjs` found this for one file: a `schedule:` trigger
 * fires from the default branch, so the cron JOB LIST that runs is `main`'s and
 * not this branch's. The same is true of a whole class of files, and each one
 * edited here is an edit that does nothing until it is merged.
 *
 * Measured 2026-09-08, and two of the three were fixes made by this very loop:
 *
 *   .github/dependabot.yml     pass 41 raised open-pull-requests-limit from 5
 *                              to 10 because six open npm PRs had starved the
 *                              queue. Dependabot reads the DEFAULT branch.
 *                              `main` still says 5. The fix has done nothing.
 *   scripts/nightly-health.sh  pass 55 wired five audits that nothing ran into
 *                              the nightly. The nightly checks out `main`,
 *                              which has 5 run steps to this branch's 9. So the
 *                              fix for "an audit nothing runs" is itself unrun.
 *   scripts/cron-jobs.json     the original finding, still open.
 *
 * WHY IT IS EASY TO MISS. Every one of these edits is correct in the file,
 * passes review, passes CI, and is visibly present in the branch. Nothing about
 * the repository says the file is read from somewhere else. The failure is
 * entirely in WHICH COPY the platform reads, and no test that opens the file
 * can see it.
 *
 * IT REFUSES RATHER THAN GUESSES. Without the default branch fetched, every
 * path would look absent and the script would report a catastrophe instead of
 * an unfetched remote.
 *
 *   node scripts/audit-default-branch-config.mjs
 *
 * Exit: 0 no drift, 1 drift, 2 could not compare.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

/** The branch GitHub reads from, asked rather than assumed. */
export function defaultBranch() {
  try {
    const ref = execFileSync('git', ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], {
      encoding: 'utf8',
    }).trim()
    return ref.replace('refs/remotes/origin/', '')
  } catch {
    return 'main'
  }
}

/**
 * Each entry says WHY the platform reads it from the default branch. An entry
 * without that reason is a file somebody added to a list, and the next reader
 * cannot tell whether it belongs.
 */
export const DEFAULT_BRANCH_ONLY = [
  {
    path: '.github/dependabot.yml',
    why: 'Dependabot reads the repository configuration from the default branch only',
  },
  {
    path: '.github/CODEOWNERS',
    why: 'review assignment is resolved from the default branch',
  },
  {
    path: 'scripts/cron-jobs.json',
    why: 'cron.yml runs on a schedule: trigger, which checks out the default branch',
  },
  {
    path: 'scripts/run-cron-jobs.sh',
    why: 'executed by that same scheduled checkout',
  },
  {
    path: 'scripts/nightly-health.sh',
    why: 'nightly-health.yml is a schedule: trigger, so it runs the default branch copy',
  },
]

export function classify(localExists, remote, local) {
  if (remote === null) return localExists ? 'absent-on-default' : 'absent-both'
  if (!localExists) return 'absent-here'
  return remote === local ? 'same' : 'differs'
}

function showFromDefault(branch, path) {
  try {
    return execFileSync('git', ['show', `origin/${branch}:${path}`], { encoding: 'utf8' })
  } catch {
    return null
  }
}

function main() {
  const branch = defaultBranch()
  try {
    execFileSync('git', ['rev-parse', '--verify', `origin/${branch}`], { stdio: 'ignore' })
  } catch {
    console.error(`audit-default-branch-config: origin/${branch} is not fetched.`)
    console.error('Every path would read as absent. Refusing to report drift it did not check.')
    process.exit(2)
  }

  console.log(`the platform reads these from origin/${branch}\n`)
  let drifted = 0
  for (const entry of DEFAULT_BRANCH_ONLY) {
    const localExists = existsSync(entry.path)
    const remote = showFromDefault(branch, entry.path)
    const local = localExists ? readFileSync(entry.path, 'utf8') : null
    const verdict = classify(localExists, remote, local)
    if (verdict !== 'same' && verdict !== 'absent-both') drifted += 1
    console.log(`  ${verdict.padEnd(18)} ${entry.path}`)
    if (verdict !== 'same' && verdict !== 'absent-both')
      console.log(`  ${' '.repeat(18)} ${entry.why}`)
  }

  if (drifted === 0) {
    console.log('\nno drift: what this branch says is what the platform reads')
    process.exit(0)
  }
  console.log(
    `\n${drifted} of ${DEFAULT_BRANCH_ONLY.length} differ. Edits to them take effect on merge to origin/${branch}, not before.`,
  )
  process.exit(1)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
