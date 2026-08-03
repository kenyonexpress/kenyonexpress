# ארכיטקטורה: אנליטיקה

אירועי משפך **מצפייה בדיל עד מימוש**, והמלצה: **PostHog** (מוצר) + **GA4** (מרקטינג).

Status: **BINDING** · עודכן: 2026-08-03  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-ANALYTICS-BI.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
```

עקרון: משפך התנהגותי באירועים; **כסף עסקי רק מה-ledger**. בלי PII ב-payloads.

---

## 0. המלצה: GA4 מול PostHog

| קריטריון | GA4 | PostHog |
|---|---|---|
| משפכי מוצר | מסורבל | חזק |
| Google Ads / Search Console | חזק | חלש |
| פרטיות / שליטה | מעבד Google | שליטה טובה יותר |
| Session replay | מוגבל | חזק (רק אחרי consent, בלי PII) |
| עלות התחלה | חינם עד סף | חינם/cloud; self-host אפשרי |

### הכרעה

| שכבה | כלי |
|---|---|
| מקור אמת פנימי | `analytics_events` ב-Postgres |
| Product analytics | **PostHog** |
| Marketing / Ads | **GA4** + Consent Mode |
| GMV / עמלה | דוחות אדמין מה-ledger בלבד |

---

## 1. משפך מחייב: צפייה בדיל → מימוש

```text
view_product
  → add_to_cart
  → begin_checkout
  → purchase          (server / ledger derived)
  → coupon_view       (פתיחת דף/אפ קופון; אופציונלי)
  → coupon_redeemed   (server / ledger derived)
```

| שלב | event_name | מקור |
|---|---|---|
| צפייה בדיל | `view_product` | client |
| הוספה לעגלה | `add_to_cart` | client |
| התחלת קופה | `begin_checkout` | client |
| תשלום | `purchase` | server |
| מימוש | `coupon_redeemed` | server |

מדדי משפך ב-PostHog: conversion בין השלבים.  
מדדי כסף ב-SQL: on-site GMV, take, redemptions.

---

## 2. Envelope (בלי PII)

```json
{
  "event_id": "uuid",
  "event_name": "view_product",
  "schema_version": 1,
  "occurred_at": "…",
  "session_id": "uuid",
  "user_id": "uuid-or-null",
  "consent": { "analytics": true, "marketing": false },
  "context": { "locale": "he-IL", "path": "/product/…", "ip_trunc": "1.2.3.0" },
  "props": { "product_id": "uuid", "product_type": "coupon", "list_price_agorot": 12000 }
}
```

אסור: email, phone, שם, IP מלא, מחרוזת חיפוש גולמית, PAN.

---

## 3. מיפוי לכלים

| פנימי | GA4 | PostHog |
|---|---|---|
| `view_product` | `view_item` | `view_product` |
| `add_to_cart` | `add_to_cart` | `add_to_cart` |
| `begin_checkout` | `begin_checkout` | `begin_checkout` |
| `purchase` | `purchase` (value = on-site) | `purchase` |
| `coupon_redeemed` | custom אופציונלי | `coupon_redeemed` |

SDKs נטענים רק אחרי consent.

---

## 4. Acceptance

- [ ] משפף מלא עד מימוש מתועד  
- [ ] המלצת PostHog+GA4 מפורשת  
- [ ] Deny-list PII  
- [ ] כסף לא מ-`sum` ב-GA4/PostHog  

---

## 5. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | משפך צפייה→מימוש + המלצת GA4/PostHog |
