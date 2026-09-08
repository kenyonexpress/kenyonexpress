# Schema Validation

Read-only validation of every file in `migrations/pending/` (19 migrations,
3 preflights, 3559 lines, read in full) against the six schema rules of the
brief, cross-checked against the **live** schema of `ixvwfbuvfxxsjiywhbbb`
(constraints and columns read from `pg_constraint` / `information_schema` on
2026-09-08 18:51 UTC).

Legend: PASS = the rule holds. PASS* = holds with a note. FAIL = violated.
N/A = the file touches nothing the rule governs.

---

## 1. Summary

| Rule | Result | Where it is enforced |
|---|---|---|
| No hardcoded platform percentages | **PASS*** | no migration hardcodes a commission or split percent; 177 hardcodes two cashback bonus rates (1000 bp / 500 bp) as a deliberate business rule, see 2.1 |
| All money as integer agorot | **PASS*** | every new money column is `bigint`/`integer` `*_agorot`; the only `numeric` touches are boundary conversions into `fn_wallet_transfer(p_amount_ils)` and out of pre-059 `total_ils` |
| No escrow on vouchers | **PASS** | no pending migration writes `escrow_holds`, `escrow_held_agorot` or a transition into `escrow_held`; live guard `fn_order_items_settlement_status_guard` has no inbound edge to escrow states |
| `platform_percent` dynamic per product | **PASS** | no migration adds a default or a global; live: `products.platform_percent` has no default, 0 of 45 active products lack it, 0 of 3 order_items lack the snapshot |
| All FK constraints present | **PASS*** | every reference in the new tables is a declared FK except three deliberate bare uuids (documented), plus one **ordering hazard** between 177 and 148 |
| CHECK constraints for physical split % | **PASS** | live: `products_split_pair_sums_to_100`, `order_items_split_pair_sums_to_100`, `settlement_events_split_pair_sums_to_100`, plus 0..100 range checks on every percent column |

---

## 2. Rule by rule

### 2.1 No hardcoded percentages

| File | Percent literals found | Verdict |
|---|---|---|
| 148, 149, 162, 169 (both), 170 (both), 171 (both), 172 (both), 173, 178, 179, 180, 181, 182, 183 | none | PASS |
| 177_cashback_ledger | `v_bp := 1000` (first purchase 10%), `v_bp := 500` (every fifth purchase 5%), `percent_bp <= 10000` range check | **PASS*** : these are the cashback bonus rules the file exists to define ("decided here in SQL and nowhere else", header). They are not commission or split percentages and they are stored per ledger row (`percent_bp`), so a later change does not rewrite history. They are still literals inside a function body, so changing the rate is a migration, not a setting. Acceptable; noted. |

Live check: `products.platform_percent` default = NULL, `order_items.platform_percent` default = NULL. No column carrying a percent has a non-null default other than `products.cashback_percent = 0` and `products.profit_share_cap_percent = 0`, both "off" values.

### 2.2 Money as integer agorot

| File | Money columns / arithmetic | Verdict |
|---|---|---|
| 170_reporting | `gross_agorot`, `discount_agorot`, `cashback_applied_agorot`, `net_agorot`, `revenue_agorot` all `bigint`; sources are the generated `*_ils_agorot` twins | PASS |
| 173_whatsapp | `v_total_agorot bigint := coalesce((row->>'total_agorot')::bigint, round((row->>'total_ils')::numeric * 100)::bigint, 0)` | PASS* : numeric appears only to read the pre-059 shekel column and is rounded once into bigint |
| 177_cashback | `amount_agorot bigint`, `basis_agorot bigint`, integer half-up `(v_basis * v_bp + 5000) / 10000`; `fn_wallet_transfer(... (v_amount::numeric / 100) ...)` | PASS* : the `/ 100` is the documented boundary of `fn_wallet_transfer`'s `p_amount_ils` contract (089); an integer divided by 100 is exact at two decimals |
| 182_coupon_qr | no money columns ("introduces no new amounts") | N/A |
| 148, 149, 162, 169, 171, 172, 178, 179, 180, 181, 183 | none | N/A |

Live check: every `*_agorot` column in `products`, `order_items`, `orders`, `payments`, `vouchers`, `escrow_holds`, `settlement_events`, `split_executions` is `bigint` or `integer`; each carries a non-negative CHECK (167 applied). No `double precision` or `real` money column exists.

### 2.3 No escrow on vouchers

Rule (BUSINESS-RULES §3, BUSINESS-MODEL §1a): the whole on-site coupon payment is platform revenue at charge time; no hold, no release, no supplier payout on the coupon path.

| Check | Result |
|---|---|
| Any pending migration inserting into `escrow_holds` | none |
| Any pending migration adding a transition into `escrow_held` / `escrow_released` | none (148 recreates the existing guard trigger verbatim) |
| Live `fn_order_items_settlement_status_guard` inbound edges to escrow states | none (only outbound, for the 2 legacy rows) |
| Live `escrow_holds` rows | 2, both `status = held`, `created_at 2026-07-21`, `voucher_id NULL`, from E2E fixture orders before the 2026-07-24 cutover; no writer in `src/` (only readers: finalize, settlement-report, supplier queries, expire-vouchers) |
| Live `order_items` in `escrow_held` | 2 (the same fixtures), `supplier_immediate_agorot = 0` |

**PASS.** The two legacy rows are a known residue (PAYMENT-FLOW §5). They are not vouchers (0 vouchers exist) and nothing can create a third.

### 2.4 `platform_percent` dynamic per product

| Check | Result |
|---|---|
| Any pending migration adding `DEFAULT` to `platform_percent` | none |
| Any pending migration reading `platform_percent` from `products` at settlement time instead of the `order_items` snapshot | none (170 reads only `order_items.total_price_ils_agorot`; 177 reads the order total) |
| Live `product_platform_percent(uuid)` | exists, SECURITY DEFINER, no anon/authenticated grant |
| Live active products with NULL `platform_percent` | 0 / 45 |
| Live `order_items` with NULL `platform_percent` snapshot | 0 / 3 |
| Live `settlement_events.platform_percent_snapshot` + `supplier_split_percent_snapshot` | present, with pair-sum CHECK |

**PASS.**

### 2.5 FK constraints present

| File | References declared | Bare uuids (no FK) | Verdict |
|---|---|---|---|
| 148 | 16 composite FKs re-pointed to `orders(id, created_at)` with original names and ON DELETE semantics; `orders_user_id_fkey`, `orders_address_id_fkey`; registry `orders_invoice_numbers.order_id` bare | `orders_invoice_numbers.order_id` (deliberate: the registry must outlive a cross-partition move) | PASS* |
| 173 | `whatsapp_contacts.user_id`, `support_tickets.user_id` -> `auth.users`; `support_ticket_messages.ticket_id` -> `support_tickets` CASCADE | `whatsapp_inbound_messages.ticket_id`, `whatsapp_outbox.phone` (text key, not a FK to contacts) | PASS* : `ticket_id` on the inbound log should reference `support_tickets(id) ON DELETE SET NULL`; noted as a recommendation |
| 177 | `user_id`, `created_by` -> `profiles`; `order_id` -> `orders(id)`; `wallet_entry_id` -> `wallet_entries` | none | **PASS with ORDERING HAZARD**: `REFERENCES public.orders(id)` requires a unique constraint on `orders.id` alone. After 148 the primary key is `(id, created_at)` and that FK **cannot be created**. Apply 177 before 148, and add `cashback_ledger` to 148's 16-table loop; or give 177 a twin column now. 182 avoided exactly this by leaving `redeemed_order_id` bare. |
| 178, 179 | `user_id` -> `auth.users` CASCADE | none | PASS |
| 182 | `campaign_id` -> `discount_campaigns` RESTRICT (both tables), `batch_id` -> `coupon_qr_batches` RESTRICT, `created_by` -> `profiles` SET NULL | `coupon_qr_codes.redeemed_order_id` (deliberate, header explains 148) | PASS* |
| 149, 162, 169, 170, 171, 172, 180, 181, 183 | no new relations | N/A |

Live: 119 FKs in `public`, 16 of them to `orders` (matches 148's list exactly).

### 2.6 CHECK constraints for the physical split

Live constraints (all present, none pending):

```
products_split_pair_sums_to_100          platform_percent + supplier_split_percent = 100  (NULL-tolerant)
products_platform_percent_check          0..100
products_supplier_split_percent_range    0..100
products_commission_type_matches_type    coupon <-> coupon_absolute, else physical_percent
order_items_split_pair_sums_to_100       same pair rule on the snapshot
order_items_commission_percent_snapshot_range  0..100
order_items_money_conservation           face = paid_on_site + balance_due      (167)
split_executions_conservation            face_value = commission + supplier
settlement_events_split_pair_sums_to_100 snapshot pair = 100
settlement_events_percent_range          both snapshots 0..100
subscription_charges_split_is_exact      platform_fee + supplier_due = amount
vouchers_conservation                    face = coupon_price + remaining_due
vouchers_platform_percent_range          0..100
```

**PASS.** No pending migration weakens any of these. 148 copies them onto the partitioned parent with `INCLUDING CONSTRAINTS`.

---

## 3. Findings outside the six rules, found while reading

1. **`set_updated_at` is redefined without `search_path` in 173, 178, 179** (and was in 182, which is applied and is the root cause of the live advisor WARN). Each apply will unpin the function again.
2. **`183` narrows a live CHECK.** The live `notification_outbox_kind_check` already contains `order_shipped` **and `account_deleted`** (widened by the GDPR account-deletion work). 183 does `DROP CONSTRAINT` then `ADD CONSTRAINT` with a list that lacks `account_deleted`; applying it as written removes that kind and fails outright if any queued row carries it. Only 183's trigger half is still needed.
3. **`169_analytics_server_event_names.sql` and `180_analytics_server_event_names.sql` are byte-equivalent in effect** (same function body, same 12-name list). One must go.
4. **`173` grants nothing but revokes nothing either:** `fn_enqueue_whatsapp` is SECURITY DEFINER with the default `PUBLIC` EXECUTE, so `anon`/`authenticated` can call it via RPC. Consent gating limits the blast radius to opted-in phones, but the function should carry `REVOKE ALL ... FROM PUBLIC, anon, authenticated` like 177 and 183 do.
5. **`148` recreates only three triggers on `orders`.** The live table now also carries `audit_orders` (169, applied) and, after their applies, `tg_orders_whatsapp_status` (173) and `trg_orders_notify_shipped` (183). All of them are lost by the table swap unless 148 is updated to recreate them. 148's own header already warns about `audit_orders`.
6. **`162` names vault secrets that do not exist.** Vault holds `CRON_SECRET` and `APP_BASE_URL`; 162 guards on `cron_secret` and `app_url`. Either rename the vault rows or the file. 162 also schedules `ke-retention` and `ke-weekly-digest`, which are not in `scripts/cron-jobs.json`, and omits `whatsapp`, which is. The inventory test pins `cron-jobs.json` as the single source of truth.
