# ארכיטקטורה: כללי תמחור

`platform_percent` דינמי פר מוצר (חובה, בלי default), `coupon_price` מוחלט, snapshots, ומבצעים.

Status: **BINDING** · עודכן: 2026-08-12 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #5/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/BUSINESS-MODEL.md
docs/CONTRADICTIONS.md
docs/ARCHITECTURE-COMMERCE.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-SEASONAL-CAMPAIGNS.md
docs/ARCHITECTURE-REFERRAL.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
```

מודל כסף: **No Escrow**. אין held/נאמן/J5. אין עמלה קבועה גלובלית.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| P1 | אין עמלה גלובלית. `platform_percent` **פר מוצר**, בלי default, admin only. שדה ריק = שגיאת ולידציה. |
| P2 | `platform_percent + supplier_split_percent = 100` (DB CHECK). |
| P3 | קופון: `coupon_price` / `coupon_price_ils` מוחלט באתר (לא נגזר מאחוז). יתרה בעסק = face − coupon. **No Escrow**. |
| P4 | פיזי: הלקוח משלם 100% באתר; פיצול לפי snapshot של `platform_percent`. |
| P5 | `discount_percent` לתצוגה/באדג' בלבד; לא מקור חיוב Cardcom. |
| P6 | מבצע בזק = חלון זמן + מחיר חלופי לפי שעון שרת. |
| P7 | אחרי יצירת הזמנה: snapshots על `order_items` לא משתנים כשהמוצר מתעדכן. |
| P8 | אין תעריף מחייב ברמת ספק (`suppliers.commission_*` אינו default ליצירת מוצר). |
| P9 | דמי ביטול חוקיים 5% או 100₪ ו-VAT 18% הם statutory; **לא** commission. |

---

## 1. שדות כסף במוצר

| שדה חי | תפקיד |
|---|---|
| `platform_percent` | אחוז פלטפורמה מהסכום שנגבה באתר |
| `supplier_split_percent` | משלים ל-100 |
| `coupon_price_ils` / agorot | מחיר קופון באתר (מוחלט) |
| face / compare | ערך נקוב לתצוגה ויתרת עסק |
| `discount_percent` | תצוגה |
| `cashback_percent` | אופציונלי; snapshot בזמן קנייה |
| `coupon_expiry_days` | בסיס ל-`expires_at` ב-mint |

חישוב פנימי באגורות integer (`src/lib/money` / commerce money). Cardcom מקבל ILS עשרוני מאותו מספר אגורות.

---

## 2. קופון מול פיזי

### קופון

```text
charged_on_site = coupon_price
platform_revenue = charged_on_site   (100% לפלטפורמה; No Escrow)
supplier_due_from_platform = 0
balance_at_business = face - coupon_price
```

### פיזי

```text
charged_on_site = price
platform_fee = round(charged * platform_percent / 100)
supplier_due = charged - platform_fee
```

Payout לספק פיזי = מסלול נפרד (T+N), לא בתוך Cardcom charge.

---

## 3. Snapshot

ב-`beginCheckout` מועתקים לשורת `order_items` לפחות: `platform_percent`, פיצול ספק, סכומי on-site / fee / due / balance, זהות ספק לתצוגה.

Finalize, refund, payout ודוחות נשענים על ה-snapshot, לא על `products` החי.

---

## 4. אסור

- default `platform_percent = 5` / 10 / כל קבוע במוצר  
- נאמן / J5 / held לספק על מקדמת קופון  
- שינוי רטרואקטיבי של % על הזמנות `paid`  
- חיוב מלקוח לפי מחיר ששמר האורח בעגלה  

---

## 5. Acceptance

- [ ] P1-P9 מתועדים  
- [ ] נוסחאות קופון/פיזי תואמות No Escrow  
- [ ] Snapshot חובה לפני LP  
- [ ] Statutory fees מופרדים מ-commission  
- [ ] אין default אחוז ברמת ספק  

---

## 6. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | QA-PASS חבילת 20 |
| 2026-08-12 | batch-2 #5: רענון BINDING + קישור CHECKOUT-FLOW |
