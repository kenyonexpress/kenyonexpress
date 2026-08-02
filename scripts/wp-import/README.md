# wp-import

WordPress/WooCommerce to Supabase migration pipeline.

Architecture and field mapping: `docs/ARCHITECTURE-WP-DATA-MIGRATION.md`.
Schema: `supabase/migrations/032_wp_import_staging.sql` (staging) and
`057_wp_migration_log.sql` (run log, validation reports, rollback).

## Dry run is the default

Nothing is written unless **both** locks are open:

```bash
node scripts/wp-import/run.mjs                          # dry run
WP_IMPORT_ALLOW_WRITES=1 node scripts/wp-import/run.mjs --apply   # writes
```

One lock is a typo away from a live import. Two locks cannot both be tripped
by accident. A dry run does all the reading, transforming, image fetching and
validating, and prints the exact plan it would apply.

## Stages

```
extract -> transform -> load -> media -> project -> validate
```

| Stage | Reads | Writes | Touches public.*? |
| --- | --- | --- | --- |
| `extract` | WooCommerce REST or a restored dump | `wp_import/raw/` | no |
| `transform` | `wp_import/raw/` | `wp_import/normalized/` | no |
| `load` | `wp_import/normalized/` | `wp_import.*` staging | no |
| `media` | `wp_import/normalized/media.json` | storage bucket, `wp_import.media` | no |
| `project` | `wp_import.*` staging | `public.categories`, `public.products` | **yes** |
| `validate` | everything | `wp_import/reports/`, `wp_import.validation_reports` | no |

Run one stage at a time:

```bash
node scripts/wp-import/run.mjs extract
node scripts/wp-import/run.mjs transform
node scripts/wp-import/run.mjs validate
```

## Try it offline

The fixture is a small synthetic WooCommerce export carrying the failure modes
we expect from the real catalog. It needs no credentials and no database.

```bash
node scripts/wp-import/fixtures/make-fixture.mjs
node scripts/wp-import/run.mjs transform
node scripts/wp-import/run.mjs validate
```

The `media` stage needs `sharp`, so run `pnpm install` in this worktree first
if you want it. Every other stage runs with no dependencies at all.

## Environment

```bash
# source: WooCommerce REST, read-only key from
# WooCommerce > Settings > Advanced > REST API
export WC_BASE="https://kenyonexpress.co.il"
export WC_KEY="ck_..."
export WC_SECRET="cs_..."

# target
export SUPABASE_URL="https://<project>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="..."

# the second write lock
export WP_IMPORT_ALLOW_WRITES=1
```

Without Supabase credentials the pipeline runs fully offline against the JSON
artifacts. That is the normal mode for authoring and reviewing a plan.

## Options

```
--apply             actually write (needs WP_IMPORT_ALLOW_WRITES=1 too)
--source rest|dump  extraction source (default: rest)
--entity <name>     restrict to one entity (product, category, media, ...)
--limit <n>         cap rows per entity (debugging)
--batch <uuid>      attach to an existing import_batches row
--resume            skip source pages already checkpointed in wp_import/raw/
--verbose           per-row logging
--help
```

## Artifacts

Everything a run produces lands under `wp_import/` at the repo root, which is
gitignored:

```
wp_import/
  raw/            verbatim source payloads, one file per page (the audit trail)
  normalized/     post-transform rows, one file per entity
  media/          downloaded and converted image bytes, keyed by sha256
  reports/        validation-<batch>.{json,md}, customer-invites.json
  logs/           <batch>.jsonl - every operation, dry run included
```

The JSONL log is what makes a dry run worth reading: the full plan, row by
row, diffable against the next run.

## Idempotency

Every upsert keys on `wp:<entity>:<wp_id>`, and every public uuid comes from
`wp_import.id_map`. Re-running the pipeline updates the rows it created last
time. It never duplicates.

## Rollback

```sql
-- what would be undone
SELECT * FROM wp_import.fn_rollback_batch('<batch-uuid>');

-- actually undo it
SELECT * FROM wp_import.fn_rollback_batch('<batch-uuid>', p_dry_run => false);
```

Only rows a batch **inserted** are deleted. Rows it merely updated are
reported for manual review, with their pre-image in
`wp_import.migration_log.before_data`. Storage objects are content-addressed
and shared between products, so they are never deleted by a rollback.

## Rules the pipeline will not bend

- **No password migration.** WordPress hashes are never extracted, never
  staged, never projected. Legacy customers arrive through the reset flow, and
  a gate fails the run if any password material reaches staging.
- **No imported marketing consent.** Every imported person starts opted out.
  An opt-in on the old site is evidence, not consent on the new one.
- **Historical orders are archive-only.** They live in `wp_import.orders` and
  are never projected into live commerce tables.
- **No product goes live broken.** Missing price or missing category means
  `draft`, never `active`.
- **No old URL 404s.** Every old path gets a 301 target, a direct match, or an
  explicit 410.
