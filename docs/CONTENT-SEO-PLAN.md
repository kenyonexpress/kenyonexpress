# תוכנית תוכן ו-SEO להשקת חנות הקופונים

תאריך: 2026-08-19.
ענף: `phase5/homepage`.
היקף: docs בלבד.

מקורות שמחייבים כשזה סותר טיוטה ישנה: המודל העסקי (קופון = מחיר קופון באתר, יתרה בעסק, אין Escrow), הנתיבים החיים (`/product/[slug]`, לא `/products/[slug]`), והקוד ב-
`src/app/sitemap.ts`,
`src/app/robots.ts`,
`src/lib/seo/json-ld.ts`.

דומיין קנוני להשקה: apex
`https://kenyonexpress.co.il`
(Q38). `www` → apex ב-301. `NEXT_PUBLIC_APP_URL` חייב להיות אותו host, בלי slash בסוף.

עשר הקטגוריות בסעיף 4 הן התפריט החי בלי `courses` (בקרוב) ובלי `electronics` (שארית seed). ראה
`docs/DATA-BASELINE.md`.

כלל על: ערך חסר = השמטה. אסור לזייף דירוג, מלאי, מחיר או כתובת ספק.

---

## 1. Metadata לפי סוג דף

תבנית האתר ב-root layout כבר קיימת:

```
title.template = '%s | קניון אקספרס'
title.default  = 'קניון אקספרס | קופונים ומבצעים'
```

לכן `generateMetadata` מחזיר את ה-`%s` בלבד. לא לשים "קניון אקספרס" בסוף ה-title של הדף, אחרת הכפילות יוצאת בתוצאות.

אורכים: title 50-60 תווים לפני התבנית. description 140-160 תווים. מחיר ב-meta = מה שנגבה באתר, לא שווי הדיל.

### 1.1 בית (`/`)

| שדה | תבנית |
|---|---|
| title (ברירת האתר, בלי template כפול) | להשאיר דרך `title.absolute` או לעקוף את ה-template. הערך החי היום מכיל מקף ארוך בקוד. להשקה: `קניון אקספרס | קופונים ומבצעים בישראל` כ-`absolute` |
| description | `קופונים למסעדות, ספא, נופש ובעלי מקצוע בכל הארץ. משלמים את מחיר הקופון באתר, את היתרה בבית העסק.` |
| canonical | `https://kenyonexpress.co.il/` |
| robots | `index, follow` |
| og:type | `website` |
| og:locale | `he_IL` |
| og:image | קובץ ה-route `src/app/opengraph-image.tsx` (1200×630). לא תמונת מוצר אקראית מהגריד |
| twitter | `summary_large_image`, אותם title/description/image |

H1 בדף: אחד. היום הכותרת הוויזואלית היא בסליידר. לא להוסיף H1 שני ל-SEO.

JSON-LD: `Organization` + `WebSite` (כבר ב-
`buildSiteJsonLd`
). לא לחזור עליהם ב-layout (יכפיל בכל דף).

### 1.2 קטגוריה (`/category/[slug]`)

מקור: `categories.name_he`, `categories.description_he` (קיים ב-
`getCategoryBySlug`
). אין `seo_title` על הקטגוריה היום. עד שיתווסף: title = `name_he`.

| שדה | תבנית |
|---|---|
| title | `{name_he}` → יוצא `{name_he} \| קניון אקספרס`. אוסף (`hot-deals`, `under-99`, `new`): אותו דבר, בלי להמציא "הכי זול בישראל" |
| description | `description_he` אם מלא (סעיף 4). אחרת: `קופונים ב{name_he} בקניון אקספרס. מחיר הקופון באתר, יתרה בבית העסק.` |
| canonical | `/category/{slug}` בלי query. `?page=2`, `?sort=`, `?city=` לא נכנסים לקנוניקל |
| robots | עמוד 1: `index, follow`. עמוד ≥2: `noindex, follow` (אופציונלי; אם לא מיושם, לפחות לא לשים עמודי עמוד ב-sitemap) |
| og:image | ברירת האתר (opengraph-image של השורש) עד שיש כרטיס קטגוריה. לא picsum |
| og:type | `website` |

אין לאינדקס קטגוריה עם 0 מוצרים פעילים. או `noindex` או 404. `courses` נשאר "בקרוב": `noindex` עד שיש דיל.

### 1.3 מוצר קופון (`/product/[slug]`, `products.type = coupon`)

סדר title: `products.seo_title` אם מלא, אחרת `name_he`. לא לדחוף מחיר ל-title אם `seo_title` כבר קיים (האדמין ניסח).

| שדה | תבנית כשאין `seo_*` |
|---|---|
| title | `{name_he}` |
| description | `seo_description` → `short_description_he` → משפט גנרי: `{name_he} אצל {supplier.name}. קופון ב-₪{coupon_price_ils} באתר, יתרה בבית העסק.` אסור משפט שמציג את `full_price` כמחיר הרכישה באתר |
| canonical | `/product/{urlencoded slug}` |
| robots | `index` רק אם `status=active` ו-`deleted_at` ריק. אחרת `noindex, follow` (כבר בקוד) |
| og:type | `website` (לא `product`: כרטיס ה-OG הוא PNG מעוצב, לא Open Graph product) |
| og:image | **לא** `images[0]`. הקובץ `src/app/(store)/product/[slug]/opengraph-image.tsx` (1200×630, מחיר קופון על הכרטיס). מדידה: תמונת 600×600 נחתכת בוואטסאפ ונעלם המחיר |

המחיר על כרטיס ה-OG = `CouponOffer.paidOnlineIls`, אותו אובייקט שהקופה גובה.

### 1.4 מוצר פיזי (`/product/[slug]`, `type = physical`)

לא ב-soft-launch כסף (Q13). אם דף פעיל בכל זאת באינדקס:

| שדה | תבנית כשאין `seo_*` |
|---|---|
| title | `{name_he}` |
| description | `{name_he} ב-₪{kenyon_price / price_ils}. משלוח לפי הספק. מחיר כולל מע״מ.` |
| canonical / robots / OG | כמו קופון. כרטיס OG מציג את המחיר שנגבה באתר (מלא), לא מקדמה |

אסור Offer של קופון על מוצר פיזי ולהפך.

### 1.5 דפים נלווים (קצר)

| דף | index | הערה |
|---|---|---|
| `/products`, `/coupons` | כן | ארכיון. canonical בלי query |
| `/search` | לא | מלכודת תוכן דק. `noindex, follow` |
| `/about`, `/faq`, `/contact`, `/suppliers` | כן | |
| `/blog`, `/blog/[slug]` | כן | |
| משפטיים בנתיבי WP | כן | `/terms-and-conditions`, `/privacy-policy`, `/refund_returns`, `/accessibility` |
| `/cart`, `/checkout*` | לא | גם ב-robots.txt. חסר `robots` ב-metadata של העגלה/קופה: להוסיף `noindex` (קוד, לא הלילה) |
| `/account/**`, `/admin/**`, `/supplier/**`, `/scan`, `/auth/**` | לא | |
| `/coupon/[id]`, `/redeem/[token]`, `/gift/[token]` | לא | הטוקן הוא השובר |

---

## 2. Schema.org ומיפוי לסכמה

מימוש קיים:
`src/lib/seo/json-ld.ts`.
כללים שם נשארים: מחיר מ-`CouponOffer`, בלי דירוג, בלי מחיר 0.

### 2.1 `Product` + `Offer` (PDP)

| JSON-LD | מקור בסכמה / במנוע | הערה |
|---|---|---|
| `name` | `products.name_he` | |
| `description` | `seo_description` / `short_description_he` / `description_he` | אותו מקור כמו meta |
| `url` | `/product/{slug}` | slug מ-`products.slug` |
| `sku` | `products.sku` או `products.id` | רק אם קיים ערך יציב. חסר = השמטה |
| `image[]` | `products.images` | URLs אבסולוטיים. picsum לא צריך להגיע לאינדקס |
| `category` | `categories.name_he` דרך `category_id` | |
| `brand` | `suppliers.name` | לא שם הפלטפורמה |
| `offers.@type` | `Offer` | |
| `offers.priceCurrency` | תמיד `ILS` | |
| `offers.price` (קופון) | `CouponOffer.paidOnlineIls` ← `coupon_price_ils` | מה שנגבה באתר |
| `offers.highPrice` (קופון) | `CouponOffer.fullPriceIls` ← `full_price` / `kenyon_price` | רק אם גבוה מהמקדמה. זה שווי הדיל, לא החיוב באתר |
| `offers.price` (פיזי) | `price_ils` / `kenyon_price` | מלוא החיוב באתר |
| `offers.highPrice` (פיזי) | `full_price` אם גבוה יותר | מחיר מחוק |
| `offers.availability` | מלאי פיזי: `stock_quantity`. קופון לא-sellable: `OutOfStock` בלי מחיר | אסור `price: 0` |
| `offers.priceValidUntil` | `offer_valid_until` דרך `CouponOffer.validUntil` | תוקף ההצעה, לא תוקף השובר אחרי קנייה |
| `offers.seller` | `Organization` עם `suppliers.name` | לא Cardcom |
| `offers.url` | אותו URL של המוצר | |

אסור: `aggregateRating`, `review`. אין ביקורות במוצר.

### 2.2 `LocalBusiness` (בלוק הספק ב-PDP, לא בבית)

אין builder ב-
`json-ld.ts`
היום. להוסיף ליד ה-Product, לא במקומו. חסר שדה = השמטה.

| JSON-LD | עמודה |
|---|---|
| `@type` | `LocalBusiness` (או `Restaurant` / `LodgingBusiness` רק אם יש enum יציב. ב-v1: `LocalBusiness` לכולם) |
| `name` | `suppliers.name` |
| `image` | `suppliers.logo_url` |
| `telephone` | `suppliers.contact_phone` |
| `address.@type` | `PostalAddress` |
| `address.streetAddress` | `suppliers.address` |
| `address.addressLocality` | `suppliers.city` |
| `address.addressCountry` | `IL` |
| `geo.@type` | `GeoCoordinates` |
| `geo.latitude` / `longitude` | `suppliers.lat` / `suppliers.lng` |
| `openingHoursSpecification` | `suppliers.opening_hours` jsonb, רק אחרי שהפורמט קבוע |
| `url` | דף ספק ציבורי כשקיים. אחרת השמטה (לא לקשר ל-`/supplier/` המוגן) |

11 הספקים החיים בלי כתובת: **לא לפלוט LocalBusiness ריק.** Product בלי seller עדיף על כתובת בדיונית.

### 2.3 `BreadcrumbList`

קיים:
`buildBreadcrumbJsonLd`.

סדר:

1. בית `/`
2. קטגוריה `/category/{slug}` (`categories.name_he`)
3. מוצר `/product/{slug}` (`products.name_he`)

`position` מ-1. `item` אבסולוטי. תואם את מה שמוצג ב-UI.

### 2.4 `Organization` + `WebSite` (בית בלבד)

| JSON-LD | ערך |
|---|---|
| `Organization.name` | קניון אקספרס (הקוד כותב KenyonExpress. להשקה ליישר לעברית) |
| `url` | `siteUrl()` |
| `logo` | `{site}/logo.png` (לוודא שהקובץ קיים ב-public) |
| `WebSite.inLanguage` | `he-IL` |
| `SearchAction.target` | `{site}/search?q={search_term_string}` | רק כי הראוט קיים |

אין `AggregateOffer` על הבית. אין FAQ schema על הבית (יש על `/faq`).

### 2.5 מה לא לסמן

- מחיר מחירון כ-`offers.price` על קופון.
- `ItemList` של 32 כרטיסי הבית כל עוד 8 מהם 404.
- קטגוריה ריקה כ-`CollectionPage` עם רשימה ריקה.

---

## 3. sitemap.xml ו-robots.txt

הקוד כבר קרוב. התוכנית להשקה היא לא לכתוב sitemap שני, אלא לשמור על החוזה הזה.

### 3.1 מה נכנס ל-sitemap (קובץ יחיד, עד 45,000)

מקור:
`src/app/sitemap.ts`
(anon + `CATALOGUE_TAG` + `cacheLife('hours')`).

| URL | priority | changefreq | lastmod |
|---|---|---|---|
| `/` | 1.0 | daily | max `updated_at` בקטלוג |
| `/products`, `/coupons` | 0.9 | daily | אותו |
| `/category/{slug}` | 0.8 | daily | `categories.updated_at` |
| `/product/{slug}` פעיל | 0.7 | weekly | `products.updated_at` |
| `/about`, `/faq`, `/contact`, `/suppliers` | 0.5-0.7 | monthly | בלי שעון מזויף |
| `/blog`, פוסטים | 0.5-0.6 | weekly/monthly | `publishedAt` |
| עמודים משפטיים | 0.3 | yearly | `updatedAt` של המסמך |

פילטרים: מוצר רק `status=active` ו-`deleted_at IS NULL`. קטגוריה רק `is_active`. לא לכלול `courses` כל עוד אין דיל (או להשאיר עם `noindex` בדף). לא לכלול דמו אם `attributes.demo = true` (חסר היום ב-sitemap: פער תוכן, לא מכניקה).

`lastmod` אמיתי בלבד. שעון "עכשיו" על כל URL גורם לגוגל להתעלם מהקובץ כולו.

### 3.2 מה אסור לאנדקס (שלוש שכבות)

robots.txt הוא בקשה. הדף עצמו `noindex`. ה-sitemap לא מזכיר.

| נתיב | robots.txt היום | metadata noindex | למה |
|---|---|---|---|
| `/account/` | כן | חלקי (title בלבד) | PII, הזמנות, ארנק |
| `/supplier/` | כן | חלקי | פורטל ספק |
| `/admin/` | כן | חלקי | אדמין |
| `/checkout` ו-`/checkout/*` | `/checkout` | **חסר** בעמוד הקופה | תשלום, לא תוכן |
| `/cart` | כן | **חסר** | עגלה |
| `/scan` | כן | | מצלמת קופה |
| `/auth/`, login, reset | `/auth/`, reset, forgot | חלק מהדפים בלי robots | |
| `/api/` | כן | | |
| `/redeem/` | כן | כן (`noindex, nofollow`) | **הנתיב הוא הטוקן** |
| `/coupon/` | כן | כן ב-`/coupon/[id]` | QR של הלקוח |
| `/gift/[token]` | לא ב-disallow | כן | טוקן מתנה: להוסיף ל-disallow |
| `/search` | לא | לא | להוסיף `noindex` ב-metadata |

אחרי cutover: Search Console, הסרת URL ל-`/product-category/` הישן דרך 301 ל-`/category/`, לא דרך sitemap כפול.

### 3.3 robots.txt (חוזה)

```
User-agent: *
Allow: /
Disallow: /redeem/
Disallow: /coupon/
Disallow: /gift/
Disallow: /account/
Disallow: /supplier/
Disallow: /scan
Disallow: /admin/
Disallow: /checkout
Disallow: /cart
Disallow: /auth/
Disallow: /api/
Disallow: /reset-password
Disallow: /forgot-password

Sitemap: https://kenyonexpress.co.il/sitemap.xml
Host: https://kenyonexpress.co.il
```

`Allow: /` עם Disallow ספציפי. לא לחסום `/product/` או `/category/`.

Preview / Vercel deployment protection: לא לאנדקס `*.vercel.app`. `X-Robots-Tag: noindex` על Preview, או `robots: noindex` כש-`VERCEL_ENV !== 'production'`.

---

## 4. עשרת עמודי הקטגוריה: H1 ופסקת פתיחה

הטקסט הזה הוא תוכן `categories.description_he` (או שדה ייעודי כשיתווסף). H1 = `name_he` של המחלקה, אחד לדף, מעל הגריד, לא בתוך כרטיס.

פסקה אחת, עברית, בלי הבטחת "הכי זול בארץ", בלי Escrow, עם מודל הקופון כשהמחלקה קופונית. אוספים (`hot-deals`, `under-99`, `new`) מתארים כלל, לא טקסונומיית עסק.

### 4.1 דילים חמים (`hot-deals`)

H1: דילים חמים

קופונים עם הנחה בולטת למסעדות, ספא, נופש ושירותים בכל הארץ. משלמים באתר את מחיר הקופון בלבד, ואת יתרת המחיר בבית העסק בעת המימוש ב-QR. העמוד מתעדכן לפי המבצעים הפעילים, לא לפי רשימת קניות קבועה.

### 4.2 עד ₪99 (`under-99`)

H1: עד ₪99

קופונים שמחירם באתר הוא עד תשעים ותשעה שקלים. זה הסכום שנגבה בקניון אקספרס, לא בהכרח שווי הבילוי המלא. את היתרה, אם יש, משלמים במקום המימוש. מתאים למי שמחפש כניסה זולה לדיל, לא לחבילת הכל-כלול במחיר הזה.

### 4.3 החדשים (`new`)

H1: החדשים

דילים שפורסמו לאחרונה בקניון אקספרס: מסעדות, טיפולים, צימרים ושירותים. כל כרטיס מציג את מחיר הקופון באתר ואת בית העסק. כדאי לבדוק תוקף המימוש בעמוד הדיל לפני הרכישה.

### 4.4 מסעדות ובתי קפה (`restaurants-cafes`)

H1: מסעדות ובתי קפה

קופונים לארוחות, בראנץ', בתי קפה וברים ברחבי ישראל. רוכשים קופון באתר, מגיעים למסעדה עם הקוד, ומשלימים את היתרה בחשבון במקום. בדף כל דיל מופיעים שם העסק, הכתובת והוראות המימוש. אין הזמנת שולחן דרך האתר אלא אם צוין במפורש בדיל.

### 4.5 יופי בריאות וטיפוח (`beauty-health`)

H1: יופי, בריאות וטיפוח

קופונים לעיסוי, טיפולי פנים, מספרות, לייזר ומכוני ספא. מחיר הקופון משולם באתר; היתרה, אם מופיעה, בקופת הקליניקה אחרי סריקת ה-QR. יש לבדוק אם נדרש תיאום תור מראש בעמוד הדיל. תוקף הקופון נקוב בימים מיום הרכישה.

### 4.6 טלפונים מחשבים ואביזרים (`phones-computers`)

H1: טלפונים, מחשבים ואביזרים

מכשירים ואביזרים בהנחה. מוצר פיזי בקטגוריה הזו משולם במלואו באתר ומסופק על ידי בית העסק, לא כקופון עם יתרה בקופה. לפני קנייה יש לוודא מלאי, אחריות וכתובת האיסוף או המשלוח בעמוד המוצר. עד השקת פיזי: אם מופיע כאן קופון לשירות תיקון או התקנה, חלים כללי הקופון הרגילים.

### 4.7 תינוקות וילדים (`baby-kids`)

H1: תינוקות וילדים

קופונים לפעילויות, טיפולים ומוצרים לתינוקות וילדים. מחיר הקופון באתר, יתרה בבית העסק במעמד המימוש. דילים שדורשים ליווי הורה או הגבלת גיל יציינו זאת בתיאור. מוצר פיזי (חיתולים, ציוד) אם יופיע: תשלום מלא באתר, בלי יתרה בקופה.

### 4.8 צימרים מלונות ונופש (`vacation`)

H1: צימרים, מלונות ונופש

קופונים ללילה בצימר, חבילת נופש או אטרקציה. משלמים באתר את מחיר הקופון; תוספות (חגים, סופ״ש, אדם נוסף) לפי תנאי הדיל, בדרך כלל בבית העסק. חובה לקרוא את חלון הביטול ואת הצורך בתיאום תאריכים לפני הרכישה. קופון שמומש ללילה שכבר התקיים אינו בר החזר.

### 4.9 ציוד ומזון לבעלי חיים (`pets`)

H1: ציוד ומזון לבעלי חיים

קופונים ודילים למזון, טיפול וציוד לחיות מחמד. אם זה קופון לשירות (מספרה, וטרינר): תשלום באתר ויתרה במרפאה או בעסק. אם זה מוצר פיזי: תשלום מלא באתר. הקטגוריה דקה היום. דיל יופיע כאן רק כשיש ספק עם כתובת וטלפון.

### 4.10 בעלי מקצוע (`professionals`)

H1: בעלי מקצוע

קופונים לשירותי בעלי מקצוע: משרד, בית, יופי טכני ושירותים חד-פעמיים. מחיר הקופון באתר מכסה את המקדמה שנקבעה בדיל; עבודה נוספת מעבר למה שכתוב משולמת ישירות לבעל המקצוע. בדף הדיל חייבים להופיע אזור השירות והאם נדרש תיאום מראש.

`courses` לא כאן: "בקרוב", `noindex`, בלי פסקת השקה שמבטיחה קורסים.

---

## 5. Core Web Vitals: צ'קליסט Next.js 15 (הפרויקט הזה)

יעדים: LCP ≤ 2.5s בנייד על בית ו-PDP, CLS ≤ 0.1, INP ≤ 200ms. מדידת הבית ב-01.08 הייתה LCP ארוך (באנר קוקיז / הירו). השער הוויזואלי (`compare.mjs` < 11%) לא מחליף CWV.

הפרויקט רץ עם Cache Components (`use cache`, `cacheLife`, `cacheTag`). `export const revalidate` ב-sitemap הוחלף בזה בכוונה. לא להחזיר segment config ישן ששובר את הדגל.

### 5.1 LCP

| # | בדיקה | למה זה Next 15 |
|---|---|---|
| L1 | תמונת LCP אחת עם `priority` / preload. בשאר הגריד: בלי | `next/image`. שתי תמונות priority נלחמות על ה-LCP |
| L2 | הירו המונפש: פריים סטילס מתחת ל-1024px (כבר נמדד). לא `unoptimized` על כל הגריד | `next/image` הורג GIF מונפש אם משנים גודל |
| L3 | `generateMetadata` מ-`createPublicClient` + `use cache`, לא מ-cookies | קריאת עוגייה דוחה את ה-`<meta name="description">` אחרי `</head>` ו-Lighthouse SEO נכשל גם כשהתג קיים |
| L4 | Heebo: `display: swap`, `preload: false` על נתיב שה-LCP שלו Arial בכוונה | `next/font`. Preload של פונט שלא ב-LCP גונב רוחב פס |
| L5 | לא לפצל CSS של כרטיס/עגלה/בית ל-chunk נפרד אם הוא קטן | כל import ברמת route = `<link>` חוסם. נמדד: 870ms על 8.6KB בארבעה קבצים |
| L6 | באנר קוקיז לא יכול להיות אלמנט ה-LCP | אחרי תיקון הירו, Lighthouse תפס את הבאנר. soft-launch בלי פיקסל שיווקי מקטין באנר |
| L7 | תמונות מהקטלוג דרך `next/image` + `sizes` שמתאימים לכרטיס, לא `100vw` על תמונה של 193px | |
| L8 | בלי picsum ב-LCP של דף פעיל | host זר, אין cache של Vercel Image |

### 5.2 CLS

| # | בדיקה |
|---|---|
| C1 | רוחב×גובה (או aspect-ratio) על כל תמונת כרטיס. גריד בגובה 0 כבר שבר את שער הפיקסלים |
| C2 | פונט swap: שמירת line-height קבוע לכותרות כדי שהחלפת Heebo לא תקפוץ |
| C3 | באנר קוקיז / התראות: מקום שמור או באנר שלא דוחף את הירו |
| C4 | לא להזריק רצועת "הוסף לסל" אחרי paint אם היא משנה גובה כרטיס (השוואת המוצר נשארה 15% בבחירה) |
| C5 | OG ו-JSON-LD לא משפיעים על CLS. סקריפט ld+json בלי layout |

### 5.3 INP

| # | בדיקה |
|---|---|
| I1 | הבית ודף הקטגוריה: RSC. Zustand לעגלה בלבד, לא את חבילת הקופה |
| I2 | Cardcom / iframe רק ב-`/checkout` |
| I3 | אנליטיקה אחרי idle + consent. לא ב-critical path |
| I4 | כפתור "הוסף לעגלה": פעולה קצרה, בלי לחכות ל-PDP מלא |
| I5 | חיפוש: debounce, Meilisearch בשרת, לא לגרור קטלוג לדפדפן |
| I6 | Speed Insights מותר. Web Analytics של Vercel לא תחליף ל-Sentry |

### 5.4 Cache Components (ייחודי לדגל כאן)

| # | בדיקה |
|---|---|
| K1 | קטלוג, sitemap, SEO של PDP: `'use cache'` + `cacheTag(CATALOGUE_TAG)` |
| K2 | שמירת מוצר באדמין קוראת `updateTag` על אותו תג, אחרת sitemap ו-meta נשארים ישנים עד שעה |
| K3 | `new Date()` רק בתוך cache scope (הערה ב-sitemap). מחוץ לו זה שגיאת build תחת הדגל |
| K4 | עגלה/קופה/חשבון: דינמיים, בלי cache של PII |
| K5 | Preview לא משתמש ב-CDN של פרוד כאילו זה קטלוג חי |

### 5.5 מדידה לפני GA

| כלי | מתי |
|---|---|
| Lighthouse נייד על `/`, `/category/beauty-health`, PDP קופון אמיתי (לא דמו) | אחרי תיקון תוכן, לפני cutover |
| Search Console: sitemap, כיסוי, דפים מיותרים | 48 שעות אחרי DNS |
| Rich Results Test על PDP קופון | אחרי JSON-LD; מחיר = מקדמה |
| `compare.mjs --page=home` | לא במקום CWV |

---

## 6. סדר ביצוע להשקה (תוכן, לא קוד הלילה)

1. למלא `description_he` לעשר הקטגוריות בנוסח סעיף 4.
2. `noindex` על `courses`, על חיפוש, על עגלה/קופה ב-metadata.
3. להוציא דמו מ-sitemap.
4. `LocalBusiness` רק לספק עם כתובת.
5. ליישר `Organization.name` לעברית.
6. GSC אחרי cutover, לא לפני שהדומיין על Next.

---

## Revision

| Date | Change |
|---|---|
| 2026-08-19 | תוכנית השקה: metadata, Schema.org מול הסכמה החיה, sitemap/robots, 10 קטגוריות, CWV ל-Next 15 עם Cache Components |
