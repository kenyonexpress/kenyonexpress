# ARCHITECTURE: Supplier Settlements

מחזורי התחשבנות לספקים: מימוש קופון יוצר רשומת payout, פיצול מיידי לפיזי, דוח חודשי, חלון מחלוקת.

Status: **BINDING** · Updated: 2026-08-03  
Scope: **docs only** · branch `arch/docs-queue`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי.

Companions:

```
docs/ARCHITECTURE-SUPPLIER-ANALYTICS.md
docs/ARCHITECTURE-ADMIN-REPORTS.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/ARCHITECTURE-SUPPLIER-ONBOARDING.md
docs/LEGAL-CHECKLIST.md
```

מודל כסף: Escrow פנימי 2026-07-27. אגורות ב-DB. `platform_percent` רק מסנאפשוט `order_items`.

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| SS1 | קופון: בעת מכירה המקדמה נגבית באתר; חלק ספק מהמקדמה ב-**held** עד `redeemed`. |
| SS2 | Redeem מוצלח → יצירת/שחרור **payout record** (לא לפני). |
| SS3 | פיזי: אחרי `paid`, יתרת ספק (אחרי עמלה מהסנאפשוט) נכנסת למסלול settlement לפי hold T+N. |
| SS4 | אין חישוב מחדש מ-`products.platform_percent` החי בזמן תשלום לספק. |
| SS5 | דוח חודשי לכל ספק פעיל; CSV/PDF יעד. |
| SS6 | חלון מחלוקת לפני סגירת מחזור (dispute window). |

---

## 1. מחזור חיים

```text
Physical line paid
  → settlement_line status=pending_hold (snapshot amounts)
  → after T+N / ship rules → eligible
  → include in payout batch

Coupon line paid
  → held (no supplier payout yet)
  → voucher redeemed
  → payout_record created/released for supplier share of advance
  → include in next batch (or instant queue if policy)

Monthly statement
  → sum eligible lines − clawbacks
  → dispute window
  → mark payable → bank transfer (ops)
  → mark paid
```

---

## 2. Coupon redemption → payout record

| שדה ברשומה | מקור |
|---|---|
| `supplier_id` | voucher / order_item |
| `voucher_id` / `order_item_id` | |
| `gross_paid_on_site_agorot` | snapshot |
| `platform_commission_agorot` | snapshot `%` |
| `supplier_payout_agorot` | held released amount |
| `collected_at_store_agorot` | מה שהעסק גבה (לא payout פלטפורמה) |
| `redeemed_at` | |
| `status` | `eligible` / `included` / `paid` / `clawback` |

Idempotency: מפתח `payout:voucher:{voucher_id}` UNIQUE.  
Replay redeem → לא יוצר payout כפול.

---

## 3. Physical immediate split

"Immediate" = לוגי ב-ledger מיד ב-`paid`, לא בהכרח העברה בנקאית באותו רגע.

| רכיב | חישוב |
|---|---|
| Gross | `paid_on_site` לשורת הספק |
| Platform | `commission_agorot` מסנאפשוט |
| Supplier due | Gross − commission |
| Hold | T+N ימי עסקים / עד shipped לפי מדיניות |
| Clawback | refunds / chargebacks |

אסור לשלם לספק על סכום שעדיין ב-dispute Cardcom פתוח (מדיניות).

---

## 4. Monthly statement generation

| פריט | תוכן |
|---|---|
| תקופה | חודש קלנדרי `Asia/Jerusalem` או מחזור 1–סוף |
| ספק | כל `suppliers.status=active` עם תנועה או יתרה |
| סעיפים | physical eligible, coupon released, refunds, adjustments, fees |
| פלט | `/admin/reports/supplier-settlements` + קובץ לספק בפורטל |
| ייצוא | CSV UTF-8 BOM (ראה Admin Reports) |

סטטוסי statement:

```text
draft → open_for_dispute → finalized → payout_in_progress → closed
```

---

## 5. Dispute window

| פרמטר | יעד התחלתי |
|---|---|
| משך | 5 ימי עסקים אחרי הפצת statement `open_for_dispute` |
| מי יכול לפתוח | supplier owner / admin |
| נושאים | סכום שגוי, redeem חסר, clawback לא מוצדק |
| אחרי החלון | `finalized`; שינוי רק עם admin override + audit |
| במהלך חלון | אין העברה בנקאית סופית על הסכום השנוי במחלוקת |

תוצאות: accept / adjust ledger / reject עם נימוק עברית.

---

## 6. Payout batch (ops)

1. סינון `eligible` + statements finalized
2. מינימום payout (אם מוגדר)
3. יצירת batch + קובץ בנק
4. סימון `paid` + `paid_at` + reference
5. הודעה לספק (אופציונלי)

כישלון העברה: לא לשכתב ledger כפול; סטטוס `payout_failed` + retry.

---

## 7. Acceptance

- [ ] Redeem יוצר payout record אידמפוטנטי
- [ ] פיזי משתמש ב-snapshot בלבד
- [ ] Statement חודשי + dispute window
- [ ] Admin + supplier יכולים לראות יתרות לפי RBAC
- [ ] Refunds יוצרים clawback

---

## 8. Revision

| Date | Change |
|---|---|
| 2026-08-03 | מסמך ראשוני על arch/docs-queue |
