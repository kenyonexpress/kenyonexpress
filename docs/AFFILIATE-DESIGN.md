# Affiliate campaigns: design for F12

Status: built (commit 10a784e9c, migration 283 affiliate_campaigns). Tables are
`affiliate_campaigns` (admin sets `commission_bp`), `affiliate_links`,
`affiliate_attributions` (rate snapshotted at order creation from the 30-day
`ke_aff` cookie), `affiliate_payouts`. Daily cron `/api/cron/affiliate-payouts`
pays via `fn_wallet_transfer`, key `affiliate:<order_id>`, after a 14-day hold,
reversed on cancel or refund, never on own order. Share links and stats live at
`/account/affiliate`; campaigns at `/admin/affiliates/campaigns`. Open: 283 is not
yet listed in `MIGRATIONS-APPLIED.md` (prod state unverified, Supabase MCP needs OAuth).

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
