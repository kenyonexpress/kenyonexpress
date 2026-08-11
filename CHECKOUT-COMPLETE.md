# CHECKOUT-COMPLETE

מפרט checkout end-to-end: Cardcom LP, webhook, idempotency. **No Escrow.**

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
Design only (no UI files in doc scope).

---

## 1. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| C1 | **agorot integer** בכל מסלול; Cardcom minor unit = agorot. |
| C2 | **Webhook + GetLpResult** = יחידים שקוראים `checkout_finalize`. |
| C3 | Redirect URLs = poll only, **אין writes**. |
| C4 | Snapshot `platform_bp` + `*_agorot` ב-`order_items` at beginCheckout. |
| C5 | **קופון No Escrow:** full coupon price on site → `platform_settled`; `supplier_due=0`. |
| C6 | **פיזי:** split מיידי; `supplier_due = base - platform_fee`. |

---

## 2. חלופות שנדחו

| חלופה | למה |
|---|---|
| finalize on redirect | race / fake success |
| float ILS in ledger | money.ts |
| held until redeem (coupon) | No Escrow |
| read percent from products post-pay | C10 snapshot |
| PAN on our servers | PCI SAQ-A via LP |

---

## 3. סכמת DB

| table | key fields |
|---|---|
| `orders` | status, expires_at, paid_at |
| `order_items` | `platform_bp`, `*_agorot`, snapshot |
| `payments` | status, idempotency_key |
| `payment_webhook_events` | raw + HMAC |
| `settlement_status` | `platform_settled` (coupon) |
| `vouchers` | post-finalize issue |

Migration refs: 046 runtime, 051 agorot, 071 enum.

---

## 4. מקרי קצה

| # | מצב |
|---|---|
| E1 | duplicate webhook | idempotency |
| E2 | wallet covers all | finalize without Cardcom |
| E3 | 30min pending | cancel cron |
| E4 | amount mismatch GetLpResult | reject finalize |
| E5 | missing platform_bp | refuse voucher issue |
| E6 | token charge | alternate entry to finalize |

---

## 5. פתוחות

| # | פער |
|---|---|
| O1 | 051 apply on prod |
| O2 | code reads `*_agorot` everywhere |
| O3 | E2E purchase→coupon→scan (needs service key) |

---

## Pipeline (summary)

```
CART → IDENTITY → CHECKOUT SESSION → ORDER SNAPSHOT
  → Cardcom LP → webhook → checkout_finalize
  → paid + vouchers + ledger + outbox
```

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING: No Escrow |
| 2026-07 | design doc |
