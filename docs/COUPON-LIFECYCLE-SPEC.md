# מחזור חיי קופון

מכונת מצבים: `issued` | `redeemed` | `expired` | `refunded`.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. **No Escrow**; agorot integer.

מסמכים קשורים:

```
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/EMAIL-TEMPLATES-SPEC.md
docs/FRAUD-PREVENTION-SPEC.md
```

enum פרוד (054): `issued | redeemed | expired | refunded`. alias ישן `used` = `redeemed` (קריאה בלבד).

---

## החלטה

| # | הכרעה |
|---|---|
| C1 | הנפקה (`issued`) אחרי order `paid`; QR חתום + snapshots כסף. |
| C2 | מימוש (`redeemed`): סריקה אטומית `WHERE status='issued'`; חד-פעמי. |
| C3 | פקיעה (`expired`): cron על `expires_at`; לא מטרמינליים אחרים. |
| C4 | החזר (`refunded`): רק `issued`; Cardcom מאומת. |
| C5 | כסף קופון: מקדמה בפלטפורמה; במימוש יתרה בעסק; **אין** payout לספק. |
| C6 | `redeemed` טרמינלי: אין unwind אוטומטי. |
| C7 | `frozen_at` על `issued` ל-chargeback. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Escrow release במימוש | C5: No Escrow. |
| `redeemed` → `issued` | C6. |
| `refunded` → `redeemed` | טרמינלי. |
| `expired` → `redeemed` | דחייה. |
| enum `used` בכתיבה | קנוני: `redeemed`. |
| refund על `redeemed` אוטומטי | מחלוקת ידנית. |

---

## סכמת DB

```text
vouchers
  id, order_id, product_id, supplier_id
  status  -- issued|redeemed|expired|refunded
  code, qr_payload, expires_at
  redeemed_at, redeemed_by, frozen_at
  paid_on_site_agorot, balance_due_agorot

coupon_scan_events / voucher_redemptions
```

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | שני redeem במקביל | אחד מצליח; השני `already_redeemed` |
| CE2 | סריקה אחרי `expired` | `expired`; בלי side effects |
| CE3 | refund בלי Cardcom | דחייה |
| CE4 | cron על `redeemed` | לא נוגע |
| CE5 | הארכת admin נדירה | audit חובה |
| CE6 | chargeback | freeze על `issued` |

מיילים: `coupon_issued`, `coupon_redeemed`, `coupon_expired`, `coupon_refunded`.

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | זיכוי ארנק ב-`expired` | מדיניות LEGAL. |
| O2 | Wallet pass void | אופציונלי. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | rev A: FSM + SQL |
| 2026-08-12 | batch-2: BINDING 5 סעיפים |
