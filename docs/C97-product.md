# C97 PRODUCT PAGE final sweep

RESULT: BLOCKED migration 315 not applied (Supabase MCP needs OAuth in a non-interactive session; db push forbidden); product-page compare.mjs not re-measured

## Audit against the brief
| Requirement | State |
|---|---|
| Coupon QR + 8-digit code | Already present: `src/lib/voucher-code.ts` (8 digits, HMAC), `qr_payload` KEV1 in `server/domain/vouchers/issue.ts`. Unchanged. |
| platform_percent snapshot into order_items | Already present: migration 291 (`platform_percent_snapshot`, locked on paid orders; still pending in `migrations/pending`, applied status not re-verified here), `finalize.ts` reads it. Unchanged. |
| Coupon expiry 30/60/90, default 90 | Changed: admin form field is now a select 30/60/90 defaulting to 90 (3 render sites in `ProductForm.tsx`); `product-form-schema.ts` rejects any other value. |
| shipping_price_agorot, cancellation_window_days | Already present (migrations 185/278, integer agorot). Unchanged. |
| supplier_transfer_days | Added: migration `315_products_supplier_transfer_days.sql` + `preflight_315.sql` (nullable int 0-90), parser in `product-logistics-fields.ts`, admin form field, `types/database.ts`. The save action omits the key while null so saves keep working until 315 is applied. |
| wa.me prefilled button | Already present: `lib/whatsapp.ts`, `WhatsAppShareButton`, `buildShareMessage`. Unchanged. |
| Share menu order | Already WhatsApp, native share, copy link (`ProductInfo.tsx`, per C02). Unchanged. |

## Checks
tsc --noEmit clean; biome clean on touched files; vitest `src/__tests__/pending-migrations-inventory.test.ts`, `src/lib/admin`, `src/components/shared`, `src/components/admin`: 305 passed.

## Not met
- Migration 315: REST probe returns 400 for `products.supplier_transfer_days` (not applied). Needs Supabase MCP apply_migration on ixvwfbuvfxxsjiywhbbb.
- compare.mjs under 11% on product at 380/768/1440 was not re-run; C02 recorded it as not measurable (local catalogue has no matching slug). No visual change was made to the public product page.
- Existing coupons with other expiry values (e.g. 14) still open in the edit select as 90 and need a re-save.
