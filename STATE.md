# KenyonExpress State (ke-arch-wp)

## Current Phase
WordPress data migration architecture (`arch/wp-migration`).

## Last Completed
2026-07-31: `docs/ARCHITECTURE-WP-MIGRATION.md` (docs only):

- Clarified "33 tables" = public prod count; import matrix PROJECT/ARCHIVE/UNTOUCHED
- Field maps: products, coupons/vouchers, images, users
- mysqldump + uploads extraction; curation gates (`supplier_id`, `platform_percent`)
- Run order stages 0–7; rollback; DoD gates
- Money: no Escrow, agorot, coupon on-site full pay

Also (same day, other worktree): pushed `arch/ai-agents` @ `84befe6` (`docs: AI agents architecture`).

## In Progress
nothing

## Blocking Issues
none for this docs pass

## Next Task
Curation spreadsheet + DEV dry-run of wp-import against live schema.

## Working Directory
/Users/ofir/kenyonexpress-web/ke-arch-wp

## Branch
`arch/wp-migration`

## History

### 2026-07-31
Created worktree from `origin/main`, wrote WP migration architecture (docs only).
