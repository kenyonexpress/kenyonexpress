# KenyonExpress State (ke-arch-wp)

## Current Phase
WordPress data migration architecture (`arch/wp-migration`).

## Last Completed
2026-07-31 (morning): refreshed `docs/ARCHITECTURE-WP-MIGRATION.md` (docs only):

- Binding input: WXR under `data-import/wp-backup/` (`kenyonexpress-wxr-2026-07-29.xml`)
- Parse → normalize → stage → curation → project → integrity
- Map to 33 public tables (PROJECT / CURATION / ARCHIVE / UNTOUCHED)
- Run order, rollback, integrity checks (incl. dry-run blockers B1–B6)
- Orders: headers only from WXR; line items require dump/REST

Also placed XML at `kenyonexpress/data-import/wp-backup/` (hardlink from `refs/wp-export/`).

## In Progress
nothing

## Blocking Issues
none for this docs pass (implementation blockers B1–B6 tracked in the doc)

## Next Task
Fix WXR category parse (B1) on `feat/wp-migration`; run validate against `data-import/wp-backup/`.

## Working Directory
/Users/ofir/kenyonexpress-web/ke-arch-wp

## Branch
`arch/wp-migration`

## History

### 2026-07-31
Initial WP migration arch commit `e2de030`; morning refresh to WXR-first + integrity suite.
