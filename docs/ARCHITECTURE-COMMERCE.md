# KenyonExpress Commerce Architecture

> **QA 2026-08-06: הבאנר הקודם כאן היה שגוי, והוסר.** הוא הכריז שכל מספר עמלה
> ונוסח Escrow במסמך הוא שריד שגובר עליו `CONTRADICTIONS.md`. **זה לא נכון
> יותר, ולא היה נכון כשנבדק:** הגוף של המסמך כבר מיישם את ההכרעות במפורש -
> ‏C1/C2 בסעיף 0.1 ובסעיף 2.1 (אין ברירת מחדל בשום מקום, `commission_percent`
> יצא מתפקיד מפתח הפיצול), ‏C3 בסעיף 0.3 (אין נאמן, אין J5, ה-held הוא רישום
> פנימי בלבד), ‏C4, ‏C6, ‏C7, ‏C8 ו-C10 כל אחד במקומו, ו-O1 מסומן CLOSED.
> באנר שאומר "אל תסמוך על המסמך הזה" מעל מסמך שכן מדויק גורם לקורא ללכת לחפש
> את האמת במקום גרוע יותר.
>
> **מה כן נשאר לא מיושר, וזה אמיתי:** כל ה-DDL כאן ב-`numeric(12,2)` שקלים
> (`charged_on_site_ils`, `platform_fee_ils`, `supplier_due_ils`,
> `balance_due_at_business_ils`), בזמן שכלל הכסף המחייב הוא **אגורות integer
> בלבד**. זה אותו פער בדיוק שרשום כ-D3 ב-`ARCHITECTURE-MASTER-CHECKOUT-REDEMPTION.md`
> וכ-`PENDING-money-integer-fix.sql` שממתין לאישור ואסור להריץ. המיגרציה
> הנלווית `026_commerce.sql` **לא הוחלה**, ולכן הפער הזה עדיין תיאורטי: הוא
> יהפוך לאמיתי ברגע שמישהו יחיל אותה כפי שהיא.

Status: **DESIGN, QA-PASS 2026-08-06** (הוסר סימון STALE). Companion draft migration: `supabase/migrations/026_commerce.sql` (NOT applied).
Date: 2026-07-08. Supersedes the fixed-10% commission model documented in
`.claude/skills/cardcom-payments` wherever the two conflict. This document also
absorbs the earlier commerce stub (which mislabeled the commerce migration as
"draft migration 032"; the actual migration is 026): still-valid stub-only ideas
are kept in section 8, superseded stub ideas are listed there explicitly.

## 0. Business rules (authoritative)

1. **Commission is dynamic per product, and mandatory.** Every product and coupon
   deal carries an admin-defined `platform_percent`, set on its admin product page.
   There is **no default anywhere** (CONTRADICTIONS C1, migration 050: `NOT NULL`
   with no `DEFAULT`); a product without it cannot be priced or sold.
   `commission_percent` is retired as the split knob (C2). Platform keeps
   `platform_percent` of the on-site amount; the supplier gets the remainder.
2. **Physical product**: customer pays 100% on site. The split is applied at
   settlement (supplier_payouts), not at transaction time. This supersedes the
   skill's "Cardcom Multi-Account split at time of payment". Payout is released
   T+3 business days after delivery and only once the accrued balance reaches
   100 ILS (C8, migration 051); below that it rolls over.
3. **Coupon**: customer pays a per-product `coupon_price` on site - a free field,
   NOT derived from `platform_percent` (C4). The remainder is paid directly at the
   business when the coupon is scanned. Coupon expires on scan, or after
   `coupon_expiry_days` (C7); on expiry without redemption the paid upfront is
   credited to the customer wallet (C6). The on-site charge is held as an
   **internal ledger record only** until redemption - no external escrow, no
   trustee, no J5 authorization against Cardcom (C3). The money sits in our own
   Cardcom account throughout.
4. **Snapshot rule**: `platform_percent` is copied into `order_items` at purchase
   time. Later admin changes never affect past orders (C10).
5. **Wallet**: internal site credit only. Cashback is spendable only on-site,
   never cashes out. Applied as a discount at checkout on user request, not
   automatically.
6. **Auth**: guest cart is open. Google Login is required only at pay click.
   After login: merge guest cart (`mergeGuestCart`, exists), save details +
   Cardcom token.
7. **Payments**: Cardcom (Israeli PSP), Low Profile hosted page + token charges.
   All Cardcom calls from server actions in `src/server/actions/payments/` only.

## 1. Existing schema this design builds on

| Table | Migration | Status |
|---|---|---|
| `carts` (jsonb `items`, `profile_id`/`session_id`) | 001 | live, used by `src/server/actions/cart.ts` |
| `payment_tokens` (`cardcom_token`) | 001 | live |
| `vendors` (`commission_rate`) | 001 + 013 | live; `commission_rate` is NOT a default for the split. CONTRADICTIONS C1 forbids any commission default: `products.platform_percent` is mandatory per product (050) |
| `products`, `product_variants` | 005 + 014 | live |
| `coupon_deals` | 015 | live |
| `coupon_codes` (8-digit, statuses issued/used/expired/refunded) | 008 | live |
| `orders`, `order_items` | 007 | live; extended, see 2.4 |
| `wallet_balances`, `wallet_transactions` (single-entry) | 006 | live; superseded by double-entry, see 2.6 |
| `audit_log` + `audit_log_trigger_fn()` | 011 + 025 | live |
| `user_rate_limits` + `check_user_rate_limit()` | 019 | live |

Known drift: the live DB does not exactly match the migration files (e.g. `coupons`
survived 008's drop). 026 is written defensively (guards, IF NOT EXISTS) for this
reason. Verify against the live DB before applying.

## 2. Schema (new + extended)

All money columns are `numeric(12,2)` ILS to match the existing tables. All money
ARITHMETIC is defined in agorot (integer) per section 4; the numeric columns store
the already-rounded results, so sums always reconcile exactly.

### 2.1 `products.platform_percent`, `coupon_deals.platform_percent`

```sql
platform_percent numeric(5,2) NOT NULL CHECK (platform_percent BETWEEN 0 AND 100)
-- No DEFAULT. Mandatory per-product admin input (docs/CONTRADICTIONS.md C1).
```

- Set on the admin product page. Required for `active` status (app-level guard).
- `vendors.commission_rate` is demoted to a default suggestion when creating a
  product for that vendor. It is never read at checkout.
- ~~OPEN QUESTION (O1)~~ **CLOSED by C1/C2 (2026-07-24)**: neither number is a
  default. `vendors.commission_rate` and `suppliers.commission_percent` are
  suggestions shown while creating a product, never read at checkout or settlement.
  The only value that means "platform share" is `products.platform_percent`.

### 2.2 `carts` (exists) + new `cart_items`

`carts` stays as the header (owner check: `profile_id` or `session_id`).
New normalized `cart_items`:

```sql
cart_items (
  id uuid PK,
  cart_id uuid NOT NULL -> carts ON DELETE CASCADE,
  product_id uuid NOT NULL -> products ON DELETE CASCADE,
  variant_id uuid NULL -> product_variants ON DELETE CASCADE,
  quantity int NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  created_at, updated_at,
  UNIQUE (cart_id, product_id, variant_id)
)
```

- No price on cart_items. Prices are resolved and snapshotted only at checkout;
  a cart is a wishlist of references, never a financial record.
- Transition: `carts.items` jsonb keeps working until the cart server actions are
  rewritten; 026 creates the table without touching the jsonb column. The
  uniqueness key matches `itemKey()` in `cart.ts` (product_id + variant_id).
- RLS: owner ALL via cart ownership (`carts.profile_id = auth.uid()`); guest carts
  are handled server-side with the admin client (service role bypasses RLS);
  admin ALL.

### 2.3 `payments` + `payment_webhook_events`

One row per Cardcom attempt (charge or refund). Never updated by users.

```sql
payment_kind:   'charge' | 'token_charge' | 'refund'
payment_status: 'initiated' | 'redirected' | 'succeeded' | 'failed' | 'cancelled' | 'refunded'

payments (
  id uuid PK,
  order_id uuid NOT NULL -> orders ON DELETE RESTRICT,
  kind payment_kind NOT NULL DEFAULT 'charge',
  status payment_status NOT NULL DEFAULT 'initiated',
  amount_ils numeric(12,2) NOT NULL CHECK (amount_ils > 0),
  currency text NOT NULL DEFAULT 'ILS',
  wallet_applied_ils numeric(12,2) NOT NULL DEFAULT 0,   -- informational echo of order.cashback_applied_ils
  token_id uuid NULL -> payment_tokens ON DELETE SET NULL,
  cardcom_low_profile_id text UNIQUE,       -- returned when creating the hosted page
  cardcom_transaction_id text UNIQUE,       -- set by verified webhook only
  refund_of_payment_id uuid NULL -> payments,
  idempotency_key text UNIQUE NOT NULL,     -- app-generated, dedups double-submits
  failure_code text, failure_message text,
  raw_response jsonb NOT NULL DEFAULT '{}',
  created_at, updated_at, succeeded_at, failed_at
)
```

`payment_webhook_events` is the replay-protection and forensics log:

```sql
payment_webhook_events (
  id uuid PK,
  provider text NOT NULL DEFAULT 'cardcom',
  external_event_id text NOT NULL,          -- Cardcom LowProfileId or TranzactionId
  payment_id uuid NULL -> payments,
  signature_valid boolean NOT NULL,
  verified_against_api boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, external_event_id)      -- replayed webhook = no-op
)
```

RLS: payments user SELECT own (via order.user_id), admin SELECT; ALL writes go
through the service role in the webhook route / server actions. Webhook events:
admin SELECT only.

### 2.4 `orders` / `order_items` extensions

`orders` (007) gains:

```sql
paid_at timestamptz, cancelled_at timestamptz, refunded_at timestamptz,
expires_at timestamptz    -- pending orders auto-cancel after 30 min (cron)
```

`order_items` (007) gains the dynamic-split snapshot:

```sql
platform_percent            numeric(5,2)  NOT NULL,  -- snapshot at purchase, no default
platform_fee_ils            numeric(12,2) NOT NULL DEFAULT 0,   -- platform share of line
supplier_due_ils            numeric(12,2) NOT NULL DEFAULT 0,   -- physical: paid at settlement
charged_on_site_ils         numeric(12,2) NOT NULL DEFAULT 0,   -- physical: = line total; coupon: = platform fee
balance_due_at_business_ils numeric(12,2) NOT NULL DEFAULT 0    -- coupon remainder, paid on scan
```

- The legacy `commission_percent` + `supplier_payout_ils` (007) are DEPRECATED:
  026 keeps them and backfills them identically (`commission_percent =
  platform_percent`, `supplier_payout_ils = supplier_due_ils`) so old reports
  keep working. New code reads only the new columns.
- Invariants (enforced by CHECK):
  - `charged_on_site_ils + balance_due_at_business_ils = total_price_ils`
  - `platform_fee_ils + supplier_due_ils = total_price_ils` (physical)
  - coupon: `supplier_due_ils = 0` (supplier collects at the business directly),
    `charged_on_site_ils = platform_fee_ils`.

### 2.5 `coupon_redemptions` → **בפועל `voucher_redemptions`**

> **QA 2026-08-07.** הטבלה בפרודקשן נקראת **`voucher_redemptions`**, המפתח הוא
> ‏`voucher_id` ולא `coupon_code_id`, והסכום הוא `amount_collected_agorot`
> ‏(integer אגורות) ולא `numeric` בשקלים. ה-DDL שלמטה הוא הטיוטה של 026 שלא
> הוחלה, ולא מה שרץ. נשמר כטיוטה, לא כתיאור.
>
> **הפרש אחד מהותי ולא רק שמי: הטבלה החיה מתעדת גם סריקות שנכשלו.** יש בה
> עמודת `outcome` מסוג `voucher_scan_outcome`, ונכתבת שורה גם לקוד שכבר מומש,
> לקוד שפג, ולסורק בלי הרשאה. לכן "‏One row per successful scan" **אינו נכון**,
> וכל שאילתה כספית חייבת לסנן `WHERE outcome = 'success'`.

‏(טיוטה 026, לא הוחלה) שורה אחת לכל סריקה. ‏`UNIQUE` על `coupon_code_id` הוא
מחסום ה-replay.

```sql
coupon_redemptions (
  id uuid PK,
  coupon_code_id uuid NOT NULL UNIQUE -> coupon_codes ON DELETE RESTRICT,
  order_item_id uuid NULL -> order_items ON DELETE SET NULL,
  supplier_id uuid NOT NULL -> suppliers ON DELETE RESTRICT,
  scanned_by uuid NOT NULL -> auth.users ON DELETE RESTRICT,
  method text NOT NULL CHECK (method IN ('camera','manual')),
  amount_collected_ils numeric(12,2),   -- what the business collected (balance due)
  ip inet, user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
)
```

RLS: coupon owner SELECT (via coupon_codes.user_id), supplier staff SELECT own
supplier's rows, admin SELECT. INSERT is blocked for everyone; the only writer is
`fn_redeem_coupon()` (SECURITY DEFINER, section 5.3).

### 2.6 Wallet: double-entry ledger

006's single-entry `wallet_balances`/`wallet_transactions` is superseded. 026
renames the old transactions table to `wallet_transactions_legacy` (kept read-only
for history) and introduces:

```sql
wallet_accounts (
  id uuid PK,
  owner_type text NOT NULL CHECK (owner_type IN ('user','platform')),
  user_id uuid UNIQUE NULL -> auth.users,      -- required when owner_type='user'
  code text UNIQUE NULL,                        -- required when owner_type='platform'
  balance_ils numeric(12,2) NOT NULL DEFAULT 0,
  created_at, updated_at,
  CHECK ((owner_type='user') = (user_id IS NOT NULL)),
  CHECK ((owner_type='platform') = (code IS NOT NULL)),
  CHECK (owner_type='platform' OR balance_ils >= 0)   -- users can never go negative
)
```

Seeded platform accounts (`ON CONFLICT DO NOTHING`):

| code | meaning |
|---|---|
| `platform:cashback_reserve` | source of cashback credits (liability funding) |
| `platform:revenue` | destination when users spend wallet credit |
| `platform:adjustments` | manual admin credit/debit counterparty |

```sql
wallet_transactions (
  id uuid PK,
  debit_account_id  uuid NOT NULL -> wallet_accounts,
  credit_account_id uuid NOT NULL -> wallet_accounts,
  amount_ils numeric(12,2) NOT NULL CHECK (amount_ils > 0),
  reason wallet_reason NOT NULL,      -- 'cashback_earn'|'order_spend'|'expire'|'refund_credit'|'referral_bonus'|'manual_adjust'
  related_order_id uuid NULL, related_order_item_id uuid NULL,
  idempotency_key text UNIQUE NOT NULL,
  note text, created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (debit_account_id <> credit_account_id)
)
```

- Every movement is one balanced pair: value leaves the debit account and enters
  the credit account. Money is conserved by construction; there is no way to
  "mint" balance except against a platform account, which makes the platform's
  total cashback liability directly readable from `platform:cashback_reserve`.
- Append-only: RLS blocks UPDATE/DELETE for everyone including admins; the table
  only grows. Corrections are compensating transactions.
- `balance_ils` on accounts is a cache maintained by `fn_wallet_transfer()` inside
  the same transaction that inserts the ledger row. A nightly integrity job can
  re-derive balances from the ledger and alert on drift.
- Standard entries:
  - cashback earn: debit `platform:cashback_reserve`, credit user
  - spend at checkout: debit user, credit `platform:revenue`
  - expiry: debit user, credit `platform:cashback_reserve`
  - refund-to-wallet: debit `platform:adjustments`, credit user
- `handle_new_user()` (023) is updated to also create the user's wallet_accounts
  row (it keeps creating wallet_balances until the code cutover, then that insert
  is removed).
- RLS: user SELECT own account and transactions touching it; admin SELECT all;
  ALL writes only via `fn_wallet_transfer()` (SECURITY DEFINER).

### 2.7 `supplier_payouts` + `supplier_payout_items`

Settlement for PHYSICAL products only (coupons settle at the business).

```sql
payout_status: 'draft' | 'approved' | 'paid' | 'cancelled'

supplier_payouts (
  id uuid PK,
  supplier_id uuid NOT NULL -> suppliers ON DELETE RESTRICT,
  period_start date NOT NULL, period_end date NOT NULL,
  status payout_status NOT NULL DEFAULT 'draft',
  items_count int NOT NULL DEFAULT 0,
  gross_ils numeric(12,2) NOT NULL DEFAULT 0,        -- sum of line totals
  platform_fee_ils numeric(12,2) NOT NULL DEFAULT 0,
  payout_ils numeric(12,2) NOT NULL DEFAULT 0,       -- gross - fee = sum(supplier_due_ils)
  approved_by uuid, approved_at timestamptz,
  paid_at timestamptz, payment_reference text,        -- bank transfer ref
  notes text, created_at, updated_at
)

supplier_payout_items (
  payout_id uuid NOT NULL -> supplier_payouts ON DELETE CASCADE,
  order_item_id uuid NOT NULL UNIQUE -> order_items ON DELETE RESTRICT,  -- an item settles exactly once
  supplier_due_ils numeric(12,2) NOT NULL,
  PRIMARY KEY (payout_id, order_item_id)
)
```

- Eligibility: physical `order_items` with `item_status = 'delivered'`, order not
  refunded, `delivered + 14 days` past (return window, O2), not yet in any payout.
- `draft -> approved` (admin reviews) `-> paid` (money actually transferred,
  reference recorded). `cancelled` only from draft.
- Refund after payout: compensating negative line in the NEXT payout (payouts are
  immutable once paid); tracked via a draft payout item with negative amount is
  NOT allowed by the CHECK, so instead the refund creates an `adjustment` note and
  the next draft's generator subtracts it. Kept simple deliberately (O3).
- RLS: vendor SELECT own (via profiles.supplier_id), admin ALL.

## 3. State machines

### 3.1 Order

```
pending --(all items cancelled / expires_at passed, cron)--> cancelled
pending --(verified webhook: payment succeeded)-----------> paid
paid    --(some physical items shipped/delivered)---------> partially_fulfilled
paid    --(all items fulfilled: delivered or coupon issued)-> fulfilled
paid|partially_fulfilled|fulfilled --(admin refund)-------> refunded
```

- `pending` orders hold NO wallet debit and NO coupon codes. Everything valuable
  is created only on the `paid` transition, inside the webhook transaction:
  1) mark payment succeeded, 2) debit wallet (if applied), 3) generate coupon
  codes for coupon items, 4) award cashback if the order qualifies, 5) audit log.
- Stock (`stock_quantity`) is decremented at `paid`, not at `pending` (no
  reservation in v1; oversell handled by refund, O4).
- `cancelled` from `pending` releases nothing because nothing was taken.

### 3.2 Payment (Cardcom)

```
initiated --(Low Profile URL created)--> redirected
redirected --(webhook, signature valid, API-verified)--> succeeded
redirected --(webhook: declined / user abandoned + order expiry)--> failed
initiated|redirected --(user cancels)--> cancelled
succeeded --(admin refund via Cardcom API, new payments row kind='refund')--> refunded
```

Failure paths:
- **Webhook never arrives** (Cardcom hiccup): order stays `pending`; a reconcile
  cron queries Cardcom's API by `cardcom_low_profile_id` for payments in
  `redirected` older than 10 minutes and applies the real status. Customers are
  never told "paid" based on the redirect URL alone.
- **Webhook arrives twice**: `payment_webhook_events` UNIQUE on
  `(provider, external_event_id)` makes the second insert a conflict; handler
  exits before any state change.
- **Webhook for unknown payment**: logged with `payment_id NULL`, alert, no writes.
- **Refund**: new `payments` row `kind='refund'`, `refund_of_payment_id` set;
  original row flips to `refunded` only after Cardcom confirms. Coupon items:
  refund only `charged_on_site_ils` and only for coupons still `issued`
  (refunding flips the coupon to `refunded`, blocking future scans). החזר משמר
  את אמצעי התשלום: החלק ששולם בכרטיס חוזר לכרטיס דרך Cardcom; החלק ששולם
  מארנק חוזר לארנק. החזר חלק הכרטיס לארנק מותר רק בהסכמה אקטיבית ומתועדת של
  הלקוח. זהו תיקון LEG-10 המחייב של
  `ARCHITECTURE-LEGAL-COMPLIANCE.md`.

### 3.3 Coupon code

```
issued --(fn_redeem_coupon at business)--> used        [terminal]
issued --(expires_at passed, cron)-------> expired     [terminal]
issued --(admin refund)------------------> refunded    [terminal]
```

במעבר `issued -> expired`, ה-job מזכה אוטומטית את ארנק הלקוח במלוא
`platform_paid_ils` כ-`refund_credit` עם תוקף 5 שנים. תוקף הדיל עצמו הוא
לפחות 4 חודשים ממועד הרכישה. ראו
`ARCHITECTURE-LEGAL-COMPLIANCE.md` סעיף 1.2.

All three transitions are one-way; `used`/`expired`/`refunded` never revert. The
only writer for `issued -> used` is `fn_redeem_coupon()` (5.3).

## 4. Dynamic split + rounding (agorot rules)

All computation in integer agorot. `A(x)` = `round(x * 100)`.

For each order line: `line_total_ag = unit_price_ag * quantity`, `pp = platform_percent`.

```
fee_ag      = round_half_up(line_total_ag * pp / 100)
supplier_ag = line_total_ag - fee_ag           -- remainder, never recomputed
```

- Rounding happens ONCE per line, on the fee. The supplier gets the exact
  remainder, so `fee + supplier = total` always, no drift.
- Physical: `charged_on_site = line_total`, `platform_fee = fee`,
  `supplier_due = supplier_ag`, `balance_due_at_business = 0`.
- Coupon: `charged_on_site = fee` (customer pays only this on site),
  `platform_fee = fee`, `supplier_due = 0`,
  `balance_due_at_business = line_total - fee`.
- Order totals are sums of line values, never recomputed from percentages.
- Wallet credit applied at checkout reduces the card charge only
  (`payments.amount_ils = order.total_ils - cashback_applied_ils`); the split is
  computed on line totals BEFORE wallet, because wallet credit is platform money
  spent back on the platform, so it comes out of the platform's side at
  settlement, not the supplier's (O5 confirms this allocation).
- Minimum card charge: if wallet covers the entire total, no Cardcom call is made
  and the order goes straight to `paid` inside a single transaction.

## 5. Server actions API surface

All in `src/server/actions/`, `'use server'`, zod-validated inputs, following the
existing `{ error } | { success }` state convention. Auth guards from
`lib/admin/rbac.ts` (`requireAdminSession`) plus a new `requireUserSession`.

### 5.1 Cart (public + owner)

| Action | Input | Output | Guard |
|---|---|---|---|
| `getCart()` | none (cookie session) | cart + items + live prices | none (guest ok) |
| `addToCart` | product_id, variant_id?, qty | cart state | none (guest ok) |
| `updateCartItem` | item key, qty (0 = remove) | cart state | none (guest ok) |
| `mergeGuestCart` | userId, sessionId | void | called post-login only (exists) |

### 5.2 Checkout + payments (`src/server/actions/payments/`)

| Action | Input | Output | Guard |
|---|---|---|---|
| `beginCheckout` | cart_id, address_id?, apply_wallet_ils?, accept_terms | `{ redirect_url }` (Cardcom Low Profile) or `{ order_id }` if wallet covers all | authenticated; terms required |
| `chargeWithToken` | order_id, token_id | payment status | authenticated, token owner |
| `refundPayment` | payment_id, amount?, reason | refund payment row | `requireAdminSession` |
| `handleCardcomWebhook` | route handler `POST /api/payments/cardcom/webhook` | 200 always after logging | signature + server-to-server verification, service role |

`beginCheckout` does, in one transaction: validate stock + product status,
resolve prices, compute split snapshot per line (section 4), create `orders`
(pending, expires_at = now()+30min) + `order_items` + `payments` (initiated),
then request the Cardcom Low Profile page and store `cardcom_low_profile_id`.
Wallet is only VALIDATED here (balance >= apply_wallet_ils); the debit happens at
webhook success.

### 5.3 Coupons

| Action | Input | Output | Guard |
|---|---|---|---|
| `getMyCoupons` | none | active/used/expired lists | authenticated |
| `redeemCouponByCode` | code (8 digits), method | redemption result | role vendor/content_uploader/admin with matching supplier_id |

`redeemCouponByCode` calls `fn_redeem_coupon(p_code, p_method)` (SECURITY
DEFINER). The function:

```sql
UPDATE coupon_codes
   SET status='used', used_at=now(), used_by_supplier_user_id=auth.uid(), used_scan_method=p_method
 WHERE code = p_code
   AND status = 'issued'
   AND expires_at > now()
   AND supplier_id = (SELECT supplier_id FROM profiles WHERE id = auth.uid())
RETURNING id, ...;
```

Zero rows returned = reject (already used, expired, wrong supplier, unknown code);
the caller gets a reason by a follow-up SELECT. One row = INSERT into
`coupon_redemptions` (UNIQUE coupon_code_id backstops even a bug here), write
`audit_log`, return business-facing summary (amount to collect =
`balance_due_at_business_ils`). Rate limit: `check_user_rate_limit(uid,
'coupon_scan', 20, '1 min')` blocks brute-force code guessing.

### 5.4 Wallet

| Action | Input | Output | Guard |
|---|---|---|---|
| `getWalletBalance` | none | balance + pending expiry | authenticated |
| `getWalletHistory` | pagination | ledger rows (own) | authenticated |
| `adminAdjustWallet` | user_id, amount, direction, note | tx id | `requireAdminSession`, audit |

No public "spend" action exists. Spending happens only inside the webhook
transaction via `fn_wallet_transfer()`; earning only via the cashback rule in the
same place. Both use idempotency keys derived from `(order_id, reason)` so a
re-processed webhook cannot double-credit or double-debit.

### 5.5 Payouts (admin)

| Action | Input | Output | Guard |
|---|---|---|---|
| `generatePayoutDraft` | supplier_id, period | payout + items | `requireAdminSession` |
| `approvePayout` | payout_id | status | `requireAdminSession` |
| `markPayoutPaid` | payout_id, payment_reference | status | super_admin only |
| `cancelPayoutDraft` | payout_id | status | `requireAdminSession` |

## 6. Threat model

### T1: Coupon scan replay (same code scanned twice)
- Atomic compare-and-set on `status='issued'` (single UPDATE, no read-then-write).
- **In production**: a *partial* unique index, which is the stronger form:

  ```sql
  CREATE UNIQUE INDEX voucher_redemptions_one_success_per_voucher
    ON public.voucher_redemptions (voucher_id)
    WHERE outcome = 'success' AND voucher_id IS NOT NULL;
  ```

  One success per voucher, unlimited failed attempts still recorded. The
  unconditional `UNIQUE(coupon_code_id)` this document drafted would have
  rejected the second *failed* scan, discarding precisely the row that shows
  someone trying a code repeatedly.
- Supplier binding in the WHERE clause: a code can only be redeemed by staff of
  the supplier it belongs to; a leaked code is useless at another business.
- Rate limiting on scan attempts (019 infra) kills 8-digit brute force
  (10^8 space, 20/min = irrelevant).
- Every attempt (success or reject) is audit-logged with ip + user_agent.

### T2: Wallet double-spend
- Double-entry ledger: balance cannot be created, only moved from a platform
  account. `CHECK (balance_ils >= 0)` on user accounts is the floor.
- `fn_wallet_transfer()` takes `SELECT ... FOR UPDATE` on both account rows in a
  fixed order (by uuid) before writing, serializing concurrent spends of the same
  balance and preventing deadlocks.
- Idempotency key per (order, reason) makes webhook replays no-ops.
- Wallet debit happens only at webhook success, in the same DB transaction that
  marks the payment succeeded: two orders racing for the same balance both pass
  validation at `beginCheckout`, but only the first webhook debit succeeds; the
  second fails the balance CHECK, the order is flagged for support, and the card
  charge is auto-refunded (documented, rare path).
- RLS: no client-side write path to any wallet table, including admins (admin
  adjustments go through the same definer function with audit).

### T3: Cardcom webhook spoofing
- Signature/secret validation first (per skill rule); invalid = log + 200 + drop
  (200 so attackers learn nothing; the event row records `signature_valid=false`).
- Even with a valid signature, the handler makes a server-to-server call to
  Cardcom to fetch the transaction by id and trusts ONLY that response for
  amount + status (`verified_against_api=true`). A forged "paid" for 1 ILS on a
  500 ILS order fails the amount match and rejects.
- Redirect/success URLs from the browser NEVER change order state.
- Dedup on `(provider, external_event_id)`; raw payload retained for forensics.
- `payments.cardcom_transaction_id UNIQUE`: one Cardcom transaction can settle
  one payment row exactly once, ever.

### T4: Price/percent tampering at checkout
- Client sends only product/variant ids + quantities. Prices and
  `platform_percent` are read server-side inside `beginCheckout`'s transaction
  and snapshotted. There is no client-supplied money field anywhere in the API.

### T5: Guest cart abuse
- Carts hold no prices and no inventory reservation; a poisoned guest cart can at
  worst fail validation at checkout. Session ids are httpOnly cookies; carts
  expire (`expires_at`, cron cleanup).

## 7. Migration plan (026, DRAFT)

Order of operations inside `026_commerce.sql` (each step idempotent):
1. Enums: `payment_kind`, `payment_status`, `wallet_reason`, `payout_status`.
2. `platform_percent` on `products` + `coupon_deals`.
3. `cart_items`.
4. `orders` + `order_items` new columns + backfill of deprecated twins.
5. `payments`, `payment_webhook_events`.
6. Wallet: rename 006 `wallet_transactions` to `wallet_transactions_legacy`
   (guarded), create `wallet_accounts` + new `wallet_transactions`, seed platform
   accounts, copy `wallet_balances` balances into user accounts, replace
   `handle_new_user()`, `fn_wallet_transfer()`.
7. `coupon_redemptions` + `fn_redeem_coupon()`.
8. `supplier_payouts` + `supplier_payout_items`.
9. RLS for every new table (explicit per-operation policies).
10. `updated_at` triggers + indexes throughout.

NOT in 026: any change to existing RLS on orders/products, any data seeding
beyond platform wallet accounts, any application code.

## 8. Merged from the earlier stub (formerly "draft migration 032", corrected: 026)

The earlier stub predates this design. Items below are the parts of it that are
not already covered above. None of them are part of `026_commerce.sql`; where
they contradict sections 0-7, sections 0-7 win.

### 8.1 Future / unscheduled: subscriptions

Sketch only, requires its own design doc and migration before implementation:

- `products` additions: `billing_interval text CHECK (billing_interval IN ('monthly'))`,
  `recurring_amount numeric(10,2)`, `max_billing_cycles int` (NULL = unlimited),
  and a `'subscription'` product type.
- New table `subscriptions`: `id uuid PK`, `user_id`, `product_id`,
  `cardcom_recurring_token text`, `status` ('active' | 'paused' | 'cancelled'),
  `next_billing_at timestamptz`, `cycles_completed int DEFAULT 0`,
  `created_at`, `cancelled_at`.
- Flow: product page, "subscribe" click, Google login, Cardcom Recurring Token,
  first charge, subscription active, then a monthly billing cron.
- Any subscription split must reuse the `platform_percent` snapshot rules of
  section 4; the stub's separate money columns are superseded (see 8.4).

### 8.2 Future / unscheduled: geo and location preferences

- New table `user_location_prefs`: `user_id uuid PK`, `preferred_city text`,
  `preferred_radius_km int`, `last_lat numeric(9,6)`, `last_lng numeric(9,6)`.
- `suppliers` gains business-locator fields: `address`, `city`, `phone`,
  `whatsapp`, `opening_hours jsonb`, `lat numeric(9,6)`, `lng numeric(9,6)`,
  generated `waze_link`.
- Distance sorting: `CREATE INDEX ON suppliers USING gist (ll_to_earth(lat, lng))`
  via the `earthdistance` extension (plus `cube`).
- API: `GET /api/products?near=lat,lng&radius_km=25`.
- Homepage: if geolocation permission exists, sort deals by the user's previous
  area, otherwise show the whole country.

### 8.3 Retained UX notes (valid, app-level, no schema impact)

- City picker: manual city selection lives on the category page, NOT in the
  header (the header stays logo + 3 icons).
- Coupon delivery: after issue, the coupon (code + QR) appears in the user's
  account area and can also be sent via WhatsApp.
- Supplier redemption UI: a `/redeem` page for business staff (RBAC via the
  supplier-linked roles), scanning a QR or entering the code manually; backed by
  `redeemCouponByCode` and `fn_redeem_coupon()` (section 5.3), audit-logged.

### 8.4 Superseded stub ideas (do NOT implement)

- `coupons_issued` table (statuses active/redeemed/expired/refunded): superseded
  by the live `coupon_codes` table (008, statuses issued/used/expired/refunded)
  plus `coupon_redemptions` (section 2.5).
- `products.coupon_price` / `products.total_deal_price` / `product_type='coupon'`
  columns: superseded by the `coupon_deals` table (015) and the
  `platform_percent` snapshot model (sections 2.1 and 2.4).
- `order_items.platform_amount` / `order_items.supplier_amount`: superseded by
  `platform_fee_ils` / `supplier_due_ils` (section 2.4).
- The "draft migration 032" label: stale; the commerce migration is
  `026_commerce.sql`.
