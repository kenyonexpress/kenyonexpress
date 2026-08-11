# ארכיטקטורה: התחשבנות ספקים

מחזורי settlement לספקים: פיזי בלבד ב-payout; קופון ללא payout מהפלטפורמה; דוח חודשי; חלון מחלוקת.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף: **No Escrow**. אין held-until-redeem. מקדמת קופון = הכנסת פלטפורמה; `supplier_due` מהפלטפורמה = 0.

מסמכים קשורים:

```
docs/ARCHITECTURE-SUPPLIER-ANALYTICS.md
docs/ARCHITECTURE-ADMIN-REPORTS.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/ARCHITECTURE-SUPPLIER-ONBOARDING.md
docs/ARCHITECTURE-PAYOUT-MECHANISM.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/LEGAL-CHECKLIST.md
```

---

## 0. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| SS1 | **קופון: אין payout** מהפלטפורמה. מקדמה באתר = 100% הכנסת פלטפורמה. redeem לא יוצר payout record. |
| SS2 | **פיזי:** אחרי `paid`, יתרת ספק (אחרי עמלה מהסנאפשוט) נכנסת ל-settlement; payout אחרי T+N + שער משלוח. |
| SS3 | אין חישוב מחדש מ-`products.platform_percent` החי בזמן settlement. |
| SS4 | דוח חודשי לכל ספק פעיל; CSV/PDF יעד. |
| SS5 | חלון מחלוקת לפני סגירת מחזור (dispute window). |
| SS6 | Refunds יוצרים clawback / `supplier_debit` על פיזי ששולם. |
| SS7 | **נדחה במפורש:** held-until-redeem, Escrow פנימי, payout על redeem קופון. |
| SS8 | כל סכום באגורות integer; snapshot בלבד. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| **held-until-redeem** לחלק ספק מהמקדמה | **נדחה.** סותר No Escrow. מקדמה = הכנסת פלטפורמה. |
| payout record על redeem קופון | supplier_due מהפלטפורמה = 0; אין מסלול. |
| Escrow פנימי 2026-07-27 | הוחלף ב-No Escrow; מסמך זה מבטל. |
| חישוב settlement מ-`products` החי | משנה היסטוריה; snapshot בלבד. |
| תשלום מיידי ב-redeem (קופון) | אין כסף פלטפורמה→ספק על קופון. |
| monthly statement בלי dispute window | ספק ללא זכות ערעור; נדחה. |

---

## 2. סכמת DB (קיים; אין DDL חדש)

| ישות | תפקיד |
|---|---|
| `settlement_events` | ledger; `kind`: `charge_settled`, `payout_settled`, `supplier_debit`, `refund` |
| `order_items` | snapshot amounts; `settlement_status` |
| `supplier_settlement_statements` | דוח חודשי (יעד) |
| `payout_batches` / lines | באצ' payout פיזי |
| `disputes` | מחלוקת על statement |
| `vouchers` | redeem = סטטוס בלבד; **לא** payout trigger |

אין טבלת `escrow_holds`. אין `held_agorot` על קופון.

אין DDL חדש במסמך זה.

---

## 3. מחזור חיים

```text
Physical line paid
  → settlement_events charge_settled (snapshot)
  → settlement_status = split_executed
  → after T+N + shipped → eligible
  → payout batch (PAYOUT-MECHANISM)

Coupon line paid
  → platform_settled (100% מקדמה לפלטפורמה)
  → voucher issued
  → redeem → status redeemed ONLY
  → NO payout record / NO held release

Monthly statement
  → sum physical eligible − clawbacks
  → dispute window
  → finalized → payout_in_progress → closed
```

---

## 4. קופון: מה קורה ב-redeem

| פעולה | קורה? |
|---|---|
| שינוי `vouchers.status` → `redeemed` | כן |
| ledger release / held | **לא** |
| payout record | **לא** |
| `collected_at_store` (informational) | כן, ב-scan log |

יתרה בעסק נגבית מחוץ לפלטפורמה. הפלטפורמה לא מעבירה כסף לספק על קופון.

---

## 5. פיזי: פיצול מיידי (ledger)

| רכיב | חישוב |
|---|---|
| Gross | `paid_on_site` לשורת הספק |
| Platform | `commission_agorot` מסנאפשוט |
| Supplier due | Gross − commission |
| Hold | T+N + שער משלוח |
| Clawback | refunds / chargebacks → `supplier_debit` |

---

## 6. דוח חודשי

```text
draft → open_for_dispute → finalized → payout_in_progress → closed
```

| פריט | תוכן |
|---|---|
| תקופה | חודש קלנדרי Asia/Jerusalem |
| סעיפים | physical eligible, refunds, adjustments |
| **לא** | coupon payout / held release |
| פלט | admin reports + פורטל ספק |

---

## 7. חלון מחלוקת

| פרמטר | יעד |
|---|---|
| משך | 5 ימי עסקים אחרי `open_for_dispute` |
| מי פותח | supplier owner / admin |
| אחרי החלון | `finalized`; override רק admin + audit |

---

## 8. מקרי קצה

| מקרה | התנהגות |
|---|---|
| redeem קופון | סטטוס בלבד; **אין** payout |
| refund קופון issued | refund ללקוח; לא clawback ספק (לא קיבל payout) |
| refund פיזי אחרי payout | `supplier_debit`; קיזוז בבאג' הבא |
| dispute במהלך חלון | freeze סכום disputed |
| statement עם 0 תנועה | draft ריק; לא payout |
| ספק suspended | לא statement חדש; יתרות קיימות נשמרות |
| duplicate redeem replay | idempotent; לא payout כפול (N/A לקופון) |
| chargeback פתוח | exclude מ-finalized |
| held-until-redeem (legacy doc) | **נדחה**; לא לממש |

---

## 9. Acceptance

- [ ] redeem קופון: **אין** payout record
- [ ] held-until-redeem **נדחה** במפורש
- [ ] פיזי: snapshot בלבד
- [ ] statement חודשי + dispute window
- [ ] Refunds → clawback על פיזי

---

## 10. פתוחות

| ID | שאלה | ברירת מחדל |
|---|---|---|
| Q-SS-STMT | שם טבלת statement סופי? | `supplier_settlement_statements` |
| Q-SS-PDF | PDF generation? | v2 |

---

## 11. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | מסמך ראשוני (Escrow; deprecated) |
| 2026-08-12 | batch-2: No Escrow; **דחיית held-until-redeem**; BINDING template |
