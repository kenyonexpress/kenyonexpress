# Backlog

**Status:** 3 open items (2 code TODOs + 1 feature item) (filed by M07-c183 / M07-c187 TODO/FIXME scans, re-verified by M07-c270, M07-c283, M07-c286, M07-c287, M07-c288, M07-c292, M07-c293, M07-c302, M07-c307, M07-c308, M07-c314, M07-c315, M07-c316, M07-c317, M07-c323, M07-c324 and M07-c335, M07-c338, M07-c340, M07-c342, M07-c343, M07-c346 and M07-c347, 2026-11-02)

Resolved since last scan: dead R2 batch-migration stub removed (M07-c347, 4 TODOs gone). Earlier: stock-notifications cron cache invalidation (`revalidateTag(CATALOGUE_TAG, 'max')`, commit 46217252e).

All earlier items were processed (C47, 2026-10-24).

| # | Origin | Item | Why not resolved now |
|---|--------|------|----------------------|
| 1 | `src/lib/payments/cardcom.ts:255` `TODO(cardcom)` (since 2026-07-24) | Confirm the legacy refund endpoint (`RefundDeal.aspx`) and its field names against a live terminal | Needs Cardcom production credentials. See docs/KNOWN-ISSUES.md #2 |
| 2 | `src/lib/payments/cardcom.ts:318` `TODO(cardcom)` (since 2026-08-07) | Confirm the document endpoint (`BillGoldPost.aspx`) and its field names against a live terminal | Same blocker as #1 |
| 3 | Former `src/lib/images/r2-migration.ts:103-106` four `TODO`s (since 2026-10-17; code TODOs resolved by M07-c347, which deleted the unused no-op `migrateProductImagesToR2` stub) | Implement batch migration of product images to R2: query product images, batch upload, update `product.images` URLs, verify and delete from source | Feature work, no code marker left; `uploadToR2` in the same file is still a placeholder, and the DB step needs the Supabase service-role key (deferred) |
