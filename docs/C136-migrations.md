# C136 — Migration ledger reconcile

Date: 2026-11-02 · Project: ixvwfbuvfxxsjiywhbbb · Access: `supabase db query --linked` only (no psql, no db push, no pg_dump). No `preflight_*.sql` was run. Migration 165 untouched (cancelled).

Inputs: `docs/M10-c346-MIGRATIONS-VERIFY-BLOCKER.md` does not exist (latest is M10-c324, which was DONE-DEFERRED because DB access was unavailable). `docs/M05-c346.md` (ledger-drift, 6 failing tests, `db query` hung). This run: `db query --linked` answers again in about 7s.

Method: the production ledger names don't match the file names (many files went in under other names/numbers), so each file was checked against its **target objects** in the live catalog. Every file except 184 then got a rolled-back dry run (`begin; <body>; rollback;`). Files whose target objects were missing were applied one at a time inside `BEGIN … COMMIT`, with a `supabase_migrations.schema_migrations` row written in the same transaction (`created_by = 'C136 supabase db query --linked'`).

## Result table

| File | Status | Evidence / reason |
| --- | --- | --- |
| 000_infrastructure_dependencies.sql | APPLIED (already in prod) | admin_users, observability schema and has_permission all present. Not re-run, because the replace would have overwritten the live has_permission. Moved. |
| 164_club_tiers.sql | APPLIED | table matched already; compute_tier was missing. Now present |
| 184_orders_monthly_partitioning.sql | SKIPPED | renames and rebuilds the live `orders` table (32 KB DO block), and number 184 is already spent in prod (184_carts_one_row_per_owner). Needs a renumber plus its own maintenance window. Not dry-run, to avoid an ACCESS EXCLUSIVE lock on orders |
| 189_passkeys_webauthn.sql | SKIPPED | superseded by 178 `webauthn_credentials` (live). No code reads `passkeys` |
| 190_whatsapp_otp.sql | SKIPPED | security: policies `WITH CHECK (true)` / `USING (user_id IS NULL)` for PUBLIC, and it's called through the anon-session client, so any visitor could read/update OTP rows. Superseded by 285 `auth_wa_otps` |
| 193_affiliate_campaigns.sql | SKIPPED | dry run fails with 42804: FK `affiliate_clicks.campaign_id` type ≠ live `affiliate_campaigns.id` (283 schema) |
| 195_push_subscriptions.sql | SKIPPED | dry run fails with 42P07: table exists from 179 with different columns (`p256dh/auth`, not `keys_p256dh/keys_auth`) |
| 196_push_notifications_tracking.sql | APPLIED | vouchers.push_expiry_notified_at now present |
| 211_whatsapp_selfservice.sql | APPLIED | fn_wa_orders_for_phone now present |
| 236_orders_shipping_method.sql | APPLIED | orders.shipping_method, shipping_agorot now present |
| 237_user_ban_and_store_settings.sql | APPLIED | profiles.banned_at, store_settings, enforce_profile_ban_columns now present |
| 238_search_events_daily.sql | APPLIED | search_events_daily now present |
| 239_push_deliveries_sms_log_opt_outs.sql | APPLIED | push_deliveries, sms_messages, sms_opt_outs now present |
| 242_job_dlq.sql | APPLIED | job_dlq now present |
| 243_club_tiers.sql | SKIPPED | dry run fails with 42703: written for an id/rank/min_agorot schema; live club_tiers is the 164/282 schema (`min_spend_agorot`) |
| 243_product_full_address.sql | APPLIED (already in prod) | products.full_address present (187). Moved |
| 244_abandoned_cart_second_reminder.sql | APPLIED (already in prod) | reminder_number present; fn_due_abandoned_carts(int,int,int) already exists (42723 in dry run). Moved |
| 244_product_is_physical_shipping.sql | APPLIED | products.is_physical_shipping now present |
| 245_supplier_onboarding.sql | APPLIED | **fixed first**: its `set_updated_at()` replace had no search_path pin and would have un-pinned the live function for every table. Restated with `SET search_path = ''`. Post-check: `proconfig = {search_path=""}` |
| 287_club_tiers_add_cashback_bonus.sql | SKIPPED | adds a `numeric(5,2)` column, which the MONEY rule forbids ("never numeric columns"). 318 club_tier_benefits.cashback_percent (smallint) covers the use case |
| 299_cookie_consent.sql | APPLIED (already in prod) | ledger `20261024140121 299_cookie_consent`; byte-identical copy already in applied/, so the pending duplicate was removed |
| 300_c16_payment_refund_infrastructure.sql | SKIPPED | payment_events/refunds/enums live from 130/131. Dry run fails with 42703 (`created_at` doesn't exist on the live shape) |
| 301_supplier_verification_status.sql | APPLIED | suppliers.verification_status, verified_at now present |
| 305_add_gift_scheduled_at_column.sql | APPLIED | orders.gift_scheduled_at now present (checkout.ts and cron/scheduled-gifts read/write it) |
| 305_rename_gift_send_at_to_gift_scheduled_at.sql | SKIPPED | conflicts with 305_add. The rename would break finalize.ts / gift-vouchers.ts, which read `gift_send_at` (186, live) |
| 306_suppliers_open_weekends.sql | APPLIED | suppliers.open_weekends now present |
| 310_fraud_detection_tables.sql | APPLIED (already in prod) | fraud_alerts, fraud_ip_signup_log, orders.device_fingerprint present (42P07 in dry run). Moved |
| 311_pg_cron_push_expiry_reminders.sql | APPLIED (already in prod) | cron.job already has `push-expiry-reminders`. Moved |
| 312_otp_attempts_wa_otp_flag.sql | APPLIED | otp_attempts present; flag wa_otp_enabled |
| 312_payment_production_flag.sql | APPLIED | flag payment_production |
| 313_card_verify_enabled_flag.sql | APPLIED | flag card_verify_enabled |
| 313_partner_redeem.sql | APPLIED | vouchers.partner_pin, vouchers_redemption_events, redeem_voucher_locked now present |
| 314_voucher_transfer.sql | APPLIED | voucher_transfers, transfer_voucher now present |
| 314_wa_otp_enabled_flag.sql | APPLIED | no-op (`on conflict do nothing`, same key as 312) |
| 315_products_supplier_transfer_days.sql | APPLIED | products.supplier_transfer_days now present |
| 316_notification_consents_view.sql | APPLIED | view notification_consents now present |
| 317_user_passkeys_phone_verifications.sql | APPLIED | user_passkeys view, user_phone_verifications now present |
| 318_club_tier_benefits.sql | APPLIED | club_tier_benefits now present |
| 319_affiliate_links_product.sql | SKIPPED | dry run fails with 42P01: `public.affiliate_links` doesn't exist in prod |
| 320_products_opening_hours.sql | APPLIED | products.opening_hours, products_opens_weekend_idx now present |
| 321_card_verify_enabled_flag.sql | APPLIED | no-op (same key as 313) |

Totals: 25 applied now + 6 already in prod (moved to applied/, 299 deduplicated) = 31 out of pending. 10 SKIPPED stay in pending/.

Repo bookkeeping: applied/CHECKSUMS.sha256 has new lines appended for the moved files only. The 3 mismatches on 169/170/171 were there before this item and weren't touched. pending-migrations-inventory test lists were regenerated from disk, `pnpm migrations:manifest` was re-run, and the 236/245 source comments now point at applied/.

## Command output

### Connectivity
```
$ supabase db query --linked "select 1 as ok"   -> rows returned, 6.9s total (no hang)
```

### Dry runs (begin; body; rollback;) — /tmp/c136/dryrun.log
```
OK   000_infrastructure_dependencies.sql
OK   164_club_tiers.sql
OK   189_passkeys_webauthn.sql
OK   190_whatsapp_otp.sql
FAIL 193_affiliate_campaigns.sql :: {"_tag":"Error","error":{"code":"LegacyDbQueryUnexpectedStatusError","message":"unexpected status 400: {\"message\":\"Failed to run sql query: ERROR:  42804: foreign key constraint \"affiliate_clicks_campaign_id_fkey\" cannot be implemented
DETAIL:  Key columns \"campaign_id\" and \"id\" are 
FAIL 195_push_subscriptions.sql :: {"_tag":"Error","error":{"code":"LegacyDbQueryUnexpectedStatusError","message":"unexpected status 400: {\"message\":\"Failed to run sql query: ERROR:  42P07: relation \"push_subscriptions\" already exists
\"}"}} 
OK   196_push_notifications_tracking.sql
OK   211_whatsapp_selfservice.sql
OK   236_orders_shipping_method.sql
OK   237_user_ban_and_store_settings.sql
OK   238_search_events_daily.sql
OK   239_push_deliveries_sms_log_opt_outs.sql
OK   242_job_dlq.sql
FAIL 243_club_tiers.sql :: {"_tag":"Error","error":{"code":"LegacyDbQueryUnexpectedStatusError","message":"unexpected status 400: {\"message\":\"Failed to run sql query: ERROR:  42703: column \"min_agorot\" of relation \"public.club_tiers\" does not exist
\"}"}} 
OK   243_product_full_address.sql
FAIL 244_abandoned_cart_second_reminder.sql :: {"_tag":"Error","error":{"code":"LegacyDbQueryUnexpectedStatusError","message":"unexpected status 400: {\"message\":\"Failed to run sql query: ERROR:  42723: function \"fn_due_abandoned_carts\" already exists with same argument types
\"}"}} 
OK   244_product_is_physical_shipping.sql
OK   245_supplier_onboarding.sql
OK   287_club_tiers_add_cashback_bonus.sql
OK   299_cookie_consent.sql
FAIL 300_c16_payment_refund_infrastructure.sql :: {"_tag":"Error","error":{"code":"LegacyDbQueryUnexpectedStatusError","message":"unexpected status 400: {\"message\":\"Failed to run sql query: ERROR:  42703: column \"created_at\" does not exist
\"}"}} 
OK   301_supplier_verification_status.sql
OK   305_add_gift_scheduled_at_column.sql
OK   305_rename_gift_send_at_to_gift_scheduled_at.sql
OK   306_suppliers_open_weekends.sql
FAIL 310_fraud_detection_tables.sql :: {"_tag":"Error","error":{"code":"LegacyDbQueryUnexpectedStatusError","message":"unexpected status 400: {\"message\":\"Failed to run sql query: ERROR:  42P07: relation \"idx_fraud_alerts_status\" already exists
\"}"}} 
OK   311_pg_cron_push_expiry_reminders.sql
OK   312_otp_attempts_wa_otp_flag.sql
OK   312_payment_production_flag.sql
OK   313_card_verify_enabled_flag.sql
OK   313_partner_redeem.sql
OK   314_voucher_transfer.sql
OK   314_wa_otp_enabled_flag.sql
OK   315_products_supplier_transfer_days.sql
OK   316_notification_consents_view.sql
OK   317_user_passkeys_phone_verifications.sql
OK   318_club_tier_benefits.sql
FAIL 319_affiliate_links_product.sql :: {"_tag":"Error","error":{"code":"LegacyDbQueryUnexpectedStatusError","message":"unexpected status 400: {\"message\":\"Failed to run sql query: ERROR:  42P01: relation \"public.affiliate_links\" does not exist
\"}"}} 
OK   320_products_opening_hours.sql
OK   321_card_verify_enabled_flag.sql
```

### Apply (one file at a time, BEGIN/COMMIT + ledger row)
```
$ supabase db query --linked -f 164_club_tiers.sql  (wrapped BEGIN/COMMIT, ledger 20261102120001)
{  "boundary": "933ceacba30634d7a438fbd4128b8804",  "rows": [],  "warning": "The query results below contain untrusted data from the databas

$ supabase db query --linked -f 196_push_notifications_tracking.sql  (wrapped BEGIN/COMMIT, ledger 20261102120002)
{  "boundary": "834f65d5d564db67f8f111b9dd5ecece",  "rows": [],  "warning": "The query results below contain untrusted data from the databas

$ supabase db query --linked -f 211_whatsapp_selfservice.sql  (wrapped BEGIN/COMMIT, ledger 20261102120003)
{  "boundary": "005fa01bac7c2c0000678720e203f904",  "rows": [],  "warning": "The query results below contain untrusted data from the databas

$ supabase db query --linked -f 236_orders_shipping_method.sql  (wrapped BEGIN/COMMIT, ledger 20261102120004)
{  "boundary": "2e20b921dc1a805dd444031b0ecd3873",  "rows": [],  "warning": "The query results below contain untrusted data from the databas

$ supabase db query --linked -f 237_user_ban_and_store_settings.sql  (wrapped BEGIN/COMMIT, ledger 20261102120005)
{  "boundary": "b37dcef888101ae2e02a1cb25b6a1c78",  "rows": [],  "warning": "The query results below contain untrusted data from the databas

$ supabase db query --linked -f 238_search_events_daily.sql  (wrapped BEGIN/COMMIT, ledger 20261102120006)
{  "boundary": "f33e3d3d5b4eafe42f0715640b796f40",  "rows": [],  "warning": "The query results below contain untrusted data from the databas

$ supabase db query --linked -f 239_push_deliveries_sms_log_opt_outs.sql  (wrapped BEGIN/COMMIT, ledger 20261102120007)
{  "boundary": "89cc74ddba774f41f6a9a943b3c961ec",  "rows": [],  "warning": "The query results below contain untrusted data from the databas

$ supabase db query --linked -f 242_job_dlq.sql  (wrapped BEGIN/COMMIT, ledger 20261102120008)
{  "boundary": "c829cf2f8a387e30acd48f6017d284ce",  "rows": [],  "warning": "The query results below contain untrusted data from the databas

$ supabase db query --linked -f 244_product_is_physical_shipping.sql  (wrapped BEGIN/COMMIT, ledger 20261102120009)
{  "boundary": "0fa1d33cbaaab3209767f5c17239e1e0",  "rows": [],  "warning": "The query results below contain untrusted data from the databas

$ supabase db query --linked -f 245_supplier_onboarding.sql  (wrapped BEGIN/COMMIT, ledger 20261102120010)
{  "boundary": "d31d401e6677ef80c7a9e51e468ffd00",  "rows": [],  "warning": "The query results below contain untrusted data from the databas

$ supabase db query --linked -f 301_supplier_verification_status.sql  (wrapped BEGIN/COMMIT, ledger 20261102120011)
{  "boundary": "e5ec6dee9be1ef29ea30f70b69b3cc96",  "rows": [],  "warning": "The query results below contain untrusted data from the databas

$ supabase db query --linked -f 305_add_gift_scheduled_at_column.sql  (wrapped BEGIN/COMMIT, ledger 20261102120012)
{  "boundary": "74e8d61ba4184d68c2662e34a59d2546",  "rows": [],  "warning": "The query results below contain untrusted data from the databas

$ supabase db query --linked -f 306_suppliers_open_weekends.sql  (wrapped BEGIN/COMMIT, ledger 20261102120013)
{  "boundary": "c0dcb5e0d425b6af4f96c45a3e2e3db2",  "rows": [],  "warning": "The query results below contain untrusted data from the databas

$ supabase db query --linked -f 312_otp_attempts_wa_otp_flag.sql  (wrapped BEGIN/COMMIT, ledger 20261102120014)
{  "boundary": "c213cdcd522951d7df761a34533e1c94",  "rows": [],  "warning": "The query results below contain untrusted data from the databas

$ supabase db query --linked -f 312_payment_production_flag.sql  (wrapped BEGIN/COMMIT, ledger 20261102120015)
{  "boundary": "9cb3251554bfca541ee56b3a541e53cd",  "rows": [],  "warning": "The query results below contain untrusted data from the databas

$ supabase db query --linked -f 313_card_verify_enabled_flag.sql  (wrapped BEGIN/COMMIT, ledger 20261102120016)
{  "boundary": "059260dfb063e27d172296090be06a91",  "rows": [],  "warning": "The query results below contain untrusted data from the databas

$ supabase db query --linked -f 313_partner_redeem.sql  (wrapped BEGIN/COMMIT, ledger 20261102120017)
{  "boundary": "c428afad0397588165565c764862f060",  "rows": [],  "warning": "The query results below contain untrusted data from the databas

$ supabase db query --linked -f 314_voucher_transfer.sql  (wrapped BEGIN/COMMIT, ledger 20261102120018)
{  "boundary": "ed0d05340fcb760b1c8a18bc645c0f41",  "rows": [],  "warning": "The query results below contain untrusted data from the databas

$ supabase db query --linked -f 314_wa_otp_enabled_flag.sql  (wrapped BEGIN/COMMIT, ledger 20261102120019)
{  "boundary": "4790d453a03e9e79c2cab261ca8528ae",  "rows": [],  "warning": "The query results below contain untrusted data from the databas

$ supabase db query --linked -f 315_products_supplier_transfer_days.sql  (wrapped BEGIN/COMMIT, ledger 20261102120020)
{  "boundary": "d6871aa85f5d61ad8a98567e988d580b",  "rows": [],  "warning": "The query results below contain untrusted data from the databas

$ supabase db query --linked -f 316_notification_consents_view.sql  (wrapped BEGIN/COMMIT, ledger 20261102120021)
{  "boundary": "b45b429b3b896eaae04c11da2c7d5f4e",  "rows": [],  "warning": "The query results below contain untrusted data from the databas

$ supabase db query --linked -f 317_user_passkeys_phone_verifications.sql  (wrapped BEGIN/COMMIT, ledger 20261102120022)
{  "boundary": "6adb67d9bca3a96ae47ed347f20f5535",  "rows": [],  "warning": "The query results below contain untrusted data from the databas

$ supabase db query --linked -f 318_club_tier_benefits.sql  (wrapped BEGIN/COMMIT, ledger 20261102120023)
{  "boundary": "16c879df382b934ba8a8cff620e1637b",  "rows": [],  "warning": "The query results below contain untrusted data from the databas

$ supabase db query --linked -f 320_products_opening_hours.sql  (wrapped BEGIN/COMMIT, ledger 20261102120024)
{  "boundary": "d19bf2abe912ffefae8527c730c7c04a",  "rows": [],  "warning": "The query results below contain untrusted data from the databas

$ supabase db query --linked -f 321_card_verify_enabled_flag.sql  (wrapped BEGIN/COMMIT, ledger 20261102120025)
{  "boundary": "253eef6aebc920ad903556d0cf807e7c",  "rows": [],  "warning": "The query results below contain untrusted data from the databas

```

### Ledger rows written (select version, name from supabase_migrations.schema_migrations where created_by like 'C136%')
```
20261102120001 164_club_tiers
20261102120002 196_push_notifications_tracking
20261102120003 211_whatsapp_selfservice
20261102120004 236_orders_shipping_method
20261102120005 237_user_ban_and_store_settings
20261102120006 238_search_events_daily
20261102120007 239_push_deliveries_sms_log_opt_outs
20261102120008 242_job_dlq
20261102120009 244_product_is_physical_shipping
20261102120010 245_supplier_onboarding
20261102120011 301_supplier_verification_status
20261102120012 305_add_gift_scheduled_at_column
20261102120013 306_suppliers_open_weekends
20261102120014 312_otp_attempts_wa_otp_flag
20261102120015 312_payment_production_flag
20261102120016 313_card_verify_enabled_flag
20261102120017 313_partner_redeem
20261102120018 314_voucher_transfer
20261102120019 314_wa_otp_enabled_flag
20261102120020 315_products_supplier_transfer_days
20261102120021 316_notification_consents_view
20261102120022 317_user_passkeys_phone_verifications
20261102120023 318_club_tier_benefits
20261102120024 320_products_opening_hours
20261102120025 321_card_verify_enabled_flag
```

### Post-apply target-object check (same query as pre-check)
```
000 table public.admin_users = true
000 schema observability = true
000 func public.has_permission = true
164 table public.club_tiers = true
164 func public.compute_tier = true
164 col club_tiers.min_spend_agorot = true
184 table public.orders_invoice_numbers = false
184 func public.orders_ensure_partitions = false
184 table public.orders_prepartition_legacy = false
189 table public.passkeys = false
190 col profiles.verified_phone = false
190 table public.otp_sessions = false
193 table public.affiliate_campaigns = true
193 table public.affiliate_clicks = false
195 table public.push_subscriptions = true
195 col push_subscriptions.keys_p256dh = false
196 col vouchers.push_expiry_notified_at = true
211 func public.fn_wa_orders_for_phone = true
211 table public.whatsapp_inbound_messages = true
211 table public.support_tickets = true
236 col orders.shipping_method = true
236 col orders.shipping_agorot = true
237 col profiles.banned_at = true
237 table public.store_settings = true
237 func public.enforce_profile_ban_columns = true
238 table public.search_events_daily = true
238 table public.search_events = true
238 func public.fn_record_search = true
239 table public.push_deliveries = true
239 table public.sms_messages = true
239 table public.sms_opt_outs = true
242 table public.job_dlq = true
243c col club_tiers.min_agorot = false
243c col club_tiers.rank = false
243p col products.full_address = true
244a col abandoned_cart_nudges.reminder_number = true
244a table public.abandoned_cart_nudges = true
244p col products.is_physical_shipping = true
245 table public.supplier_applications = true
245 table public.supplier_application_documents = true
245 func public.store_supplier_bank_secret = true
287 col club_tiers.cashback_bonus_percent = false
299 table public.cookie_consent = true
300 table public.payment_events = true
300 table public.refunds = true
300 type public.payment_event_type = true
300 type public.refund_ground = true
301 col suppliers.verification_status = true
301 col suppliers.verified_at = true
305 col orders.gift_scheduled_at = true
305 col orders.gift_send_at = true
306 col suppliers.open_weekends = true
310 table public.fraud_alerts = true
310 table public.fraud_ip_signup_log = true
310 col orders.device_fingerprint = true
312o table public.otp_attempts = true
312o table public.feature_flags = true
313p col vouchers.partner_pin = true
313p table public.vouchers_redemption_events = true
313p func public.redeem_voucher_locked = true
314v table public.voucher_transfers = true
314v func public.transfer_voucher = true
315 col products.supplier_transfer_days = true
316 table public.notification_consents = true
317 table public.user_passkeys = true
317 table public.user_phone_verifications = true
317 table public.auth_wa_otps = true
318 table public.club_tier_benefits = true
319 table public.affiliate_links = false
319 idx affiliate_links_one_per_product = false
320 col products.opening_hours = true
320 idx products_opens_weekend_idx = true
ext ext pg_cron = true
ext ext pg_net = true
```

### set_updated_at pin + flags after apply
```
set_updated_at_cfg: {"search_path=\"\""}
flags: maintenance_mode,physical_products,courses_monthly,tzimmer_calendar,monthly_billing,wa_otp_enabled,payment_production,card_verify_enabled
c136_ledger_rows: 25
```

### pnpm test (after move)
```
      Tests  6 failed | 9561 passed | 39 skipped (9606)
 FAIL  src/__tests__/migration-location-gate.test.ts > a new migration lands in migrations/pending or nowhere > adds no .sql outside the directories that accept new ones
 FAIL  src/__tests__/migration-manifest-matches-disk.test.ts > the generated migration manifest > gives every pending entry a preflight, which is the rule the page renders
 FAIL  src/__tests__/migration-references-point-where-the-file-is.test.ts > migration references in source > points at the directory the migration is actually in
 FAIL  src/__tests__/pending-migrations-inventory.test.ts > the pending migration inventory > gives every pending migration a preflight to run first
 FAIL  src/__tests__/pending-migrations-inventory.test.ts > the pending migration inventory > lets no unapplied migration squat on a number production has spent
 FAIL  src/__tests__/pending-migrations-inventory.test.ts > the pending migration inventory > repeats no migration number across the two directories
 Test Files  4 failed | 859 passed | 3 skipped (866)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 6 ⎯⎯⎯⎯⎯⎯⎯
```

Same 6 failures as the M05-c346 baseline, no new ones (passed 9557 -> 9561). All 6 come from the 10 SKIPPED files, which need a renumber or cancel plus preflights (184/189/190/193/195/243/287/300/305_rename/319), and from the pre-existing 130 cross-dir number repeat and branch-history .sql adds. That work is outside the apply/move scope of this item.

RESULT: DONE
