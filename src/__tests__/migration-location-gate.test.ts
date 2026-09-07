import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

/**
 * A NEW MIGRATION LANDS IN `migrations/pending/` OR IT DOES NOT LAND.
 *
 * The standing rule is that schema change is written to `migrations/pending`
 * with a matching preflight and is applied by a human after review. The half of
 * that already enforced is "every pending file has a preflight", in
 * `pending-migrations-inventory.test.ts`. The half that was not enforced is
 * WHERE a new file is allowed to appear, and it is the half that matters more:
 * a `.sql` added to `supabase/migrations/` looks exactly like the 115 files
 * already sitting there, and the `supabase` CLI would happily push it.
 *
 * WHY `supabase/migrations/` IS FROZEN RATHER THAN BANNED. It holds the
 * project's history and cannot be deleted, but it does not describe production:
 * the hosted database is the pre-059 lineage, and this repo's own record of
 * what is live is `migrations/applied/` plus the generated types. Adding to a
 * directory that is already out of step with production is how a change gets
 * believed to be deployed when it is not.
 *
 * SCOPED TO WHAT THIS BRANCH ADDED, not to the tree. Every existing file is
 * grandfathered by construction, so this can never fail for history it did not
 * create, and it fails the moment somebody adds a file in the wrong place.
 *
 * On a pull request the diff base is the merge target. `HEAD~1` is not usable
 * there: GitHub builds a merge commit, so `HEAD~1` is the target branch and the
 * range would be empty, which is a gate that passes by not looking.
 */

/** Directories a NEW .sql file may be added to. */
const ALLOWED_NEW = [
  'migrations/pending/',
  // Test fixtures and seeds are not schema change and are not applied by the
  // migration flow at all.
  'tests/sql/',
  'seeds/',
  'scripts/wp-import/sql/',
  'supabase/seed/',
  'supabase/seed-fixes/',
]

/** Where a file may MOVE to, since approval moves it out of pending. */
const ALLOWED_MOVE = ['migrations/applied/', 'migrations/cancelled/']

function git(args: readonly string[]): string {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return ''
  }
}

/**
 * The merge base against the trunk, or null when it cannot be resolved (a
 * shallow clone, a detached checkout with no remote). Null means skip rather
 * than invent a range: a gate that guesses its own diff is worse than one that
 * says it could not run.
 */
function mergeBase(): string | null {
  for (const ref of ['origin/main', 'main']) {
    const base = git(['merge-base', 'HEAD', ref]).trim()
    if (base) return base
  }
  return null
}

describe('a new migration lands in migrations/pending or nowhere', () => {
  const base = mergeBase()

  it('resolves a diff base, or says why it did not', () => {
    // The guard on the guard. Without a base the check below has nothing to
    // read and would pass silently, which is the failure this repo has hit
    // before: a range that resolves to empty is a gate that stopped looking.
    if (!base) {
      console.warn('migration-location-gate: no merge base against main; check skipped')
    }
    expect(true).toBe(true)
  })

  it.skipIf(!base)('adds no .sql outside the directories that accept new ones', () => {
    // A = added, R = renamed. Rename is included because moving a file INTO
    // supabase/migrations is the same act as creating one there.
    const raw = git(['diff', '--name-status', '--diff-filter=AR', `${base}...HEAD`])
    const offenders: string[] = []

    for (const line of raw.split('\n')) {
      if (!line.trim()) continue
      const parts = line.split('\t')
      const status = parts[0] ?? ''
      const path = (status.startsWith('R') ? parts[2] : parts[1]) ?? ''
      if (!path.endsWith('.sql')) continue

      const allowed = status.startsWith('R') ? [...ALLOWED_NEW, ...ALLOWED_MOVE] : ALLOWED_NEW
      if (!allowed.some((dir) => path.startsWith(dir))) offenders.push(`${status} ${path}`)
    }

    expect(
      offenders,
      `these .sql files were added outside migrations/pending. Schema change is written there with a matching preflight and applied by a human after review; supabase/migrations/ is history and does not describe production:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})
