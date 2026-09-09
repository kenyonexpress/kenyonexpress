# Schema Reality Check

**Table and column names that appear in this documentation set but do not exist
in production**, and what production actually has instead.

Measured against `ixvwfbuvfxxsjiywhbbb` on **2026-09-01** through MCP. The
documentation side was measured by scanning every `.md` file under `docs/` and
`.claude/` for backticked identifiers and diffing them against
`information_schema`.

> **Why this document exists.** The repository and the production database are
> different lineages. Many documents here are *designs* that were written,
> reviewed, and never built. They are not worthless: several are the best
> statement of intent this project has. But a reader cannot tell, from inside
> one of those documents, whether the table it describes is something they can
> query today. This file is that lookup.
>
> Before writing a query, a migration, or a code review comment against any
> table name you found in a document, check it here.

**Headline: 31 distinct table names, appearing 248 times across 42 documents,
do not exist in production.** Counting `(document, phantom name)` pairs rather
than raw occurrences gives 160.

---

## 1. How to read the verdict column

| Verdict | Meaning |
|---|---|
| **RENAMED** | The concept is live; the document uses the wrong name. Substitute. |
| **NEVER BUILT** | Designed, never applied. There is no data and no migration. |
| **WRONG SCHEMA** | It exists, but not in `public`. Qualify the name. |
| **NOT A TABLE** | It is an env var, a jsonb column, or a file. |

---

## 2. The mapping

### 2.1 Renamed: the concept is live under a different name

| In the docs | Refs | In production | Note |
|---|---|---|---|
| `notifications_outbox` | 19 | **`notification_outbox`** | Singular `notification`. A plain typo, and the most mechanical fix in this table. |
| `coupon_redemptions` | 29 | **`voucher_redemptions`** | The scan log moved from the coupon model to the voucher model. Column names differ too: see §3. |
| `coupon_scan_events` | 18 | **`voucher_redemptions`** | Same table as above. Two different document lineages invented two names for one thing. |
| `admin_audit_log` | 6 | **`audit_log`** | No `admin_` prefix. One table covers all actors; `actor_role` distinguishes them. |
| `audit_events` | 6 | **`audit_log`** | Same. |
| `notification_events` | 8 | **`notification_outbox`** | There is no separate event table; the outbox row carries its own status, `attempts`, `last_error` and `next_attempt_at`. |
| `notification_delivery_events` | 8 | **`notification_outbox`** | Same. Delivery state is columns on the outbox row, not rows in a child table. |
| `notification_log` | 2 | **`notification_outbox`** | Same. |
| `order_escrow_holds` | 2 | **`escrow_holds`** | No `order_` prefix, and see the escrow warning in §4. |

### 2.2 Never built: designed, never applied

| In the docs | Refs | Reality |
|---|---|---|
| `supplier_payouts` | 28 | **No payout table exists and never has in this lineage.** The `payout_status` and `payout_line_type` enums exist in production with nothing behind them. See §4. |
| `payout_statements` | 20 | Never built. Part of the same payout design. |
| `payout_statement_lines` | 9 | Never built. |
| `supplier_payout_items` | 9 | Never built. |
| `consent_events` | 20 | Never built. Cookie and marketing consent has no dedicated table in production. |
| `supplier_bank_accounts` | 15 | Never built. There is no bank detail storage in production, which is consistent with there being no payouts. |
| `security_events` | 12 | Never built. Security-relevant events land in `audit_log` and `payment_events`. |
| `analytics_events` | 8 | Never built. `search_events` is an **aggregate** (`term`, `searches`, `empty_results`, `last_hits`), not a per-event log. There is no event stream table. |
| `ledger_entries` | 2 | Never built. The double-entry ledger design in `LEDGER-DESIGN.md` was not applied. `wallet_entries` is the closest live thing and is a different model. |
| `ledger_accounts` | 1 | Never built. |
| `ledger_journal_lines` | 1 | Never built. |
| `settlement_batches` | 1 | Never built. `settlement_events` is live and is per-event, not batched. |
| `settlement_items` | 1 | Never built. |
| `channel_suppressions` | 2 | Never built. `email_suppressions` is live and is email-only. |
| `wishlist_items` | 3 | Never built. There is no wishlist in production. |
| `order_addresses` | 1 | Never built. `orders.address_id` points at `user_addresses`. |
| `capi_events` | 4 | Never built. Meta CAPI is configured by env var, with no table behind it. |
| `il_postal_codes` | 3 | Never built. Postal code handling is `src/lib/checkout/israeli-postal-code.ts`, in code. |

### 2.3 Wrong schema: real, but not in `public`

The `wp_import` schema holds **14 tables** for the WordPress migration and is
easy to miss because a bare `list_tables` on `public` does not show it.

| In the docs | Refs | Actually |
|---|---|---|
| `migration_log` | 4 | **`wp_import.migration_log`** |
| `import_batches` | 1 | **`wp_import.import_batches`** |

The rest of `wp_import`: `categories`, `coupons`, `customers`, `id_map`,
`issues`, `media`, `order_items`, `orders`, `products`, `url_inventory`,
`validation_reports`, `vouchers`, `wp_category_map`, `wp_product_map`,
`wp_redirect_map`, plus five `v_*` views.

Note that `wp_import.orders`, `wp_import.products` and `wp_import.vouchers`
**shadow the names of `public` tables**. An unqualified reference in a document
is ambiguous, and a `SET search_path` mistake would make it dangerous.

### 2.4 Not a table at all

| In the docs | Refs | What it actually is |
|---|---|---|
| `cart_items` | 11 | **`carts.items`, a `jsonb` column.** There is no cart line table. `carts` is 7 columns: `id`, `profile_id`, `session_id`, `items`, `expires_at`, `created_at`, `updated_at`. Any document showing a join to `cart_items` is showing a query that cannot run. |
| `cardcom_accounts` | 3 | **The `CARDCOM_ACCOUNTS` environment variable**, read by `src/lib/payments/accounts.ts`. Multi-account routing is config, not data. |

---

## 3. Column names that moved with the table

When substituting `voucher_redemptions` for `coupon_redemptions` or
`coupon_scan_events`, the columns are not the same. Production:

```
voucher_redemptions
  id, voucher_id, code_entered, supplier_id, scanned_by, scan_method,
  outcome (voucher_scan_outcome), idempotency_key, amount_collected_agorot,
  metadata, created_at, ip_address, user_agent, staff_id
```

Two differences that break a copied query:

- The result column is **`outcome`**, typed `voucher_scan_outcome`, not a
  boolean `success` and not a text `result`. Its eleven values are `success`,
  `already_redeemed`, `expired`, `cancelled`, `refunded`, `wrong_supplier`,
  `not_found`, `invalid_signature`, `invalid_request`, `unauthorized`,
  `rate_limited`.
- The foreign key is **`voucher_id`**, not `coupon_code_id`.

`coupon_codes` does still exist, holding **2 rows** from the pre-voucher model,
with its own shape (`face_value_ils`, `platform_paid_ils`,
`collect_amount_ils`, `qr_token`, `status coupon_status`). It is not the same
table as `vouchers` and the two must not be conflated.

For the money-column generation problem, which is a larger and separate trap,
see `docs/ARCHITECTURE-OVERVIEW.md` §8 and the list of phantom `_agorot`
columns there. In short: production is the **`ils` generation** with
`_ils_agorot` generated twins, and `orders.subtotal_agorot`,
`orders.total_agorot`, `orders.customer_pays_now_agorot`,
`orders.cashback_applied_agorot`, `orders.wallet_applied_agorot`,
`order_items.unit_price_agorot`, `order_items.total_price_agorot`,
`payments.wallet_applied_agorot` and `vouchers.platform_bp` **do not exist**.

---

## 4. The two designs most worth knowing were never built

### There is no payout system

`supplier_payouts`, `payout_statements`, `payout_statement_lines`,
`supplier_payout_items` and `supplier_bank_accounts` account for **81 of the 248
phantom references**, roughly a third of this entire document. They describe a
supplier settlement ledger with bank details, statements and payout lines.

None of it exists, and on the current business model **none of it is needed**:
on the coupon path the platform owes the supplier nothing. The customer's
prepayment stays with the platform permanently, and the supplier collects the
balance in cash at the counter. There is no money to pay out and therefore no
payout to record.

The `payout_status` (`draft, pending_approval, approved, paid, cancelled`) and
`payout_line_type` (`physical_delivery, coupon_redemption, adjustment`) enums
survive in production as evidence of the design. Enums with no tables behind
them are the archaeological trace of a system that was specified and then made
unnecessary by a business decision.

If the physical product path goes live, this design becomes relevant again, and
`settlement_events` is the live table that would carry it.

### There is no escrow

`escrow_holds` **does** exist, so it will not appear in the phantom list above,
but it holds **2 legacy rows and no code writes it**. The `settlement_status`
enum still carries `escrow_held` and `escrow_released`, and those are **dead
labels that nothing can write**: `SettlementState` in
`src/server/domain/orders/state-machine.ts` deliberately refuses them.

Any document describing money being held for a supplier and released on
redemption is describing the model abandoned on 2026-07-24 and removed by
migration 125. See `docs/PAYMENT-FLOW.md` §5.

---

## 5. Documents with the highest phantom density

Measured, not estimated: **42 documents** carry at least one phantom name, and
there are **160 distinct `(document, phantom name)` pairs**.

This is not a criticism of these files. They are the design documents, so they
are where designs live. Read them as intent, not as schema.

| Document | Distinct phantom tables |
|---|---|
| `MIGRATION-BACKLOG.md` | 13 |
| `MASTER-ARCHITECTURE.md` | 11 |
| `ARCHITECTURE-LEGAL-COMPLIANCE.md` | 11 |
| `DB-DRIFT-AUDIT.md` | 9 |
| `ARCHITECTURE-SUPPLIER-PORTAL.md` | 7 |
| `ARCHITECTURE-API-CONTRACTS.md` | 7 |
| `ARCHITECTURE-NOTIFICATIONS-MARKETING.md` | 5 |
| `ARCHITECTURE-MASTER-CHECKOUT-REDEMPTION.md` | 5 |
| `ARCHITECTURE-ADMIN-DASHBOARD.md` | 5 |
| `ARCHITECTURE-SUPPLIER-REDEMPTION.md` | 4 |
| `ARCHITECTURE-SECURITY-COMPLIANCE.md` | 4 |

Two of these are special cases where the phantom names are the subject matter
rather than an error: `DB-DRIFT-AUDIT.md` is *about* the drift, and
`MIGRATION-BACKLOG.md` catalogues migrations that were never applied, so it
necessarily names the tables they would have created.

## 6. Reproducing this check

The production side:

```sql
select table_schema, table_name
from information_schema.tables
where table_schema in ('public','wp_import')
order by table_schema, table_name;
```

The documentation side, from the repository root:

```bash
grep -rhoE '`[a-z][a-z0-9_]{4,40}`' docs/ .claude/ --include='*.md' \
  | tr -d '`' | sort -u > /tmp/doc-idents.txt
# then diff against the query above
```

Re-run both after any migration. A name that moves from this document into
production is progress; a new name appearing here is a design being written
against a schema that does not exist yet, which is fine as long as the document
says so.

---

## 7. Related

| Question | Document |
|---|---|
| What production actually is | `docs/ARCHITECTURE-OVERVIEW.md` |
| Which migrations are applied | `docs/ARCHITECTURE-OVERVIEW.md` §8 |
| Money columns and generations | `docs/ARCHITECTURE-OVERVIEW.md` §3.2, §8 |
| Live enum sets | `docs/PAYMENT-FLOW.md` §2 |
| Grants and RLS counts | `docs/DB-SECURITY-MODEL.md` |
| The drift itself | `docs/DB-DRIFT-AUDIT.md` |
