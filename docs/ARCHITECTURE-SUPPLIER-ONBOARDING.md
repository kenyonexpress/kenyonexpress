# ARCHITECTURE-SUPPLIER-ONBOARDING.md

ארכיטקטורת **גיוס ו-onboarding ספקים**.

Status: BINDING · worktree

```
/Users/ofir/kenyonexpress-web/ke-arch
```

branch:

```
arch/docs-queue
```

Date: 2026-07-31  
Scope: docs בלבד.  
Companions: supplier-portal, admin, legal, fulfillment.

---

## 0. עקרונות

1. ספק לא עולה לאוויר בלי אימייל תפעולי + אישור בעלים/אדמין.
2. מוצרים דורשים `platform_percent` (פיזי) ו/או `coupon_price_ils` (קופון) לפני publish.
3. ספק מבין: קופון prepaid נשאר בפלטפורמה; יתרה נגבית בעסק בסריקה.
4. אין Escrow בהסבר או בחוזה תפעולי.

---

## 1. שלבים

```
Lead → KYC קל (ח.פ/עוסק, איש קשר) → יצירת suppliers row
  → הזמנת חבר ל-supplier_members
  → הדרכת סורק QR
  → העלאת מוצרים (draft)
  → אישור אדמין (publish)
  → go-live ספק
```

---

## 2. נתונים מינימליים

| שדה | חובה |
|---|---|
| שם מסחרי | כן |
| ח.פ / עוסק | כן לפני payout פיזי |
| אימייל + טלפון | כן |
| כתובת עסק (קופון) | כן לקופונים |
| תנאי payout | לפי 051 |

---

## 3. גישה

- `supplier_members` + RLS.
- סורק: רק אחרי חברות פעילה.
- אדמין יכול להשעות ספק (מוצרים unpublish).

---

## 4. הדרכה (תוכן)

צ'קליסט קצר לספק:

1. איך סורקים קופון
2. מה הלקוח משלם בעסק
3. איך מעדכנים משלוח פיזי
4. איפה רואים יתרות payout (פיזי בלבד)

---

## 5. Revision

| Date | Change |
|---|---|
| 2026-07-31 | Supplier onboarding (`arch/docs-queue`) |
