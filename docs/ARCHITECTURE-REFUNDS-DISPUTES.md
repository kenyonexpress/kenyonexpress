# ארכיטקטורה: החזרים ומחלוקות

החזר קופון לפני/אחרי מימוש, החזרות פיזי (14 יום), Cardcom Refund, `supplier_debit` לפיזי ששולם, ומכונת dispute.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

**אינה ייעוץ משפטי.** ניסוח ללקוח רק אחרי עו״ד.

מודל כסף: **No Escrow**. אין release_escrow / held לספק.

מסמכים קשורים:

```
docs/REFUNDS-CANCELLATION-POLICY.md
docs/DISPUTE-RESOLUTION.md
docs/CARDCOM-ARCHITECTURE.md
docs/ARCHITECTURE-PAYOUT-MECHANISM.md
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/CONTRADICTIONS.md
```

---

## 0. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| R1 | חלון **14 יום** כשחל החוק (**[דורש עו״ד]**). |
| R2 | דמי ביטול: עד **5% או 100 ₪**, הנמוך. |
| R3 | קופון: בסיס refund = `paid_on_site` / `coupon_price`, לא face. |
| R4 | לפני מימוש (`issued`): ביטול → `refunded`. |
| R5 | אחרי מימוש (`redeemed`): אין unwind; dispute בלבד. |
| R6 | פיזי: ledger הפוך; `supplier_debit` אם payout כבר בוצע. |
| R7 | Cardcom: `RefundByTransactionId` (+ `CancelOnly` אותו יום). |
| R8 | כל refund/dispute ב-`audit_log` + `refunds` / `disputes`. |
| R9 | No Escrow: אין release_escrow / held לספק על קופון. |
| R10 | Chargeback → freeze; `manual_review`. |

**אין Escrow ואין "שחרור נאמן".**

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| unwind `redeemed` → `issued` | fraud; dispute path בלבד |
| refund face מלא לקופון | רק paid_on_site נגבה |
| release held לספק בקופון | No Escrow; לא קיים |
| refund מ-client בלי admin | אבטחה; server/admin בלבד |
| מחיקת supplier_debit | audit; קיזוז בבאג' הבא |
| AllowMultipleRefunds default true | double refund |

---

## 2. סכמת DB (קיים; אין DDL חדש)

```sql
refunds (
  id, order_id, payment_id, amount_agorot, fee_agorot,
  status,           -- requested|approved|submitted|succeeded|failed
  cardcom_refund_transaction_id,
  reason_code, created_by, …
)

disputes (
  id, order_id, voucher_id null, supplier_id,
  status,           -- open|awaiting_supplier|under_review|resolved_*|closed
  resolution_type,  -- wallet|cardcom_refund|rejected
  amount_agorot null,
  decided_by, decided_at, notes_he
)
```

| ישות נוספת | שימוש |
|---|---|
| `settlement_events` | `supplier_debit`, `refund` |
| `vouchers` | `issued` / `frozen` / `redeemed` / `refunded` |
| `payments` | `cardcom_transaction_id` |

אין DDL חדש.

---

## 3. קופון: לפני מימוש

```text
בקשה → זכאות (issued, חלון) → fee → Cardcom refund → voucher refunded
```

| כלל | פירוט |
|---|---|
| Race מול redeem | FOR UPDATE; refund רק מ-`issued` |
| כשל Cardcom | voucher frozen; ops |
| Idempotency | מפתח refund יציב |

---

## 4. קופון: אחרי מימוש

```text
redeemed → dispute → resolved (wallet | cardcom | reject)
```

אין שחזור שובר. אין היפוך Escrow (לא קיים).

---

## 5. פיזי + supplier_debit

```text
פיזי שכבר payout
  → Cardcom refund ללקוח
  → settlement_events: supplier_debit
  → באצ' הבא מקזז
```

---

## 6. Cardcom Refund

| פעולה | מתי |
|---|---|
| `CancelOnly: true` | אותו יום |
| Refund מלא | אחרי שידור |
| `PartialSum` | דמי ביטול |

---

## 7. מכונת dispute

```text
open → awaiting_supplier → under_review → resolved_* → closed
```

SLA: תשובה ≤ יום עסקים; הכרעה ≤ 3 ימי עסקים.

---

## 8. מקרי קצה

| מקרה | התנהגות |
|---|---|
| refund + redeem race | FOR UPDATE; אחד wins |
| partial refund | `PartialSum`; voucher partial policy |
| wallet credit במקום Cardcom | audit; voucher state |
| chargeback על issued | freeze; no payout |
| supplier_debit > net באצ' | rolled; carry forward |
| dispute timeout supplier | under_review |
| refund אחרי calendar expiry | policy; issued only auto |
| duplicate refund webhook | idempotency |
| fee=0 פגם/אי-אספקה | full refund |

---

## 9. Acceptance

- [ ] קופון issued: refund + `refunded`
- [ ] redeemed: dispute בלבד
- [ ] אין Escrow/held
- [ ] supplier_debit אחרי payout פיזי
- [ ] audit + idempotency

---

## 10. פתוחות

| ID | שאלה | ברירת מחדל |
|---|---|---|
| Q-RF-LEGAL | טקסט 14 יום ללקוח | `[דורש עו״ד]` |
| Q-RF-WALLET | refund ל-wallet default? | Cardcom; wallet כ-dispute resolution |

---

## 11. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | יצירה |
| 2026-08-12 | batch-2: BINDING template; No Escrow |
