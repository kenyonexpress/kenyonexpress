# ARCHITECTURE-CHECKOUT-CARDCOM.md

<!-- v1-final-banner:2026-09-01 -->
> ⚠️ **Partly stale 2026-09-01. Current: `docs/ARCHITECTURE-OVERVIEW.md` §4 and `docs/CARDCOM-ARCHITECTURE.md`.**
>
> Two corrections:
>
> 1. **No escrow is created at checkout.** The coupon prepayment is platform
>    revenue at the moment the charge succeeds. `finalize.ts` writes no custody
>    row.
> 2. **`platform_settled` is a live value in `payment_status` and
>    `order_status`,** and rows carry it. Any status list that omits it is
>    incomplete.
>
> Cardcom does not sign its callbacks. Authenticity rests on the URL secret plus
> mandatory server-to-server `GetLpResult` re-verification, never on the POST
> body.

KenyonExpress end-to-end checkout and Cardcom payment architecture (complete binding spec).

Status: BINDING for worktree `/Users/ofir/kenyonexpress-web/ke-admin` · branch `arch/admin-supplier` (2026-07-28)
Scope: **docs only.** No application code in this change.
Companions: `docs/ARCHITECTURE-COUPON-REDEMPTION.md`, `docs/ARCHITECTURE-FULFILLMENT-SUPPLIER-WORKFLOW.md`, `docs/ARCHITECTURE-NOTIFICATIONS.md`, `docs/ARCHITECTURE-ADMIN.md`, `docs/ADMIN-PRODUCT-PAGE-SPEC.md`, `docs/ARCHITECTURE-SUPPLIER-PORTAL.md`, `docs/ARCHITECTURE-SECURITY-COMPLIANCE.md`.
Stack: Next.js App Router checkout, Server Actions under `src/server/actions/payments/`, Route Handler webhook, Supabase Postgres, Cardcom Low Profile / iframe.
Money: integer **agorot** internally; UI shows ₪ with 2 decimals (`he-IL`).

---

## 0. Business model (checkout economics)

| Product type | Customer pays on site | After payment | Platform / supplier |
|---|---|---|---|
| **Coupon** | Full absolute **`coupon_price_ils`** (admin-set, no default) | Voucher issued; till remainder `face - coupon_price` collected **at supplier** on QR scan; voucher expires on scan | **100% of on-site charge stays with the platform** at pay time (`platform_settled`). Supplier payout from prepaid = 0. **No Escrow**, no held-until-redeem release to supplier. `platform_percent` on coupon lines is reporting-only (not a customer price). |
| **Physical** | Full discounted on-site charge | Supplier notified to ship | **Immediate split** by snapshotted `platform_percent`: `platformFee = round_once(paid * percent / 100)`, `supplierDue = paid - platformFee`. Payout after T+3 + min threshold. **Not** “Escrow until delivery” |

Invariants:

1. KenyonExpress is a **platform**, never a supplier. Cardcom charges the **platform** merchant account(s); suppliers are paid via payout statements, not Cardcom sub-merchants in v1.
2. `platform_percent` is dynamic per product, **no fixed rate, no DB default**. Cart lines without a publishable percent cannot checkout.
3. Every PDP (and checkout line) shows supplier identity (name, contact; rating/history when data exists).
4. Snapshots on `order_items` at order create / pay are immutable. Never recompute historical money from live `products`.
5. No Escrow agent, no J5 hold, no “release Escrow on delivery” for physical. Delivery confirmation is a **fulfillment** signal, not a money-release gate for the Cardcom charge.

### החלטה מחייבת (אין Escrow)

נוסחים ישנים ("held until QR", "Escrow released on delivery") **בטלים**.

- קופון: ב-`finalize` הסטטוס הוא `platform_settled`; אין `order_escrow_holds` / שחרור לספק.
- יתרת הקופון בבית העסק אף פעם לא נכנסת למשמורת הפלטפורמה.
- פיזי: פיצול ב-`payment_settled` / `split_executed`; משלוח הוא fulfillment בלבד, לא שער כסף.

---

## 1. End-to-end checkout flow

```
browse / cart (guest OK)
  → checkout entry (login required at Pay)
  → contact + shipping (physical) / digital delivery (coupon)
  → Israel address + postal validation
  → order summary (on-site charge only; till remainder disclosed for coupons)
  → create order (pending) + payment row (initiated)
  → select Cardcom account (multi-account rules)
  → Low Profile / iframe charge
  → redirect / indicator + webhook
  → payment_settled finalize (idempotent)
  → vouchers / supplier notify / settlement_events
```

### 1.1 Guest entry

| Step | Rule |
|---|---|
| Browse + cart | Guest allowed; cart cookie / anonymous id |
| Click **שלם** / Pay | Require auth (Google OAuth or OTP). No password |
| Post-login | Merge guest cart into user cart (idempotent by product line) |
| Guest email-only pay | **Out of v1** unless **Q-CHK-GUEST** opens; default login-at-pay |

### 1.2 Cart → checkout preconditions

Before `beginCheckout`:

- Every line product is published/active.
- Every line has non-null `platform_percent` (and coupon lines have `coupon_price_ils`).
- Supplier publish fields present on each product’s supplier (name, phone, address, logo).
- Stock / offer_valid_until checks for physical and time-bound deals.
- Mixed carts (coupon + physical) allowed; on-site total = sum of per-line online charges only.

### 1.3 Shipping address (Israel)

Required for any **physical** line. Coupon-only carts skip shipping; capture billing/contact only.

| Field | Validation |
|---|---|
| `full_name` | non-empty Hebrew/Latin, 2-80 chars |
| `phone` | Israeli mobile/landline normalize (`05x…` / `0x…`); E.164 storage optional |
| `city` | non-empty; optionally match Israel cities list |
| `street` + `house_number` | required |
| `apartment` / `entrance` | optional |
| `postal_code` | **Israel postal code**: 5 or 7 digits; checksum optional via curated table `il_postal_codes` (**Q-CHK-ZIP**). Reject non-digit / wrong length |
| `notes` | optional, length-capped |

Server Action validates with Zod; never trust client-only checks. Store on `orders` / `order_addresses` snapshot (immutable after pay).

### 1.4 Order summary (customer-visible)

Show per line:

- Product name, supplier name (link to PDP supplier block)
- Type badge: קופון / מוצר פיזי
- On-site charge (coupon_price or discounted physical)
- For coupon: **יתרה לתשלום בבית העסק** (till remainder), not “Escrow”
- Order total = sum of on-site charges − wallet credit − first-purchase incentive if applicable
- Never show platform/supplier split to customers by default (see notifications Q-NOTIF-MONEY-1)

### 1.5 Create order (pre-iframe)

Atomic Server Action (service role after session):

1. Re-price from DB (not client totals).
2. Insert `orders` with `status = pending` (or `awaiting_payment`), `idempotency_key` unique per user attempt.
3. Insert `order_items` with **full money + supplier snapshots** (percent, coupon_price, face, paid_on_site, commission, balance_due, supplier_*).
4. Insert `payments` row: `status = initiated`, `provider = cardcom`, `idempotency_key`, `amount_agorot`.
5. Emit `order_created` (optional notify; default often wait for pay).
6. Return Low Profile config / iframe URL params for selected Cardcom account.

Conceptual status labels for webhooks:

| Label | DB |
|---|---|
| `order_created` | order inserted, payment not settled |
| `payment_pending` | payment `initiated` / `redirected` / awaiting webhook |
| `payment_settled` | payment verified success → order `paid` |

---

## 2. Cardcom iframe and multi-account selection

### 2.1 Integration rules

- All Cardcom calls from **server** (`src/server/actions/payments/**`). Never from client components directly to Cardcom APIs.
- Prefer Low Profile / hosted fields iframe; card data never touches our servers (PCI).
- Validate Indicator / webhook signatures before mutating money.
- Use service role / SECURITY DEFINER for status transitions after verified pay.
- Log every webhook / indicator to `payment_webhook_events` (or `audit_log`) **before** acting.

### 2.2 Multi-account model

Platform may hold **multiple Cardcom terminal / Company accounts** (legal entities, risk separation, product-mix routing). Selection is **server-side**, snapshotted onto `payments.cardcom_account_id`.

| Input | Account selection rule (v1) |
|---|---|
| Cart all coupons with `platform_percent = 100` | Default **coupon / prepaid** account |
| Cart has any physical line | Default **goods** account |
| Mixed cart | Prefer **goods** account if any physical; else coupon account (**Q-CHK-MIX**) |
| Admin override map | Optional `cardcom_account_routes` table: match on `product_type`, `platform_percent` band, or `supplier_id` |

Dynamic `platform_percent` does **not** mean a Cardcom split API (Cardcom has no atomic marketplace split in our model). Percent drives **our ledger**, not multiple simultaneous charges. Account selection is routing of the **single** customer charge.

Snapshot on payment:

- `cardcom_account_id`, terminal number, API credentials key id (not secret)
- `amount_agorot`, currency ILS
- `low_profile_id` / `internal_deal_number` / provider refs

### 2.3 Iframe lifecycle

1. Server creates Low Profile deal for selected account.
2. Client embeds iframe / redirects to Cardcom UI (RTL Hebrew copy around iframe).
3. Customer completes or abandons.
4. Success path: Indicator URL + async **webhook** (source of truth).
5. Failure / cancel: return to checkout with Hebrew error; payment `failed` or `cancelled`; order remains unpaid / expires.

Tokenization (first purchase): store Cardcom token in `payment_tokens` (never PAN). One-click later uses tokenized charge Server Action with same idempotency rules.

---

## 3. Webhook receiver

Route: `POST /api/payments/cardcom/webhook` (and Indicator GET/POST as Cardcom requires).

### 3.1 Pipeline

```
1. Persist raw body + headers → payment_webhook_events (unique provider event id when present)
2. Verify signature / shared secret / deal authenticity via Cardcom API verify call
3. Resolve payment + order by Low Profile id / DealNumber / our idempotency key
4. Branch on result code:
     success → finalize_payment_settled (idempotent)
     failure → mark payment failed; optional order cancel/expire
5. Return 200 quickly after durable log; heavy work in same TX if short, else queue
```

### 3.2 State transitions

```
order: pending + payment_pending
        | webhook success (verified)
        v
order: paid  +  payment: succeeded
        |
        +--> issue vouchers (coupon lines)
        +--> insert settlement_events (all lines)
        +--> emit payment_settled / supplier_new_order
        +--> fulfillment handoff (see FULFILLMENT doc)

webhook failure:
payment: failed; order stays unpaid or → cancelled/expired per policy
```

### 3.3 Idempotency (prevent double-charge and double-finalize)

| Layer | Mechanism |
|---|---|
| Checkout create | `orders.idempotency_key` UNIQUE (user + cart hash + attempt) |
| Payment create | `payments.idempotency_key` UNIQUE; one initiated payment per order unless explicit retry creates new row linked to same order |
| Cardcom deal | Store `provider_deal_id` UNIQUE; recreating Low Profile for same payment returns existing if still open |
| Webhook | UNIQUE on `provider_event_id` / payload hash; duplicate → no-op success 200 |
| Finalize | Conditional `UPDATE orders SET status='paid' WHERE status IN ('pending','awaiting_payment')`; second webhook sees already paid → replay side effects as no-op |
| Charge | Never create a second Cardcom charge for an order already `paid` |

Double-charge prevention: UI disables Pay after submit; server rejects second `beginCheckout` for same idempotency key; webhook finalize is conditional.

### 3.4 Failure handling

| Case | Behavior |
|---|---|
| Customer decline / 3DS fail | `payment.failed`; Hebrew message; allow **retry** with new `payments` row + new Low Profile; same order if still valid |
| Webhook timeout / missing webhook | Indicator may show success: run **verify pull** from Cardcom API by deal id (reconcile cron / on thank-you page). Never trust browser alone |
| Webhook before order commit | Rare: buffer event keyed by deal id; reconcile job attaches when order appears; or create payment first always before iframe |
| Webhook race (two success events) | UNIQUE event + conditional paid update |
| Abandoned iframe | Cron expires `pending` orders after N minutes (**Q-CHK-TTL**, default 30-60); release stock holds |
| Partial multi-line failure | N/A: single charge for whole order; all-or-nothing pay |

Retry logic:

1. User clicks Pay again → new payment attempt row (`attempt_n`), new iframe.
2. Prior initiated payments marked `superseded`.
3. At most one `succeeded` payment per order (CHECK / partial unique).

---

## 4. Settlement ledger (`settlement_events`)

Append-only facts written in the **same transaction** as `payment_settled` finalize (or immediately after under the same idempotency key).

### 4.1 Purpose

Snapshot **all splits per product line** at the moment money is confirmed, for admin, payouts, and audits. Independent of later product edits.

### 4.2 Row shape (binding intent)

| Column | Meaning |
|---|---|
| `id` | uuid |
| `order_id`, `order_item_id`, `payment_id` | links |
| `product_id`, `product_type`, `supplier_id` | refs + denormalized names |
| `platform_percent` | snapshot |
| `paid_on_site_agorot` | what Cardcom charged for this line share of total |
| `platform_fee_agorot` | `round_once(paid_on_site * platform_percent / 100)` |
| `supplier_due_agorot` | physical: residual; coupon: usually 0 from platform (till is outside) |
| `balance_due_agorot` | coupon till remainder (not platform custody) |
| `coupon_price_agorot`, `face_value_agorot` | coupon lines |
| `cardcom_account_id` | which terminal took the charge |
| `event_type` | `payment_settled` \| `refund` \| `adjustment` |
| `created_at` | timestamptz |

No UPDATE/DELETE for authenticated roles. Admin read via service / RLS.

Payout generators read physical `supplier_due_agorot` from settlement / order_items snapshots with T+3 rules. Coupon lines never create payout lines from till remainder.

---

## 5. Incentives and wallet (checkout interactions)

| Feature | Checkout behavior |
|---|---|
| First purchase 10% | Applied to on-site total when eligible; snapshotted |
| Wallet cashback spend | Discount on-site total; never cash-out |
| Every 5th order 5% cashback | Credited after settled pay (ledger), not before |

All discounts re-validated server-side.

---

## 6. Test scenarios

| ID | Scenario | Expect |
|---|---|---|
| T1 | Success coupon-only | Charge = sum coupon_price; vouchers issued; settlement_events prepaid + balance_due; no supplier payout line for till |
| T2 | Success physical-only | Charge = discounted total; immediate split in settlement_events; `supplier_new_order` email |
| T3 | Success mixed cart | Single charge; per-line settlement; shipping required |
| T4 | Card decline | payment failed; order unpaid; retry creates new payment attempt |
| T5 | Webhook duplicate success | Second event no-op; one paid; one voucher set |
| T6 | Indicator success, webhook delayed | Thank-you reconcile pull marks paid once |
| T7 | Webhook success then retry Pay | Rejected; order already paid |
| T8 | Invalid IL postal code | Checkout blocked before iframe |
| T9 | Missing platform_percent on line | Cannot beginCheckout |
| T10 | Webhook race two workers | Conditional update; single settlement batch |
| T11 | Abandoned iframe + TTL | Order expired; stock released |
| T12 | Wrong Cardcom account secrets | Fail closed; ntfy admin; no fake paid |

---

## 7. Security and compliance

- Webhook: signature + server-to-server verify; no session cookies required.
- Origin exception documented in security architecture.
- PCI: iframe / token only; no PAN/CVV in DB or logs.
- PII: address encrypted at rest if required by legal track; RLS on orders.
- `/checkout*` `noindex` (SEO doc).

---

## 8. Migrations (077+, MCP only)

Never `supabase db push`. Next free ordinal ≥ 077 from hosted journal (**Q-CHK-MIG**).

| Object | Intent |
|---|---|
| `payments` uniqueness / attempt columns | if gaps |
| `payment_webhook_events` | raw + unique provider id; append-only |
| `settlement_events` | §4 |
| `cardcom_accounts` / `cardcom_account_routes` | multi-account |
| Optional `il_postal_codes` | Israel ZIP validation |
| Comments | no Escrow tables |

---

## 9. Acceptance checklist

- [ ] Guest cart merges on login; pay requires auth
- [ ] IL postal validation blocks bad addresses for physical
- [ ] Order summary shows till remainder for coupons without Escrow language
- [ ] Cardcom account selection server-side and snapshotted
- [ ] Webhook verify + idempotent finalize; no double-charge
- [ ] `settlement_events` one row per line on settle with snapshotted `platform_percent`
- [ ] Failure + retry + webhook timeout reconcile covered by tests T4-T7
- [ ] Physical split immediate; coupon till outside platform

---

## 10. Open questions

| ID | Question |
|---|---|
| Q-CHK-GUEST | True guest checkout without login? |
| Q-CHK-ZIP | Enforce `il_postal_codes` table vs length-only? |
| Q-CHK-MIX | Account routing for mixed carts |
| Q-CHK-TTL | Pending order expiry minutes |
| Q-CHK-MIG | First free migration ordinal |

---

## 11. Related

| Path / doc | Role |
|---|---|
| `src/server/actions/payments/**` | Cardcom Server Actions |
| `/api/payments/cardcom/webhook` | webhook |
| `docs/ARCHITECTURE-FULFILLMENT-SUPPLIER-WORKFLOW.md` | post-pay |
| `docs/ARCHITECTURE-COUPON-REDEMPTION.md` | voucher after settle |
| `docs/ARCHITECTURE-NOTIFICATIONS.md` | `payment_settled`, failures |
