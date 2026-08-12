# COUPON-STOREFRONT-SPEC.md

מפרט דף מוצר מסוג קופון (storefront PDP).

Status: **BINDING for coupon PDP UI** · Updated: 2026-08-12  
Scope: **docs only** · worktree `ke-docs-pack` · branch `arch/docs-queue`  
אין שינוי קוד במסמך הזה.

מקורות (בסדר עדיפות כשיש סתירה ויזואלית מול לייב):

1. `refs/electro.madrasthemes.com-DESIGN.md` (design tokens Electro: צבעים, טיפוגרפיה, כפתורים, כרטיסים)
2. מדידות לייב מ-`refs/ke_live_computed.json` לדף `product` ברוחבים 380 ו-768
3. `docs/coupon-page-measured.md` (סגנונות מחושבים מקופון לייב ב-1440)
4. `DESIGN-MEASURED.md` (פלטת KenyonExpress חיה: `#333e48`, `#fed700`, מחיר אדום)
5. `docs/PRODUCT-PAGE-SPEC.md` (שדות חובה ללקוח) ו-`docs/BUSINESS-MODEL.md` §2 (פרטי ספק)

היררכיה עסקית: `docs/CONTRADICTIONS.md` ו-`docs/ADMIN-ARCHITECTURE.md` §0 גוברים על כסף. המסמך הזה מגדיר UI בלבד.

---

## 0. מטרה והיקף

דף אחד: מוצר עם `products.type = 'coupon'` (או `is_coupon_enabled` שמציג מסלול קופון).

הלקוח חייב להבין לפני תשלום:

- כמה משלמים **באתר** (`coupon_price_ils`)
- כמה נשאר **בבית העסק** (`face - coupon_price`)
- איפה מממשים (ספק: שם, כתובת, טלפון, לוגו)
- עד מתי תקף (`coupon_expiry_days` / תאריך הצעה)

אסור להציג ללקוח: `platform_percent`, `supplier_split_percent`, פיצול פנימי, Escrow.

---

## 1. שפת עיצוב (Electro + לייב)

### 1.1 צבעים

| תפקיד | Electro DESIGN | לייב KenyonExpress (מחייב לתצוגה) |
| --- | --- | --- |
| טקסט / כותרות | `#000000` | `#333e48` (rgb 51,62,72) |
| רקע | `#FFFFFF` | `#FFFFFF` |
| משני / מסגרת | `#E0E0E0` / `#CCCCCC` | `#ddd` / `#e7e7e7` |
| מבטא Electro | `#B0E0E9` | לא ל-CTA ראשי באתר החי |
| CTA ראשי (לייב) | (Electro sky) | `#fed700` רקע, טקסט לבן על add-to-cart |
| מחיר נוכחי | שחור Electro | `#dc3545` (מחיר דיל) |
| מחיר חוצה | אפור | `#848484` line-through |

עקרון: DESIGN של Electro נותן אווירה (שקט, גיאומטריה, whitespace). מספרים חיים ל-CTA ולמחיר באים מ-MEASURED-LIVE / DESIGN-MEASURED.

### 1.2 טיפוגרפיה

Electro DESIGN מציע Roboto / Open Sans. הלייב משתמש ב-Open Sans על PDP.

| תפקיד | גודל | משקל | צבע | הערות |
| --- | --- | --- | --- | --- |
| H1 כותרת מוצר | 25px | 500 | `#333e48` | margin-bottom ~12px |
| מחיר לתשלום באתר | 35px | 400 | `#dc3545` או `#333e48` לפי הקשר לייב | שורת המחיר הראשית |
| מחיר רגיל / חוצה | 21px | 400 | `#848484` | `del` / `.full-price` |
| גוף / מטא | 14px | 400 | `#333e48` | line-height ~24px |
| תווית כפתור | 14px | 700 | לבן על `#fed700` | add to cart |

RTL: `dir="rtl"` על השורש. `text-align: start` (לא `right` קשיח) כדי ש-LTR בתוך מספרים (`dir="ltr"` על מחירים וטלפון) לא יישבר.

---

## 2. שלד הדף ורכיבים

סדר DOM (RTL): breadcrumb → גלריה + summary → בלוק פרטי ספק → תיאור / הוראות מימוש → מוצרים קשורים.

| # | רכיב | חובה בקופון | הערות |
| --- | --- | --- | --- |
| C1 | Breadcrumb | כן | קטגוריה ← מוצר |
| C2 | Gallery | כן | תמונה ראשית + thumbnails |
| C3 | Title (`h1`) | כן | `name_he` |
| C4 | Rating / wishlist | אופציונלי | לייב מציג דירוג; אפשר לדחות |
| C5 | Dual price block | כן | מחיר רגיל + מחיר בקניון / לתשלום באתר |
| C6 | Balance-at-business line | כן | יתרה בקופה; לא בלייב הישן כמחרוזת קבועה, חובה במודל החדש |
| C7 | Expiry hint | כן | "תקף X ימים מיום הרכישה" |
| C8 | Quantity + Add to cart | כן | pill צהוב |
| C9 | Location meta | כן אם קיים | עיר / אזור מהספק |
| C10 | SupplierInfo | כן | שם, לוגו, כתובת+Waze, טלפון, WhatsApp לפי דגל |
| C11 | Description | כן לפרסום | `description_he` / short |
| C12 | Redemption instructions | כן לפרסום | `redemption_instructions_he` |
| C13 | Related products | כן | רשת כרטיסים |
| C14 | ShippingInfo | **לא** | פיזי בלבד |

אסור ב-DOM ללקוח: אחוזי פיצול, עלות, SKU פנימי, שדות admin.

---

## 3. מידות: 380px (handheld)

מקור: `ke_live_computed.json` → `product` → `380` (דף מוצר לייב, RTL).

| רכיב | x | y | w | h | הערות |
| --- | --- | --- | --- | --- | --- |
| Breadcrumb | 0 | 116 | 380 | 55 | מעל ה-wrapper |
| `single-product-wrapper` | 0 | 193 | 380 | 822 | עמודה אחת |
| `product-images-wrapper` | 0 | 193 | 380 | 356 | גלריה מעל ה-summary |
| `summary` | 0 | 549 | 380 | 466 | מתחת לגלריה |
| Title | 15 | 578 | 350 | 32 | padding אופקי 15px |
| Price row | 15 | 774 | 350 | 45 | 35px font |
| Cart form | 15 | 844 | 350 | 121 | כמות + CTA |
| Related block | 15 | 1105 | 350 | ~417 | מתחת |

### כללי 380

1. **עמודה אחת:** גלריה ואז summary (לא שתי עמודות).
2. **רוחב תוכן:** 350px בתוך padding 15px מכל צד (סה״כ 380).
3. **CTA:** רוחב מלא ~350px, גובה ~53px, radius ~22-25px, רקע `#fed700`.
4. **Touch:** יעדי לחיצה ≥ 44px (כמות, wishlist, WhatsApp).
5. **גלריה:** רוחב מלא 380; גובה ~356 (יחס תמונה מהמקור, בלי crop אגרסיבי).
6. **מספרים ומחירים:** עטיפה `dir="ltr"` בתוך פסקה RTL.

---

## 4. מידות: 768px (tablet)

מקור: `ke_live_computed.json` → `product` → `768`.

| רכיב | x | y | w | h | הערות |
| --- | --- | --- | --- | --- | --- |
| Breadcrumb | 39 | 78 | 690 | 84 | |
| `single-product-wrapper` | 24 | 163 | 720 | 454 | שתי עמודות באותו גובה |
| `summary` | 24 | 163 | 420 | 454 | בלייב: צד start של השורה |
| `product-images-wrapper` | 444 | 163 | 300 | 454 | בלייב: ליד ה-summary |
| Title | 39 | 192 | 390 | 32 | |
| Price | 39 | 388 | 390 | 45 | |
| Cart form / CTA | 39 / 93 | 458 | 390 / 192 | 109 / 53 | כפתור ~192×53 |
| Related | 39 | 777 | 690 | ~455 | |

### כללי 768

1. **שתי עמודות** בתוך wrapper רוחב ~720, gutter פנימי.
2. **RTL מחייב ל-KenyonExpress:** בעמודת ה-inline-start (ימין ויזואלית) יושב ה-summary; הגלריה ב-inline-end (שמאל).  
   הלייב Electro לעיתים מצייר summary ב-x קטן יותר (שמאל פיזי). השחזור שלנו **מהפך** לפי `dir=rtl`, לא מעתיק את סדר ה-DOM של תבנית LTR.
3. גובה שורת המוצר העליונה ~454px (גלריה ו-summary נמתחים יחד).
4. CTA לא חייב full-bleed; ~192×53 ליד בורר הכמות מקובל.
5. Related: רוחב כמעט מלא (~690) מתחת ל-wrapper.

---

## 5. מצבי RTL (חובה)

| מצב | התנהגות |
| --- | --- |
| מסמך | `html` / layout: `lang="he"` + `dir="rtl"` |
| Flex / grid | שימוש ב-`margin-inline-start`, `ps`/`pe`, לא `ml`/`mr` קשיחים |
| מחיר וטלפון | `dir="ltr"` על המחרוזת; סמל ₪ מימין או משמאל לפי קומפוננטת הכסף הקיימת |
| Breadcrumb מפריד | מפריד ויזואלי מתאים ל-RTL (חץ/slash בכיוון הקריאה) |
| Waze / WhatsApp | אייקון לפני הטקסט ב-inline-start; לינקים `noopener` |
| כרטיס קשור | תמונה למעלה, מחיר ו-CTA מתחת; טקסט מיושר ל-start |
| Sticky ATC (אופציונלי במובייל) | פס תחתון full width; לא מכסה פרטי ספק בלי scroll |

מצבים שאסור:

- מראה LTR של כותרות עבריות
- מחיר שבור ל-`9₪` עם ספרות הפוכות
- הזחת padding רק ב-`padding-left` בלי מקבילה ל-inline

---

## 6. בלוק המחיר (קופון)

תוויות מומלצות (עברית):

| שדה | תווית UI | מקור נתונים |
| --- | --- | --- |
| Face | מחיר רגיל | `full_price` / `kenyon_price` כערך פנים |
| On-site | מחיר בקניון / לתשלום באתר | `coupon_price_ils` |
| Till | יתרה בבית העסק | face − coupon (agorot → ILS) |
| Saving | חיסכון ₪ / % | מחושב לתצוגה |

לייב היסטורי על "קופון טסט" הציג `מחיר רגיל` / `מחיר בקניון` בלי המחרוזת "לתשלום באתר". המפרט הזה **מחייב** להציג גם את היתרה בקופה, כדי שהלקוח לא יופתע בסריקה (ראה BUSINESS-MODEL / ADMIN §0.3).

כסף: חישוב רק באגורות integer בצד שרת; תצוגה ב-ILS עם 2 ספרות.

---

## 7. כפתורים וכרטיסים (Electro + לייב)

### Add to cart (ראשי)

- רקע `#fed700`, טקסט לבן (לייב product), radius ~22px, padding אנכי ~14.5px
- Hover: הכהיה קלה של הצהוב (לא sky-blue של Electro על CTA הראשי)
- Disabled: אפור `#F5F5F5`, בלי ניווט

### כרטיס קשור

- רקע לבן, מסגרת `#E0E0E0` או ללא מסגרת לפי לייב
- תמונה ריבועית / יחס קבוע; מחיר 20px; strike 12px `#768b9e`
- במובייל: עמודה אחת או שתיים; ב-768: 3–4 בעמודה לפי רוחב 690

### Secondary / Ghost

לפי Electro DESIGN (§4): רקע `#F5F5F5` או שקוף עם מסגרת שחורה. לשימוש ב-wishlist / שיתוף, לא במקום ATC.

---

## 8. נגישות ותוכן

- Alt חובה על תמונות (`media_assets.alt_he`)
- כותרת אחת `h1` לדף
- ניגודיות טקסט `#333e48` על לבן עוברת WCAG AA לגוף
- CTA צהוב: לוודא ניגודיות הטקסט (לבן על `#fed700` נמדד בלייב; לא להחליף לטקסט אפור כהה בלי מדידה מחדש)
- מסכי קורא מסך: מחיר חוצה מסומן כ-`del` עם טקסט חלופי "מחיר קודם"

---

## 9. מה לא נכנס למפרט הזה

- טופס אדמין (ראה `ADMIN-PRODUCT-PAGE-SPEC.md`)
- מסלול סריקה לספק (ראה `ARCHITECTURE-COUPON-REDEMPTION.md` ו-`VOUCHER-LIFECYCLE.md`)
- Checkout / Cardcom
- Pixel gate מול `refs/ke_live_*` (כלי מדידה, לא חלק מהמפרט העסקי)

---

## 10. Acceptance

| # | קריטריון |
| --- | --- |
| A1 | ב-380: גלריה מעל summary; רוחב תוכן 350; CTA ≥ 44px גובה |
| A2 | ב-768: שתי עמודות; summary ב-inline-start (RTL); גובה שורה ~454 |
| A3 | מוצגים face + on-site + till; בלי אחוזי פיצול ב-DOM |
| A4 | SupplierInfo עם השדות הזמינים; חסרים לא מדפיסים תווית ריקה |
| A5 | `dir=rtl` + מחירים `dir=ltr`; אין גלילה אופקית מטקסט nowrap |
| A6 | צבעי CTA/מחיר לפי DESIGN-MEASURED, לא sky-blue Electro על ATC |

---

## Revision

| תאריך | שינוי |
| --- | --- |
| 2026-08-12 | יצירה ב-`arch/docs-queue`: Electro DESIGN + מדידות 380/768 + RTL |
