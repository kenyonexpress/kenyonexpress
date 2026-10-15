# Affiliate campaigns: design for F12

Status: not built. Measured 2026-10-16: `affiliates` has `status`, `total_clicks`,
`total_conversions` and `total_earnings_ils_agorot`, and the admin page lists and
approves them. Nothing in the storefront records a click, attributes an order, or
pays anyone. Reading `affiliates.affiliate_code` appears only in admin code.

## Needed

1. `affiliate_campaigns` table: `id`, `name`, `commission_bp` (basis points, 0 to
   5000), `active`, `starts_at`, `ends_at`. Admin sets `commission_bp` per campaign.
2. `affiliate_attributions`: `order_id` unique, `affiliate_id`, `campaign_id`,
   `commission_bp` SNAPSHOT, `commission_agorot`. Written once at finalize, from the
   30-day `ke_aff` cookie, like `platform_percent` is snapshotted into `order_items`.
3. Payout to wallet through the existing definer RPC path (the ledger is
   client-readonly since 168), idempotent on `affiliate:<order_id>`, released only
   after the order's cancellation window closes, and reversed on refund.

## Rules

- Commission is computed with `applyBp` from `src/lib/money.ts`, on the amount paid
  on site, never on the coupon face value.
- An affiliate cannot earn on their own order.
- No payout before the migration is applied and rehearsed in a rolled-back block.
