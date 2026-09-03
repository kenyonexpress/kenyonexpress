# Gap matrix — generated 2026-09-03 (STEP G1)

Static audit. A ✔ means the table's name appears in that layer (or an
ENABLE ROW LEVEL SECURITY statement exists for it in the migration files).
It measures reachability, not correctness; RLS is read from migration SQL,
not from production. Drizzle covers only src/db/schema (a parallel-agent
contribution: orders, order_items).

| table | drizzle | RLS | actions | storefront/components | admin | supplier | tests | email/domain |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `abandoned_cart_nudges` | — | — | — | — | — | — | — | — |
| `affiliates` | — | ✔ | ✔ | ✔ | ✔ | — | ✔ | — |
| `ai_usage` | — | ✔ | — | — | — | — | ✔ | — |
| `analytics_events` | — | ✔ | — | — | — | — | — | — |
| `audit_log` | — | ✔ | ✔ | — | ✔ | ✔ | ✔ | — |
| `banners` | — | ✔ | — | ✔ | — | — | ✔ | — |
| `carts` | — | ✔ | ✔ | ✔ | — | — | ✔ | — |
| `cashback_rules` | — | ✔ | — | — | — | — | — | — |
| `categories` | — | ✔ | ✔ | ✔ | ✔ | — | ✔ | — |
| `coupon_codes` | — | ✔ | ✔ | ✔ | ✔ | — | — | ✔ |
| `coupon_deals` | — | ✔ | ✔ | — | ✔ | — | — | — |
| `coupons` | — | — | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `discount_campaigns` | — | ✔ | ✔ | — | — | — | — | — |
| `discount_redemptions` | — | ✔ | — | — | — | — | — | — |
| `email_suppressions` | — | — | ✔ | — | — | — | ✔ | — |
| `escrow_holds` | — | ✔ | — | — | ✔ | — | ✔ | ✔ |
| `homepage_sections` | — | ✔ | — | — | — | — | — | — |
| `invoices` | — | ✔ | ✔ | ✔ | ✔ | — | ✔ | — |
| `legacy_percent_archive_112` | — | — | ✔ | — | ✔ | — | — | — |
| `media_assets` | — | ✔ | ✔ | ✔ | — | — | — | — |
| `newsletter_subscribers` | — | — | ✔ | — | — | — | — | — |
| `notification_outbox` | — | ✔ | ✔ | — | ✔ | — | ✔ | ✔ |
| `order_items` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `orders` | ✔ | — | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `payment_events` | — | ✔ | — | — | — | — | ✔ | — |
| `payment_tokens` | — | ✔ | ✔ | ✔ | — | — | ✔ | — |
| `payment_webhook_events` | — | ✔ | — | — | ✔ | — | ✔ | — |
| `payments` | — | ✔ | ✔ | ✔ | ✔ | — | ✔ | ✔ |
| `payout_statement_lines` | — | ✔ | — | — | — | — | — | — |
| `payout_statements` | — | — | ✔ | ✔ | ✔ | — | — | ✔ |
| `popular_searches` | — | ✔ | ✔ | — | ✔ | — | — | — |
| `product_images` | — | ✔ | — | — | — | — | — | — |
| `product_variants` | — | ✔ | ✔ | ✔ | ✔ | — | ✔ | — |
| `products` | — | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `profiles` | — | ✔ | ✔ | ✔ | ✔ | — | ✔ | — |
| `push_tokens` | — | ✔ | ✔ | — | — | — | — | — |
| `rate_limits` | — | ✔ | — | — | — | — | — | — |
| `referral_program_settings` | — | ✔ | — | ✔ | — | — | ✔ | — |
| `referral_signals` | — | ✔ | — | — | — | — | ✔ | — |
| `referrals` | — | — | ✔ | ✔ | ✔ | — | ✔ | — |
| `refunds` | — | ✔ | ✔ | — | — | — | ✔ | ✔ |
| `reviews` | — | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| `search_events` | — | ✔ | — | — | ✔ | — | — | — |
| `search_index_dlq` | — | ✔ | ✔ | — | ✔ | — | — | — |
| `search_index_outbox` | — | ✔ | — | — | — | — | ✔ | — |
| `seo_redirects` | — | ✔ | — | — | — | — | — | — |
| `settlement_events` | — | ✔ | ✔ | ✔ | ✔ | — | ✔ | ✔ |
| `split_executions` | — | ✔ | — | — | ✔ | — | ✔ | — |
| `stock_reservations` | — | ✔ | — | — | — | — | — | — |
| `subscription_charges` | — | ✔ | — | — | — | — | — | — |
| `subscriptions` | — | ✔ | ✔ | ✔ | — | — | ✔ | — |
| `supplier_branches` | — | ✔ | — | — | — | — | ✔ | — |
| `supplier_leads` | — | — | ✔ | — | — | — | — | — |
| `supplier_members` | — | ✔ | ✔ | — | ✔ | — | ✔ | — |
| `supplier_staff` | — | ✔ | — | — | — | — | ✔ | — |
| `suppliers` | — | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `user_addresses` | — | ✔ | ✔ | ✔ | — | — | ✔ | — |
| `user_rate_limits` | — | ✔ | — | — | — | — | — | — |
| `user_recent_searches` | — | ✔ | ✔ | — | — | — | — | — |
| `vendors` | — | ✔ | ✔ | ✔ | ✔ | — | ✔ | — |
| `voucher_redemptions` | — | ✔ | ✔ | — | — | ✔ | ✔ | ✔ |
| `vouchers` | — | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `wallet_accounts` | — | ✔ | ✔ | ✔ | — | — | — | — |
| `wallet_balances` | — | — | — | — | ✔ | ✔ | ✔ | — |
| `wallet_entries` | — | ✔ | — | ✔ | — | — | ✔ | — |
| `wallet_transactions` | — | ✔ | — | — | ✔ | — | ✔ | — |
| `wishlists` | — | ✔ | ✔ | — | — | — | — | — |

## Tables with no ENABLE RLS statement in the repo

Production may still have RLS on these (the hosted DB is the pre-059 lineage
and the migration files do not fully describe it — a standing project memory).
Verify against production before treating any of these as a hole:

- `abandoned_cart_nudges`
- `coupons`
- `email_suppressions`
- `legacy_percent_archive_112`
- `newsletter_subscribers`
- `orders`
- `payout_statements`
- `referrals`
- `supplier_leads`
- `wallet_balances`