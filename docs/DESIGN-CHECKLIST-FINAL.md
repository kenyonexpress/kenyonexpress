# DESIGN-CHECKLIST-FINAL.md
# צ'קליסט עיצוב סופי מול electro home-v7

> **עודכן: 2026-08-10.**  
> מקור ערכים: `refs/ke_live_singlefile.html` (capture מ-kenyonexpress.co.il) + מדידות ב-`DESIGN-MEASURED.md` / `KE_LIVE_SPEC.md` + tokens ב-`src/app/globals.css`.  
> תבנית ייחוס: electro home-v7. Overrides מכוונים של הפרויקט גוברים על 1:1 לחי כשמפורטים למטה.

Status: **BINDING (QA gate)** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
Scope: **docs only**. אין שינוי קוד ב-worktree הראשי.

מסמכים קשורים:

```
KE_LIVE_SPEC.md
DESIGN-MEASURED.md
docs/ARCHITECTURE-SEO-PERFORMANCE.md
docs/PRODUCT-FIELDS-RESEARCH.md
src/styles/tokens.ts
src/app/globals.css
```

---

## 0. Tokens מחייבים (לכל הדפים)

| Token | ערך מחייב | מקור / הערה |
|---|---|---|
| Brand yellow | `#fed700` | CTA, badge, search btn, newsletter; לא `#FDD700` |
| Price red | `#E4002B` | override מכוון (חי WooCommerce נמדד לעתים `#dc3545`; היעד בפרויקט הוא `#E4002B`) |
| Product / link blue | `#0062bd` | שם מוצר בכרטיס, קישורים |
| Heading slate | `#333e48` | כותרות, top bar, footer ink |
| Font | **Heebo** בלבד | `next/font` → `--font-heebo` → `--font-sans`. אין Inter |
| Container | **1320px** | `max-w-page` / `--container-page` (override מול electro 1200/1430) |
| Touch target | **≥ 44×44px** | כל כפתור/אייקון לחיץ (מובייל ודסקטופ) |
| Header masthead | **לוגו + 3 אייקונים בלבד** | מועדפים, חשבון, עגלה. **אין** חיפוש ואין בורר אזור ב-header |

Viewport ייחוס למדידה: `1440×900` (דסקטופ), `375×812` (מובייל).

סימון בכל שורה: `[ ]` טרם / `[x]` עבר / `[!]` סטייה מאושרת בתיעוד.

---

## 1. משותף לכל הדפים (shell)

| # | אלמנט | ערך מקור | Pass? |
|---|---|---|---|
| S1 | `dir="rtl"` + `lang="he"` / `he-IL` | root layout | [ ] |
| S2 | גופן Heebo על body | אין Inter / Open Sans ב-computed | [ ] |
| S3 | container תוכן | `max-width: 1320px`, ממורכז | [ ] |
| S4 | Top bar | גובה ~38px, טקסט `#333e48`, רקע לבן, border `#ddd` | [ ] |
| S5 | Top bar copy | "ברוך הבא לעולם של קניון Express" + USP קצרים | [ ] |
| S6 | Masthead | לוגו ימין (RTL) + **רק** 3 אייקונים משמאל | [ ] |
| S7 | אייקונים | Heart / User / Cart; צבע `#515151`; hit ≥44px | [ ] |
| S8 | **אין** search ב-header | חיפוש מחוץ ל-masthead (override) | [ ] |
| S9 | **אין** בורר אזור ב-header | הוסר במכוון | [ ] |
| S10 | Cart badge | רקע `#fed700`, דיו `#333e48` | [ ] |
| S11 | Primary CTA | רקע `#fed700`, hover `#fedd26` או שחור לפי הקשר המדוד | [ ] |
| S12 | Footer newsletter bar | רקע `#fed700` | [ ] |
| S13 | Footer body / copyright | slate / `#eaeaea` bar | [ ] |
| S14 | WhatsApp float | פינה; לא מכסה CTA ראשי; touch ≥44 | [ ] |

---

## 2. דף בית `/`

| # | אלמנט | ערך מקור (singlefile / electro-v7) | Pass? |
|---|---|---|---|
| H1 | Hero row 3 טורים | departments \| slider \| mini-banners (grid פרויקט ~270 / 1fr / 270) | [ ] |
| H2 | Hero slider height | ~370–377px; רקע slide `#eef7f9` / electro | [ ] |
| H3 | Hero dots | active `#fed700` ~30×8; inactive 8×8 | [ ] |
| H4 | Category strip | גובה ~170px; border `#e7e7e7`; labels 14px/600 `#333e48` | [ ] |
| H5 | USP / feature bar | border `#ddd`, radius 8; אייקון 36px `#fed700` | [ ] |
| H6 | כרטיס דיל: שם | 14px / 700 / `#0062bd` | [ ] |
| H7 | כרטיס דיל: מחיר נוכחי | `#E4002B` (לא כחול חי `#1da1f2`) | [ ] |
| H8 | כרטיס דיל: strike | אפור `#848484` / `#768b9e`, line-through | [ ] |
| H9 | Sale badge | ירוק `#44b81b`, טקסט לבן 12px/700 | [ ] |
| H10 | Add-to-cart על כרטיס | touch ≥44; צבע אייקון `#333e48` | [ ] |
| H11 | רשת מוצרים | gutters עקביים; תמונה לא נמעכת | [ ] |
| H12 | אין כרטיסים מיותרים ב-hero | קומפוזיציה אחת; בלי dashboard clutter | [ ] |

---

## 3. דף מוצר `/product/[slug]` (או `/products/[slug]`)

| # | אלמנט | ערך מקור | Pass? |
|---|---|---|---|
| P1 | Layout | גלריה ~42% \| summary ~58% (electro col-lg-5/7); מובייל stack | [ ] |
| P2 | Gallery main | יחס electro; thumbs carousel | [ ] |
| P3 | H1 כותרת | ~25px / 500 / `#333e48` | [ ] |
| P4 | מחיר נוכחי | ~35px / `#E4002B` | [ ] |
| P5 | מחיר strike | ~21px / `#848484` line-through | [ ] |
| P6 | Quantity | pill ~radius 22; border `#ddd`; control ≥44 | [ ] |
| P7 | Add to cart | bg `#fed700`; pill ~22–25px radius; touch ≥44 | [ ] |
| P8 | שם קישור / tags | `#0062bd` היכן שקישור | [ ] |
| P9 | קופון: מחיר אתר + יתרה בעסק | תצוגה ברורה; **בלי** מילות Escrow/נאמן | [ ] |
| P10 | Variants (אם יש) | בורר; variant אזל מושבת; בלי בחירה = חסום הוספה | [ ] |
| P11 | Related | כותרת ~25px `#333e48` | [ ] |
| P12 | אין ביקורות מזויפות | אין aggregateRating ב-UI אם אין נתונים | [ ] |

---

## 4. דף קטגוריה `/category/[slug]`

| # | אלמנט | ערך מקור | Pass? |
|---|---|---|---|
| C1 | H1 | ~25px / 500 / `#333e48` | [ ] |
| C2 | Grid כרטיסים | תמונה ריבועית; title `#0062bd` 14/700 | [ ] |
| C3 | מחיר כרטיס | `#E4002B` במבצע; strike אפור | [ ] |
| C4 | Sale badge | `#44b81b` | [ ] |
| C5 | Filters / sort | touch ≥44; RTL | [ ] |
| C6 | Pagination | לא שובר container 1320 | [ ] |
| C7 | Empty state | אייקון `#cccccc`; CTA `#fed700` | [ ] |

---

## 5. עגלה `/cart`

| # | אלמנט | ערך מקור | Pass? |
|---|---|---|---|
| G1 | כותרת עמוד | ~40px / 500 / `#333e48` | [ ] |
| G2 | Thumbnail שורה | ~92×92 | [ ] |
| G3 | שם פריט | קישור `#0062bd` או ink `#333e48` עקבי | [ ] |
| G4 | מחיר שורה | `#E4002B` לסכום נוכחי | [ ] |
| G5 | Qty | ≥44 touch; border `#ddd` | [ ] |
| G6 | Remove | נגיש; לא מתחת ל-44 | [ ] |
| G7 | Checkout CTA | bg `#fed700`, text `#333e48`, 14/700, radius ~22 | [ ] |
| G8 | קופון בעגלה | מציג שולם באתר + יתרה בעסק; בלי Escrow | [ ] |
| G9 | Empty cart | CTA חזרה לקטלוג בצהוב מותג | [ ] |

---

## 6. Checkout `/checkout`

| # | אלמנט | ערך מקור | Pass? |
|---|---|---|---|
| X1 | Container | 1320 max; RTL forms | [ ] |
| X2 | Primary pay CTA | `#fed700`; disabled state ברור; ≥44 | [ ] |
| X3 | שדות טופס | labels עברית; focus ring לא סגול גנרי | [ ] |
| X4 | סיכום מחירים | מחיר אתר ב-`#E4002B`; יתרה בעסק מופרדת לקופון | [ ] |
| X5 | אין J5 / Escrow copy | אין "תפיסת מסגרת" / "נאמן" | [ ] |
| X6 | שגיאות Cardcom | עברית, לא חוסמות את כל ה-viewport בלי CTA | [ ] |
| X7 | Trust strip | אייקוני תשלום/אבטחה בלי רעש ויזואלי | [ ] |

---

## 7. אזור אישי `/account/*`

| # | אלמנט | ערך מקור | Pass? |
|---|---|---|---|
| A1 | Shell | `account.css`: yellow `#fed700`, blue `#0062bd`, container 1320 | [ ] |
| A2 | Nav | עברית; פריט פעיל מודגש בצהוב/underline | [ ] |
| A3 | Touch | כל לינק nav ≥44 | [ ] |
| A4 | הזמנות | סטטוסים עברית; מחירים בפורמט ₪ מ-agorot/ILS עקבי | [ ] |
| A5 | קופונים | "שולם באתר" + "לתשלום בבית העסק"; בלי Escrow | [ ] |
| A6 | ארנק | קרדיט פנימי בלבד; אין משיכה | [ ] |
| A7 | פרופיל | אימייל read-only; שמירה CTA `#fed700` | [ ] |

---

## 8. מובייל (כל הדפים)

| # | בדיקה | Pass? |
|---|---|---|---|
| M1 | Header לא נשבר: לוגו + 3 אייקונים נגישים | [ ] |
| M2 | אין overflow אופקי ב-375 | [ ] |
| M3 | Hero / gallery לא חותכים טקסט | [ ] |
| M4 | Sticky CTA (אם יש) לא מכסה WhatsApp | [ ] |
| M5 | פונט Heebo נטען (אין FOUT קיצוני ששובר CLS) | [ ] |

---

## 9. כישלון אוטומטי (אדום)

כל אחד מאלה = FAIL ל-gate, גם אם שאר הדף יפה:

1. `#B0E0E9` או סגול/indigo כ־primary  
2. Inter / Roboto / Arial כגופן ראשי במקום Heebo  
3. container רחב מ-1320 או צר מכוון בלי תיעוד  
4. hit target מתחת ל-44px על אייקון header / CTA ראשי  
5. search או בורר אזור חזרו ל-masthead  
6. מחיר מוצג בכחול `#1da1f2` במקום `#E4002B`  
7. copy של Escrow / נאמן / J5 ללקוח  

---

## 10. איך למדוד שוב

```bash
# regenerate singlefile (gitignored under refs/)
node scripts/capture-live-singlefile.mjs

# local vs electro / live tables
node scripts/measure-electro.mjs
node scripts/measure-live.mjs
```

השווה ל-`DESIGN-MEASURED.md`. כל סטייה חדשה: או תיקון קוד, או שורת override מתועדת כאן + ב-`KE_LIVE_SPEC.md`.

---

## 11. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-10 | צ'קליסט סופי: בית / מוצר / קטגוריה / עגלה / checkout / אזור אישי מול electro-v7 + overrides |
