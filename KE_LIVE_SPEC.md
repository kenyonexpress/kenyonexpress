# מבנה האתר החי קניון EXPRESS

מקור אמת, חולץ ישירות מ-HTML של kenyonexpress.co.il (ke_live_home.html / ke_live_product.html / ke_live_cart.html).

**פלטפורמת המקור:** WordPress 6.8.1 + Elementor 3.30.2 + WooCommerce + Slider Revolution 6.5.8, תבנית `electro` + child `electro-child`. RTL (`class="rtl"`).

---

## צבעים (מה-CSS החי)
- `#fed700` — צהוב מותג (CTA, אקטיבי, badges)
- `#333e48` — כהה (footer, טקסט כהה, מחיר במקומות מסוימים)
- `.price` (מחיר נוכחי) — **`#1da1f2` (כחול)** או `#333e48` לפי הקשר
- `.price del` (מחיר ישן strike-through) — אפור `#768b9e` / `#848484`
- `#198754` — ירוק (במלאי/הצלחה)
- `#dc3545` — אדום (danger/onsale)
- `#212121` — טקסט כותרות

## פונט (מה-CSS החי)
Inter + Open Sans + Assistant + font-electro (אייקונים). **האתר החי אינו משתמש ב-Heebo.**

---

## Top bar (שורה עליונה דקה, RTL)
ברוך הבא לעולם של קניון Express | בפריסה ארצית | משלוח מהיר חינם | קניה בטוחה | התחברות

## Header (באתר החי)
לוגו | שדה חיפוש ("Search for:" / "חיפוש") | בורר אזור ("בחר אזור", 16 אזורים) | סל קניות | חשבון/התחברות.

### בורר אזור — 16 אזורים (קיים באתר החי)
תל אביב | רמת גן – גבעתיים – בני ברק | חולון – בת ים – ראשון לציון | פתח תקוה | השרון | נתניה והסביבה | חדרה והסביבה | ירושלים והסביבה | השפלה | רחובות – נס ציונה | אשדוד – אשקלון | חיפה והקריות | גליל תחתון | גליל עליון | גולן | באר שבע והסביבה | אילת

## תפריט קטגוריות (Departments sidebar + תפריט עליון) — שמות מהאתר החי, לפי הסדר
1. דילים חמים 🔥 (slug: hot-deals)
2. עד ₪99 (slug: under-99)
3. החדשים (slug: new)
4. מסעדות ובתי קפה (slug: restaurants-cafes)
5. יופי בריאות וטיפוח (slug: beauty-health)
6. טלפונים מחשבים ואביזרים (slug: phones-computers)
7. תינוקות וילדים (slug: baby-kids)
8. צימרים ובתי מלון (slug: vacation)
9. ציוד ומזון לבעלי חיים (slug: pets)
10. בעלי מקצוע (slug: professionals)
11. קורסים Express – בקרוב . . . (slug: courses)

---

## סדר הסקשנים בדף הבית (DOM)
1. Top bar
2. Header (לוגו + חיפוש + בורר אזור + סל + חשבון)
3. תפריט קטגוריות עליון
4. **שורה ראשית (3 טורים):** [תפריט קטגוריות אנכי ימין] [Hero slider אמצע] [3 מיני-באנרים שמאל]
5. רצועת קטגוריות (`categories-block columns-5`)
6. רשת מוצרים (`columns-3`) עם כרטיסי WooCommerce
7. Feature bar (5 פיצ'רים)
8. רצועת Newsletter
9. Footer

### Hero slider — 5 שקופיות (Slider Revolution)
1. "ברוכים הבאים לקניון Express", "מסדרים לך בילוי. . .", תווית "SIMPLY THE BEST"
2. "THE NEW STANDARD" / "PRODUCT PREMIUM"
3. "ממשק מהיר ונוח"
4. "תצוגה מושלמת"
5. "בקרוב האפליקציה"

### 3 מיני-באנרים (צד שמאל של הסליידר)
- Shop the Hottest Products — "Shop now"
- Catch Big Deals on The Consoles — "Shop now"
- Laptops Notebooks and More — "Shop now"

### Feature bar — 5 פיצ'רים
לכל חלקי הארץ | קניה חכמה | שירות לקוחות | מחירים מנצחים | מותגי יוקרה מובילים !

---

## כרטיס מוצר (WooCommerce loop, `columns-3`)
מבנה: שם הקטגוריה כקישור מעל (`.category`) | תמונה | שם מוצר (`woocommerce-loop-product__title`) | badge `onsale` (פינה) | מחיר: `del` (ישן, אפור strike) ליד `ins`/amount (נוכחי) ב-`.woocommerce-Price-amount.amount` בשקלים (₪).

## דף מוצר בודד (`single-product`, electro)
- `single-product-wrapper row`:
  - **גלריה** `woocommerce-product-gallery --columns-5 images`: תמונה ראשית `__image` + carousel thumbnails (5 עמודות).
  - **`summary entry-summary`**: `product_title entry-title` (h1) | מחיר | `quantity` (בורר כמות) + `single_add_to_cart_button button alt` ("הוספה לסל") | `single-product-tags` | SKU ("SKU: n/a").
- מתחת: `related products`.
- **אין טאב ביקורות** (`woocommerce-tabs` לא נוכח). אין wishlist/compare בדף.

## Footer
- Newsletter עליון: "קנה וחסוך, הירשם ל Newsletter לקבלת הנחות והטבות $ נוספות . . ." + שדה אימייל + שדה Phone + כפתור "הירשם"
- "יש לך שאלות, הצעות או הערות ? צור קשר"
- כתובת: "פארק העסקים, התעשייה וההיי-טק. Air Port City"
- אייקוני רשתות: Facebook, X, WhatsApp, Instagram, YouTube
- עמודה "שירות לקוחות": צור קשר, תקנון
- עמודה "אזור אישי": החשבון שלי, סל הקניות, מועדפים, הסטוריה, הזמנות
- שורת תחתית: "כל הזכויות שמורות © Kenyon Express" + אייקוני תשלום

## כפתור WhatsApp צף
מספר 972524635550, פינה תחתית.

---

## סטיות מהאתר החי שהוחלטו לפרויקט (overrides מכוונים)
ערכים אלו נבחרו במפורש ושונים מהאתר החי. בכל קונפליקט בין "1:1 לאתר החי" לבין הרשימה הזו — צריך הכרעה:

| נושא | אתר חי | הוחלט לפרויקט |
|---|---|---|
| פונט | Inter / Open Sans / Assistant | **Heebo** בכל האתר |
| בורר אזור ב-header | קיים (16 אזורים) | **הוסר** מה-header |
| שדה חיפוש ב-header | קיים | **הוסר** (header = לוגו + 3 אייקונים) |
| צבע מחיר | כחול `#1da1f2` / `#333e48` | **אדום `#E4002B`** |
| צבע שם מוצר | כהה | **כחול link `#0062bd`** |
| hover כפתורים | — | `#fedd26` |
| רוחב container | — | `1320px` (token `--container-page`) |
| גובה header | — | `54px` |

---

## מידות electro (מקור: electro_style.css האמיתי + ke_live_home.html)
הערה: `electro_home_v7.html` נחסם ע"י Cloudflare (דף challenge), אז המידות חולצו מ-`electro_style.css` (1.1MB, התבנית האמיתית) ומה-HTML החי.

### Container (max-width לפי breakpoint)
| breakpoint | max-width |
|---|---|
| ≥576px | 540px |
| ≥768px | 720px |
| ≥992px | 960px |
| ≥1200px | **1200px** |
| ≥1480px | **1430px** |

הפרויקט בחר `1320px` אחיד (token `--container-page`) — סטייה מכוונת בין 1200 ל-1430.

### שורה ראשית (3 טורים)
electro/elementor: עמודות 25% (`elementor-col-25` / Bootstrap `col-lg-3`). תפריט Departments אנכי ≈ 25% מהרוחב (כ-270px). הפרויקט: `lg:grid-cols-[270px_1fr_270px]` (departments 270 | hero גמיש | מיני-באנרים 270).

### דף מוצר (יחס גלריה/summary)
- גלריה: `col-lg-5` = **41.667%**
- summary: `col-lg-7` = **58.333%**
- מתחת ל-768px: נערמים (100%).
- גלריה: תמונה ראשית + thumbnails carousel (`--columns-5`).

### רשת מוצרים
`columns-3` (3 עמודות בדסקטופ). gutters Bootstrap (~30px → ~15px לכל צד).

### כרטיס מוצר
padding פנימי קטן + `margin-bottom` בין שורות (~1.8em). תמונה ברוחב מלא של הכרטיס.
