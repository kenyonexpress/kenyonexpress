# דף קטגוריה 1:1: ממצאי מדידה

ממצאי השוואת פיקסלים בין האתר החי ל-localhost לדף קטגוריה, עם הכרעות תיקון ורצפת diff.

Status: **BINDING (מדידה)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: No Escrow (לא רלוונטי ישירות; כרטיס מציג מחיר אתר + יתרה בעסק).

מסמכים קשורים:

```
refs/ke_live_singlefile.html
scripts/_cat-probe.mjs
scripts/compare.mjs
docs/DESIGN-CHECKLIST-FINAL.md
```

---

## 1. החלטה

| # | הכרעה |
|---|---|
| D1 | עובדים לפי **מדידה מהאתר החי**, לא לפי ערכים ישנים ב-STATE או בהוראות electro. |
| D2 | ה-footer **לא** sticky: הוסר `flex-1` מ-main ב-`(store)/layout.tsx`. |
| D3 | כרטיס קטגוריה חייב בלוק `custom-price-wrapper` (72px, שתי שורות 24px) מ-`full_price` / `kenyon_price`. |
| D4 | ה-header נסגר לגובה החי (masthead ~127px); אישור לגעת ב-header שהיה נעול. |
| D5 | **אין sidebar** בקטגוריה: `CategoryFilterSidebar` אין לו מקבילה בחי. |
| D6 | יעד compare: מתחת ל-7% **רק** אם נתוני הקטלוג תואמים (מספר מוצרים זהה). |
| D7 | המספרים ב-`custom-price-wrapper` החי הם קלט WooCommerce ידני: משחזרים **גאומטריה**, לא ערכים. |

---

## 2. חלופות שנדחו

| חלופה | נימוק דחייה |
|---|---|
| להשאיר sticky footer ל"יופי" viewport גבוה | מדידה: +1218px ל-footer; רצועות y1400-2400 ב-9-53% diff. |
| sidebar כמו חנויות SaaS | בארכיון חי: `content-area` 1200px מלא, אין shop sidebar באף URL שנבדק. |
| להעתיק מספרי full-price/discount מהחי | לא עקביים עם מחירי הכרטיס (JEEP: ₪99 בכרטיס, ₪399/₪196 ב-wrapper). |
| למחוק 2 מוצרים מ-hot-deals כדי לרדת מתחת ל-7% | גיים של המדד, לא תיקון layout; הקטלוג אמיתי. |
| container 1320px / צהוב `#fedd26` / אדום `#E4002B` לפי הוראה ישנה | singlefile: 1170px, `#fed700`, `#dc3545`. |

---

## 3. סכמת DB

**אין DDL חדש.** הממצאים הם UI/תוכן.

טבלאות/שדות שנקראים בהקשר השוואה:

| טבלה / מקור | שדות | שימוש |
|---|---|---|
| `products` | `name_he`, `coupon_price_ils`, `full_price`, `kenyon_price`, `images` | כרטיס, מחיר, גובה wrapper |
| `categories` | `slug`, `kind` | hot-deals = collection; מספר מוצרים בגריד |
| `KE_LIVE_CATEGORIES` / seed | slugs קיימים | התאמת תוכן לרפרנס `/product-category/hot-deals/` |

מיגרציות: אין שינוי סכימה במסמך זה.

---

## 4. מקרי קצה

| # | מצב | התנהגות / ממצא |
|---|---|---|
| E1 | viewport 2600px עם flex-1 | main נמתח ל-1993px; footer ב-2089 במקום ~871 בחי. |
| E2 | 2 מוצרים בחי מול 4 אצלנו | חצי גריד שמאלי ריק בחי, מלא אצלנו: רצפת diff y400-900 (22-55%). |
| E3 | header קצר 95px מול 148px חי | תוכן מתחיל 69.9px גבוה מדי; רצפה 70px בכל רצועה. |
| E4 | Next image optimization שקט | 8MB מקור עם 200 בלי לוג: לא להניח דחיסה. |
| E5 | compare על hot-deals אחרי layout 1:1 | 9.45% (לא מתחת 7%) בגלל תוכן, לא CSS. |
| E6 | sidebar widget ב-footer החי | לא sidebar קטלוג; אין לבנות filter sidebar "כמו Woo". |
| E7 | מוצרים משותפים, סדר שונה | JEEP + חבילת פינוק אצלנו; תספורת + JEEP בחי. |
| E8 | 6 סוכנים במקביל על קטגוריה | הסשן נעצר; ממצאים נשמרים כאן בלבד. |

---

## 5. פתוחות

| # | פער | החלטה זמנית | תאריך |
|---|---|---|---|
| O1 | compare category 9.45% > יעד 7% | מקובל כרצפת תוכן; לא לשנות קטלוג למען המדד | 2026-08-12 |
| O2 | האם להסיר `CategoryFilterSidebar` לפני GA | להמתין להחלטת מוצר; אין מקבילה בחי | 2026-08-12 |
| O3 | probes `_cat-*.mjs` | למחוק אחרי סגירת דף קטגוריה | 2026-08-12 |
| O4 | STATE.md מציין 11.56% / 23.7% ישן | לעדכן STATE בהמשך batch | 2026-08-12 |

---

## 6. מדד פתיחה (2026-07-24)

`node scripts/compare.mjs --page=category` = **11.56%** (STATE ישן). יעד: מתחת ל-7%.

רצועות גרועות לפני תיקון layout: y2100 = 53.4%, y400 = 51.5%, y900 = 41.5%, y500 = 38.6%, y800 = 30.6%, y300 = 16.8%.

---

## 7. פערי מבנה (לפני תיקון)

| # | פער | חי | אצלנו | דלתא |
|---|---|---|---|---|
| 1 | מיקום footer | top 871 | top 2089 | +1218px |
| 2 | גובה כרטיס | 437.5 | 358.5 | -79px |
| 3 | תחילת breadcrumb | top 165.4 | top 95.5 | -69.9px |
| 4 | מספר מוצרים | 2 | 4 | תוכן |

### 7.1 Footer sticky

`src/app/(store)/layout.tsx`: `min-h-screen flex flex-col` + `main.flex-1` דוחף footer. החי: `div.hfeed` 1396px, footer מיד אחרי תוכן.

### 7.2 custom-price-wrapper (72px)

```html
<div class="product-loop-footer">
  <div class="price-add-to-cart">...</div>
  <div class="custom-price-wrapper">
    <div class="full-price">₪399</div>
    <br>
    <div class="discount-price">₪196</div>
  </div>
</div>
```

גאומטריה מ-`full_price`/`kenyon_price`; לא המספרים הלא-עקביים של החי.

### 7.3 Header 70px

`TopBar.tsx` + `MainHeader.tsx` היו נעולים; אושר תיקון masthead ל-127px.

---

## 8. Sidebar: המצאה מקומית

| URL | content-area | sidebar |
|---|---|---|
| hot-deals / restaurants / electronics / shop | 1200px | אין |

`CategoryFilterSidebar` נוצר 2026-07-21 בלי מקבילה בחי.

---

## 9. ערכי עיצוב: הוראה מול מדידה

| ערך | הוראה ישנה | נמדד בחי | singlefile |
|---|---|---|---|
| container | 1320px | 1170px | 1170×3 |
| צהוב hover | #fedd26 | #fed700 | fed700×13 |
| אדום מחיר | #E4002B | #dc3545 | dc3545×2 |

---

## 10. תיקונים שבוצעו (2026-07-24)

1. הוסר `flex-1` מה-main: footer אחרי תוכן; רצועות y1400-2400 → 0%.
2. `custom-price-wrapper` ב-`CategoryProductCard.tsx`: כרטיס ~430px (קרוב ל-437).
3. masthead 54px → 127px ב-`Header.tsx`.

**תוצאה:** קטגוריה 10.89% → 9.45%. בית 28.01% → 17.83%.

---

## 11. רצפת תוכן (מתחת 7%)

| | חי | אצלנו |
|---|---|---|
| מוצרים hot-deals | 2 | 4 |
| חצי גריד שמאלי | ריק | 2 כרטיסים |

layout 1:1; השארית diff = תוכן. refs: `refs/cat-grid.png`, `refs/cat-footer.png`.

---

## 12. כלי עזר

- `scripts/crop-band.mjs <y0> <y1>`: חיתוך רצועה live/mine.
- `scripts/_cat-*.mjs`: probes חד-פעמיים.

---

## 13. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-24 | ממצאי מדידה; הסשן נעצר (6 סוכנים) |
| 2026-07-24 | תיקון footer, wrapper, header |
| 2026-08-12 | BINDING: 5 סעיפי תבנית batch-2 (`arch/docs-batch-2`) |
