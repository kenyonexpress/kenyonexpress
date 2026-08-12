# COUPON-STOREFRONT-SPEC.md

מפרט מלא של דף מוצר מסוג קופון (storefront PDP).

Status: **BINDING for coupon PDP UI** · Updated: 2026-08-12  
Scope: **docs only** · worktree `ke-docs-pack` · branch `arch/docs-queue`  
אין שינוי קוד במסמך הזה.

## מקורות (סדר עדיפות)

1. **Electro design (שם הקובץ המבוקש):** `refs/electro.madrasthemes.com-DESIGN.md`  
   בקובץ זה **חסר** ב-worktree. במקומו נעשה שימוש בתוכן המקביל שנמדד מ-Electro home-v7:
   - `DESIGN-MEASURED.md` (פלטה וטיפוגרפיה מחייבות לתצוגה חיה)
   - `refs/electro-measurements-380.md` / `refs/electro-measurements-768.md`
   - `refs/electro-components-map.md`
2. מדידות לייב PDP: `refs/ke_live_computed.json` → `product` ברוחבים **380** ו-**768**
3. `docs/coupon-page-measured.md` (סגנונות מחושבים מקופון לייב ב-1440, כשקיים)
4. `docs/PRODUCT-PAGE-SPEC.md` (שדות חובה ללקוח) ו-`docs/BUSINESS-MODEL.md` §2 (פרטי ספק)

היררכיה עסקית: `docs/CONTRADICTIONS.md` ו-`docs/ADMIN-ARCHITECTURE.md` §0 גוברים על כסף. המסמך הזה מגדיר **UI בלבד**.

עקרון צבע: Electro נותן גיאומטריה ו-whitespace. CTA ומחיר באתר החי הם `#fed700` ו-`#dc3545`, לא sky-blue (`#B0E0E9` אסור).

---

## 0. מטרה והיקף

דף אחד למוצר עם `products.type = 'coupon'` (או `is_coupon_enabled` שמציג מסלול קופון).

הלקוח חייב להבין **לפני** תשלום:

| שאלה | מקור נתונים |
| --- | --- |
| כמה משלמים באתר | `coupon_price_ils` |
| כמה נשאר בבית העסק | face − coupon (באגורות בשרת, ILS בתצוגה) |
| איפה מממשים | ספק: שם, לוגו, כתובת+Waze, טלפון, WhatsApp לפי דגל |
| עד מתי תקף | `coupon_expiry_days` / תאריך הצעה |

אסור ב-DOM ללקוח: `platform_percent`, `supplier_split_percent`, פיצול פנימי, Escrow, SKU פנימי, שדות admin.

---

## 1. שפת עיצוב (Electro + MEASURED-LIVE)

### 1.1 צבעים

| תפקיד | Electro (גיאומטריה) | לייב KenyonExpress (מחייב לתצוגה) |
| --- | --- | --- |
| טקסט / כותרות | `#000000` | `#333e48` (rgb 51,62,72) |
| רקע | `#FFFFFF` | `#FFFFFF` |
| משני / מסגרת | `#E0E0E0` / `#CCCCCC` | `#ddd` / `#e7e7e7` |
| מבטא Electro (לא ל-CTA ראשי) | `#B0E0E9` | **אסור** על ATC |
| CTA ראשי | (Electro sky) | `#fed700` רקע, טקסט לבן על add-to-cart |
| מחיר נוכחי / דיל | שחור Electro | `#dc3545` |
| מחיר חוצה | אפור | `#848484` line-through |
| מטא משני | | `#768b9e` / `#7e7e7e` |

### 1.2 טיפוגרפיה

Electro מציע Roboto / Open Sans. הלייב על PDP: Open Sans.

| תפקיד | גודל | משקל | צבע | הערות |
| --- | --- | --- | --- | --- |
| H1 כותרת מוצר | 25px | 500 | `#333e48` | margin-bottom ~12px |
| מחיר לתשלום באתר | 35px | 400 | `#dc3545` או `#333e48` | שורת מחיר ראשית |
| מחיר רגיל / חוצה | 21px | 400 | `#848484` | `del` / `.full-price` |
| גוף / מטא | 14px | 400 | `#333e48` | line-height ~24px |
| תווית כפתור | 14px | 700 | לבן על `#fed700` | add to cart |
| מחיר בכרטיס קשור | 20px | 400 | `#dc3545` | |
| Strike בכרטיס | 12px | 400 | `#768b9e` | |

RTL: `dir="rtl"` על השורש. יישור ב-`start` / logical properties. מספרים וטלפון ב-`dir="ltr"`.

---

## 2. עץ רכיבים (כל קומפוננטה)

סדר DOM מומלץ (RTL): breadcrumb → גלריה + summary → פרטי ספק → תיאור / הוראות מימוש → קשורים.

| ID | רכיב | נתיב יעד (קיים / מכוון) | חובה בקופון | תפקיד |
| --- | --- | --- | --- | --- |
| C1 | Breadcrumb | layout / PDP chrome | כן | קטגוריה ← מוצר |
| C2 | ProductGallery | `src/components/storefront/ProductGallery.tsx` | כן | תמונה ראשית + thumbs |
| C3 | Title (`h1`) | `ProductInfo` | כן | `name_he` |
| C4 | Rating / wishlist | אופציונלי | לא חוסם פרסום | אפשר לדחות |
| C5 | Dual price | `CouponPricing` / `ProductInfo` | כן | face + on-site |
| C6 | Balance-at-business | `CouponPricing` | כן | יתרה בקופה |
| C7 | Expiry hint | `CouponTerms` | כן | "תקף X ימים מיום הרכישה" |
| C8 | Quantity | PDP form | כן | − / מספר / + |
| C9 | Add to cart | PDP form | כן | pill צהוב |
| C10 | Location meta | `productLocation` | כן אם קיים | עיר / אזור |
| C11 | SupplierInfo | `src/components/storefront/SupplierInfo.tsx` | כן | שם, לוגו, כתובת, טלפון, WA |
| C12 | Description | PDP details | כן לפרסום | `description_he` |
| C13 | Redemption instructions | PDP details | כן לפרסום | `redemption_instructions_he` |
| C14 | Related products | `RelatedProducts` | כן | רשת כרטיסים |
| C15 | Sticky ATC (מובייל) | אופציונלי | מומלץ ב-380 | לא מכסה SupplierInfo בלי scroll |
| C16 | ShippingInfo | `ShippingInfo.tsx` | **לא** | פיזי בלבד |

---

## 3. מידות: 380px (handheld)

מקור: `ke_live_computed.json` → `product` → `380`.

| רכיב | x | y | w | h | הערות |
| --- | --- | --- | --- | --- | --- |
| Breadcrumb | 0 | 116 | 380 | 55 | מעל ה-wrapper |
| `single-product-wrapper` | 0 | 193 | 380 | 822 | עמודה אחת |
| `product-images-wrapper` | 0 | 193 | 380 | 356 | גלריה מעל summary |
| `summary` | 0 | 549 | 380 | 466 | מתחת לגלריה |
| Title | 15 | 578 | 350 | 32 | padding אופקי 15px |
| Price row | 15 | 774 | 350 | 45 | font 35px |
| Cart form | 15 | 844 | 350 | 121 | כמות + CTA |
| CTA button | ~15 | ~860 | ~350 | ~53 | radius ~22–25px |
| Related block | 15 | 1105 | 350 | ~417 | מתחת |

### כללי 380

1. עמודה אחת: גלריה ואז summary.
2. רוחב תוכן 350px בתוך padding 15px מכל צד (סה״כ 380).
3. CTA full-bleed ~350×53, רקע `#fed700`, טקסט לבן.
4. Touch targets ≥ 44px (כמות, wishlist, WhatsApp, CTA).
5. גלריה: רוחב 380, גובה ~356; בלי crop אגרסיבי.
6. Thumbs (אם יש): שורה אופקית מתחת לראשית, גלילה אופקית מותרת, גודל thumb ≥ 56px.
7. Sticky ATC (אם קיים): גובה פס ≤ 64px; `padding-bottom` על התוכן שלא יוסתר.
8. מחירים וטלפון: `dir="ltr"` בתוך פסקת RTL.

התייחסות Electro homepage (לא PDP, לקנה מידה בלבד): `#masthead` 380×55.5; תוכן `.site-main` 350px. ה-PDP שלנו נשען על מדידות `product` לייב, לא על home-v7.

---

## 4. מידות: 768px (tablet)

מקור: `ke_live_computed.json` → `product` → `768`.

| רכיב | x | y | w | h | הערות |
| --- | --- | --- | --- | --- | --- |
| Breadcrumb | 39 | 78 | 690 | 84 | |
| `single-product-wrapper` | 24 | 163 | 720 | 454 | שתי עמודות |
| `summary` | 24 | 163 | 420 | 454 | inline-start ב-RTL |
| `product-images-wrapper` | 444 | 163 | 300 | 454 | inline-end ב-RTL |
| Title | 39 | 192 | 390 | 32 | |
| Price | 39 | 388 | 390 | 45 | |
| Cart form | 39 | 458 | 390 | 109 | |
| CTA | ~93 | ~458 | ~192 | ~53 | ליד הכמות |
| Related | 39 | 777 | 690 | ~455 | |

### כללי 768

1. שתי עמודות בתוך wrapper ~720, gutter פנימי.
2. **RTL מחייב:** summary ב-inline-start (ימין ויזואלית); גלריה ב-inline-end (שמאל).  
   תבנית Electro LTR לעיתים הופכת את זה פיזית; השחזור שלנו לא מעתיק סדר LTR.
3. גובה שורת המוצר העליונה ~454px (גלריה ו-summary נמתחים יחד).
4. CTA ~192×53 ליד בורר הכמות (לא חובה full-bleed).
5. Related: רוחב ~690; 3–4 כרטיסים בשורה לפי רוחב זמין.
6. Electro `.site-main` ב-768 הוא 690px; יישור לרוחב תוכן דומה מתחת ל-breadcrumb.

---

## 5. מצבי RTL (חובה)

| מצב | התנהגות |
| --- | --- |
| מסמך | `lang="he"` + `dir="rtl"` על השורש |
| Flex / grid | `margin-inline-*`, `ps`/`pe`, `gap`; אסור `ml`/`mr` קשיחים בלבד |
| מחיר וטלפון | `dir="ltr"` על המחרוזת; סמל ₪ לפי קומפוננטת הכסף הקיימת |
| Breadcrumb | מפריד בכיוון הקריאה (RTL) |
| Waze / WhatsApp | אייקון ב-inline-start לפני הטקסט; `rel="noopener noreferrer"` |
| כרטיס קשור | תמונה למעלה; מחיר וטקסט מיושרים ל-start |
| Sticky ATC | פס תחתון full width; לא מכסה פרטי ספק בלי גלילה |
| כמות | כפתורי −/+ משני צידי המספר לפי RTL logical |

אסור:

- כותרות עבריות בפריסת LTR
- ספרות מחיר הפוכות (`9₪` שבור)
- `padding-left` בלי מקבילה ל-inline

---

## 6. בלוק המחיר (קופון)

| שדה | תווית UI | מקור |
| --- | --- | --- |
| Face | מחיר רגיל | `full_price` / ערך פנים |
| On-site | מחיר בקניון / לתשלום באתר | `coupon_price_ils` |
| Till | יתרה בבית העסק | face − coupon |
| Saving | חיסכון ₪ / % | תצוגה בלבד |

המפרט **מחייב** את שורת היתרה בקופה (ADMIN §0.3), גם אם לייב היסטורי הציג רק "מחיר רגיל / מחיר בקניון".

כסף: חישוב באגורות integer בשרת; תצוגה ILS עם 2 ספרות.

---

## 7. כפתורים וכרטיסים

### Add to cart (ראשי)

- רקע `#fed700`, טקסט לבן, radius ~22px, padding אנכי ~14.5px
- Hover: הכהיה קלה של הצהוב (לא sky-blue)
- Disabled: `#F5F5F5`, בלי ניווט
- 380: ~350×53 · 768: ~192×53

### Quantity

- מסגרת `#ddd`, גובה שורה תואם ל-CTA (~44–53px)
- יעדי −/+ ≥ 44px

### כרטיס קשור

- רקע לבן; מסגרת `#E0E0E0` או ללא לפי לייב
- תמונה יחס קבוע; מחיר 20px; strike 12px `#768b9e`
- 380: 1–2 בעמודה · 768: 3–4 ברוחב ~690

### Secondary / Ghost

רקע `#F5F5F5` או שקוף+מסגרת. ל-wishlist / שיתוף, לא במקום ATC.

---

## 8. SupplierInfo (חובה בכל קופון)

| שדה | תצוגה |
| --- | --- |
| לוגו | אם `logo_url` קיים; אחרת דילוג (בלי תווית ריקה) |
| שם | חובה לתצוגה כשיש ספק |
| כתובת + Waze | רק אם יש כתובת |
| טלפון | `dir="ltr"`; קישור `tel:` |
| WhatsApp | רק אם `whatsapp_enabled` על המוצר **וגם** מספר נייד תקין |

שורת מימוש: "מימוש הקופון מתבצע ישירות מול הספק בבית העסק."

---

## 9. נגישות

- Alt חובה (`media_assets.alt_he`)
- `h1` יחיד לדף
- ניגודיות `#333e48` על לבן: AA לגוף
- CTA צהוב: לא להחליף טקסט ללא מדידת ניגודיות מחדש
- מחיר חוצה: `del` + טקסט חלופי "מחיר קודם"

---

## 10. מחוץ להיקף

- טופס אדמין (`ADMIN-PRODUCT-PAGE-SPEC.md`)
- סריקת ספק (`ARCHITECTURE-COUPON-REDEMPTION.md`, `VOUCHER-LIFECYCLE.md`)
- Checkout / Cardcom
- Pixel gate מול `refs/ke_live_*`

---

## 11. Acceptance

| # | קריטריון |
| --- | --- |
| A1 | ב-380: גלריה מעל summary; תוכן 350; CTA ≥ 44px גובה |
| A2 | ב-768: שתי עמודות; summary ב-inline-start; גובה שורה ~454 |
| A3 | face + on-site + till; בלי אחוזי פיצול ב-DOM |
| A4 | SupplierInfo בלי תוויות ריקות |
| A5 | `dir=rtl` + מחירים `dir=ltr`; אין גלילה אופקית מ-nowrap |
| A6 | CTA/מחיר לפי DESIGN-MEASURED, לא `#B0E0E9` על ATC |

---

## Revision

| תאריך | שינוי |
| --- | --- |
| 2026-08-12 | יצירה: Electro + מדידות 380/768 + RTL |
| 2026-08-12 | הרחבה: עץ רכיבים מלא, מקורות Electro כש-DESIGN.md חסר, SupplierInfo, sticky ATC |
