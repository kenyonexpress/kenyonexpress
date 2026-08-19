# unused_index: the 90, one recommendation each

Wave DB HARDENING, step 14. Written 2026-08-19 against production
(`ixvwfbuvfxxsjiywhbbb`). **Nothing here was dropped.** Step 14 is a report;
the only indexes removed in this wave were the 4 duplicates in migration 122,
and two of those appear below already gone.

## How to read a zero here

`idx_scan = 0` does not mean an index is useless. It means nothing has used it
*since the counters started*, and on this database `pg_stat_database.stats_reset`
is NULL, so there is no measured window at all to weigh that against. Three
things then make a zero uninformative on their own:

* **The table is empty.** 35 of the 90. A count of zero scans on zero rows says
  nothing about the index, only about the feature not being live yet.
* **The table is tiny.** 20 of the 90, the largest being `audit_log` at 471
  rows and `products` at 80. Below roughly a few thousand rows the planner
  reads the whole table and ignores the index by choice, because that is
  genuinely cheaper. These indexes start earning when the data does.
* **The index exists for writes, not reads.** 33 of the 90 are the only index
  covering a foreign key. An unindexed FK forces a sequential scan of the child
  table on every parent DELETE or key UPDATE, and that cost never shows up as
  `idx_scan`. Dropping these to chase a zero would undo migration 122, which
  was step 12 of this same wave.

Row counts below are `reltuples` immediately after `ANALYZE`. Before the
ANALYZE most of these tables reported `-1`, which in Postgres 14+ means "never
analyzed", not "empty" - measuring them without it would have mislabelled 35
tables as empty when some were merely unmeasured.

## The recommendation

**Keep all 90 as they are.** Not one of them is both large enough for a zero to
mean anything and free of a structural job. Revisit after the storefront has
real traffic and a real `stats_reset` window, at which point the question can be
asked properly: reset the stats, run a week, and re-read.

The genuinely removable indexes on this database are not in the advisor's list
at all. See the five below.

## The five the advisor does not flag, and probably should

Each of these is a plain index sitting on exactly the columns of a UNIQUE
constraint's index on the same table. The unique index already serves every
lookup and every FK check the plain one could, so the plain one is pure write
overhead. The advisor skips them because the pair differs in uniqueness, so it
does not see them as duplicates.

| plain index | shadowed by | table |
| --- | --- | --- |
| `idx_affiliates_code` | `affiliates_affiliate_code_key` | public.affiliates |
| `idx_affiliates_user_id` | `affiliates_user_id_key` | public.affiliates |
| `idx_orders_invoice_number` | `orders_invoice_number_key` | public.orders |
| `rate_limits_key_idx` | `rate_limits_key_key` | public.rate_limits |
| `idx_wallet_balances_user_id` | `wallet_balances_user_id_key` | public.wallet_balances |

Note this cuts across the table below: `idx_affiliates_user_id` and
`idx_wallet_balances_user_id` are listed there as KEEP-FK, because they do cover
a foreign key. The unique index covers the same key, so the FK argument does not
save them. They are still not dropped here, because step 14 does not drop.

## DROPPED, already gone (2)

Removed by migration 122 as true duplicates.

| index | table | rows | size |
| --- | --- | --- | --- |
| `idx_products_category` | - | - | - |
| `idx_products_supplier` | - | - | - |

## KEEP-FK, sole index covering a foreign key (33)

Dropping any of these puts a sequential scan back on the parent's DELETE path.

| index | table | rows | size |
| --- | --- | --- | --- |
| `idx_affiliates_user_id` | public.affiliates | 0 | 8192 bytes |
| `idx_audit_log_actor` | public.audit_log | 471 | 16 kB |
| `categories_created_by_idx` | public.categories | 12 | 16 kB |
| `idx_coupon_codes_user` | public.coupon_codes | 2 | 16 kB |
| `coupon_deals_vendor_id_idx` | public.coupon_deals | 8 | 16 kB |
| `coupons_created_by_idx` | public.coupons | 0 | 8192 bytes |
| `escrow_holds_status_supplier_idx` | public.escrow_holds | 2 | 16 kB |
| `idx_invoices_order` | public.invoices | 0 | 16 kB |
| `newsletter_user_idx` | public.newsletter_subscribers | 0 | 8192 bytes |
| `idx_orders_user_status` | public.orders | 4 | 16 kB |
| `idx_payments_refund_of` | public.payments | 2 | 16 kB |
| `products_created_by_idx` | public.products | 80 | 16 kB |
| `push_tokens_device_idx` | public.push_tokens | 0 | 8192 bytes |
| `push_tokens_user_enabled_idx` | public.push_tokens | 0 | 8192 bytes |
| `settlement_events_item_idx` | public.settlement_events | 0 | 16 kB |
| `settlement_events_order_idx` | public.settlement_events | 0 | 16 kB |
| `settlement_events_supplier_idx` | public.settlement_events | 0 | 16 kB |
| `idx_user_addresses_user_active` | public.user_addresses | 1 | 16 kB |
| `user_recent_searches_recent_idx` | public.user_recent_searches | 0 | 8192 bytes |
| `voucher_redemptions_scanner_idx` | public.voucher_redemptions | 0 | 16 kB |
| `voucher_redemptions_staff_idx` | public.voucher_redemptions | 0 | 8192 bytes |
| `voucher_redemptions_supplier_idx` | public.voucher_redemptions | 0 | 16 kB |
| `vouchers_redeemed_by_supplier_idx` | public.vouchers | 0 | 16 kB |
| `vouchers_user_status_idx` | public.vouchers | 0 | 16 kB |
| `idx_wallet_balances_user_id` | public.wallet_balances | 0 | 8192 bytes |
| `idx_wallet_transactions_user_id` | public.wallet_transactions | 0 | 8192 bytes |
| `idx_wallet_transactions_wallet_id` | public.wallet_transactions | 0 | 8192 bytes |
| `id_map_batch_idx` | wp_import.id_map | 0 | 8192 bytes |
| `wp_migration_log_applied_insert_idx` | wp_import.migration_log | 0 | 8192 bytes |
| `wp_migration_log_batch_idx` | wp_import.migration_log | 0 | 8192 bytes |
| `wp_migration_log_failed_idx` | wp_import.migration_log | 0 | 8192 bytes |
| `wp_order_items_order_idx` | wp_import.order_items | 0 | 8192 bytes |
| `wp_validation_reports_batch_idx` | wp_import.validation_reports | 0 | 8192 bytes |

## KEEP-EMPTY, the table has no rows yet (35)

A zero scan count on a zero row table measures the feature's launch date, not
the index. Re-read these once the tables carry data.

| index | table | rows | size |
| --- | --- | --- | --- |
| `abandoned_cart_sent_idx` | public.abandoned_cart_nudges | 0 | 16 kB |
| `idx_affiliates_code` | public.affiliates | 0 | 8192 bytes |
| `idx_affiliates_status` | public.affiliates | 0 | 8192 bytes |
| `discount_campaigns_active_idx` | public.discount_campaigns | 0 | 16 kB |
| `discount_campaigns_window_idx` | public.discount_campaigns | 0 | 16 kB |
| `idx_invoices_due` | public.invoices | 0 | 16 kB |
| `media_assets_base_path_idx` | public.media_assets | 0 | 8192 bytes |
| `popular_searches_order_idx` | public.popular_searches | 0 | 8192 bytes |
| `referral_signals_lookup_idx` | public.referral_signals | 0 | 16 kB |
| `idx_referrals_code` | public.referrals | 0 | 16 kB |
| `search_events_empty_idx` | public.search_events | 0 | 16 kB |
| `search_events_popular_idx` | public.search_events | 0 | 16 kB |
| `search_index_dlq_status_created_idx` | public.search_index_dlq | 0 | 8192 bytes |
| `seo_redirects_active_source_idx` | public.seo_redirects | 0 | 16 kB |
| `seo_redirects_wp_id_idx` | public.seo_redirects | 0 | 8192 bytes |
| `supplier_leads_status_idx` | public.supplier_leads | 0 | 8192 bytes |
| `voucher_redemptions_ip_idx` | public.voucher_redemptions | 0 | 8192 bytes |
| `idx_wallet_transactions_created_at` | public.wallet_transactions | 0 | 8192 bytes |
| `wp_customers_email_idx` | wp_import.customers | 0 | 8192 bytes |
| `wp_issues_severity_idx` | wp_import.issues | 0 | 8192 bytes |
| `wp_media_sha256_idx` | wp_import.media | 0 | 8192 bytes |
| `wp_media_status_idx` | wp_import.media | 0 | 8192 bytes |
| `wp_media_storage_path_idx` | wp_import.media | 0 | 8192 bytes |
| `wp_migration_log_entity_idx` | wp_import.migration_log | 0 | 8192 bytes |
| `wp_migration_log_external_idx` | wp_import.migration_log | 0 | 8192 bytes |
| `wp_order_items_product_idx` | wp_import.order_items | 0 | 8192 bytes |
| `wp_orders_customer_idx` | wp_import.orders | 0 | 8192 bytes |
| `wp_orders_email_idx` | wp_import.orders | 0 | 8192 bytes |
| `wp_orders_status_idx` | wp_import.orders | 0 | 8192 bytes |
| `wp_products_parent_idx` | wp_import.products | 0 | 8192 bytes |
| `wp_products_slug_idx` | wp_import.products | 0 | 8192 bytes |
| `wp_products_status_idx` | wp_import.products | 0 | 8192 bytes |
| `wp_url_inventory_undecided_idx` | wp_import.url_inventory | 0 | 8192 bytes |
| `wp_validation_reports_failed_idx` | wp_import.validation_reports | 0 | 8192 bytes |
| `wp_vouchers_open_idx` | wp_import.vouchers | 0 | 8192 bytes |

The whole `wp_import` schema is a staging area for the WordPress migration and
is empty. Its 17 indexes here are not a performance question at all; they go
when the schema does, and not one at a time.

## KEEP-SMALL, the table is too small for the planner to bother (20)

| index | table | rows | size |
| --- | --- | --- | --- |
| `idx_audit_log_action` | public.audit_log | 471 | 16 kB |
| `idx_audit_log_created_at` | public.audit_log | 471 | 16 kB |
| `idx_audit_log_entity` | public.audit_log | 471 | 56 kB |
| `idx_cashback_rules_active` | public.cashback_rules | 1 | 16 kB |
| `coupon_deals_status_idx` | public.coupon_deals | 8 | 16 kB |
| `coupon_deals_valid_idx` | public.coupon_deals | 8 | 16 kB |
| `idx_order_items_settlement_status` | public.order_items | 3 | 16 kB |
| `idx_orders_invoice_number` | public.orders | 4 | 16 kB |
| `payment_tokens_cardcom_account_idx` | public.payment_tokens | 2 | 8192 bytes |
| `idx_payments_low_profile` | public.payments | 2 | 16 kB |
| `payments_cardcom_account_idx` | public.payments | 2 | 8192 bytes |
| `idx_products_approval_pending` | public.products | 80 | 8192 bytes |
| `products_brand_idx` | public.products | 80 | 16 kB |
| `products_city_idx` | public.products | 80 | 8192 bytes |
| `products_is_featured_idx` | public.products | 80 | 16 kB |
| `products_offer_valid_until_idx` | public.products | 80 | 8192 bytes |
| `products_tags_gin` | public.products | 80 | 16 kB |
| `idx_profiles_affiliate_code` | public.profiles | 9 | 8192 bytes |
| `rate_limits_key_idx` | public.rate_limits | 10 | 16 kB |
| `vendors_status_idx` | public.vendors | 6 | 16 kB |

`products` is the one worth watching. Six of its indexes are unused at 80 rows,
which is expected, but `products` is also the table that will grow first and
the one on the storefront's hot path. Re-read this group before the catalogue
passes a few thousand rows, not after.

## What this costs today

The 88 surviving indexes total roughly 1 MB. The reason to revisit is write
amplification as the tables fill, not disk.

## Why this advisor's count went UP in the same wave

Re-reading the advisor after step 12, `unused_index` reports 131 where it
reported 90 at the start. That is arithmetic, not a regression: 90 less the 2
duplicates migration 122 dropped, plus the 44 foreign key indexes the same
migration created, less one that has since registered a scan.

Every one of those 44 is unused *by construction*. They were added because an
unindexed foreign key makes the parent's DELETE and key-UPDATE path scan the
child table sequentially, and that work is never counted in `idx_scan`. An
index whose entire job is on the write path will always read as unused to this
advisor. The two lints disagree by design, and step 12 is the one to believe:
`unindexed_foreign_keys` went 35 to 0.
