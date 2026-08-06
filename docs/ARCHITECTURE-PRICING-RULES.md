# ארכיטקטורה: כללי תמחור

`platform_percent` דינמי פר מוצר, מבצעי בזק, והנחות תצוגה.

Status: **BINDING** · עודכן: 2026-08-06 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-INVENTORY.md
docs/BUSINESS-MODEL.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-SEASONAL-CAMPAIGNS.md
docs/ARCHITECTURE-B2B-SALES.md
```

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| P1 | אין עמלה גלובלית. `platform_percent` **פר מוצר**, בלי default, admin only. |
| P2 | `platform_percent + supplier_split_percent = 100`. |
| P3 | קופון: `coupon_price_ils` מוחלט באתר; יתרה בעסק = face − coupon; **No Escrow**. |
| P4 | פיזי: פיצול on-site לפי snapshot ב-`order_items`. |
| P5 | `discount_percent` לתצוגה בלבד; לא מקור חיוב. |
| P6 | מבצע בזק = חלון זמן + מחיר חלופי לפי שעון שרת. |
| P7 | אחרי paid: snapshots לא משתנים. |

---

## 1. שדות כסף במוצר

| שדה | תפקיד |
|---|---|
| `price_ils` | מחירון / שווי דיל |
| `coupon_price_ils` | תשלום באתר לקופון |
| `platform_percent` | עמלת פלטפורמה (פיזי; בקופון לביקורת) |
| `supplier_split_percent` | משלים ל-100 |
| `discount_percent` | תווית הנחה לתצוגה |
| `flash_price_ils` | מחיר בזק אופציונלי |
| `flash_starts_at` / `flash_ends_at` | חלון הבזק |

---

## 2. מבצעי בזק

```text
if now() in [flash_starts_at, flash_ends_at) and flash_price set:
  charge = flash_price
else:
  charge = coupon_price (קופון) או price (פיזי)
```

כללים: לא מאריך אוטומטית; הארכה = admin + audit; מכסת מלאי עדיין חלה.

---

## 3. הנחות

| סוג | התנהגות |
|---|---|
| תווית הנחה על PDP | מ-`discount_percent` או נגזרת ממחירון מול קופון |
| קופון ארנק / referral | לא משנים `platform_percent`; מפחיתים חיוב on-site בקופה |
| קופון קוד הנחה עתידי | snapshot בזמן checkout; לא רטרואקטיבי |

---

## 4. Acceptance

- [ ] Publish נכשל בלי `platform_percent`  
- [ ] Flash לא שובר snapshots ישנים  
- [ ] קופון: platform keeps on-site; יתרה בעסק נפרדת  
- [ ] UI אדמין: זוג אחוזים = 100  

---

## 5. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | platform_percent + בזק + הנחות |
| 2026-08-06 | QA: קישור SEASONAL/B2B; חיזוק No Escrow |
