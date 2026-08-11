# SEED-SUPPLIERS-SPEC.md
# מפרט ייבוא/מיפוי ספקים מ-WordPress

מיפוי שדות ספק מ-WP (REST / meta) ל-`public.suppliers`, ולידציה לפני publish דילים, geo, שעות פתיחה, ו-WhatsApp.

Status: **SPEC** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`

מסמכים קשורים:

```
docs/ARCHITECTURE-WP-DATA-MIGRATION.md
docs/GEO-FEATURES-SPEC.md
docs/SUPPLIER-ONBOARDING.md
docs/LAUNCH-VALIDATION.md
docs/GO-LIVE-CHECKLIST.md
docs/ARCHITECTURE-SUPPLIER-ONBOARDING.md
docs/BUSINESS-MODEL.md
```

עקרון: דיל השקה בלי ספק `verified` (שם + טלפון + כתובת + לוגו מינימליים) **לא** עולה לשיווק ממומן.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| SS1 | יעד: שורת `suppliers` אמיתית לכל דיל השקה; לא synthetic "legacy WP" בלי פרטי חנות. |
| SS2 | מקור WP: WooCommerce store / vendor plugin / ACF על מוצר או על user vendor. |
| SS3 | `whatsapp` נשמר בנפרד מ-`contact_phone` כשאפשר; אחרת נגזר מטלפון ישראלי מנורמל. |
| SS4 | `lat`/`lng` רק ממקור מאומת או geocode מכתובת; לא מ-meta ישן שגוי. |
| SS5 | `opening_hours` ב-jsonb סטנדרטי (ראה §4); חסר → null, לא מחרוזת חופשית באנגלית. |
| SS6 | ולידציית publish: `supplierReadiness` (שם, טלפון, כתובת, לוגו). |
| SS7 | מיגרציות/seed ל-prod רק אחרי בדיקה ב-Preview; MCP ל-DDL בלבד. |

---

## 1. מצב סכמה (כיוון)

### 1.1 קיים היום (טיפוסים)

| עמודה | חובה ל-seed השקה |
|---|---|
| `name` | כן |
| `contact_phone` | כן (publish) |
| `address` | כן (publish) |
| `logo_url` | כן (publish) |
| `city` | מומלץ |
| `whatsapp` | מומלץ |
| `contact_email` / `contact_name` | אופציונלי |
| `website` | אופציונלי |
| `status` | `active` לדילים חיים |
| `business_id` | אופציונלי (ח.פ) |

### 1.2 יעד להוספה (DDL נפרד; GEO)

| עמודה | תפקיד |
|---|---|
| `lat` / `lng` | מרחק + מפה + JSON-LD |
| `opening_hours` jsonb | "פתוח עכשיו" / תצוגה |
| `waze_link` text או נגזר | ניווט מה-PDP |
| `payout_hold_business_days` / `min_payout_agorot` | לפי PAYOUT (פיזי) |

עד שהעמודות קיימות בפרוד: לשמור geo/שעות ב-CSV נלווה או ב-`notes` **רק זמנית**; לא כמקור אמת ארוך טווח.

---

## 2. מיפוי מ-WordPress

| יעד Kenyon | מקורות WP אפשריים (לפי סדר עדיפות) | הערות |
|---|---|---|
| `name` | vendor store name / ACF `business_name` / product `meta.supplier_name` | חובה; trim עברית |
| `contact_phone` | ACF `phone` / vendor billing phone / meta `_phone` | נרמול IL (§5) |
| `whatsapp` | ACF `whatsapp` / אותו טלפון אם wa.me בשימוש באתר הישן | נרמול ל-E.164 או ספרות מקומיות |
| `address` | ACF `address` / vendor address1+city | מחרוזת אחת לתצוגה + Waze |
| `city` | ACF `city` / חלק מכתובת | לסינון GEO |
| `logo_url` | vendor avatar / ACF image → pipeline R2/Storage | לא להשאיר URL של WP ארוך טווח |
| `website` | vendor website | אופציונלי |
| `contact_email` | vendor email | לא לחשוף ב-PDP בלי מדיניות |
| `lat`,`lng` | ACF `location` / geocode Google/Here מכתובת | §3 |
| `opening_hours` | ACF hours repeater / serialized WP | §4 |
| `business_id` | ACF `vat_id` / ח.פ | payout / חשבוניות |
| קישור מוצר→ספק | `vendor_map.csv` (`wp_vendor_id,supplier_id`) או meta על המוצר | ראה WP-DATA-MIGRATION §2.4 |

אם אין vendor plugin: כל מוצר ממופה ידנית ב-`vendor_map.csv` או נוצר ספק אחד לכל רשת/מותג.

---

## 3. Geo

```text
כתובת מלאה בעברית
  → geocode (שירות מאושר) → lat/lng
  → שמירה רק אם confidence גבוה / אימות ידני באדמין
  → waze_link = https://waze.com/ul?ll={lat},{lng}&navigate=yes
     או חיפוש לפי address encoded
```

כללים:

- אין lat/lng מזויפים ל-SEO.  
- JSON-LD LocalBusiness עם geo רק כשיש קואורדינטות מאומתות (`GEO-FEATURES-SPEC`).  
- כשל geocode: ספק עדיין יכול להיות `active` לחנות; סינון "קרוב אליי" מדלג עליו.

---

## 4. שעות פתיחה (`opening_hours`)

פורמט יעד (jsonb):

```json
{
  "timezone": "Asia/Jerusalem",
  "weekly": [
    { "day": 0, "open": "09:00", "close": "17:00" },
    { "day": 5, "open": null, "close": null }
  ],
  "exceptions": [
    { "date": "2026-09-23", "open": null, "close": null, "note_he": "סגור בחג" }
  ]
}
```

`day`: 0=ראשון … 6=שבת (כמו JS `getDay` בלוח מקומי אחרי המרה ל-Asia/Jerusalem).

מיפוי מ-WP: אם ACF מחזיר טקסט חופשי ("א׳–ה׳ 9–17") → פרסור ידני ב-seed או השארה ב-`notes` עד ניקוי; **לא** לזייף jsonb שגוי.

---

## 5. טלפון ו-WhatsApp

| שלב | כלל |
|---|---|
| קלט | ספרות / `+972` / `05x-...` |
| נרמול | ספריית `lib/whatsapp` (מקומי↔בינלאומי) |
| `contact_phone` | תצוגה + `tel:` |
| `whatsapp` | ל-`wa.me` ב-PDP; אם ריק → נגזר מ-`contact_phone` אחרי נרמול |
| ולידציה | לפחות 9 ספרות משמעותיות לישראל; אחרת fail seed |

אין לשמור קישור `wa.me` מלא בעמודה; רק מספר מנורמל.

---

## 6. ולידציה (שערי איכות)

### 6.1 לפני `status=active` לדילי השקה

| בדיקה | חומרה |
|---|---|
| `name` לא ריק | חוסם |
| `contact_phone` תקין | חוסם |
| `address` לא ריק | חוסם |
| `logo_url` HTTPS תקין | חוסם ל-publish מוצר |
| `city` | אזהרה |
| `whatsapp` או נגזר מטלפון | אזהרה |
| `lat`/`lng` זוג תקין או שניהם null | חוסם אם אחד בלבד |

מיושר ל-`supplierReadiness` באדמין ול-`GO-LIVE-CHECKLIST` / `FINAL-REPORT` §7 (ספקים בלי כתובת/לוגו).

### 6.2 אחרי seed

- [ ] ספירת ספקים `active` עם ארבעת שדות החובה  
- [ ] כל דיל השקה `supplier_id` מצביע לספק קיים ולא ל-legacy ריק  
- [ ] מדגם: לחיצה ל-WhatsApp + Waze מ-PDP  
- [ ] אין מספרי בדיקה / lorem בלוגו  

---

## 7. תהליך seed מומלץ

```text
1. ייצוא/סריקת WP (REST + meta) → suppliers_raw.csv
2. ניקוי ידני: שם, טלפון, כתובת, עיר
3. vendor_map.csv: wp_id → supplier slug
4. העלאת לוגו ל-Storage
5. geocode באצ' + סקירת outliers
6. INSERT/UPSERT suppliers (Preview)
7. קישור products.supplier_id
8. סימון verified ב-LAUNCH-VALIDATION
9. רק אז Production (זהירות יתרה)
```

Idempotency: מפתח טבעי `business_id` או `slug` יציב; לא לשכפל ספקים בכל ריצה.

---

## 8. Acceptance

- [ ] טבלת מיפוי §2 מול המקור האמיתי ב-WP מתועדת  
- [ ] ≥ 5/10 דילי השקה עם ספק שעובר §6.1  
- [ ] WhatsApp נפתח ממספר מנורמל  
- [ ] אין lat בלי lng  
- [ ] opening_hours תקין או null  
- [ ] אין Escrow בניסוח ספק  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | מפרט seed ספקים: מיפוי WP, ולידציה, geo, שעות, WhatsApp |
