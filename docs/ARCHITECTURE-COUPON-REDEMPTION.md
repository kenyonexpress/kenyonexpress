# ארכיטקטורה: מימוש קופון (ספק)

סריקת ספק, RPC `redeem_voucher`, outcomes, אימות QR, idempotency, ו-anti-enum.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #8/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/ARCHITECTURE-COUPON-REDEMPTION-UX.md
docs/ARCHITECTURE-CARDCOM-WEBHOOKS.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-SUPPLIER-REDEMPTION.md
```

מודל כסף: **No Escrow**. סריקה לא משחררת כסף פלטפורמה→ספק.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| CR1 | מימוש רק דרך RPC אטומי + route ספק מאומת. |
| CR2 | `supplier_id` נגזר מ-membership של `auth.uid()`, לא מגוף הבקשה. |
| CR3 | QR payload: HMAC חובה לפני RPC; כשל → `not_found` ללקוח. |
| CR4 | Outcomes יציבים; אין leak של קיום קוד בחנות אחרת. |
| CR5 | Idempotency: status CAS + optional `idempotency_key`. |
| CR6 | אחרי success: `voucher.status=redeemed`; `settlement_status=redeemed` על השורה. |

---

## 1. קצה

```
POST /api/supplier/vouchers/redeem
Body: { code? , qr_payload? , method: camera|manual, idempotency_key? }
```

User-scoped Supabase client (לא service role) כדי ש-`auth.uid()` יישב ב-RPC.

---

## 2. Outcomes

| outcome | HTTP | צד לקוח |
|---|---|---|
| success | 200 | מומש |
| already_redeemed | 409 | כבר מומש |
| expired / cancelled / refunded | 409 | לא ניתן |
| not_found | 404 | כולל wrong shop |
| unauthorized | 401 | אין ספק |
| rate_limited | 429 | האט |
| invalid_request | 400 | בקשה שבורה |

---

## 3. רצף

```text
auth → parse → QR verify → redeem_voucher FOR UPDATE
  → UPDATE issued→redeemed → log → markOrderItemRedeemed → outbox
```

---

## 4. Acceptance

- [ ] No Escrow על redeem  
- [ ] Anti-enum wrong shop  
- [ ] CAS + idempotency  
- [ ] קישור ל-LIFECYCLE / UX  

---

## 5. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2 #8: מפרט סריקה מקוצר מחייב מול הקוד החי |
