# KenyonExpress: Architecture Overview

**One document, the whole system.** Written for someone who has never opened this
repository. Everything below was verified against the live Supabase project
`ixvwfbuvfxxsjiywhbbb` on **2026-09-01** through MCP, or read out of the source
files it names. Where a document elsewhere in `docs/` disagrees with this one,
this one is right and that one is stale.

---

## 0. What the product is

KenyonExpress is an Israeli marketplace, Hebrew and RTL throughout, that sells
two kinds of thing from the same catalogue and the same cart:

| | **Coupon** (`product_type = 'coupon'`) | **Physical** (`product_type = 'physical'`) |
|---|---|---|
| What the shopper buys | A voucher redeemable at a named business | Goods, shipped |
| Paid on this site | `products.coupon_price_ils`, an **absolute** admin-set amount | 100% of the price |
| Paid at the business | The remaining balance (`face − coupon_price`), in cash at the counter | Nothing |
| Platform keeps | **All** of the online prepayment | `platform_percent` of the charge |
| Supplier receives from us | **Nothing** | The residual, immediately |
| Escrow | **None.** See §3.5 | **None** |

Two further product types exist in the enum, `service` and `recurring`.
`recurring` is backed by the `subscriptions` / `subscription_charges` tables
(migration 135) and by `/account/subscriptions`; `service` has schema support
but no distinct money path; it settles like `physical`.

The single fact that most often gets written down wrong: **the coupon
prepayment is an absolute shekel amount, never a percentage.** A product whose
`coupon_price_ils` is missing cannot be sold, only described
(`src/lib/commerce/coupon-offer.ts`). There is no default anywhere and no
fallback percentage; a mispriced product fails loudly at checkout rather than
selling at an invented split.

---

## 1. Stack and repository layout

| Layer | Choice |
|---|---|
| Framework | Next.js **16.2.12**, App Router, React 19.2.4 |
| Language | TypeScript, strict |
| Database | Supabase Postgres, project `ixvwfbuvfxxsjiywhbbb` |
| Payments | Cardcom, legacy `/Interface/*.aspx` API |
| Search | Postgres `ILIKE` today; Meilisearch when configured (§6) |
| Queue | Upstash QStash, optional; degrades to inline execution |
| Rate limiting | Upstash Redis when configured, else Postgres `check_rate_limit` |
| Errors | Sentry (`@sentry/nextjs`), EU region |
| Hosting | Vercel, region `fra1` |
| Package manager | **pnpm 11.1.2 only.** `npm install` cannot work here (see `AGENTS.md`) |
| Lint/format | Biome | 
| Tests | Vitest (unit), Playwright (E2E) |

**Next.js 16 note.** `middleware.ts` no longer exists. The edge entry point is
`src/proxy.ts`, and the exported function must be named `proxy`. Anything in
this repo's history that says "middleware" means that file.

```
src/
  proxy.ts                  edge entry: redirects, session refresh, route guards
  instrumentation.ts        boot-time env validation (src/lib/env.ts)
  app/
    (store)/                storefront: product, category, cart, checkout, search
    (account)/account/      addresses coupons details orders referrals
                            subscriptions tokens vouchers wallet
    (admin)/admin/          21 sections, see §5.3
    (supplier)/supplier/    orders payouts products redemptions scan
    (auth)/ (legal)/ (main)/ (marketing)/
    api/
      cron/                 ten scheduled jobs, see §7.3
      payments/cardcom/webhook/   Cardcom IndicatorUrl callback
      webhooks/products/    Supabase DB webhook -> search index
      search/ admin/ app/ cart/ wallet/ supplier/ health/
  lib/
    money.ts                canonical money math, the ONLY money module
    commerce/               money.ts commission.ts coupon-offer.ts product-money.ts
    payments/               cardcom.ts env.ts accounts.ts token-expiry.ts
    search/                 indexer.ts qstash.ts meili-settings.ts
                            pipeline-contracts.ts hebrew-synonyms.ts
    supabase/               anon.ts server.ts admin.ts bearer.ts public.ts
  server/
    actions/                server actions (payments/checkout.ts, payments/refund.ts, admin/)
    payments/finalize.ts    the ONLY writer of the transition to paid
    domain/orders/          settlement.ts state-machine.ts
    domain/vouchers/        issue.ts code.ts qr.ts state-machine.ts redemption.ts
supabase/migrations/        115 files, 001–129. Does NOT describe production;
                            production's own ledger holds 99. See §8.
migrations/pending/         23 .sql files, ALL of them applied to production,
                            several under other names. Nothing here is
                            outstanding. See §8.1.
apps/mobile/                second RPC caller, a till app. Any grants audit
                            that greps only src/ will miss it.
refs/ke_live_singlefile.html   the pixel reference the UI is compared against
```

---

## 2. Data model

Every number in this table was read out of production on 2026-09-01. The queries
that produce them are in §11, so any of these can be re-checked in seconds
rather than argued about.

| Measure | Production |
|---|---|
| Migrations applied | **99** |
| Base tables in `public` | **61** |
| Tables with RLS **disabled** | **0** |
| RLS policies | **133** |
| Views (all `security_invoker`) | **12** |
| Functions / of which `SECURITY DEFINER` | **72 / 61** |
| `SECURITY DEFINER` functions with an unpinned `search_path` | **0** |
| EXECUTE grants to `anon` | **6** |
| Columns named `*_agorot` | **78** |
| Of those, `GENERATED ALWAYS ... STORED` | **26** |
| Non-internal triggers | **56** |

All eight tables from the 2026-08/09 wave are live: `payment_events`, `refunds`,
`search_index_outbox`, `supplier_branches`, `subscriptions`,
`subscription_charges`, `homepage_sections`, `banners`.

**Three of the counts moved on 2026-09-01 and the reason is one migration.**
Applying 137 added three functions (`fn_orders_status_guard`,
`fn_order_items_settlement_status_guard`, `fn_payments_status_guard`) and the
three triggers that call them, which is why functions went 69 → 72 and
non-internal triggers 53 → 56. None of the three is `SECURITY DEFINER`, so that
count is unchanged at 61.

### 2.1 Core commerce

```
profiles ──┬── orders ── order_items ──┬── vouchers
           │      │                    └── settlement_events
           │      ├── payments ── payment_events
           │      └── refunds
           ├── wallet_accounts ── wallet_entries
           ├── wallet_transactions / wallet_balances
           └── user_addresses, carts, referrals, subscriptions

suppliers ──┬── supplier_members (owner|manager|scanner)
            ├── supplier_branches
            ├── supplier_staff (PIN, for the till app)
            └── products ── product_variants, product_images
                     └── categories
```

`order_items` is the money row. It carries a **snapshot** of everything the
settlement later depends on, so nothing is joined back to a live product:
`platform_percent`, `face_value_agorot`, `paid_on_site_agorot`,
`balance_due_agorot`, `commission_agorot`, `supplier_immediate_agorot`,
`cashback_amount_agorot`, plus supplier identity by value. A supplier that is
renamed after a sale does not rename the sale.

### 2.2 Live enums

Copied from production. Note the values that documentation elsewhere routinely
omits.

| Enum | Values |
|---|---|
| `order_status` | `pending, paid, partially_fulfilled, fulfilled, cancelled, refunded, platform_settled` |
| `settlement_status` (`order_items`) | `pending, paid, split_executed, escrow_held, escrow_released, redeemed, refunded, cancelled, platform_settled` |
| `payment_status` | `initiated, redirected, succeeded, failed, refunded, platform_settled` |
| `voucher_status` | `issued, redeemed, expired, cancelled, refunded` |
| `product_type` | `coupon, physical, service, recurring` |
| `product_status` | `draft, active, paused, sold_out, archived` |
| `user_role` | `customer, content_uploader, vendor, admin, super_admin, support` |
| `supplier_member_role` | `owner, manager, scanner` |
| `commission_type` | `coupon_absolute, physical_percent` |
| `refund_state` | `requested, approved, rejected, executing, completed, failed` |
| `refund_ground` | `distance_sale_14d, defect, service_not_provided, duplicate_charge, extended_window, goodwill` |
| `payment_event_type` | 38 values, from `checkout_started` through `reconciliation_amount_differs` |

`escrow_held` and `escrow_released` are **dead values kept for history**. Nothing
in the code can write them: `SettlementState` in
`src/server/domain/orders/state-machine.ts` deliberately does not admit them, so
a value the type refuses is a row this code can never produce. They remain in
Postgres because you do not drop an enum value from a production database over a
rule change. `platform_settled` survives only in the redemption **read** path
(`REDEEMABLE_SETTLEMENT_STATUSES`), which has to keep recognising rows written
before the rule changed.

### 2.3 Tables added by the 2026-08/09 wave

| Table | What it is |
|---|---|
| `payment_events` | Append-only journal of the payment lifecycle. A trigger (`payment_events_append_only`) refuses UPDATE and DELETE. 38-value `payment_event_type`. |
| `refunds` | The refund workflow: `requested_agorot`, `granted_agorot`, `cancellation_fee_agorot`, `ground`, `state`. Four CHECK constraints encode Israeli consumer law (§3.6). |
| `search_index_outbox` | Durable "this product owes a reindex" record, written in the same transaction as the product change. The webhook stays the fast path; this is the floor under it. `product_id` is deliberately **not** a foreign key: a deleted product still owes a delete job. |
| `supplier_branches` | Multiple physical locations per supplier. |
| `subscriptions`, `subscription_charges` | Recurring products. `subscription_charges_split_is_exact` enforces `platform_fee + supplier_due = amount`. |
| `homepage_sections`, `banners` | Homepage CMS, read through `v_homepage_sections_live` and `v_banners_live`. Both empty in production today. |

### 2.4 Vestigial tables

`escrow_holds` still exists and holds **2 legacy rows**. No code writes it. It is
a fossil of the pre-2026-07-24 model, kept for the same reason the enum values
are. `coupon_codes` (2 rows) is the pre-voucher consumption model; the
`settlement_status = 'redeemed'` terminal state exists to keep recognising those
rows.

The enums `payout_status` and `payout_line_type` exist with **no tables behind
them**. There is no `supplier_payouts` table in production and never has been in
this lineage. Documents that describe a payout ledger are describing a design
that was not built. The coupon model owes suppliers nothing, so there is
nothing to pay out.

### 2.5 Data volumes (2026-09-01, pre-launch)

products 80 · categories 12 · suppliers 12 · profiles 10 · orders 4 ·
order_items 3 · payments 2 · coupon_codes 2 · escrow_holds 2 ·
vouchers 0 · payment_events 0 · refunds 0 · subscriptions 0 ·
supplier_branches 0 · homepage_sections 0 · banners 0 · search_index_outbox 0

---

## 3. Money

### 3.1 The rule

**Money is an integer number of agorot. 1 ₪ = 100 agorot. No float ever touches
a money value.** Every calculation goes through `src/lib/money.ts`, which
re-exports the branded primitives from `src/lib/commerce/money.ts`.

```ts
type Agorot = number & { readonly [agorotBrand]: 'Agorot' }   // branded
type Bp     = number & { readonly [bpBrand]: 'Bp' }           // basis points
const BP_WHOLE = 10_000        // 100%
const VAT_RATE_BP = 1800       // 18%, since 2025-01-01
```

Rates are integer **basis points**, not percentages: 10% is `1000`, not `0.1`.

Rounding is integer half-up, done without division:

```ts
divRoundHalfUp(n, d) = sign * floor((2*|n| + d) / (2*d))
applyBp(amount, points) = divRoundHalfUp(amount * points, 10_000)
```

Every constructor asserts `Number.isSafeInteger`, including intermediates, so a
value that would silently lose precision throws instead.

VAT is extracted from a gross, VAT-inclusive amount, and the VAT half is
computed by **subtraction** so `net + vat === gross` exactly, with no rounding
leak:

```ts
net = divRoundHalfUp(gross * 10_000, 10_000 + vatRateBp)
vat = gross - net
```

The platform books VAT only on its own commission.

### 3.2 The `_agorot` columns

Production carries **78 columns named `*_agorot`**. Of those, **26 are
`GENERATED ALWAYS ... STORED`** twins of a legacy `numeric` column:

```sql
(round((price_ils * 100::numeric)))::bigint
```

They exist so the multiplication stops happening in JavaScript. Application code
reads the generated twin; it does not compute one. The remaining 52 are ordinary
integer columns written directly by the money path.

**Signedness is not uniform, and the exceptions are deliberate.** Nineteen of
the 26 generated columns carry a non-negative CHECK. Seven do not, because they
must be able to go negative:

- `profiles.wallet_balance_agorot`
- `wallet_accounts.balance_ils_agorot`
- `wallet_balances.balance_ils_agorot`
- `wallet_entries.amount_ils_agorot`
- `wallet_transactions.amount_ils_agorot`
- `wallet_transactions.gross_amount_ils_agorot`
- `product_variants.price_modifier_agorot`

A wallet ledger entry has a sign; a variant price modifier can subtract. Adding a
`>= 0` check to any of these would break the ledger.

> Measured note: the brief for this document said twenty-seven generated
> `_agorot` columns. The live count is **26**. The query behind that number:
> `information_schema.columns` where `is_generated = 'ALWAYS'` and
> `column_name LIKE '%\_agorot'`, restricted to `BASE TABLE`. Two further
> generated columns exist on `coupon_deals` (`discount_percentage`,
> `platform_price`) but are not agorot columns.

### 3.3 Conservation invariants, enforced in the database

These are CHECK constraints, not conventions:

```sql
vouchers_conservation        face_value = coupon_price + remaining_amount_due
split_executions_conservation face_value = commission + supplier
escrow_holds_conservation     held       = commission + release     -- legacy
invoices_amounts_add_up       net + vat  = total
subscription_charges_split_is_exact  platform_fee + supplier_due = amount
```

### 3.4 The engine

`src/lib/commerce/commission.ts` computes a cart. Per line:

```
faceValue           = unitPrice × quantity
customerPaysNow     = coupon  ? couponPriceUnit × quantity : faceValue
balanceDueAtBusiness= coupon  ? faceValue − customerPaysNow : 0
platformFee         = coupon  ? customerPaysNow : applyBp(faceValue, platformPercentBp)
supplierImmediate   = coupon  ? 0 : faceValue − platformFee
supplierDue         = supplierImmediate
cashbackAmount      = applyBp(customerPaysNow, cashbackPercentBp)
```

Four properties worth naming:

1. **`platformPercent` is mandatory on both product types.** There is no default
   anywhere. A coupon line does not use it to divide anything (the platform
   keeps the whole prepayment), but it stays required so the catalogue invariant
   holds one way for every product.
2. **The supplier residual is `face − fee`, not a second percentage applied to
   the same base.** Applying the mirror percent twice is how two halves come to
   disagree by an agora.
3. **Cashback is snapshotted, not credited.** Lifecycle handlers credit it after
   redemption or shipment.
4. **Wallet is a payment source, nothing more.** It reduces `cardCharge` only;
   it never mutates line settlement, commission, supplier due, or the cashback
   snapshot. `walletApplied > customerPaysNow` throws.

A coupon line reports `platformPercentBps = 10_000` downstream, because that is
the split that actually happened. Reporting the product's configured percent
would describe a division that did not occur, and this value is what gets
snapshotted onto `order_items`.

### 3.5 There is no escrow

The authoritative business rule, settled 2026-07-24: the customer pays the
absolute coupon price on the site, **all of it stays with the platform
permanently**, and the supplier collects the balance in cash at the counter when
the voucher is scanned. No coupon money is ever held for a supplier and none is
ever paid out to one.

Consequently the coupon and physical happy paths are the **same two moves**:

```
pending ──PAYMENT_CONFIRMED──> paid ──EXECUTE_SPLIT──> split_executed
```

A coupon line simply splits 100/0. There is no state between `paid` and settled
because nothing is deferred. Failure paths: `pending → cancelled`;
`paid | split_executed → refunded`.

`src/server/payments/finalize.ts` is the **only** writer of the transition to
`paid`.

### 3.6 Refunds

`src/server/actions/payments/refund.ts`. A card refund is legal only while
**every** voucher on the line is still `issued`. Once one voucher is `redeemed`
or `expired` the value was consumed at the business and the platform cannot
un-consume it; a goodwill refund after that point is a wallet credit, which is a
different money movement and does not touch the voucher row.

Israeli consumer law is encoded in CHECK constraints on `refunds`:

```sql
refunds_fee_within_statutory_cap
  cancellation_fee_agorot <= LEAST((requested_agorot + 19) / 20, 10000)
  -- 5% of the transaction or ₪100, whichever is lower

refunds_no_fee_when_our_fault
  ground NOT IN ('defect','duplicate_charge') OR cancellation_fee_agorot = 0

refunds_completed_has_money
  state <> 'completed' OR (granted_agorot IS NOT NULL AND completed_at IS NOT NULL)
```

---

## 4. Coupon lifecycle, end to end

```
 1  Admin publishes a product: product_type='coupon', price_ils (sticker),
    coupon_price_ils (absolute online charge), platform_percent, optional
    offer_valid_until and coupon_expiry_days.

 2  Storefront derives the offer once, in lib/commerce/coupon-offer.ts, so the
    product page, the card and the tests all read the same numbers. A product
    without coupon_price_ils renders as { sellable: false, reason:
    'missing-price' } rather than guessing.

 3  beginCheckout (server/actions/payments/checkout.ts):
      - validates the cart server-side; the client contributes ids and consent,
        never prices
      - reserves stock via reserve_order_stock(order, ttl): 15 minutes, shorter
        than ORDER_EXPIRY_MINUTES on purpose
      - snapshots money and supplier identity onto order_items
      - opens a Cardcom Low Profile page, returned as a `frame` to be mounted in
        an iframe on the checkout page.
    A saved-card token charge skips all of that: it is server-to-server, and the
    charge response IS the outcome.

 4  Cardcom calls back to /api/payments/cardcom/webhook.
      - Cardcom does NOT sign its callbacks. There is no HMAC header.
      - Authenticity rests on an unguessable secret in the callback URL (?s=),
        compared in constant time against BOTH the current and the retiring
        secret, with no short circuit. Bailing on the first match would let
        response time say which secret was presented.
      - The POST body is NEVER trusted for money. GetLpResult is re-fetched
        server-to-server and that response is the only trusted source of
        amount, status and token.
      - Every event is journalled first; dedup is on
        (provider, external_event_id); a replay is a 200 no-op.

 5  finalizeOrder (server/payments/finalize.ts), the single writer of `paid`:
      - moves order_items to split_executed (coupon: 100/0)
      - issues ONE voucher per purchased unit, keyed on order_item_id and capped
        at quantity, so a webhook replay is a no-op and not a second live
        voucher
      - splits line-level agorot per unit, first unit absorbing the remainder
      - writes settlement_events, enqueues the invoice, sends the voucher email,
        completes any referral

 6  The shopper sees the voucher at /account/vouchers or /coupon/[id]: a signed
    QR (server/domain/vouchers/qr.ts) plus the code.

 7  Redemption at the business. The supplier scans, through the portal
    (/supplier/scan) or the till app in apps/mobile, which calls the
    redeem_voucher RPC. Guards, from vouchers/state-machine.ts and mirrored in
    SQL as the arbiter under concurrency:
      - legal only from `issued`
      - only for the voucher's OWN supplier      -> WRONG_SUPPLIER
      - only before expiry                        -> PAST_EXPIRY
    The customer hands over the balance in cash. That money never passes
    through the platform's clearing account.

 8  Every non-issued voucher state is terminal. Once a voucher leaves `issued`
    there is nothing left to move: the value was consumed at the business, or
    the money went back to the customer.

 9  Expiry: the expire-vouchers cron calls expire_vouchers(), and
    credit_expired_vouchers() handles the goodwill credit.
    enqueue_expiring_voucher_notices(buckets) warns beforehand.
```

---

## 5. Roles, authentication and RLS

### 5.1 The three database roles

| Role | What it can do |
|---|---|
| `anon` | SELECT on 62 relations, gated by RLS. INSERT/UPDATE/DELETE on exactly **one** table: `carts` (guest carts). |
| `authenticated` | SELECT on 64, DML on 56. The 8 server-only tables were revoked (§8). |
| `service_role` | Full DML on all 73 relations. Bypasses RLS. Used only from `src/lib/supabase/admin.ts`, server-side. |

Client code uses the anon key with the user's session; anything that must cross
a user boundary goes through the admin client on the server, never in a
component.

### 5.2 Application roles

`user_role`: `customer, content_uploader, vendor, admin, super_admin, support`.
Role is authoritative in `profiles.role`, **not** in `app_metadata`, which can be
stale. `enforce_profile_privilege_columns` is a trigger that stops a user
changing their own role.

Supplier membership is separate from `user_role` and lives in
`supplier_members` with its own enum: `owner, manager, scanner`.

### 5.3 Route guarding

`src/proxy.ts`, in this order. The order is load-bearing:

1. `/monitoring` (the Sentry tunnel) forwards **first**, before anything that
   costs a network round trip. It carries no session and it is posted to by a
   page that may already be broken.
2. Legacy WordPress redirects, on GET/HEAD only, **before** the session refresh.
   Googlebot re-crawling retired paths should not cost thousands of token
   refreshes. A 301 on a POST is a request whose body the browser may or may not
   resend, and a redirected payment callback is a payment nobody hears about.
   A `410` is returned where the decision was "gone", not "missing".
3. `supabase.auth.getUser()`, required for cookie rotation.
4. Auth gates: `/account/*`, `/coupon/*`, `/supplier/*` (except `/supplier/login`
   and `/supplier/access-denied`), and `/checkout/*` **sub-routes only**.
5. `/admin/*` additionally requires `profiles.role ∈ {admin, super_admin,
   content_uploader, support}`. This is an optimistic check; every page re-gates
   per section and every server action re-checks its own guard.

Two deliberate exclusions that keep getting re-broken:

- **`/checkout` itself is not gated.** It takes guests. Sign-in happens on the
  pay press, and `/auth/callback` merges the guest cart into the account.
- **`/checkout/frame-return` must not be gated.** Cardcom navigates the payment
  iframe there, that navigation is cross-site, and browsers withhold
  `SameSite=Lax` cookies on it. Requiring a session there shows a login form
  inside the payment box of a shopper who has just paid.

Admin sections: affiliates, analytics, approvals, audit-log, categories, coupons,
dashboard, discounts, growth, orders, payments, payouts, products, queues,
referrals, reports, search, status, suppliers, users, vendors.

### 5.4 RLS shape

133 policies. The recurring pattern for an owner-scoped table:

```sql
-- orders_select_unified
is_admin()
OR (deleted_at IS NULL
    AND status IN ('paid','partially_fulfilled','fulfilled')
    AND is_supplier_order(id))
OR (is_support() AND deleted_at IS NULL)
OR user_id = (SELECT auth.uid())
```

`auth.uid()` is wrapped in a scalar subquery on purpose: it turns a per-row call
into an InitPlan evaluated once.

The public read predicate for the catalogue is one expression, and the search
indexer uses the same one so the index and RLS cannot disagree:

```sql
status = 'active' AND deleted_at IS NULL
```

**Helper functions are `SECURITY DEFINER` and their execute grants are the real
access surface**, not the policies. Production carries 69 functions, 61 of them
`SECURITY DEFINER`, and **all 61 pin `search_path`**, zero unpinned, which
closes the search-path hijack class outright.

`anon` holds exactly **six** EXECUTE grants, and the split between them matters:

| Grant | Callable as an RPC? |
|---|---|
| `is_admin()` | yes, and it is: RLS policies call it under the anon role |
| `is_supplier_member(uuid)` | yes, same reason |
| `fn_record_recent_search(text)` | yes, deliberately, so a guest's recent searches work |
| `enqueue_search_index()` | no: a trigger function |
| `payment_events_append_only()` | no: a trigger function |
| `refunds_force_due_by()` | no: a trigger function |

The last three carry Postgres's default public EXECUTE grant on a trigger
function. They take no useful arguments and return `trigger`, so calling them
over PostgREST achieves nothing, but an audit that counts grants rather than
reachable surface will report six and should say why three of them are inert.
`check_rate_limit` was narrowed to `service_role` only by
`127_revoke_check_rate_limit_execute`; before that an anonymous caller chose
both the rate-limit key and the threshold.

> Known trap, worth stating because a flat audit gets it wrong twice:
> (a) server-action guards sit **two hops in**, behind `withActionContext`
> wrappers. Grepping for a guard call at the top of each action reports almost
> none and is wrong; (b) `apps/mobile` is a second RPC caller, so any grants
> audit scoped to `src/` under-counts.

### 5.5 Deny-all tables

Eight tables carry RLS with no permissive policy for any client role, which
denies every client unconditionally: `legacy_percent_archive_112`,
`payment_webhook_events`, `rate_limits`, `referral_signals`, `search_index_dlq`,
`settlement_events`, `stock_reservations`, `user_rate_limits`. Migration 122
made the deny explicit and 144 revoked the underlying table grants, so adding a
read policy later cannot silently hand out INSERT/UPDATE/DELETE as well.
`search_index_outbox` (from 132) is server-only in the same way.

---

## 6. Search

Two engines behind one interface, chosen at runtime by whether
`MEILISEARCH_HOST` and `MEILISEARCH_API_KEY` are set. Both paths return the same
`ProductCard` shape and the outcome names its engine
(`src/lib/search-server.ts`):

```ts
type SearchOutcome = { results: Product[]; total: number; engine: 'meilisearch' | 'database' }
```

**Stage 1 (today): Postgres `ILIKE`** through the Supabase client, terms
sanitised by `sanitizeOrTerm`.

**Stage 3: Meilisearch.** `type` is a filterable attribute, so the coupon /
physical facet is applied in the engine and `estimatedTotalHits` stays truthful
rather than being filtered after the fact.

### 6.1 The indexing pipeline

```
products row change
   │
   ├─(fast path)  Supabase Database Webhook
   │                 -> /api/webhooks/products
   │                 -> QStash publish
   │                 -> /api/search/index-job   (worker)
   │
   └─(floor)      AFTER trigger enqueue_search_index()
                     -> search_index_outbox row, SAME transaction
                     -> claim_search_index_jobs(limit) drains it
```

Four design rules, each of which is load-bearing:

1. **The webhook payload is a notification, never data.** The worker re-reads
   the product row from Postgres before touching the index, the same philosophy
   as the Cardcom callback. Out-of-order and duplicate deliveries therefore
   converge on the truth, and a spoofed payload can at worst schedule a no-op.
2. **The job is tiny**: `{ op, productId, reason, enqueuedAt }`. Everything else
   is re-read at run time.
3. **`search_index_outbox.product_id` is not a foreign key.** A DELETE of the
   product must leave the "remove this document" instruction behind; `ON DELETE
   CASCADE` would delete exactly the row carrying the work.
4. **Failure is loud.** `runSearchIndexJob` throws on any Meilisearch or database
   error so the worker answers non-2xx and QStash retries with backoff
   (`QSTASH_RETRIES = 5`), then POSTs to `/api/search/index-dlq` and parks a
   second copy in Upstash's own DLQ. Deletes are idempotent: a 404 on DELETE is
   success.

When Meilisearch is unconfigured every job is a **successful no-op**, so the
pipeline stays wired and silent until `MEILISEARCH_HOST` appears. When QStash is
unconfigured, `enqueue` degrades to inline execution, so the pipeline works end
to end in dev without Upstash. QStash deliveries carry an `Upstash-Signature`
JWS signed with one of two rotating HMAC keys, verified by
`verifyQstashSignature`.

### 6.2 Search intelligence

`search_events`, `popular_searches`, `user_recent_searches` (migration 118).
`fn_record_search(term, hits)` is `service_role`; `fn_record_recent_search(term)`
is reachable by `anon` and `authenticated` so a guest's recent searches work.
Hebrew synonyms live in `src/lib/search/hebrew-synonyms.ts`.

---

## 7. Deployment topology

```
        Browser (he-IL, RTL)
              │
        Vercel · fra1 · Next.js 16
        ┌─────┴──────────────────────────┐
        │ src/proxy.ts (edge)            │
        │ RSC + server actions           │
        │ /api/* route handlers          │
        └─────┬───────────┬──────────┬───┘
              │           │          │
     Supabase Postgres  Cardcom   Sentry (EU)
     ixvwfbuvfxxsjiywhbbb  legacy
     + Auth + Storage    /Interface/*.aspx
              │
     optional: Meilisearch · Upstash QStash · Upstash Redis
              │
     external scheduler ──> /api/cron/* (ten jobs, Bearer CRON_SECRET)
```

- **Repo**: `git@github.com:kenyonexpress/kenyonexpress.git`. The working branch
  is `main`, which is also the GitHub default and the target of every push.
- **`vercel.json`** sets framework `nextjs`, install `pnpm install
  --no-frozen-lockfile`, build `pnpm build`, output `.next`, region `fra1`. It
  declares **no `crons` key**. See §7.3.
- **DNS is not switched over.** Pointing the domain is a manual step Ofir
  approves; nothing in this repo should run it.
- The Vercel CLI is reachable locally but **there is no project link and no
  token**, so any instruction here of the form "run `vercel deploy`" cannot be
  followed from this checkout.

### 7.1 Environment

`src/lib/env.ts` validates at boot from `instrumentation.ts` `register()`, which
Next calls before the server accepts a request. The alternative,
`loadCardcomEnv()` throwing at request time, means a deploy with a missing
secret builds, goes green, and fails on the first customer who tries to pay.

Required in production: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD`,
`CARDCOM_WEBHOOK_SECRET`, `VOUCHER_QR_SECRET`, `CRON_SECRET`,
`NEXT_PUBLIC_APP_URL`.

Optional, each degrading rather than failing: `UPSTASH_REDIS_REST_URL` +
`_TOKEN` (falls back to Postgres `check_rate_limit`), `MEILISEARCH_HOST` +
`_API_KEY` (falls back to `ILIKE`), `QSTASH_TOKEN` (falls back to inline),
`SENTRY_DSN`.

`ALLOW_INCOMPLETE_ENV` exists because **`next start` on a laptop is also
`NODE_ENV=production`**, and that is how Lighthouse and the whole Playwright suite
are measured, against the real build rather than dev. Without the escape hatch,
boot validation refuses to start that server.

> Environment auditing takes three grep patterns, not one. A `process.env` sweep
> found 96 of 129 references; the rest read `env.X` off a `ProcessEnv` passed
> into `loadCardcomEnv` and its siblings.

### 7.2 Local development

```bash
pnpm install                    # NEVER npm, see AGENTS.md
pnpm dev
pnpm test                       # vitest
pnpm type-check                 # tsc --noEmit
pnpm lint                       # biome
pnpm build                      # a SEPARATE gate: cacheComponents rejects
                                # uncached page reads that the three above pass
```

E2E and the pixel gate must run against a **built** server, not `next dev`:

```bash
PORT=3311 pnpm start &
LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=home
```

The pixel comparison against `refs/ke_live_singlefile.html` must stay **under
11%**.

Two traps that cost real time: a bare `playwright test` reuses a stale dev
server and fabricates cart failures; and browsing `127.0.0.1` against a server
started on `localhost` silently blocks Next 16 server actions on an origin
check, so probes must use `localhost`.

### 7.3 Scheduled jobs

Ten routes under `src/app/api/cron/`: `abandoned-cart`, `expire-vouchers`,
`health`, `invoices`, `notifications`, `reap-carts`, `reconcile`, `stock`,
`stranded-payments`, `subscriptions`. All ten are `GET` and all ten require
`Authorization: Bearer <CRON_SECRET>`, with no default and no fallback: a
missing secret means every route answers 401.

**No scheduler is running.** They were removed from `vercel.json` deliberately:
Vercel's cron allowance is a plan feature, and on Hobby it is two jobs at daily
granularity. This project needs ten, four of them at five- or ten-minute
intervals. Declaring all ten anyway does not fail the build and does not warn:
the platform runs the ones the plan covers and silently ignores the rest, which
is how a payment reconciler comes to be believed to be running when it is not.

Three of the ten are on the money path (`invoices`, `reconcile`,
`stranded-payments`) and `notifications` is the only thing that ever sends a
customer their voucher email. Two candidate schedulers are written down and
neither is switched on: `.github/workflows/cron.yml` needs `CRON_SECRET` in
Actions secrets (`gh secret list` returns nothing) plus an enabling variable, and
cron-job.org needs a person in a browser. Details in `docs/CRON-EXTERNAL.md`.

> A scheduled GitHub workflow only fires from the default branch. A `cron:`
> workflow committed to a feature branch never runs, and `gh workflow run`
> answers 404 for it.

---

## 8. Migrations

**`db push` is forbidden.** A schema change is written as a file in
`migrations/pending/` and waits for explicit approval; applying to production
goes through MCP `apply_migration`.

`supabase/migrations/` holds 115 files numbered 001 through 129, but it does
**not** describe production. The hosted database is the pre-059 lineage, the two
chains diverged long ago, and **production's own ledger holds 98 applied
migrations** whose names and numbers only partly overlap with those filenames.
The authoritative descriptions of production are the live schema and
`src/types/database.ts`. A from-zero reset is not runnable here in any case.

Two consequences worth stating plainly, because both have caused wasted work:

- **A migration number is not a unique key in this project.** Production's
  ledger contains two migrations numbered 126 (`126_revoke_authenticated_dml`
  and `126_percent_range_checks`) and two numbered 127
  (`127_revoke_check_rate_limit_execute` and `127_homepage_cms`). Cite
  migrations by name, never by number alone.
- **`migrations/pending/` is not a queue of unapplied work. It is not a queue at
  all.** All 23 of its `.sql` files are live in production, applied through MCP
  under the names in §8.1. The directory name is now purely historical, and `ls`
  on it is not evidence of anything.

### 8.1 State as of 2026-09-01

Verified against `supabase_migrations.schema_migrations`: **99 migrations
applied**. Nothing is outstanding.

| | Numbers |
|---|---|
| Applied | 122, 123, 125, 126, 127, 130, 131, 132, 133, 134, 135, 136, **137**, 138, 139, 140, 141, 146 |
| Applied earlier under different numbers | 124, 143, 144, 145 |
| Pending, not applied | *(none)* |

137 was the last to land, at ledger version `20260901110706`, after everything
else in the batch.

The renumbering is real and it trips people up. In the production migration
history these appear under their old names:

| Pending file | Applied as |
|---|---|
| `124_categories_sort_order` | folded into an earlier categories migration; `categories.sort_order` exists |
| `143_revoke_unused_definer_execute` | `revoke_orphan_security_definer_grants_125` |
| `144_revoke_authenticated_dml` | `126_revoke_authenticated_dml` |
| `145_revoke_check_rate_limit_execute` | `127_revoke_check_rate_limit_execute` |
| `138`–`141` (four money files) | one migration, `138_141_money_agorot_generated_columns` |
| `135_recurring_subscriptions` | two, `135a_product_type_recurring` + `135b_recurring_subscriptions` |

### 8.2 Migration 137: rewritten, and applied

`137_order_transition_guard.sql` adds a transition guard to `orders`,
`order_items` and `payments`. **It is applied.** Three
`BEFORE UPDATE ... FOR EACH ROW` triggers are live and enabled:
`tg_orders_status_guard`, `tg_order_items_settlement_status_guard`,
`tg_payments_status_guard`. An illegal move raises `23514` naming both ends of
the attempted transition. The full transition tables are in
`docs/PAYMENT-FLOW.md` §2.1, which is authoritative.

It covers **three** tables. It does not touch `vouchers` and it does not touch
`audit_log`, so double redemption is still held off by the application's atomic
`UPDATE ... WHERE status = 'issued'` alone, and the audit log is still editable.

Its first version was blocked, and the reasons are the most useful lesson in
this document, because each defect traced to a **writer in the application
code** rather than to any architecture document:

1. **`redeemed` was unreachable.** `markOrderItemRedeemed` writes it from
   `REDEEMABLE_SETTLEMENT_STATUSES = platform_settled, paid, split_executed`.
   The guard had no rule reaching `redeemed` at all, so every voucher scan would
   have raised `23514` **after the customer had already been charged**.
2. **`orders.status` omitted `platform_settled`**, which the live enum carries.
3. **`payments.status` omitted `succeeded -> platform_settled`**, which
   `terminal-reconciliation.ts` already treats as the same outcome as
   `succeeded`.

It was **rewritten against the production enums at commit `37892b88d`**, with
175 tests covering one case per legal transition, per illegal pair and per
no-op, plus a named regression test for each of the four defects above. That
rewrite passed `tsc`, 3370 Vitest tests, the build and Biome.

**It is now in production**, applied through MCP with the approval that §9.6
requires. Any document that still describes 137 as pending is out of date; the
guard bodies read out of `pg_proc` are the only authority, and
`src/server/domain/orders/status-transitions.json` is checked against them by
`status-transitions.test.ts`.

Two artefacts have not caught up and are traps for the next reader: the header
of the migration file itself still ends with `NOT APPLIED`, and the docstring of
`src/server/domain/orders/status-transitions.ts` still cites the file under
`migrations/pending/`. Both are prose; both tables are correct.

---

## 9. Conventions that are not negotiable

1. **Money is integer agorot.** Every calculation through `src/lib/money.ts`.
   No `float` anywhere on the money path.
2. **No `db push`.** Migrations are files, applied on approval.
3. **`platform_percent` is per product, and it is snapshotted onto
   `order_items` at purchase.** Settlement never reads a live percentage off a
   product.
4. **Hebrew RTL in all UI**, and every screen is measured against
   `refs/ke_live_singlefile.html` with the comparison gate under 11%.
5. **pnpm only.** `npm install` crashes inside npm's arborist on pnpm's symlink
   store, before any lifecycle hook can produce a better message.
6. **The four stop-and-ask situations**: a production push to Vercel, deleting a
   database or files, running a migration against production, and a second code
   agent on the same repository.

---

## 10. Where to look next

| Question | File |
|---|---|
| Money math | `src/lib/money.ts`, `src/lib/commerce/commission.ts` |
| Payment model in one page | `src/server/payments/README.md` |
| Cardcom specifics | `docs/CARDCOM-ARCHITECTURE.md` |
| Order line states | `src/server/domain/orders/state-machine.ts` |
| Voucher states | `src/server/domain/vouchers/state-machine.ts` |
| Roles and RLS | `docs/AUTH-MODEL.md`, `docs/DB-SECURITY-MODEL.md` |
| Search | `docs/SEARCH-PIPELINE-SPEC.md`, `src/lib/search/` |
| Scheduled jobs | `docs/CRON-EXTERNAL.md` |
| Launch sequence | `docs/LAUNCH-RUNBOOK.md` |
| Pending migrations | `migrations/pending/README.md`, `.../APPLY-ORDER.md` |
| Current project state | `STATE.md` |

---

## 11. Re-verifying this document

Every figure in §2 came from one of these, run through Supabase MCP
`execute_sql` against `ixvwfbuvfxxsjiywhbbb`. Re-run them before trusting a
number that matters; do not copy a count forward from another document.

```sql
-- 98 migrations applied
select count(*) from supabase_migrations.schema_migrations;

-- 61 tables, 0 with RLS off, 12 views, 69 functions, 61 SECURITY DEFINER
select
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r')                    as tables,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and not c.relrowsecurity)                                        as rls_off,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v')                    as views,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public')                                        as functions,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef)                        as security_definer;

-- 78 agorot columns, 26 of them generated
select count(*) filter (where is_generated = 'ALWAYS') as generated,
       count(*)                                        as total
from information_schema.columns
where table_schema = 'public' and column_name like '%agorot%';

-- 0 SECURITY DEFINER functions with an unpinned search_path
select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c
                  where c like 'search_path=%');

-- 6 EXECUTE grants to anon
select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
  lateral aclexplode(p.proacl) ax join pg_roles r on r.oid = ax.grantee
where n.nspname = 'public' and ax.privilege_type = 'EXECUTE'
  and r.rolname = 'anon';

-- 133 policies; 53 non-internal triggers
select (select count(*) from pg_policies where schemaname = 'public') as policies,
       (select count(*) from pg_trigger tg
          join pg_class c on c.oid = tg.tgrelid
          join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and not tg.tgisinternal)           as triggers;

-- the grant surface of §5.1: anon 62/1/1/1, authenticated 64/56/56/56,
-- service_role 73 across the board
select grantee, privilege_type, count(distinct table_name) as relations
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon','authenticated','service_role')
  and privilege_type in ('SELECT','INSERT','UPDATE','DELETE')
group by grantee, privilege_type
order by grantee, privilege_type;
```
