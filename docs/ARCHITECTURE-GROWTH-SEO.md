# ארכיטקטורת צמיחה, שימור SEO ושיווק מחזור חיים (Growth & SEO)

מסמך הכרעות. תאריך: 2026-07-17. ענף: `phase5/homepage`.

> **שכבת ריצה 2026-07-20:** מכניקת SEO בזמן ריצה (proxy 301, sitemap/robots,
> meta, JSON-LD helpers, CWV, cache) מקובעת ב-
> `ARCHITECTURE-PERFORMANCE-SEO.md` (שורש). מסמך זה נשאר מקור האמת לשימור
> דירוגים במעבר, מלאי URL, ניטור 30 יום, לולאות צמיחה/CRM/paid. אין סתירה
> מכוונת; PS-1..PS-3 מאשררים את G1..G4.

מעמד המסמך: מסמך הדומיין המחייב לצמיחה, שימור דירוגים במעבר מוורדפרס,
לולאות הפניה/‏cashback, ‏CRM ומוכנות לפרסום בתשלום. הוא בנוי מעל
ההכרעות הקיימות ואינו סותר אותן:

| תחום | המסמך הגובר |
|---|---|
| מכניקת SEO (slugs, canonical, redirects, sitemap) | `docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md` (030) |
| ‏cutover ו-inventory של URL ישנים | `docs/ARCHITECTURE-WP-DATA-MIGRATION.md` (032) |
| ערוצי הודעות, הסכמות, מסעות | `docs/ARCHITECTURE-NOTIFICATIONS-MARKETING.md` (031) |
| אירועים, ייחוס, views | `docs/ARCHITECTURE-ANALYTICS-BI.md` (033/034) |
| דין: שוברים, פרטיות, ספאם | `docs/ARCHITECTURE-LEGAL-COMPLIANCE.md` (גובר בכל עניין משפטי) |
| ארנק, snapshot כספי | `docs/ARCHITECTURE-COMMERCE.md` (026) |

מה שמסמך זה מוסיף: הכרעות שהיו חסרות (שיעורי cashback, סכומי הפניה,
תבניות JSON-LD מלאות כולל LocalBusiness, מפרט CAPI/ROAS, עץ KPI),
ומפרט מיגרציה עתידית `041_growth.sql` (סעיף 7; לפי משמעת המספור R31:
‏036 vendors, ‏037 משפטי, 038 ביצועים, 039 סוכנים, 040 ‏observability,
ולכן הפנוי הבא הוא 041; המספר תוקן מ-040 בקליטת המסמך ל-`docs/`).
המסמך כפוף ל-`docs/MASTER-ARCHITECTURE.md` (v3) ואינו משנה קבצים
ב-`supabase/`.

---

## 0. עקרונות על

1. **רציפות SEO היא הכנסה, לא פרויקט צד.** האתר הישן מדורג ומביא תנועה
   חינמית; כל אחוז תנועה אורגנית שאובד ביום המעבר נקנה אחר כך בכסף.
   שער השיגור: אפס URL ישן בלי הכרעה (301 / התאמה חיה / 410 מודע).
2. **וואטסאפ הוא ערוץ ההפצה הראשי של השוק הישראלי.** כל לולאת צמיחה
   מתוכננת קודם כשיתוף וואטסאפ, והמייל/‏SMS משניים.
3. **כל שקל של הטבה עובר ב-ledger.** הפניות ו-cashback נכתבים אך ורק דרך
   `fn_wallet_transfer` עם `idempotency_key`; ההתחייבות נקראת מ-
   `v_wallet_liability`; אין הטבות מחוץ לארנק.
4. **שיווק רק ב-opt-in.** אין ניצול חריג "לקוח קיים" של 30א (הכרעת 031).
   כל המיובאים מוורדפרס נכנסים opted-out (M5) ונאספת הסכמה מחדש באתר.
5. **מספרים להחלטה.** כל KPI בסעיף 6 ניתן לחישוב מהסכימה הקיימת
   (views של 033/034 או שאילתה מוגדרת כאן), עם הגדרה אחת ויחידה.

---

## 1. תוכנית שימור SEO במעבר מוורדפרס

### 1.1 מלאי ה-URL: שלושה מקורות, טבלה אחת

מקור האמת: `wp_import.url_inventory` (032). שלושת המקורות, בסדר הרצה:

| # | מקור | מה מפיקים | איך |
|---|---|---|---|
| 1 | ייצוא GSC | כל URL עם קליק אחד לפחות ב-12 החודשים האחרונים + שאילתות ה-Top-100 (עמודות: clicks, impressions, position) | GSC > Performance > ייצוא מלא דרך ה-API (‏Search Analytics, ‏`dimensions=page` ואז `dimensions=query,page`), לא הייצוא הידני המוגבל ל-1,000 שורות |
| 2 | ‏sitemap ישן | ‏`sitemap_index.xml` של Yoast: מוצרים, קטגוריות, עמודים, פוסטים | fetch + פירוק לכל sitemap בן |
| 3 | ‏crawl מלא | כל מה שלא ב-1/2: תגיות, עמודי מחבר, feeds, קבצי מדיה מקושרים, פרמטרים | Screaming Frog על הדומיין החי, כולל רשימת ה-inlinks לכל URL |

הכרעות:

1. ייצוא ה-GSC נשמר גם כ-baseline ביצועים: קובץ
   `docs/growth/baseline/gsc-pre-cutover.csv` (clicks/impressions/position
   פר URL ופר query) נלקח פעם אחת ב-T-7. בלעדיו אין דרך לדעת אחרי
   ההשקה אם ירדנו ומאיפה.
2. עדיפות טיפול לפי קליקים: URL עם קליקים ב-GSC מקבל מיפוי ידני;
   ‏URL בלי קליקים מקבל כלל גזירה אוטומטי (דפוסי 5.2 במסמך ה-WP).
3. קבצי מדיה עם קליקים (Google Images) נכנסים גם הם ל-inventory
   ומקבלים 301 ל-URL החדש ב-Storage (ממפת `wp_import.media`).
4. שער השלמות (5.3 במסמך ה-WP) נשאר כמות שהוא: סקריפט HTTP על כל
   ה-inventory מול הפרודקשן החדש לפני ה-flip, מצופה 301 -> 200,
   בלי שרשראות ובלי לולאות.

### 1.2 פורמט מפת ה-301: קובץ curation אחד, טבלה אחת

מקור האמת ב-runtime: `public.seo_redirects` (030), אכיפה ב-`src/proxy.ts`
על 404 בלבד, ‏301 מדויק (M8). קובץ העבודה שממנו נטענת הטבלה הוא CSV
אחד, `docs/growth/redirects/redirect-map.csv`, בפורמט המחייב:

```csv
old_path,decision,new_path,status_code,rule,gsc_clicks_12m,notes
/product/%D7%A1%D7%A4%D7%90-%D7%96%D7%95%D7%92%D7%99/,redirect,/products/spa-couples-60min,301,per_product,412,
/product-category/%D7%9E%D7%A1%D7%A2%D7%93%D7%95%D7%AA/,redirect,/category/restaurants-cafes,301,category_map,168,
/shop/,redirect,/products,301,fixed_pattern,35,
/tag/%D7%A1%D7%A4%D7%90/,redirect,/category/beauty-health,301,nearest_category,3,
/my-account/orders/,redirect,/account,301,fixed_pattern,0,
/2019/03/old-post/,gone,,410,manual,0,תוכן שאין לו יעד ולא יהיה
/checkout/,redirect,/checkout,301,fixed_pattern,0,
/wp-content/uploads/2023/05/deal-hero.jpg,redirect,https://<storage>/product-images/wp/1234/deal-hero.webp,301,media_map,22,
```

חוקים:

1. `old_path` נשמר percent-encoded ומנורמל (בלי trailing slash, בלי
   query), בדיוק כמו שה-lookup ב-`proxy.ts` מנרמל.
2. `decision` אחד מ: `redirect` / `live` (יש התאמה ישירה לדף חי, לא
   נטען לטבלה) / `gone` (410). אין ערך רביעי.
3. `rule` מתעד את מקור ההכרעה (per_product מ-id_map, category_map,
   fixed_pattern, nearest_category, media_map, manual). משמש לדיבוג
   אחרי ההשקה: כשרואים 404 חוזר, יודעים איזה כלל פספס.
4. הטעינה לטבלה: סקריפט הייבוא של מסלול W (`05-project-catalog.ts`
   כותב את ה-per_product; קובץ ה-CSV הזה משלים את השאר דרך אותו
   מנגנון batch עם `source='wordpress_import'`).
5. שרשראות אסורות: הטוען מקרוס A->B->C ל-A->C ונכשל על לולאה.

### 1.3 שפה ו-hreflang: הכרעה

**אין אשכול hreflang.** האתר חד-לשוני (עברית) על דומיין יחיד; ‏hreflang
נועד למיפוי בין גרסאות שפה מקבילות, ועם גרסה אחת הוא רעש שרק מייצר
שגיאות ולידציה ב-GSC. זה מאשרר את הכרעת הקטלוג (3.8). סיגנלי השפה
הם אלה, והם מחייבים בכל דף:

1. `<html lang="he" dir="rtl">` (קיים בפועל).
2. `og:locale = he_IL` (כלל 3.7 של הקטלוג).
3. `Content-Language` לא נשלח (deprecated, גוגל מתעלם).
4. ‏JSON-LD עם `"inLanguage": "he-IL"` על `WebSite` בלבד (סעיף 1.4).
5. אם אי פעם תקום גרסת שפה שנייה (למשל ערבית): אז ורק אז נוסף
   hreflang דו-כיווני + `x-default` לעברית, ב-`generateMetadata`
   המשותף, בלי לגעת ב-URLs הקיימים.

### 1.4 Structured data: תבניות JSON-LD פר סוג דף

עקרונות מחייבים (מרחיבים את 3.4 של הקטלוג, לא סותרים):

1. הכול מיוצר ב-server components מדאטה ב-DB בלבד; ערכים חסרים
   משמיטים את המפתח, לעולם לא מזייפים.
2. **אין `aggregateRating` ואין `review`** (עיקרון 0.5 של הקטלוג).
3. כל הישויות משתמשות ב-`@id` יציבים כדי שגרפים בין דפים יתאחו:
   `https://kenyonexpress.co.il/#org`, ‏`.../#website`,
   ‏`.../products/<slug>#product`, ‏`.../suppliers/<id>#business`.
4. מחיר תמיד `kenyon_price` (או `platform_price` בקופון: מה שמשולם
   באתר). `full_price` לא נכנס ל-JSON-LD.
5. חדש במסמך זה: **LocalBusiness לספקים עם geo**. לדיל/קופון הערך
   ללקוח הוא העסק הפיזי; ‏LocalBusiness עם `geo` + `address` +
   `openingHours` הוא מה שמזכה בנראות מקומית (חבילת המפות של גוגל
   מוזנת מ-GBP, אבל ה-markup מחזק את הקישור ישות-עסק).

טבלת ישויות פר סוג דף:

| דף | ישויות |
|---|---|
| בית `/` | `Organization` + `WebSite` (עם `SearchAction`) |
| קטגוריה `/category/[slug]` | `BreadcrumbList` + `ItemList` (‏url בלבד) |
| מוצר פיזי `/products/[slug]` | `BreadcrumbList` + `Product` + `Offer` (+ `seller` = Organization) |
| דיל קופון `/products/[slug]` (type=coupon) | `BreadcrumbList` + `Product` + `Offer` + **`LocalBusiness` משוקע כ-`seller`** |
| עמוד ספק עתידי | `LocalBusiness` מלא (אותו `@id` כמו בדף הדיל) |
| עמודים משפטיים | ללא (אין ישות מתאימה; לא ממציאים) |

תבנית הבית (‏Organization + WebSite):

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://kenyonexpress.co.il/#org",
      "name": "קניון EXPRESS",
      "url": "https://kenyonexpress.co.il/",
      "logo": "https://kenyonexpress.co.il/images/logo-600.png",
      "sameAs": ["<facebook>", "<instagram>"]
    },
    {
      "@type": "WebSite",
      "@id": "https://kenyonexpress.co.il/#website",
      "url": "https://kenyonexpress.co.il/",
      "name": "קניון EXPRESS",
      "inLanguage": "he-IL",
      "publisher": {"@id": "https://kenyonexpress.co.il/#org"},
      "potentialAction": {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": "https://kenyonexpress.co.il/search?q={search_term_string}"
        },
        "query-input": "required name=search_term_string"
      }
    }
  ]
}
```

תבנית דיל קופון (‏Product + Offer + LocalBusiness). המקורות:
`products` (או `coupon_deals`) + `suppliers` (שם, כתובת, עיר, טלפון,
שעות פתיחה, ‏lat/lng מסעיף 8.2 של 026; ח.פ מ-037):

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "@id": "https://kenyonexpress.co.il/products/<slug>#product",
  "name": "<name_he>",
  "image": ["<og_image_url>", "<images[0..n]>"],
  "description": "<description_he נקי, 300 תווים>",
  "sku": "<sku>",
  "brand": {"@type": "Brand", "name": "<brand>"},
  "offers": {
    "@type": "Offer",
    "url": "https://kenyonexpress.co.il/products/<slug>",
    "priceCurrency": "ILS",
    "price": "<מה שמשולם באתר: kenyon_price / platform_price>",
    "availability": "https://schema.org/<נגזר מסעיף 1.5 של הקטלוג>",
    "itemCondition": "https://schema.org/NewCondition",
    "validFrom": "<valid_from>",
    "priceValidUntil": "<valid_until>",
    "seller": {
      "@type": "LocalBusiness",
      "@id": "https://kenyonexpress.co.il/suppliers/<supplier_id>#business",
      "name": "<suppliers.name>",
      "telephone": "<suppliers.phone>",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "<suppliers.address>",
        "addressLocality": "<suppliers.city>",
        "addressCountry": "IL"
      },
      "geo": {
        "@type": "GeoCoordinates",
        "latitude": "<suppliers.lat>",
        "longitude": "<suppliers.lng>"
      },
      "openingHours": "<נגזר מ-suppliers.opening_hours jsonb>"
    }
  }
}
```

כללי שסתום ל-LocalBusiness:

1. משוקע רק כשלמוצר יש `supplier_id` ולספק יש לפחות שם + עיר.
   ‏`geo` רק כשיש lat/lng אמיתיים מרשומת הספק המאומתת. **לעולם לא
   מ-meta של וורדפרס** (כלל C1, באג נהריה: עיר מהייבוא אסורה).
2. מוצר פיזי שנשלח בדואר: ‏`seller` הוא `Organization` של הספק בלי
   geo (העסק הפיזי לא רלוונטי לקונה משלוח), או מושמט כשאין ספק.
3. וריאציות עם מחירים שונים: `AggregateOffer` עם lowPrice/highPrice
   (הכרעת הקטלוג), ה-seller נשאר על ה-AggregateOffer.

תבנית BreadcrumbList (מוצר; לקטגוריה אותו דבר בלי הרמה האחרונה):

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {"@type": "ListItem", "position": 1, "name": "בית", "item": "https://kenyonexpress.co.il/"},
    {"@type": "ListItem", "position": 2, "name": "<קטגוריית אב>", "item": "https://kenyonexpress.co.il/category/<parent-slug>"},
    {"@type": "ListItem", "position": 3, "name": "<קטגוריה>", "item": "https://kenyonexpress.co.il/category/<slug>"},
    {"@type": "ListItem", "position": 4, "name": "<name_he>"}
  ]
}
```

ולידציה: בדיקת Rich Results (‏URL Inspection) על 5 דפי דגימה פר סוג
לפני ה-flip; ‏CI מריץ ולידציית סכימה (ajv מול סכימות schema.org
מצומצמות) על ה-helpers שמייצרים את ה-JSON-LD.

---

## 2. יום ההשקה: צ'קליסט וניטור 30 יום

### 2.1 החלטת Change of Address

**לא משתמשים ב-Change of Address.** הכלי מיועד למעבר דומיין; אנחנו
נשארים על `kenyonexpress.co.il` (הנחת העבודה המאושרת של הקטלוג 6.3
ומסמך ה-WP). מה שכן חובה ב-GSC:

1. אימות בעלות על ה-property (‏Domain property, דרך DNS TXT) **בעוד
   וורדפרס חי** (משימת שלב 0 של מסלול W). כך ההיסטוריה נשמרת ברצף.
2. אם ה-property הקיים הוא URL-prefix בלבד: מוסיפים Domain property
   לפני ה-flip ולא מוחקים את הישן (ההיסטוריה שלו היא ה-baseline).

### 2.2 צ'קליסט T-0 (סדר ביצוע ביום ה-flip)

| # | פעולה | איפה | אימות |
|---|---|---|---|
| 1 | ‏`08-verify` ירוק מלא כולל שער ה-301 (100% inventory) | Terminal | exit code 0 |
| 2 | ‏flip DNS (‏apex A + www CNAME ל-Vercel, TTL 300) | ספק הדומיין | dig |
| 3 | בדיקת עשן: בית, קטגוריה, מוצר, ‏checkout, ‏/api/health | Chrome | ‏200 בכולם |
| 4 | דגימת 10 URL ישנים עם הקליקים הגבוהים: ‏301 -> 200, קפיצה אחת | Terminal (curl -IL) | ידני |
| 5 | הגשת ה-sitemap החדש (`/sitemap.xml`) ב-GSC | GSC > Sitemaps | סטטוס Success |
| 6 | הסרת הפניית ה-sitemap הישן של Yoast מ-GSC (לא מהאתר: הוא כבר לא מוגש) | GSC | |
| 7 | ‏robots.txt חדש חי: ‏Disallow ל-admin/account/supplier/api/search/auth + שורת Sitemap | Chrome | |
| 8 | ‏URL Inspection + בקשת אינדוקס לבית + 5 דפי הקטגוריה הראשיים | GSC | |
| 9 | אימות תגיות OG בשיתוף וואטסאפ אמיתי של דף דיל (תמונה, מחיר, כותרת) | וואטסאפ | ידני |
| 10 | הפעלת דוח ה-404 והצגת `seo_redirects.hits` בדשבורד האדמין | ‏/admin | |

אסור ביום ההשקה: שינוי טקסטים של title/description, שינוי מבנה
קטגוריות, מחיקת מוצרים. משנים דבר אחד (הפלטפורמה), מודדים, ורק אז
משפרים תוכן.

### 2.3 ניטור 30 יום: לוח, ספים, טריגרים

קצב: יומי בשבוע הראשון, ואז פעמיים בשבוע עד יום 30.

| מדד | מקור | סף תקין | פעולה כשחורג |
|---|---|---|---|
| ‏404 על path שהיה ב-inventory | דוח 404 (‏proxy logs) מוצלב מול `url_inventory` | 0 | הוספת שורת redirect באותו יום (זה באג כיסוי, לא "נחכה") |
| ‏Coverage: עמודים באינדקס | GSC > Pages | ירידה עד 15% מול baseline מוסברת (תגיות/מחברים שקיבלו 301) | מעל זה: בדיקת ה-URLs שנשרו אחד-אחד |
| קליקים אורגניים יומיים (ממוצע 7 ימים) | GSC > Performance מול `gsc-pre-cutover.csv` | עד ‏-20% בשבועיים הראשונים (תנודת מעבר צפויה) | ‏-20% עד -40%: השוואת top-50 queries מול ה-baseline, איתור הדפים שאיבדו position, בדיקת redirect + תוכן פר דף |
| ‏position ל-top-20 queries | GSC | ירידה עד 3 מקומות זמנית | מעבר לזה על query מסחרי: בדיקת הדף היעד (title, תוכן, מהירות) |
| ‏`seo_redirects.hits` | ‏DB | יורד בהדרגה (גוגל לומד את החדשים) | עלייה פתאומית: מישהו מקשר ל-URL ישן חדש; לאתר את המקור |
| ‏Soft 404 / Redirect error ב-GSC | GSC > Pages | 0 | תיקון באותו שבוע |
| ‏Core Web Vitals | GSC + Vercel Speed Insights | ירוק | בבעלות מסמך הביצועים |

**טריגרי rollback (הכרעה):**

1. ‏rollback DNS לוורדפרס (וורדפרס חי שבועיים, M14) מופעל **רק** על
   כשל תפעולי: האתר לא עולה, ‏checkout שבור, אובדן דאטה. 
2. **ירידת SEO אינה טריגר rollback.** תנודת דירוג במעבר היא צפויה
   והפיכה קדימה (תיקון redirects ותוכן); חזרה לוורדפרס ואז flip שני
   גורמת נזק כפול (שני מעברים במקום אחד). ההחלטה הזו נקבעת כאן,
   מראש, כדי שלא תתקבל בלחץ של גרף אדום ביום 5.
3. חריג יחיד: אם ביום 3+ מתגלה כשל redirects רוחבי (מעל 10% מה-
   inventory מחזיר 404 בגלל באג ב-proxy) שלא ניתן לתקן בתוך 24 שעות:
   ‏rollback. זה כשל תפעולי, לא תנודת דירוג.

ביום 30: דוח סיכום (קליקים מול baseline, עמודים באינדקס, רשימת
queries שאבדו) נשמר ב-`docs/growth/baseline/day30-report.md`, ומחליטים
על סבב שיפורי תוכן לפי הפערים.

---

## 3. לולאות צמיחה ישראליות

### 3.1 שיתוף וואטסאפ ומשמעת UTM

תשתית קיימת: ‏OG מותאם וואטסאפ (קטלוג 3.7), ‏`orders.attribution`
(‏first/last touch, ‏033), עוגיית ייחוס 30 יום. ההכרעות:

1. **כפתור שיתוף בכל דף דיל** (ובקופון שהונפק באזור האישי): פותח
   `https://wa.me/?text=<הודעה>` עם טקסט בעברית + URL. לעולם לא
   משתפים `qr_token` (הכרעת superapp); משתפים את דף המוצר בלבד.
2. **סכימת UTM קנונית אחת.** כל קישור שנוצר על ידי המערכת נושא בדיוק
   את הפרמטרים האלה, באותיות קטנות, בסדר אלפביתי (נרמול הקטלוג 3.6):

| הקשר | utm_source | utm_medium | utm_campaign | utm_content |
|---|---|---|---|---|
| כפתור שיתוף דף דיל | `whatsapp` | `share` | `product_share` | `<product-slug>` |
| שיתוף קופון שנרכש | `whatsapp` | `share` | `coupon_share` | `<product-slug>` |
| קישור הפניה אישי | `whatsapp` | `referral` | `referral_program` | `<referral_code>` |
| הודעת outbox (מייל/וואטסאפ) | `crm` | `email` / `whatsapp` | `<journey_key>` | `<template_key>` |
| פרסום בתשלום | `facebook` / `google` | `paid` | `<שם קמפיין>` | `<שם מודעה>` |

3. עמודי היעד עם UTM הם noindex ממילא רק אם יש פילטרים; ‏UTM לבדו
   לא משנה canonical (הפרמטרים utm_* מוחרגים מנרמול ה-canonical:
   ה-canonical תמיד בלי utm).
4. קישור הפניה: `https://kenyonexpress.co.il/r/<referral_code>` (דפוס
   ‏superapp D-links). ה-route קורא את הקוד, כותב עוגיית ייחוס
   ‏30 יום (אותה עוגיית attribution של 033, מפתח `ref`), ועושה 302
   לדף היעד (בית או דיל אם צוין `?d=<slug>`). ‏`/r/*` הוא noindex
   ו-Disallow ב-robots (אין ערך אינדוקס, רק דילול crawl).
5. מדידה: ‏`v_channel_revenue_weekly` כבר מפלח לפי last-touch;
   ‏k-factor בסעיף 6.

### 3.2 תוכנית הפניות (referral): הכרעות מלאות

תשתית קיימת: `referrals` (010: ‏unique pair, ‏status
‏pending/completed/rejected), ‏`profiles.affiliate_code`, ‏wallet reason
‏`referral_bonus`, פקיעת הטבות 24 חודשים (LEGAL 1.2.3). ההכרעות:

**מכניקה:**

1. דו-צדדית: המפנה מקבל **20 ש"ח** לארנק, המופנה מקבל **10 ש"ח**
   לארנק. שני הצדדים מזוכים באותו רגע (סעיף 3 להלן).
2. תנאי השלמה: למופנה זו **הזמנת ה-paid הראשונה** אי פעם, עם
   `charged_on_site_ils >= 50`, ‏**וחלפו 14 יום מ-`paid_at` בלי
   refund** (חלון הביטול הצרכני של 037). ההשהיה היא הגנת ה-fraud
   המרכזית: אי אפשר לקנות-לקבל-לבטל.
3. מימוש: cron יומי (אחרי `expire_coupons`) סורק `referrals` בסטטוס
   `pending` שההזמנה המזכה שלהם עברה את החלון, ומריץ בטרנזקציה:
   שתי קריאות `fn_wallet_transfer` מ-`platform:cashback_reserve`
   (‏reason ‏`referral_bonus`, ‏idempotency keys
   ‏`referral_referrer:<referral_id>` ו-`referral_referred:<referral_id>`),
   עדכון `referrals.status='completed'`, ורישום audit. ריצה כפולה =
   ‏no-op בזכות ה-idempotency.
4. ייחוס: עוגיית ה-`ref` מסעיף 3.1.4 נקראת בהרשמה (יצירת
   ‏`referrals` בסטטוס pending) בלבד. ‏last-touch, ‏30 יום, כמו שאר
   הייחוס. משתמש קיים שנכנס דרך קישור הפניה: לא נוצרת שורה
   (‏unique pair + בדיקת "משתמש חדש").

**גבולות fraud (נאכפים ב-fn, לא ב-UI):**

| # | כלל | מימוש |
|---|---|---|
| 1 | הפניה עצמית חסומה | ‏referrer != referred (‏CHECK), אותו אימייל מנורמל, אותה עוגיית מכשיר (`ke_session_id` זהה בהרשמה = דחייה) |
| 2 | תקרת מפנה | עד **5** הפניות completed לחודש קלנדרי ועד **30** לשנה פר משתמש; מעבר לזה השורות נשארות pending לבדיקת אדמין |
| 3 | אות תשלום זהה | הזמנה מזכה ששולמה ב-`payment_token` או בכרטיס (4 ספרות אחרונות + תוקף מ-raw_response) שכבר שילם אצל המפנה: הפניה נכנסת ל-`rejected` עם סיבה |
| 4 | טלפון/כתובת זהים | ‏phone מנורמל או address זהים בין מפנה למופנה: דגל לבדיקה ידנית (לא דחייה אוטומטית: בני משפחה לגיטימיים) |
| 5 | ‏clawback | ‏refund של ההזמנה המזכה אחרי הזיכוי (מקרה קצה: ביטול פגם באיחור): תנועת קיזוז מהארנק עד גובה היתרה + `rejected`; אין יתרה שלילית (‏CHECK של 026), ההפרש נספג ונרשם ב-note |
| 6 | קצב | ‏`check_user_rate_limit(uid,'referral_share',30,'1 day')` על יצירת קישורים; הקוד עצמו קבוע פר משתמש כך שאין טעם לג'נרט |

**מסגרת משפטית (נגזר מ-LEGAL, מחייב):**

1. בונוס הפניה הוא **הטבה שהפלטפורמה העניקה, לא כסף ששולם**: פוקע
   אחרי 24 חודשים (פקיעה פר שורת צבירה, `wallet_transactions.expires_at`),
   בכפוף לגילוי בתקנון ובמסך הארנק. הוא אינו תו קנייה לפי 14ח (לא
   נמכר בתמורה), ולכן כלל 5 השנים לא חל עליו; ההבחנה הזו כתובה
   בתקנון (סעיף 5 של 3.1 ב-LEGAL) ליד טבלת הפקיעות.
2. הארנק אינו ניתן למשיכה (הכרעת 026); בונוסים לעולם לא מומרים למזומן.
3. תנאי התוכנית = סעיף 11 בתקנון (קיים במתאר): זכות ביטול הטבות
   שהושגו בהונאה, תקרת הפניות, והבהרה שהמלאי/הסכומים ניתנים לשינוי
   צופה פני עתיד.
4. הודעת "חבר שלך קיבל 20 ש"ח" למפנה היא הודעת שירות על הטבה שנצברה
   (‏wallet activity, ‏opt-in של `wallet_activity_email` מ-029);
   הזמנה לשתף ("הזמן עוד חברים") היא **פרסומת** ונשלחת רק תחת
   ‏`marketing_*` (30א). ההפרדה נאכפת בתבניות.

### 3.3 ‏cashback כלולאת retention וחשבונאות ההתחייבות

‏026 השאיר את "אם ההזמנה מזכה" פתוח. ההכרעות:

**שיעורים:**

| סוג פריט | ‏cashback | בסיס חישוב | נימוק |
|---|---|---|---|
| קופון | **10%** | ‏`charged_on_site_ils` של השורה | מה שמשולם באתר הוא כולו הכנסת פלטפורמה; ‏10% ממנו = 10% מההכנסה, שיווקית "10% חזרה לארנק" חזק |
| פיזי | **1%** | ‏`charged_on_site_ils` (= מלוא המחיר) | ‏**נימוק מתוקן, QA 06.08.** הנימוק הקודם היה "בפיצול 10/90 זה 10% מהעמלה", והוא נשען על פיצול קבוע שאינו קיים: ‏`platform_percent` דינמי פר מוצר (‏C1/‏C2). ‏1% ממלוא המחיר הוא **חלק משתנה** מהעמלה: במוצר עם 10% הוא עשירית ממנה, ובמוצר עם 3% הוא שליש ממנה. מה שמחזיק את העלות בגבול אינו הנימוק אלא **תקרת 25% מהעמלה** (‏G11), והיא הופכת כאן מקישוט למגן היחיד |
| מנוי (עתידי) | 0 בשלב זה | | נקבע עם תכנון המנויים |

1. הערך נחתם ב-snapshot: ‏`order_items.cashback_earned_ils` מחושב
   ב-`beginCheckout` לפי השיעור התקף (אגורות, ‏round-down) ולא משתנה.
   ‏override פר מוצר באדמין מותר, עם תקרה קשיחה:
   ‏`cashback_earned_ils <= 0.25 * platform_fee_ils` (ולידציית zod +
   ‏CHECK ב-041). ה-cashback לעולם לא נוגס בחלק הספק (הכרעת O5).
2. זיכוי בפועל: בטרנזקציית ה-webhook של ה-paid (שלב 4 ברשימת 026):
   ‏`fn_wallet_transfer` מ-`platform:cashback_reserve` למשתמש, ‏reason
   ‏`cashback_earn`, ‏idempotency ‏`cashback:<order_id>`,
   ‏`expires_at = paid_at + 24 months`.
3. ‏refund של הזמנה: קיזוז ה-cashback שנצבר עליה (עד גובה היתרה),
   באותה טרנזקציית refund.

**לולאת ה-retention (החיבור ל-CRM):**

1. הודעת הזיכוי ("נצברו לך 12 ש"ח לארנק") היא חלק מהודעת ה-paid
   הטרנזקציונית, לא הודעה נפרדת.
2. תזכורת פקיעה 30 יום מראש (הכרעת 034) דרך ה-outbox: הודעת שירות
   על נכס קיים, מותרת בלי opt-in שיווקי כל עוד אין בה תוכן קידומי
   (אותו כלל כמו תזכורת פקיעת קופון של 031).
3. יתרה זמינה מוצגת ב-header ובצ'קאאוט ("יש לך 32 ש"ח, להשתמש?");
   ההחלה ידנית לבקשת המשתמש (הכרעת 026), אין החלה אוטומטית.
4. יעד הלולאה נמדד: שיעור ההזמנות שמומש בהן ארנק (סעיף 6). ארנק
   שיושב ולא ממומש הוא התחייבות בלי retention; ארנק שממומש הוא
   הזמנה חוזרת.

**חשבונאות ההתחייבות (מאשרר את 033/034, בלי כפילות):**

1. ההתחייבות = `v_wallet_liability` (סך יתרות user), עם
   ‏`v_wallet_ledger_drift` כבקרת שלמות לילית. ‏cashback שחולק היום
   מופיע בדשבורד הבעלים (שורה 8).
2. **גדר תקציב חדשה (041):** התראה ב-`v_money_alarms` כאשר בחודש
   קלנדרי `sum(cashback_earn + referral_bonus)` עולה על **12%** מ-
   `sum(platform_fee_ils)` של אותו חודש. חריגה = או באג או תוכנית
   נדיבה מדי; שני המצבים דורשים עצירה.
3. בדוחות רווחיות: ההטבות הן הוצאת שיווק במועד **המימוש** (הכרעת
   המע"מ ב-LEGAL 1.6); ההתחייבות הפתוחה מוצגת בנפרד ולא מקוזזת
   מהכנסה.

---

## 4. ‏CRM מחזור חיים

### 4.1 סגמנטים: הגדרות מחייבות, ניתנות לחישוב

כל הסגמנטים מוגדרים על `orders` (‏paid_at) ו-`coupon_codes`, יום עסקים
דרך `fn_il_date`. משתמש נמצא בסגמנט אחד בדיוק מקבוצת ה-lifecycle
(סדר ההכרעה: מלמעלה למטה), פלוס דגלים אורתוגונליים:

| סגמנט | הגדרה |
|---|---|
| `prospect` | נרשם, אפס הזמנות paid |
| `new` | הזמנת paid ראשונה ב-30 הימים האחרונים, וסך הזמנות paid = 1 |
| `active` | הזמנת paid כלשהי ב-90 הימים האחרונים (ולא `new`) |
| `dormant` | לפחות הזמנת paid אחת, אף אחת ב-90 הימים האחרונים |
| `churned` | לפחות הזמנת paid אחת, אף אחת ב-365 הימים האחרונים (תת-קבוצה של dormant לצורך דיווח; לא מקבלת מסרים נפרדים) |

דגלים אורתוגונליים (יכולים לחול על כל סגמנט):

| דגל | הגדרה |
|---|---|
| `redeemed_never_returned` | קיים `coupon_codes.status='used'` עם `used_at` לפני 21+ ימים, ואין הזמנת paid חדשה מאז ה-`used_at` המאוחר ביותר |
| `expired_burned` | קופון שפג בלי מימוש ב-6 החודשים האחרונים (קיבל `refund_credit`; לקוח שנכווה) |
| `wallet_holder` | יתרת ארנק > 0 |
| `cart_open` | עגלה 1-72 שעות (הגדרת מסע 5.1 של 031) |

מימוש: view ‏`v_crm_segments` (041, ‏security_invoker, אדמין בלבד):
שורה פר user_id עם `segment` + דגלים + `last_paid_at` +
‏`marketing_email` / ‏`marketing_whatsapp` העדכניים. פונקציות ה-enqueue
של המסעות קוראות ממנו במקום לשכפל תנאים.

```sql
-- שלד ההגדרה (המימוש המלא ב-041)
SELECT p.id AS user_id,
       CASE
         WHEN max(o.paid_at) IS NULL THEN 'prospect'
         WHEN min(o.paid_at) >= now() - interval '30 days'
              AND count(o.id) = 1 THEN 'new'
         WHEN max(o.paid_at) >= now() - interval '90 days' THEN 'active'
         ELSE 'dormant'
       END AS segment,
       bool_or(cc.status = 'used'
               AND cc.used_at < now() - interval '21 days'
               AND NOT EXISTS (SELECT 1 FROM orders o2
                               WHERE o2.user_id = p.id
                                 AND o2.paid_at > cc.used_at)
       ) AS redeemed_never_returned
FROM profiles p
LEFT JOIN orders o  ON o.user_id = p.id AND o.paid_at IS NOT NULL
LEFT JOIN coupon_codes cc ON cc.user_id = p.id
GROUP BY p.id;
```

### 4.2 מטריצת מסרים פר סגמנט

כל השורות רצות דרך צנרת 031 (‏events -> fanout -> outbox -> worker),
תחת מכסות התדירות הגלובליות (שיווקית 1/יום, 3/שבוע), שעות שקט
09:00-21:00 ולא בשבת. ‏journey keys חדשים מסומנים ב-(041).

| סגמנט/דגל | מסר | סיווג | ערוץ | תזמון | journey_key |
|---|---|---|---|---|---|
| `prospect` + `cart_open` | עגלה נטושה, 2 נגיעות | שיווקי | מייל (+וואטסאפ אם opt-in) | 1h / 24h | `abandoned_cart` (031, קיים) |
| `new` | סדרת welcome: איך מממשים קופון + מה זה הארנק | **טרנזקציוני-תפעולי** (הסבר שירות על מה שנרכש, בלי קידום) | מייל + inapp | ‏24h אחרי הזמנה ראשונה, נגיעה אחת | `welcome_first_order` (041) |
| `new` (יש opt-in) | "דילים באזור שלך" ראשון | שיווקי | וואטסאפ/מייל | יום 7 | `new_buyer_intro` (041) |
| `active` + `wallet_holder` | "יש לך X ש"ח בארנק" + דילים | שיווקי | מייל | חודשי לכל היותר | `wallet_nudge` (041) |
| כל מחזיק קופון issued | תזכורות פקיעה 7d/48h | טרנזקציוני | מייל+inapp (+וואטסאפ כשיתווסף) | ‏029, קיים | `coupon_expiry` |
| `wallet_holder` עם צבירה שפוקעת | תזכורת פקיעת ארנק | טרנזקציוני | מייל + inapp | ‏30 יום לפני | `wallet_expiry` (041; ה-job של דומיין הארנק) |
| `dormant` | ‏win-back: דילים בקטגוריות שקנה | שיווקי | מייל | רבעוני מקסימום | `winback` (031, קיים) |
| `redeemed_never_returned` | "איך היה ב-<שם העסק>?" + דיל דומה | שיווקי | וואטסאפ/מייל | ‏21 יום אחרי מימוש, פעם אחת פר מימוש | `post_redemption` (041), ‏dedupe ‏`post_redemption:<coupon_id>` |
| `expired_burned` | "הכסף חזר לארנק שלך, הנה דילים" | חלק 1 (הזיכוי) טרנזקציוני, קיים ב-2.3 של LEGAL; חלק 2 (דילים) שיווקי, רק עם opt-in, נגיעה אחת | מייל | עם הפקיעה / ‏+3 ימים | `burn_recovery` (041) |

כללים רוחביים:

1. אין וואטסאפ שיווקי בלי `marketing_whatsapp` (ברירת מחדל false).
2. תבנית שיווקית בלי המילה "פרסומת" בתחילתה לא עוברת lint (כלל 031).
3. ‏`post_redemption` בלי מנגנון ביקורות: אין אצלנו reviews (עיקרון
   הקטלוג); "איך היה" הוא CTA לפנייה לשירות, לא לדירוג פומבי.
4. כל מסר נמדד ב-`v_journey_revenue`; מסע ששלושה חודשים לא מחזיר את
   עלותו (כולל עלות הודעות וואטסאפ) נכבה. זו הכרעה, לא המלצה.

### 4.3 חוק הספאם: תיקון 40 לחוק התקשורת (סעיף 30א)

תיקון 40 (2008) הוא שהוסיף את סעיף 30א ("חוק הספאם"); צ'קליסט הציות
המלא כבר ממומש ב-031 סעיף 4.5 ומאושרר כאן ככתבו. הנקודות שנוגעות
ספציפית ל-CRM של מסמך זה:

1. **הסכמה מפורשת מראש** לכל מסר שיווקי; ברירת המחדל של כל
   ‏`marketing_*` היא false, כולל לכל המיובאים מוורדפרס (M5: ראיות
   ‏opt-in ישנות לא מכובדות).
2. **איסוף ההסכמה**: צ'קבוקס לא-מסומן ב-checkout ("קבלו דילים
   בוואטסאפ/מייל", נוסח נפרד מ-accept_terms), מסך העדפות באזור
   האישי, ובאנר הצטרפות בדף התודה. כל שינוי נרשם ב-`consent_events`
   עם `wording_version`. אסור לחסום רכישה על אי-הסכמה.
3. **הקו טרנזקציוני/שיווקי** במטריצה לעיל נקבע לפי מבחן 031: הודעה
   שהייתה נשלחת גם בלי כוונה מסחרית = שירות. ‏welcome עם "ואלה עוד
   דילים" חוצה את הקו והופך לפרסומת; לכן ה-welcome נקי מקידום
   וה"דילים" הם הודעה נפרדת תחת opt-in.
4. הסרה בקליק בלי login, נאכפת גם ב-send-time; תלונה = opt-out
   אוטומטי (031). אין SMS שיווקי בכלל.
5. סנקציה להפרה: פיצוי לדוגמה עד 1,000 ש"ח פר הודעה בלי הוכחת נזק.
   זה הנימוק הכלכלי לכך שכל בדיקת send-time שווה את ה-latency שלה.

---

## 5. מוכנות לרכישה בתשלום (paid acquisition)

### 5.1 מדיניות הפעלה

ההכרעה של 033 בתוקף: אפס פיקסלים היום. **טריגר ההפעלה של כל הסעיף
הזה הוא ההחלטה להריץ קמפיין ראשון בתשלום.** עד אז נבנה רק מה שזול
ומקדים: לכידת click IDs (סעיף 5.4.1), כי אי אפשר להשלים אותה בדיעבד.

### 5.2 ‏Meta (פייסבוק/אינסטגרם): Pixel + CAPI

1. **ארכיטקטורה: Pixel בדפדפן + Conversions API מהשרת, עם דה-דופ.**
   ‏CAPI לבדו מקבל attribution חלש; ‏Pixel לבדו מאבד את מה ש-iOS חוסם.
   הדה-דופ: ‏`event_id` זהה בשני הצדדים.
2. **הסכמה:** ה-Pixel נטען רק אחרי הסכמת האנליטיקה (`ke_consent`),
   באותו מנגנון של ה-SDK הפנימי. אירועי CAPI נשלחים **רק** עבור
   משתמשים שנתנו את אותה הסכמה (הדגל נשמר על הסשן ומוצמד להזמנה
   ב-attribution). שיתוף נתונים עם Meta הוא העברה לצד שלישי; בלי
   הסכמה אין שליחה, גם לא מהשרת. עדכון מדיניות הפרטיות (סעיף 4 של
   3.2 ב-LEGAL) נדרש לפני ההפעלה.
3. אירועים (מיפוי מה-registry הקנוני; לא נשלח שום אירוע שאין לו
   מקבילה פנימית):

| אירוע Meta | מקור | צד | event_id |
|---|---|---|---|
| `PageView`, `ViewContent` | ‏SDK (page_view / view_product) | ‏Pixel בלבד | |
| `AddToCart` | ‏add_to_cart | ‏Pixel בלבד | |
| `InitiateCheckout` | ‏begin_checkout (server) | ‏CAPI | `bc:<order_id>` |
| `Purchase` | מעבר paid (‏webhook Cardcom) | **‏CAPI בלבד** (לא סומכים על דף תודה) + Pixel אם הדף נטען, אותו event_id | `<order_id>` |

4. ‏Purchase: ‏`value = charged_on_site_ils` (המזומן שנכנס; לא GMV של
   קופון ולא platform_fee: הפלטפורמות מכיילות bidding על ערך ההמרה,
   וה-cash-in הוא הקירוב הישר), ‏`currency = ILS`. מזהי התאמה:
   ‏email + phone מנורמלים ו-hashed ‏SHA-256 בצד השרת, ‏fbclid/fbp
   מה-attribution. שליחה: ‏worker קטן על Vercel cron (דקה), קורא
   הזמנות paid חדשות (‏watermark על `paid_at`), שולח, רושם
   ‏`capi_events` (041) עם status לדה-דופ ול-retry. אותו דפוס outbox
   כמו 031, טבלה נפרדת כי היעד חיצוני ולא נמען.
5. ‏refund: אירוע CAPI מסוג Purchase שלילי לא קיים; שולחים
   ‏Meta ‏`Refund` custom + מעדכנים בדשבורד הפנימי בלבד. ההחלטות
   הכספיות ממילא נקראות מה-ledger, לא מ-Meta.

### 5.3 ‏Google Ads

1. **בלי GA4** (הכרעת 033 נשארת). ההמרות נמדדות ב-Google Ads עצמו:
   ‏**offline conversion upload דרך ה-API** על בסיס `gclid` שנלכד
   ב-attribution, ‏+ ‏Enhanced Conversions for Leads/Purchases
   (‏email hashed) לחיזוק ההתאמה.
2. אותו worker של 5.2 שולח גם ל-Google (שני adapters על אותה טבלת
   ‏`capi_events`, עמודת `destination`). המרה: ‏Purchase עם
   ‏`conversion_value = charged_on_site_ils`, ‏`order_id` כ-
   ‏transaction id (דה-דופ בצד גוגל).
3. ‏Consent Mode: נדרש רק כשטוענים תגיות גוגל בדפדפן; מכיוון שאין
   תגית (ההמרות עולות שרת-לשרת), אין צורך ב-Consent Mode. אם יתווסף
   ‏remarketing tag בעתיד: אותו כלל הסכמה כמו ה-Pixel.

### 5.4 אירועי שרת מהאנליטיקה: מה נבנה כבר עכשיו

1. **לכידת click IDs (נבנה מיד, זול):** ‏`gclid`, ‏`fbclid`, ‏`ttclid`
   נלכדים בצד לקוח יחד עם ה-UTM ונכנסים לאותה עוגיית ייחוס 30 יום;
   ‏`beginCheckout` כותב אותם לתוך `orders.attribution` (‏jsonb קיים
   מ-033, אין שינוי סכימה). בלי זה, ביום שנדליק קמפיין לא יהיה
   ‏attribution להזמנות של השבועות הראשונים.
2. ‏`begin_checkout` ו-purchase כבר קיימים כמקורות אמת (registry 033);
   ה-worker של 5.2/5.3 הוא צרכן שלהם, לא צנרת מקבילה.
3. ‏`capi_events` (041): ‏`(id, order_id, destination
   'meta'|'google', event_name, event_id, payload_hash, status
   ‏queued|sent|failed, attempts, sent_at)`, ‏UNIQUE
   ‏`(destination, event_id)`. ‏PII לא נשמר בטבלה (רק hashes בזמן
   שליחה, נבנים מחדש מ-profiles).

### 5.5 מפרט דשבורד ROAS

**קלט הוצאות:** טבלת `ad_spend_daily` (041):

```
ad_spend_daily (
  day date NOT NULL,
  channel text NOT NULL,        -- 'facebook' | 'google' | 'tiktok' | ...
  campaign text NOT NULL DEFAULT '',
  spend_ils numeric(12,2) NOT NULL CHECK (spend_ils >= 0),
  source text NOT NULL DEFAULT 'manual',   -- 'manual' | 'api'
  UNIQUE (day, channel, campaign)
)
```

מילוי: ידני שבועי במסך אדמין (CSV upload) בשלב ראשון; חיבור API של
הפלטפורמות רק כשההוצאה החודשית עוברת 10,000 ש"ח (לפני זה הזמן יקר
מהאוטומציה).

**‏view ‏`v_roas_weekly` (041):** פר (שבוע ישראלי, channel):

| עמודה | הגדרה |
|---|---|
| `spend_ils` | ‏sum מ-`ad_spend_daily` |
| `attributed_orders` | הזמנות paid עם `attribution->'last'->>'utm_source' = channel` באותו שבוע |
| `attributed_cash_in_ils` | ‏sum ‏`charged_on_site_ils` שלהן |
| `attributed_platform_revenue_ils` | ‏sum ‏`platform_fee_ils` שלהן |
| `roas_cash` | ‏cash_in / spend |
| `roas_true` | **‏platform_revenue / spend. זה המספר שמחליט** אם הקמפיין חי: קופון עם GMV גבוה יכול להיראות מצוין ב-roas_cash ולהפסיד בפועל |
| `cac_new_ils` | ‏spend / לקוחות ראשונים (first paid) מהערוץ באותו שבוע |

**כלל הכרעה תקציבי:** ‏`cac_new_ils` נמדד מול תקרת ה-CAC מ-
`v_cohort_ltv_monthly` (הכנסת פלטפורמה מצטברת פר חבר קוהורטה ב-6
חודשים). ‏CAC מעל 80% מהתקרה בשבועיים רצופים = הקמפיין נעצר. ‏ROAS
של הפלטפורמות (המדווח ב-Ads Manager) הוא לאופטימיזציית מודעות בלבד,
לא להחלטות תקציב: החלטות תקציב רק מ-`v_roas_weekly` (עיקרון "כסף רק
מה-ledger").

---

## 6. עץ KPI

### 6.1 ‏North Star

**שווי מימוש שבועי (Weekly Redeemed Value, ‏WRV):** סך הערך שלקוחות
קיבלו בפועל השבוע.

```sql
SELECT date_trunc('week', (t.ts AT TIME ZONE 'Asia/Jerusalem'))::date AS week_il,
       sum(t.value_ils) AS wrv_ils
FROM (
  SELECT cc.used_at AS ts, cc.face_value_ils AS value_ils      -- קופון שמומש בעסק
  FROM coupon_codes cc WHERE cc.status = 'used'
  UNION ALL
  SELECT oi.delivered_at, oi.total_price_ils                    -- פיזי שנמסר
  FROM order_items oi WHERE oi.item_status = 'delivered'
) t GROUP BY 1;
```

למה זה ה-North Star: הוא מתאפס רק כשכל הצדדים קיבלו ערך (לקוח מימש,
עסק ראה לקוח, הפלטפורמה הרוויחה ואין קופון שיפקע ויהפוך לזיכוי).
מכירה בלי מימוש היא התחייבות, לא הצלחה. הוא בולם בדיוק את מצב הכשל
של העסק הזה: למכור הרבה קופונים שנשרפים.

### 6.2 העץ

כל מדד: הגדרה + מקור + קצב קריאה. אין מדדי גאווה.

**רכישה (acquisition):**

| מדד | הגדרה | מקור |
|---|---|---|
| סשנים שבועיים | ‏sessions מ-`analytics_daily` (בוטים וצוות מסוננים) | 033 |
| לקוחות ראשונים בשבוע | ‏users שה-`min(paid_at)` שלהם בשבוע | ‏v_owner_dashboard #4 (יומי) |
| ‏CAC פר ערוץ | סעיף 5.5 | ‏v_roas_weekly |
| ‏k-factor חודשי | הפניות completed בחודש / קונים פעילים (paid) באותו חודש | ‏referrals + orders (041: ‏v_referral_kpis) |

**המרה (activation):**

| מדד | הגדרה | מקור |
|---|---|---|
| משפך יומי | ‏view_product -> add_to_cart -> begin_checkout -> paid | `v_funnel_daily` |
| יחס המרה גס | הזמנות paid / סשנים, יומי | ‏v_owner_dashboard #11 |
| ‏prospect->buyer 30 יום | נרשמים שביצעו paid תוך 30 יום מהרשמה / נרשמים | ‏profiles.created_at + min(paid_at) |

**הכנסה (revenue):**

| מדד | הגדרה | מקור |
|---|---|---|
| הכנסת פלטפורמה יומית | ‏sum `platform_fee_ils` לפי יום paid ישראלי | `v_revenue_daily` |
| ‏GMV / ‏cash-in / ‏revenue | שלושה מספרים נפרדים, לעולם לא מתערבבים | `v_revenue_daily` |
| ‏AOV | ‏cash-in / הזמנות paid | ‏v_owner_dashboard #2 |
| ‏take-rate אפקטיבי | ‏platform_fee / GMV פר חודש וסוג | `v_take_rate_monthly` |

**שימור (retention):**

| מדד | הגדרה | מקור |
|---|---|---|
| ‏repeat 90 יום | חברי קוהורטה עם הזמנה שנייה תוך 90 יום / גודל קוהורטה | `mv_cohort_retention_monthly` |
| ‏LTV מצטבר פר קוהורטה | הכנסת פלטפורמה מצטברת פר חבר | `v_cohort_ltv_monthly` |
| שיעור מימוש ארנק | הזמנות paid עם `cashback_applied_ils > 0` / הזמנות paid, חודשי | ‏orders (041: ‏v_wallet_engagement) |
| התפלגות סגמנטים | ספירת users פר segment, שבועי | `v_crm_segments` |

**בריאות הליבה (הקופון):**

| מדד | הגדרה | מקור |
|---|---|---|
| ‏scan rate | ‏used / (used + expired) על מצבים סופיים | `v_coupon_funnel_monthly` |
| ‏median days to scan | חציון `used_at - created_at` | שם |
| התחייבות פתוחה | קופונים issued: ‏platform_paid + ‏collect | `v_coupon_expiry_liability` |
| התחייבות ארנק | ‏sum יתרות user + גדר ה-12% (3.3) | `v_wallet_liability` + ‏alarm 041 |

**‏SEO/ערוצים:**

| מדד | הגדרה | מקור |
|---|---|---|
| קליקים אורגניים שבועיים מול baseline | סעיף 2.3 | GSC |
| הכנסה פר ערוץ | ‏last-touch על `orders.attribution` | `v_channel_revenue_weekly` |
| הכנסה פר מסע CRM | המרות מיוחסות להודעות | `v_journey_revenue` |
| ‏zero-results בחיפוש | שיעור שבועי | `v_search_quality_daily` |

כלל קריאה: הבעלים קורא יומית רק את `v_owner_dashboard` (הכרעת 033);
‏WRV והעץ המלא הם העיון השבועי. אין דשבורד שלישי.

---

## 7. תכולת `041_growth.sql` (מפרט; הקובץ ייכתב על ידי בעלי `supabase/`, לא כאן)

‏idempotent, ‏expand-only, ‏prerequisites: ‏026 (ארנק/snapshot), ‏031
(‏outbox/journeys), ‏033 (‏attribution/אירועים). תכולה:

1. ‏referrals: עמודות `qualifying_order_id`, ‏`completed_at`,
   ‏`reject_reason`; ‏`fn_complete_referrals()` (‏cron יומי, הזיכוי הכפול
   עם idempotency, גבולות ה-fraud של 3.2); ‏CHECK תקרת cashback
   ‏(`cashback_earned_ils <= 0.25 * platform_fee_ils`) על order_items.
2. ‏`v_crm_segments` (4.1) + ‏journey keys חדשים (4.2:
   ‏welcome_first_order, ‏new_buyer_intro, ‏wallet_nudge, ‏wallet_expiry,
   ‏post_redemption, ‏burn_recovery) כפונקציות enqueue בדפוס 031.
3. ‏`ad_spend_daily` + ‏`capi_events` (5.4/5.5) + ‏`v_roas_weekly` +
   ‏`v_referral_kpis` + ‏`v_wallet_engagement`.
4. הרחבת `v_money_alarms`: גדר תקציב ההטבות החודשית (12%).
5. ‏RLS מלא לכל טבלה חדשה (אדמין קריאה; כתיבה service role בלבד),
   ‏audit על ad_spend_daily. החלה רק דרך MCP ‏`apply_migration`.

קוד אפליקציה נלווה (לא במיגרציה): כפתורי שיתוף + ‏route ‏`/r/[code]`,
לכידת click IDs לעוגיית הייחוס, ‏worker ‏CAPI, מסך CSV להוצאות פרסום,
צ'קבוקס ההסכמה השיווקית ב-checkout.

---

## 8. סיכום החלטות

| # | החלטה |
|---|---|
| G1 | מלאי URL משלושה מקורות אל `url_inventory`; ‏baseline ‏GSC נשמר ב-T-7 כקובץ ייחוס |
| G2 | מפת 301 בקובץ CSV קנוני אחד בפורמט קבוע, נטען ל-`seo_redirects`; שרשראות נקרסות בטעינה |
| G3 | אין hreflang (אתר חד-לשוני); סיגנלי שפה: ‏lang/dir, ‏og:locale, ‏inLanguage על WebSite |
| G4 | ‏JSON-LD עם ‏@id יציבים; ‏LocalBusiness עם geo משוקע כ-seller בדפי דילים, מנתוני ספק מאומתים בלבד (לעולם לא מ-meta של WP); אין aggregateRating |
| G5 | אין Change of Address (אותו דומיין); ‏Domain property מאומת לפני ה-flip |
| G6 | ‏rollback DNS רק על כשל תפעולי; ירידת SEO אינה טריגר rollback (חריג: כשל redirects רוחבי >10% שלא נפתר ב-24 שעות) |
| G7 | ניטור 30 יום עם ספים מספריים ופעולה מוגדרת פר חריגה; דוח יום 30 |
| G8 | סכימת UTM קנונית אחת; קישורי הפניה `/r/<code>` (‏noindex), לעולם לא משתפים qr_token |
| G9 | הפניות: 20 ש"ח מפנה / 10 ש"ח מופנה, זיכוי אחרי הזמנה ראשונה ‏>=50 ש"ח + חלון 14 יום; תקרות 5/חודש, 30/שנה; חסימות מכשיר/טוקן; ‏clawback על refund |
| G10 | בונוס הפניה = הטבה (לא תו קנייה): פקיעה 24 חודשים עם גילוי; ארנק לא נמשך למזומן |
| G11 | ‏cashback: קופון 10% / פיזי 1% מה-charged_on_site, ‏snapshot בשורה, תקרה 25% מהעמלה; זיכוי בטרנזקציית ה-paid; פקיעה 24 חודשים + תזכורת 30 יום |
| G12 | גדר תקציב הטבות: ‏cashback+referral חודשי מעל 12% מהכנסת הפלטפורמה = התראת כסף |
| G13 | סגמנטים ממצים prospect/new/active/dormant + דגלים (כולל redeemed_never_returned); ‏view אחד, המסעות קוראים ממנו |
| G14 | מטריצת מסרים: 4 מסעות חדשים; קו 30א נשמר (welcome נקי מקידום; שיווק רק opt-in); מסע שלא מחזיר את עלותו ב-3 חודשים נכבה |
| G15 | ‏paid acquisition: ‏Pixel+CAPI עם event_id משותף, שליחה רק בהסכמה; ‏Google דרך offline conversions על gclid; בלי GA4; לכידת click IDs נבנית כבר עכשיו |
| G16 | ‏ROAS אמיתי = הכנסת פלטפורמה/הוצאה; החלטות תקציב רק מ-`v_roas_weekly`; ‏CAC נבחן מול תקרת ה-LTV |
| G17 | ‏North Star: שווי מימוש שבועי (WRV); עץ KPI מלא עם הגדרה מחושבת לכל מדד |
| G18 | כל שינויי הסכימה מרוכזים ב-`041_growth.sql` (המספר הפנוי אחרי 037-039), ‏expand-only |
