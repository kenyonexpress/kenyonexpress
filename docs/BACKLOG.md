# Backlog

**Status:** 3 open items (re-scanned by M07-c185, 2026-10-25)

All earlier items were processed (C47, 2026-10-24).

| # | Origin | Item | Why not resolved now |
|---|--------|------|----------------------|
| 1 | `src/lib/payments/cardcom.ts:249` `TODO(cardcom)` (since 2026-07-24) | Confirm the legacy refund endpoint (`RefundDeal.aspx`) and its field names against a live terminal | Needs Cardcom production credentials. See docs/KNOWN-ISSUES.md #2 |
| 2 | `src/lib/payments/cardcom.ts:312` `TODO(cardcom)` (since 2026-08-07) | Confirm the document endpoint (`BillGoldPost.aspx`) and its field names against a live terminal | Same blocker as #1 |
| 3 | `src/lib/images/r2-migration.ts:103-106` four `TODO`s (since 2026-10-17) | Implement `migrateProductImagesToR2`: query product images, batch upload to R2, update `product.images` URLs, verify and delete from source | Feature work; the function is a stub that returns empty stats, and the DB step needs the Supabase service-role key (deferred) |

Resolved by M07-c185 (2026-10-25): `src/app/api/cron/stock-notifications/route.ts:126` TODO removed. The job only sends emails, and no cache is tagged `product_<id>`, so there is nothing to invalidate.
