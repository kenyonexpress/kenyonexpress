# G108 — Admin upload (2026-10-30)

## Verified already shipped
- `/admin/products/new` (`ProductForm.tsx`): coupon + physical fields, `platform_percent` (required, no default),
  coupon expiry, shipping price (integer agorot via `money.ts`), cancellation window, payout cadence
  (`weekly|biweekly|monthly`). Zod in `product-form-schema.ts` / `product-logistics-fields.ts`.
- `/admin/products/import` + `POST /api/admin/products/import`: CSV, 185 columns, dry run (`mode=preview`) lists every
  row problem, `mode=commit` writes drafts.
- Images: browser PUTs straight to R2 via SigV4 presigned URL (`src/lib/storage/r2.ts`).

## Fixed in this item
- **Import commit stopped after row 1**: `upsertProduct` ends in `redirect()` (throws). Added
  `upsertProductNoRedirect` returning `{success, id}`.
- **Rollback**: commit is all-or-nothing. First failing row deletes every product (and variants) created in the run,
  returns `rolledBack: n`, writes an audit entry. Tests: `product-import.test.ts` (3).

## R2 "via cf.env" — decision
The app deploys on Vercel (Next), not a Cloudflare Worker, so there is no `cf.env` binding. R2 credentials are read
from `R2_*` env vars (S3 API). Falls back to Supabase Storage when unset. No code change.

## Gates
tsc clean, biome clean, `src/server/actions/admin` 68 tests pass. Not run: live R2 upload and live DB import
(Supabase MCP unauthed). Two unrelated pre-existing failures in `operational-flags.test.ts` (TURNSTILE/PASSKEYS flags).
No forbidden files touched. No migration needed. No visual gate applies (admin UI unchanged).
