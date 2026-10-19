import { describe, expect, it } from 'vitest'

/**
 * The generated manifest must equal what the repository is tracking.
 *
 * WHY THE MANIFEST EXISTS. `/admin/migrations` renders this list, and it runs
 * on Vercel where only files Next's tracer can see are in the bundle.
 * `migrations/` is data no import reaches, so a runtime readdir there works on
 * a laptop and ENOENTs in production. A generated module is imported, so it is
 * traced -- and this is what keeps it from going quietly stale.
 *
 * TRACKED, not present on disk. More than one agent works in this repo, and an
 * uncommitted migration in `migrations/pending/` belongs to whoever is still
 * writing it. What deploys is what is committed, so that is what the manifest
 * describes and what this compares against.
 *
 * It lives in its own file rather than inside `pending-migrations-inventory`
 * for the same reason: that file is edited by whoever adds a migration, and two
 * sessions editing one file is how work gets committed under someone else's
 * message.
 */

describe('the generated migration manifest', () => {
  it('equals what the migrations directories are tracking', async () => {
    const { buildManifest } = await import('../../scripts/build-migration-manifest.mjs')
    const { MIGRATION_MANIFEST } = await import('@/lib/admin/migration-manifest')
    expect(MIGRATION_MANIFEST, 'run `pnpm migrations:manifest` and commit the result').toEqual(
      buildManifest(process.cwd()),
    )
  })

  it('gives every pending entry a preflight, which is the rule the page renders', async () => {
    const { MIGRATION_MANIFEST } = await import('@/lib/admin/migration-manifest')
    const unaudited = MIGRATION_MANIFEST.filter(
      (entry) => entry.state === 'pending' && !entry.hasPreflight,
    )
    expect(unaudited.map((e) => e.file)).toEqual([])
  })
})
