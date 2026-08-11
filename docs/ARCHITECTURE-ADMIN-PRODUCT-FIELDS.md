# ארכיטקטורה: שדות מוצר באדמין

כל שדה בדף מוצר באדמין, ולידציה, והשפעה על ה-storefront.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/ADMIN-PRODUCT-EDITOR-SPEC.md
docs/PRODUCT-FIELDS-RESEARCH.md
docs/ARCHITECTURE-PRODUCT-TYPES.md
docs/ARCHITECTURE-MONEY.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/BUSINESS-MODEL.md
docs/CONTRADICTIONS.md
```

מודולי קוד קנוניים (קריאה בלבד):

```
src/components/admin/ProductForm.tsx
src/server/actions/admin/products.ts
src/lib/commerce/product-money.ts
```

מודל כסף: **No Escrow**. אגורות integer במסלול חיוב; טופס אדמין מקבל ₪ ועובר נרמול. `platform_percent` בלי default. אין ניסוח Escrow/held בטופס.

יחס ל-`ADMIN-PRODUCT-EDITOR-SPEC.md`: SPEC = UX/מבנה מסך. המסמך הזה = BINDING לשדות, שערי ולידציה, והשפעת storefront. בהתנגשות על כסף גובר MONEY.

---

## 0. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| AF1 | מקור אמת לשמירה: Zod ב-`upsertProduct` + `buildProductMoneyWrite` / `assertPublishable`. Client = UX בלבד. |
| AF2 | Discriminator: `type` ∈ {`coupon`,`physical`} בטופס החי. `subscription` = יעד UI (PRODUCT-TYPES); לא בשמירה עד דגל. |
| AF3 | `platform_percent` חובה; אין default; null ≠ 0. זוג עם `supplier_split_percent` = 100. |
| AF4 | קופון: `coupon_price_ils` מוחלט; `discount_percent` נגזר לתצוגה. פיזי: `discount_percent` מקטין חיוב באתר. |
| AF5 | Publish ל-`active` דורש שערי publish (כסף + ספק ready). `draft`/`paused`/`archived` רכים יותר בשמירה, אבל בלי % תקין המוצר לא יתומחר ב-storefront. |
| AF6 | שינוי שדה כסף אחרי מכירות **לא** משנה `order_items` ישנים (snapshot). משנה רק קניות חדשות ותצוגת PDP. |
| AF7 | סטטוס חנות: רק `active` (+ לא `deleted_at`) מוצג/נקנה. `draft`/`paused`/`archived` מוסתרים מהקטלוג. |
| AF8 | `commission_type` נכתב מה-`type` (לא שדה טופס חופשי). |
| AF9 | ספק לא עורך את הטופס הזה; אדמין בלבד לעמודות כסף. |
| AF10 | UI RTL עברית; מספרי כסף `dir=ltr`. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Default ל-`platform_percent` (5/10/100) | מסתיר מוצר לא מוגדר; CONTRADICTIONS C1. |
| הנחת קופון ידנית שסותרת את שני המחירים | באג quote≠charge; נגזר בלבד. |
| ולידציה רק ב-client | עוקפים ב-DevTools; Zod חובה. |
| ספק כותב `%` / `coupon_price` | תנאי מפעיל; SUPPLIER-PORTAL. |
| שינוי מחיר רטרואקטיבי על הזמנות | שובר כסף/חשבוניות; snapshot. |
| הסתמכות על `is_coupon_enabled` במקום `type` | דגל מורשת; `type` קנוני (PRODUCT-TYPES). |

---

## 2. סכמת DB (קיים; אין DDL חדש)

טבלת `products` (+ `product_variants`). שמות twin `*_ils` / `*_agorot` לפי cutover. אין DDL במסמך זה.

סטטוסים בטופס החי: `draft` | `active` | `paused` | `archived`.

---

## 3. קטלוג שדות מלא

מקרא השפעה:

| קוד | משמעות |
|---|---|
| PDP | דף מוצר / כרטיס |
| CAT | בית / קטגוריה / חיפוש |
| CART | עגלה + תמחור |
| PAY | beginCheckout / Cardcom |
| VOUCH | הנפקת שובר |
| SEO | meta / sitemap |
| OPS | אדמין/מלאי/ספק בלבד |

### 3.1 זהות וניווט

| שדה | לייבל אדמין | חובה | ולידציה | Storefront |
|---|---|---|---|---|
| `name_he` | שם בעברית | כן | ≥2 תווים | PDP כותרת, CAT, עגלה, מיילים |
| `name_en` | שם באנגלית | לא | (אין) | אופציונלי / פנימי |
| `slug` | קישור | כן | `^[a-z0-9-]+$`, ≥2 | URL `/product/[slug]`, SEO |
| `sku` | מק״ט | לא | (אין) | OPS; וריאנטים |
| `description_he` | תיאור | לא* | (אין) | PDP גוף (*רצוי לפני active) |
| `category_id` | קטגוריה | לא* | UUID | CAT סינון/ניווט |
| `type` | סוג מוצר | כן | `physical`\|`coupon` | מסלול מחיר/fulfillment |
| `status` | סטטוס | כן | enum למעלה | רק `active` ב-storefront |
| `supplier_id` | ספק | ל-publish | UUID + readiness | PDP זהות ספק; redeem binding |

### 3.2 כסף ופיצול

| שדה | לייבל | חובה | ולידציה | Storefront |
|---|---|---|---|---|
| `kenyon_price` | מחיר רגיל (₪) | כן | ≥0; לקופון = face | PDP face; CART base |
| `full_price` | מחיר לפני הנחה | לא | ≥ `kenyon_price` אם קיים | PDP מחיר מחוק |
| `platform_percent` | עמלת פלטפורמה % | כן | 0-100; אין default | לא מוצג ללקוח; CART/PAY snapshot |
| `supplier_split_percent` | אחוז לספק % | כן* | משלים ל-100 | לא ללקוח; snapshot (*או נגזר בטופס) |
| `discount_percent` | אחוז הנחה | פיזי: כן | 0-100 | פיזי: מקטין חיוב; קופון: badge נגזר |
| `coupon_price_ils` | מחיר קופון באתר | קופון: כן | >0 ו-≤ face | PDP/CART/PAY סכום חיוב |
| `coupon_expiry_days` | תוקף שובר (ימים) | קופון: כן | int >0 | VOUCH → `expires_at` |
| `offer_valid_until` | מבצע בתוקף עד | לא | date | הסתרת מבצע / תוקף תצוגה |
| `commission_type` | (לא בטופס) | נגזר | CHECK מול type | PAY צורת עמלה |

**השפעת כסף לפי סוג (No Escrow):**

| | קופון | פיזי |
|---|---|---|
| לקוח באתר | `coupon_price` | מחיר אחרי `discount_percent` |
| לקוח בעסק | face − coupon | 0 |
| פלטפורמה | 100% מהמקדמה | `platform_percent` מהשורה |
| ספק מהפלטפורמה | 0 | יתרה ב-payout |

תצוגת preview בטופס חייבת לא להבטיח payout על מקדמת קופון.

### 3.3 דגלים

| שדה | לייבל | ולידציה | Storefront |
|---|---|---|---|
| `is_featured` | מוצר מומלץ | bool | CAT/בית מדפים מומלצים |
| `is_coupon_enabled` | ניתן כקופון | bool | מורשת; עדיף יישור ל-`type=coupon` |

### 3.4 תוכן שיווקי

| שדה | לייבל | ולידציה | Storefront |
|---|---|---|---|
| `short_description_he` | תיאור קצר | ≤300 | כרטיסים / תקציר PDP |
| `highlights` | נקודות מכירה | מערך שורות | PDP רשימת יתרונות |
| `brand` | מותג | (אין) | PDP |
| `video_url` | קישור וידאו | URL תקין אם מלא | PDP מדיה |
| `barcode` | ברקוד | (אין) | OPS |
| `images[]` | תמונות | JSON; ≥1 ל-publish מומלץ | PDP גלריה, CAT, OG |
| `variants[]` | וריאנטים | name+sku; מלאי/מחיר | PDP בחירה; CART stock (פיזי) |

### 3.5 פרטי קופון (תוכן)

| שדה | לייבל | Storefront |
|---|---|---|
| `coupon_terms_he` | תנאי הקופון | PDP תנאים |
| `redemption_instructions_he` | הוראות מימוש | PDP + אזור אישי/שובר |
| `min_purchase_ils` | מינימום רכישה בעסק | PDP גילוי נאות |

### 3.6 מלאי ולוגיסטיקה

| שדה | לייבל | ולידציה | Storefront |
|---|---|---|---|
| `stock_quantity` | מלאי | int ≥0 או null=ללא הגבלה | CART זמינות; פיזי |
| `low_stock_threshold` | סף מלאי נמוך | int ≥0 (ברירת 5) | OPS התראות |
| `max_per_order` | מקס׳ להזמנה | int ≥1 או null | CART/checkout cap |
| `condition` | מצב | new/refurbished/used | PDP |
| `requires_shipping` | דורש משלוח | bool | checkout כתובת (פיזי) |
| `weight_grams`, `length_cm`, `width_cm`, `height_cm` | מידות | ≥0 | OPS משלוח |
| `warranty_months` | אחריות | int ≥0 | PDP |

### 3.7 SEO

| שדה | לייבל | ולידציה | Storefront |
|---|---|---|---|
| `seo_title` | כותרת SEO | ≤70 | `<title>` / OG |
| `seo_description` | תיאור SEO | ≤170 | meta description |
| `seo_keywords` | מילות מפתח | (אין) | משני / פנימי |

### 3.8 מנוי (יעד; לא בשמירה הנוכחית)

| שדה | חובה לפרסום מנוי | Storefront עתידי |
|---|---|---|
| `recurring_amount` | כן | מחיר לחודש |
| `billing_interval` | `monthly` | תנאי חיוב |
| `max_billing_cycles` | לא | תקרת מחזורים |

---

## 4. שערי ולידציה

### 4.1 שמירה (תמיד)

| כלל | הודעה (עברית) |
|---|---|
| `name_he` קצר | שם חייב להכיל לפחות 2 תווים |
| slug לא חוקי | קישור: אותיות לועזיות, מספרים ומקפים |
| `platform_percent` חסר/לא מספר | עמלת פלטפורמה נדרשת |
| זוג % ≠ 100 | חייבים להסתכם ב-100% |
| `full_price` < kenyon | מחיר מלא ≥ מחיר רגיל |
| coupon > face | מחיר הקופון לא יכול לעלות על המחיר הרגיל |
| video_url שבור | כתובת וידאו לא תקינה |
| SEO ארוך | מגבלות 70/170 |

### 4.2 Publish / `active` (`assertPublishable`)

| כלל | שדה |
|---|---|
| מחיר רגיל חיובי | `price_ils` / kenyon |
| זוג split תקין | platform / supplier_split |
| `discount_percent` מוגדר (0-100) | גם אם 0 |
| קופון: coupon_price + expiry_days | |
| ספק עם name/phone/address/logo | supplier_* |
| ספק `status=active` | supplier_status |

חסר → שמירת `active` נחסמת / המוצר לא priceable ב-cart.

### 4.3 תצוגת storefront כשחסר כסף

מוצר `active` בלי `%` או בלי coupon_price: שורה **unavailable** בעגלה (לא מנחשים אחוז). PDP עשוי להסתיר CTA קנייה.

---

## 5. מפת השפעה (בקצרה)

```text
Admin save
  → products (+ variants)
  → revalidateStorefrontCatalogue

PDP/CAT קוראים: name, images, prices, terms, supplier identity, status
CART קורא: type, kenyon/coupon/discount, platform_percent, stock, max_per_order
PAY מצלם: percents, amounts, supplier_* → order_items (immutable)
VOUCH קורא: expiry_days, product/supplier ids מההזמנה
```

| שינוי אדמין | מה הלקוח רואה מיד | מה לא משתנה |
|---|---|---|
| מחיר / coupon_price | PDP + עגלות חדשות | הזמנות ששולמו |
| platform_percent | לא ללקוח; פיצול בקניות חדשות | snapshots ישנים |
| status → paused | נעלם מהקטלוג | שוברים שכבר הונפקו |
| תנאי / הוראות מימוש | PDP + שוברים חדשים | טקסט שכבר נשלח במייל ישן (אלא אם נמשך חי) |
| is_featured | מיקום במדפים | (אין) |
| stock | זמינות | הזמנות ששולמו |

---

## 6. מקרי קצה

| קוד | סימפטום | תוצאה |
|---|---|---|
| `null_platform` | שמירה בלי % | Zod דוחה / cart unavailable |
| `split_99` | 70+29 | דחייה |
| `type_flag_drift` | physical + is_coupon_enabled | cart עלול לסווג coupon; ליישר נתונים |
| `active_no_image` | בלי תמונה | מכוער/SEO חלש; לשקול חסימת publish (פתוח) |
| `slug_collision` | כפילות | כשל DB unique |
| `supplier_incomplete` | בלי לוגו | חסימת active |
| `coupon_expiry_zero` | 0 ימים | דחייה |
| `price_change_after_cart` | שינוי אחרי add | עגלה מתומחרת מחדש מה-DB החי |
| `subscription_in_form` | בחירת מנוי לפני דגל | לא לשמור; להסתיר או disabled |

---

## 7. פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | האם תמונה אחת חובה ל-`active` בשער שרת | מומלץ; עדיין לא בכל הנתיבים |
| O2 | הסרת/הסתרת `is_coupon_enabled` אחרי יישור ל-`type` | PRODUCT-TYPES O2 |
| O3 | סטטוס `published` מול `active` בתיעוד ישן | הקוד = `active` |
| O4 | מינימום `coupon_expiry_days` (למשל 120) כ-CHECK | LEGAL / מדיניות |
| O5 | שדות מנוי בטופס כש-`SUBSCRIPTIONS_ENABLED` | EDITOR-SPEC §2.3 |
| O6 | `whatsapp_enabled` (מיגרציה ממתינה) בטופס | לא ב-ProductForm החי עדיין |

עודכן: 2026-08-12.

---

## 8. Acceptance

- [ ] כל שדות הטופס החי מתועדים עם ולידציה + השפעת storefront  
- [ ] שערי שמירה מול publish מופרדים  
- [ ] No Escrow בניסוח ובטבלת כסף  
- [ ] Snapshot: שינוי אדמין לא משנה הזמנות ישנות  
- [ ] חלופות שנדחו + DB + מקרי קצה + פתוחות  

---

## 9. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | יצירת BINDING: קטלוג שדות, ולידציה, השפעת storefront |
