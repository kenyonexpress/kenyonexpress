import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A comment that says a migration is pending must be wrong out loud.
 *
 * On 2026-09-07 twenty-one comments across `src/` named
 * `migrations/pending/<n>` for migrations that had been applied months
 * earlier and moved to `migrations/applied/`. Two of them were not merely
 * stale paths: `supplier-contact.ts` told a reader that
 * `products.whatsapp_enabled` "has NOT been applied" and that the generated
 * type "genuinely does not carry the field", when the column is live in
 * production and `src/types/database.ts` carries it; and
 * `whatsapp-schema-error.ts` exported a filename, into Hebrew text an admin
 * reads, that pointed at a path with no file at it.
 *
 * Nothing caught that, because a comment naming a directory is invisible to
 * the compiler and to every other test. This is the check: a reference to
 * `migrations/<dir>/<n>` has to be where migration <n> actually is.
 *
 * THE ONE ALLOWANCE is a candidate list. `status-transitions.test.ts` and
 * `payment-events.test.ts` deliberately name both the applied and the pending
 * path for one number, so that the test survives the file being moved. A file
 * that names the right path too has said the true thing, and the extra path is
 * that file's own resilience, not drift.
 */

const MIGRATION_DIRS = ['pending', 'applied', 'cancelled'] as const
type MigrationDir = (typeof MIGRATION_DIRS)[number]

const SRC = 'src'
const CODE = /\.(ts|tsx)$/

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (CODE.test(entry)) out.push(full)
  }
  return out
}

/** Migration number -> the directory it is actually in. */
function migrationIndex(): Map<string, MigrationDir> {
  const index = new Map<string, MigrationDir>()
  for (const dir of MIGRATION_DIRS) {
    for (const name of readdirSync(join('migrations', dir))) {
      const number = name.match(/^(\d+[a-z]?)_.*\.sql$/)?.[1]
      if (number) index.set(number, dir)
    }
  }
  return index
}

type Reference = { file: string; line: number; number: string; named: MigrationDir }

function referencesIn(file: string): Reference[] {
  const found: Reference[] = []
  const lines = readFileSync(file, 'utf8').split('\n')
  for (const [i, line] of lines.entries()) {
    for (const match of line.matchAll(/migrations\/(pending|applied|cancelled)\/(\d+[a-z]?)/g)) {
      found.push({
        file,
        line: i + 1,
        number: match[2] as string,
        named: match[1] as MigrationDir,
      })
    }
  }
  return found
}

describe('migration references in source', () => {
  const index = migrationIndex()
  const references = sourceFiles(SRC).flatMap(referencesIn)

  it('finds references at all, so a passing run means something', () => {
    // A refactor that renames the directories would empty the scan and turn
    // every assertion below into a vacuous pass. This is the tripwire.
    expect(references.length).toBeGreaterThan(10)
    expect(index.size).toBeGreaterThan(10)
  })

  it('names a migration that exists somewhere', () => {
    const unknown = references.filter((ref) => !index.has(ref.number))
    expect(
      unknown.map((ref) => `${ref.file}:${ref.line} names migration ${ref.number}`),
      'these reference a migration number with no file behind it',
    ).toEqual([])
  })

  it('points at the directory the migration is actually in', () => {
    const wrong = references.filter((ref) => {
      const actual = index.get(ref.number)
      if (!actual || actual === ref.named) return false
      // Candidate list: the same file also names the right path.
      return !references.some(
        (other) => other.file === ref.file && other.number === ref.number && other.named === actual,
      )
    })
    expect(
      wrong.map(
        (ref) =>
          `${ref.file}:${ref.line} says migrations/${ref.named}/${ref.number}, but ${ref.number} is in migrations/${index.get(ref.number)}/`,
      ),
      'a migration that moved leaves these comments asserting something false',
    ).toEqual([])
  })
})
