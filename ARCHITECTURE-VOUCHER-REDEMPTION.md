# ארכיטקטורה: Voucher Redemption (מצביע BINDING)

סקירה קצרה למימוש קופון/QR. פירוט ב-docs/.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**; סריקה לא משחררת payout; agorot integer.

**מקורות קנוניים:**

```
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/ARCHITECTURE-COUPON-REDEMPTION-UX.md
docs/ARCHITECTURE-QR-SECURITY.md
```

Dump ארוך: git history לפני 2026-08-12.

---

## החלטה

| # | הכרעה |
|---|---|
| VR1 | כתיבת מימוש: RPC `redeem_voucher` (SECURITY DEFINER) + CAS. |
| VR2 | HTTP: `POST /api/supplier/vouchers/redeem` עם JWT משתמש. |
| VR3 | QR: HMAC `KEV1` לפני RPC; כשל → `not_found`. |
| VR4 | wrong shop / not found: תשובה אחידה `not_found`. |
| VR5 | Idempotency key על redemptions; replay בלי mutate. |
| VR6 | סטטוס סופי: `redeemed`; platform→supplier = 0. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| root mega dump | docs/COUPON-REDEMPTION קנוני. |
| UPDATE ישיר ל-vouchers מ-JWT | עוקף CAS/audit. |
| Escrow release on scan | No Escrow. |
| supplier_id מגוף בקשה | membership derived. |
| status `used` בכתיבה חדשה | `redeemed` קנוני. |

---

## סכמת DB

```text
vouchers (status, code, qr_payload, expires_at)
voucher_redemptions (outcome, amount_collected_agorot, idempotency_key)
order_items (settlement_status=redeemed)
```

RPC: `redeem_voucher`. אין DDL חדש.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | race double scan | CAS → already_redeemed. |
| CE2 | expired voucher | 409 expired. |
| CE3 | invalid QR signature | not_found + audit. |
| CE4 | rate limit scan | 429. |
| CE5 | refunded voucher | 409 refunded. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | offline scan queue | PWA future. |
| O2 | QR key rotation runbook | QR-SECURITY. |
| O3 | bulk redeem admin | אין; member only. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07 | dump root |
| 2026-08-12 | batch-2: BINDING מצביע |
