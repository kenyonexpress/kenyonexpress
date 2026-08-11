# מפרט מניעת הונאה

שכבת מוצר מעל `ARCHITECTURE-FRAUD-PREVENTION.md`.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
עקרון: כפילות ב-**DB אטומי**; rate limit על כסף = **fail-closed**.

מסמכים קשורים:

```
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/COUPON-LIFECYCLE-SPEC.md
docs/VENDOR-PAYOUT-SPEC.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| F1 | Double redeem: `issued`→`redeemed` אטומי. |
| F2 | QR: HMAC/Ed25519 keyed. |
| F3 | Checkout velocity: 429 fail-closed. |
| F4 | Chargeback: freeze `issued`; `redeemed` = review ידני. |
| F5 | Supplier fraud: geo/off-hours/velocity. |
| F6 | Payout פיזי: אישור אדמין; קופון **אין payout**. |
| F7 | סדר סריקה: RL → membership → חתימה → ספק → status → expiry → UPDATE. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| auto-refund מתור review | F4 |
| unwind redeemed אוטומטי | F4 |
| rate limit fail-open | fail-closed על כסף |

---

## סכמת DB

```text
vouchers, fraud_review_queue, coupon_scan_events, audit_log
```

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | שני redeem parallel | אחד בלבד |
| CE2 | chargeback + issued | freeze |
| CE3 | refund אחרי payout פיזי | supplier_debit |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | velocity tuning | קונפיג |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: BINDING 5 סעיפים |
