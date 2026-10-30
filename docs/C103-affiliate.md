# C103 Affiliate (F12)

Most of F12 shipped in rc5 (migration 283). C103 closes the gaps.

## Already present (verified, unchanged)
- Tables `affiliate_campaigns` (admin-set commission, stored as `commission_bp`, entered as `commission_percent` on `/admin/affiliates/campaigns`), `affiliate_links`, `affiliate_clicks`, `affiliate_attributions`, `affiliate_payouts` (migration 283, applied).
- Click tracking: the proxy turns `?ref=<af code>` into the `ke_aff` cookie (30 days) and `recordAffiliateClick` counts one click per visitor per link per day (salted IP hash only).
- Conversion: `attributeOrder` runs at checkout and snapshots the campaign's `commission_bp` into `affiliate_attributions` (like `platform_percent` into `order_items`); no self-referral.
- Payout: cron `affiliate-payouts` -> `settleAffiliateCommissions`. After the 14-day cancellation hold it credits the affiliate's wallet through `fn_wallet_transfer`, idempotency key `affiliate:<order_id>`. Integer agorot via `src/lib/money.ts`; cancelled or refunded orders are reversed.

## Added in C103
- **Link per product, unique per user**: migration `319_affiliate_links_product.sql` adds `affiliate_links.product_id` and a unique partial index `(affiliate_id, product_id)`. `createAffiliateLink` accepts a `product_slug`, resolves it to an active product, points the link at `/product/<slug>`, and answers a duplicate with a clear error. The form on the affiliate page has the new field.
- **Short routes**: `/u/affiliate` -> `/account/affiliate` and `/admin/affiliate` -> `/admin/affiliates` (non-permanent redirects in `next.config.ts`); the screens themselves are unchanged.
- Migration manifest, README and inventory test updated; preflight_319.

## Not done
- Migration 319 is not applied: Supabase MCP needs OAuth, unavailable in this non-interactive session. Apply it through MCP `apply_migration` on ixvwfbuvfxxsjiywhbbb. The code works before it: a product link then fails to insert (missing column) and the user sees the generic link error; plain links are unaffected.
- No live checkout-to-payout run (needs the DB and Cardcom sandbox).
