# ARCHITECTURE-FULFILLMENT-SUPPLIER-WORKFLOW.md


> <!-- v1-final-banner:2026-09-01 -->
> ⚠️ **This document names tables that do not exist in production.**
>
> | Named here | In production |
> |---|---|
> | `notifications_outbox` | `notification_outbox` |
>
> The design below may still be sound; the schema it assumes was not built, or
> was built under another name. Verify against `docs/DATA-MODEL.md` before
> writing a query, and see `docs/SCHEMA-REALITY-CHECK.md` for the full mapping.

KenyonExpress post-purchase fulfillment and supplier workflow architecture (complete binding spec).

Status: BINDING for worktree `/Users/ofir/kenyonexpress-web/ke-arch` · branch `arch/docs-queue` (2026-07-31)
Scope: **docs only.** No application code in this change.
Companions: `docs/ARCHITECTURE-CHECKOUT-CARDCOM.md`, `docs/ARCHITECTURE-COUPON-REDEMPTION.md`, `docs/ARCHITECTURE-SUPPLIER-PORTAL.md`, `docs/ARCHITECTURE-NOTIFICATIONS.md`, `docs/ARCHITECTURE-ADMIN.md`, `docs/ADMIN-PRODUCT-PAGE-SPEC.md`.
Stack: Supabase triggers + notification outbox + Resend, Supplier Portal (`src/app/(supplier)`), Server Actions, optional cron.
Money: integer **agorot**; snapshots only.

---

## 0. Business model (fulfillment economics)

| Product type | After `payment_settled` | Supplier money from platform | Customer still owes |
|---|---|---|---|
| **Coupon** | Issue voucher (QR + code); optional notify supplier of sale (default **off**) | **100% of on-site prepaid stays with the platform** (`platform_settled`). Supplier payout from prepaid = 0. **No Escrow**, no split of coupon prepaid by `platform_percent`. | Till remainder at merchant on QR scan; voucher **expires on scan** |
| **Physical** | Notify supplier; ship workflow | **Immediate split** recorded at settle; payout after T+3 + min threshold | 0 on-site |

Invariants:

1. Platform, never supplier. Fulfillment is supplier-operated; KenyonExpress does not ship as merchant of record.
2. `platform_percent` dynamic per product, admin-set, snapshotted at purchase. Never recompute from live product in fulfillment UIs.
3. Every customer-facing product surface shows supplier (contact, and rating/history when present).
4. **No third-party Escrow.** Physical is not “funds locked until delivery confirmation.” Delivery updates **order/shipment status** and may inform support/refunds; it does **not** release a Cardcom Escrow (none exists). Payout timing is T+3 business days from paid_at (and min balance), not from `delivered_at`, unless **Q-FUL-PAYOUT-GATE** explicitly changes policy later.
5. Coupon “balance until QR” is **till cash at supplier**, not platform-held Escrow.

### החלטה אוטומטית (Escrow on delivery)

Prompt wording asked for “Escrow released on delivery confirmation” for physical. Binding checkout/redeem/supplier docs forbid Escrow. This doc uses **immediate split + payout schedule** and treats delivery as fulfillment only. Documented in STATE.

---

## 1. Trigger: payment settled → fulfillment start

Source of truth: checkout finalize after verified Cardcom webhook (`ARCHITECTURE-CHECKOUT-CARDCOM.md`).

```
payment_settled (order.status = paid)
  ├─ coupon lines  → issue vouchers (signed QR) → customer delivery of code/QR
  ├─ physical lines → fanout supplier_new_order per supplier_id
  ├─ settlement_events already written at settle
  └─ customer payment_settled email / in-app
```

Emit via `fn_emit_notification_event` / equivalent inside finalize TX (dedupe keys). Worker drains Resend + in-app per `ARCHITECTURE-NOTIFICATIONS.md`.

---

## 2. Order notification to supplier

### 2.1 Channels

| Channel | Transport | When |
|---|---|---|
| Email | Resend via `notifications_outbox` | Physical lines: **required** for owner/manager members |
| In-app | outbox `channel=inapp` | Optional on supplier home |
| Ntfy | admin ops only | Fraud / worker failure bursts, not every order |

Coupon sale email to supplier: **default off** (**Q-FUL-COUPON-MAIL**); redeem notify also default off.

### 2.2 Recipients

Active `supplier_members` with `member_role IN ('owner','manager')` for that `order_items.supplier_id`. Scanners do not get new-order mail by default.

### 2.3 Template facts (no invented commission)

- `supplier_business_name`, `order_id_short`
- Line list: product name, qty, snapshotted `platform_percent`, `paid_on_site`, `supplier_due` (physical)
- Ship-to snapshot (physical): city, postal (mask apartment in email if policy requires)
- Portal deep link: `/supplier/orders/[id]`
- Never tell supplier the till coupon remainder is “coming from KenyonExpress”

### 2.4 Supabase trigger path

Preferred: finalize RPC/action emits notification event (same TX as paid). Alternate: `AFTER UPDATE OF status ON orders` when `NEW.status = 'paid'` calling `fn_emit_notification_event` with dedupe `supplier_new_order:{order_id}:{supplier_id}`.

---

## 3. Supplier dashboard order list

Routes (Supplier Portal):

| Route | Purpose |
|---|---|
| `/supplier/orders` | Filterable list: status, date, product type |
| `/supplier/orders/[id]` | Detail: lines, address, money snapshots, actions |
| `/supplier/scan` | Coupon redeem (separate doc) |

RLS: supplier sees only lines/orders where `order_items.supplier_id` ∈ active memberships. Money columns: residual from **snapshot**, never live `products.platform_percent`.

List columns (Hebrew UI, RTL, ≥44px actions): order id, created_at, status, item count, on-site paid (their lines), supplier due (physical), customer city.

---

## 4. Status state machine

Fulfillment statuses apply primarily to **physical** shipments. Coupon lines use voucher status (`issued` → `redeemed` / `expired` / …) from the redemption doc; order-level may stay `paid` / `completed` when all vouchers issued.

### 4.1 Physical shipment / order line machine

```
pending_fulfillment
        |
        | supplier accepts / auto
        v
     processing
        |
        | mark shipped (+ tracking)
        v
      shipped
        |
        | carrier / customer / admin confirm
        v
     delivered
        |
        +---- customer/admin opens refund_requested ----+
        |                                               v
        |                                      refund_requested
        |                                               |
        |                          admin approve         | admin reject
        |                               v               v
        |                        refund_approved    (back to prior
        |                               |            or closed)
        v                               v
   completed / closed              refunded (money path)
```

Binding enum names may map to existing `order_status` / `shipment_status` / line-level `fulfillment_status`. Implementation must not invent Escrow states.

| Status | Who can set | Side effects |
|---|---|---|
| `pending_fulfillment` | system on paid | supplier notified |
| `processing` | supplier manager+ | optional |
| `shipped` | supplier manager+ | requires tracking URL or code; customer email |
| `delivered` | supplier, customer confirm, or admin; optional carrier webhook | customer delivery notification; **no Escrow release** |
| `refund_requested` | customer or admin | freeze further ship actions; notify admin |
| `refund_approved` | admin (recent auth) | Cardcom refund / wallet credit path; settlement_events `refund` |

Illegal: supplier self-approving refunds; supplier editing `platform_percent`; marking shipped without tracking when policy requires it (**Q-FUL-TRACK-REQUIRED**, default **required** for physical).

### 4.2 Coupon path (parallel)

```
paid → voucher issued (customer delivery)
         → redeemed at scan (expires) OR calendar expired OR cancelled/refunded
```

No `shipped` / `delivered` for pure digital coupon lines.

---

## 5. Supplier action: mark shipped

Server Action `markOrderShipped` (supplier JWT, membership check):

Input:

```json
{
  "order_id": "uuid",
  "tracking_url": "https://...",
  "tracking_code": "optional",
  "carrier": "optional Hebrew label"
}
```

Rules:

1. Only physical lines for this supplier; order must be `paid` and not refund-locked.
2. Persist tracking on `shipments` / order metadata snapshot.
3. Transition → `shipped`.
4. Emit `order_shipped` notification to customer (Resend + in-app).
5. Audit log row.

Tracking link: prefer HTTPS URL; if only code, portal builds carrier deep link when carrier known.

---

## 6. Customer delivery notification

| Event | Customer channel | Content |
|---|---|---|
| `payment_settled` | email + in-app | Receipt; coupon: how to open QR; physical: “הספק יטפל במשלוח” + supplier name |
| `order_shipped` | email + in-app | Tracking link/code; supplier contact from snapshot |
| `order_delivered` | email + in-app | Confirmation; support / refund window copy (legal) |
| `coupon_redeemed` | email + in-app | Scan-expiry confirmation; till amount reminder |

All Hebrew. Noindex account URLs (SEO doc).

---

## 7. Coupon delivery (QR PDF or direct code)

After settle, for each coupon unit:

1. Voucher row with `code` + signed `qr_payload` (`ARCHITECTURE-COUPON-REDEMPTION.md`).
2. Customer delivery options (v1: all of the below allowed):

| Channel | Behavior |
|---|---|
| Account UI | `/account/vouchers` live QR + code |
| Email | Link to account voucher (preferred) or inline code; avoid crawlable raw token URLs |
| PDF | Optional “הורד PDF” with QR image, code, supplier name/address, till remainder, expiry calendar date |

PDF generation: server-side; Hebrew RTL; include legal cancelation notes as required. Do not embed `platform_percent` in customer PDF.

---

## 8. Physical product integration (money vs delivery)

| Concern | Rule |
|---|---|
| Split | Already in `settlement_events` / `order_items` at `payment_settled` |
| Payout eligibility | `payout_available_at(paid_at, hold_business_days)` default T+3; min `min_payout_ils` |
| Delivery confirmation | Status only; may unblock customer review prompts; **does not** move Cardcom funds |
| Refund before ship | Admin path; easier restock; supplier notified |
| Refund after ship | Policy + evidence; admin only |

There is **no** “Escrow released on delivery” step in the ledger. If product language needs a customer-facing phrase, use “התשלום לספק מתבצע לפי לוח תשלומי הפלטפורמה” without Escrow.

---

## 9. Refunds (fulfillment-adjacent)

```
refund_requested → (admin) refund_approved → provider refund + settlement_events refund
                 → (admin) rejected → prior fulfillment status
```

- Coupon redeemed: refund policy restricted (often denied after scan).
- Coupon unredeemed: cancel voucher + refund prepaid per policy.
- Physical undelivered: preferred window for approve.
- Always `requireRecentAuth` for admin mark-refunded / Cardcom refund.

---

## 10. Observability

- Outbox lag / dead → ntfy (notifications doc)
- Unshipped physical older than SLA → admin dashboard count
- Redeem fraud bursts → ntfy (redemption doc)
- Never alert suppliers with platform internal split errors in customer copy

---

## 11. Migrations (077+, MCP only)

Never `supabase db push`. Use next free ordinal (**Q-FUL-MIG**).

| Object | Intent |
|---|---|
| `shipments` / fulfillment status columns | if not present |
| Notification event types for shipped/delivered | fanout templates |
| No Escrow / release tables | explicitly out of scope |

---

## 12. Acceptance checklist

- [ ] Physical paid → supplier owner/manager email with snapshot money + portal link
- [ ] Supplier list RLS-scoped; mark shipped requires tracking
- [ ] Customer gets shipped + delivered notifications
- [ ] Coupons delivered via account QR/code (+ optional PDF); expires on scan
- [ ] No Escrow release on delivery; physical split already at settle
- [ ] Refund state machine admin-gated
- [ ] PDP/order UI still shows supplier contact (rating/history when available)

---

## 13. Open questions

| ID | Question |
|---|---|
| Q-FUL-PAYOUT-GATE | Tie payout to `delivered_at` instead of/in addition to T+3? (default: no) |
| Q-FUL-TRACK-REQUIRED | Tracking mandatory on ship? (default yes) |
| Q-FUL-COUPON-MAIL | Email supplier on coupon sale? (default no) |
| Q-FUL-MIG | Migration ordinal |
| Q-FUL-PDF | PDF generation library / retention |

---

## 14. Related

| Doc / path | Role |
|---|---|
| `ARCHITECTURE-CHECKOUT-CARDCOM.md` | pay → settle |
| `ARCHITECTURE-COUPON-REDEMPTION.md` | scan / expire |
| `ARCHITECTURE-SUPPLIER-PORTAL.md` | RBAC, payouts |
| `ARCHITECTURE-NOTIFICATIONS.md` | Resend outbox |
| `/supplier/orders` | UI |
| `redeem_voucher` | coupon completion |

---

## 15. Revision

| Date | Change |
|---|---|
| 2026-07-28 | Fulfillment workflow binding |
| 2026-07-31 | Money lock: coupon prepaid 100% platform, no Escrow split language |
