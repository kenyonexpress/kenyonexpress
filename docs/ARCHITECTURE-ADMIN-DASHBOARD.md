# ארכיטקטורה: לוח בקרה אדמין

ניהול מוצרים עם בורר **סוג מוצר**, **`platform_percent` חובה** (דינמי פר מוצר, בלי default), ומתג **WhatsApp** פר מוצר. בנוסף: ספקים ודוחות מכירות.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד.

מודל כסף: **No Escrow**. אגורות integer ב-DB; UI ב-₪.

מסמכים קשורים:

```
docs/ARCHITECTURE-PRICING-RULES.md
docs/ADMIN-PRODUCT-EDITOR-SPEC.md
docs/ARCHITECTURE-SUPPLIER-ONBOARDING.md
docs/ARCHITECTURE-ADMIN-REPORTS.md
docs/WHATSAPP-BUSINESS-SETUP.md
docs/CONTRADICTIONS.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| AD1 | Publish אסור בלי `platform_percent` מלא (וחובה סוג מוצר תקין). |
| AD2 | בורר סוג מוצר קובע שדות חובה ומסתיר שדות לא רלוונטיים. |
| AD3 | מתג WhatsApp פר מוצר (`whatsapp_enabled`); לא שידור המוני. |
| AD4 | `content_uploader` לא נוגע בכסף / סוג / WhatsApp / publish סופי. |
| AD5 | שינוי כסף אחרי publish → `audit_log`; לא משנה הזמנות ישנות (snapshot). |
| AD6 | דוחות על snapshots; אסור GMV מ-`products.platform_percent` החי. |
| AD7 | **No Escrow:** אין מדד/עמודה של כסף מוחזק לספק על קופון. |
| AD8 | אין תעריף ברמת ספק; רק אחוז פר מוצר. |

### מודל כסף (אדמין)

| סוג | באתר | פלטפורמה | ספק |
|---|---|---|---|
| קופון | `coupon_price` | 100% on-site | 0 מהפלטפורמה; יתרה בעסק |
| פיזי | מחיר מלא | `platform_percent` snapshot | payout בנקאי |
| מנוי | recurring | % snapshot למחזור | לפי SUBSCRIPTIONS |

### בורר סוג מוצר

| ערך | שדות חובה | מוסתר |
|---|---|---|
| `coupon` | coupon_price, expiry, quota, platform_percent | מלאי פיזי |
| `physical` | מחיר, מלאי, platform_percent + split=100 | coupon_price |
| `subscription` | recurring, interval, platform_percent | קופון חד-פעמי |

Publish gate נכשל אם: חסר %, חסר סוג, חסר supplier, קופון בלי coupon_price, פיזי בלי split=100.

### WhatsApp

| שדה | התנהגות |
|---|---|
| `whatsapp_enabled` | CTA ב-PDP כש-true |
| מספר | יורש `suppliers.whatsapp_phone` |
| כבוי (default) | אין כפתור |
| content_uploader | לא משנה מתג |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| default 5%/10% ב-UI | AD1: שדה ריק = לא publish. |
| עמלה ברמת ספק | AD8: פר מוצר בלבד. |
| Escrow / held metric בדשבורד | AD7: No Escrow. |
| WhatsApp שיווק המוני מהמתג | AD3: deep link בלבד. |
| GMV מ-percent חי | AD6: snapshots. |
| content_uploader מפרסם | AD4: submit בלבד. |

---

## סכמת DB

**אין DDL חדש.** שדות מוצר רלוונטיים:

```text
products (
  ...
  product_type text,
  platform_percent numeric(5,2) NOT NULL,  -- בלי DEFAULT
  supplier_split_percent numeric(5,2),
  coupon_price_agorot bigint,
  whatsapp_enabled boolean DEFAULT false,
  supplier_id uuid FK,
  ...
)

order_items (
  platform_percent numeric(5,2),  -- snapshot
  ...
)

audit_log (
  action, entity_type, entity_id, admin_id, payload jsonb, ...
)
```

מיגרציה pending: `003-products-whatsapp-enabled.sql` (אם לא הוחלה).

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | שינוי סוג מוצר אחרי הזמנות | archive + מוצר חדש (guard) |
| CE2 | WhatsApp on בלי טלפון ספק | אזהרה / חסימת שמירה |
| CE3 | publish בלי platform_percent | validation נכשל |
| CE4 | admin משנה % אחרי publish | audit_log; הזמנות ישנות ללא שינוי |
| CE5 | content_uploader מנסה publish | נדחה |
| CE6 | דוח עם "escrow held" | **אין** עמודה (AD7) |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | `service` product_type: האם ב-v1 | PRODUCT-TYPES |
| O2 | migration whatsapp_enabled על prod | pending approval |
| O3 | preview ₪ ב-PDP admin | ADMIN-PRODUCT-EDITOR-SPEC |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | מוצרים / ספקים / דוחות |
| 2026-08-12 | batch-2: BINDING; 5 סעיפים; No Escrow |
