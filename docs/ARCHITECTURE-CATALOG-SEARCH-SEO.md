# ארכיטקטורת קטלוג, חיפוש ו-SEO

מסמך תכנון מלא. מיגרציה נלווית (טיוטה, לא הוחלה):
`supabase/migrations/030_catalog.sql`

תאריך: 2026-07-08. ענף: `phase5/homepage`.
מסמכים קשורים: `docs/ARCHITECTURE-COMMERCE.md` (026),
`docs/ARCHITECTURE-SUPPLIER-REDEMPTION.md` (027), `docs/ARCHITECTURE-AI-AGENTS.md` (028).

> תלות: 030 עומדת בפני עצמה ואינה תלויה ב-026/027/028. היא מוסיפה
> `products.platform_percent` באופן מגונן (nullable, בנוסח 027) כי מנוע הדירוג
> משתמש בו כ-boost. אם 026/027 יוחלו לפני או אחרי, אין התנגשות
> (הכול `IF NOT EXISTS`).

---

## 0. הקשר ועקרונות

1. **עברית תחילה.** כל שדה תוכן הוא `*_he`; אנגלית היא שדה עזר לחיפוש בלבד.
2. **8 קטגוריות היום, אלפי מוצרים מחר.** כל החלטה נבחנת בסקלה של 10k-50k
   מוצרים, בלי להנדס ל-1M.
3. **החלפת אתר וורדפרס מאונדקס. רציפות SEO היא הכנסה.** שום URL ישן לא מת
   בלי 301. טבלת `seo_redirects` היא רכיב מערכת, לא רשימת קבצים ב-nginx.
4. **Postgres קודם.** חיפוש, פילטרים ו-facets נשארים ב-Supabase עד סף מדיד
   (סעיף 2.8). אין תלות בשירות חיצוני ביום הראשון.
5. **בלי ביקורות.** אין `aggregateRating` ואין `review` ב-JSON-LD. לזייף דירוג
   זה עבירת Rich Results שמורידה את כל ה-snippets של הדומיין.

---

## 1. מודל הקטלוג

### 1.1 עץ קטגוריות: עומק 2, והבחנה בין טקסונומיה לאוסף

המצב היום: 12 שורות ב-`categories`, כולן שטוחות, וחלקן בכלל לא קטגוריות אלא
כללי סינון ("דילים חמים", "עד 99", "חדש"). ההחלטות:

1. **עומק מקסימלי 2** (אב + בן), נאכף ב-trigger בשם
   `enforce_category_depth`. adjacency list הקיים (`parent_id`) מספיק לעומק 2;
   אין צורך ב-ltree או closure table. breadcrumb הוא לכל היותר
   בית > אב > בן > מוצר, וזה גם הגבול הבריא ל-UX וגם מה ש-BreadcrumbList צריך.
   אם אי פעם יידרש עומק 3, מרחיבים את ה-trigger; המבנה לא משתנה.
2. **`categories.kind`**: `taxonomy` (ברירת מחדל) או `collection`.
   - `taxonomy`: שיוך ידני של מוצרים. מקור האמת ל-breadcrumb ול-canonical.
   - `collection`: אוסף חכם מבוסס כלל, בלי שיוך ידני. הכלל יושב ב-
     `categories.rule` (jsonb): למשל `{"max_price": 99}` ל"עד 99",
     `{"published_within_days": 14}` ל"חדש",
     `{"min_discount_percent": 30}` ל"דילים חמים".
     שכבת האפליקציה מתרגמת את הכלל ל-WHERE. כך "עד 99" לא דורש תחזוקה ידנית
     כשיש 5,000 מוצרים.
3. **שיוך מרובה**: `products.category_id` נשאר הקטגוריה הראשית (breadcrumb,
   canonical, ירושת פילטרים). טבלת גישור חדשה `product_categories` מאפשרת
   הופעה ידנית בקטגוריות נוספות. מוצר מופיע בדף קטגוריה אם הוא ראשי בה, משויך
   אליה ב-`product_categories`, או עונה על `rule` שלה.

### 1.2 וריאציות: צירים וערכים, לא טבלת EAV

`product_variants` קיימת (005 + 014 + 016) עם `name_he`, `price`,
`price_modifier`, `stock_quantity`, `attributes`. הבעיה: אין מבנה שקובע אילו
צירים יש למוצר ואיזה ערך יש לכל וריאציה, אז אי אפשר לבנות UI בחירה (צבע/מידה)
או לאמת שאין כפילויות. ההשלמה:

```
products.variant_axes  jsonb  -- מערך סדור של צירים:
  [{"key":"size","name_he":"מידה"},{"key":"color","name_he":"צבע"}]
products.has_variants  boolean

product_variants.option_values  jsonb  -- ערך לכל ציר:
  {"size":"M","color":"שחור"}
UNIQUE (product_id, option_values) WHERE deleted_at IS NULL
```

חוקי מחיר לוריאציה (סוגרים את הכפילות `price` מול `price_modifier`):

1. `variant.price IS NOT NULL`: זה המחיר. סוף.
2. אחרת: `products.kenyon_price`.
3. `price_modifier` מוכרז DEPRECATED. לא נקרא בקוד חדש, יוסר במיגרציית ניקוי
   עתידית אחרי אימות שאין שורות עם ערך שונה מ-0.

מלאי: כאשר `has_variants=true`, המלאי חי על הווריאציות בלבד ו-
`products.stock_quantity` מוגדר כסכום נגזר לתצוגה (לא נכתב ידנית). כאשר
`has_variants=false`, המלאי על המוצר.

וריאציה אינה דף: אין URL נפרד לוריאציה. deep-link דרך
`/products/[slug]?variant=<id>` עם canonical לדף הבסיס (סעיף 3.6).

### 1.3 מאפיינים ופילטרים: הגדרות בטבלה, ערכים ב-jsonb

עיקרון: **ערכים** נשארים ב-`products.attributes` (jsonb, קיים מ-005), אבל
**ההגדרות** עוברות לטבלאות, כדי שה-UI של הפילטרים, האימות וה-facets יהיו
מונחי סכימה ולא ניחוש מפתחות:

```
attribute_definitions (
  key            text UNIQUE  -- 'brand', 'screen_size', 'warranty_months'
  name_he        text         -- 'מותג', 'גודל מסך'
  value_type     text         -- 'text' | 'number' | 'boolean' | 'enum'
  unit           text         -- 'אינץ׳', 'חודשים' (תצוגה)
  enum_values    jsonb        -- ל-enum: [{"value":"samsung","label_he":"סמסונג"}]
  is_filterable  boolean      -- מופיע כפילטר בדף קטגוריה
  is_searchable  boolean      -- הערך מוזרם ל-search_keywords בשמירה
)

category_attributes (category_id, attribute_id, sort_order)
  -- אילו פילטרים מוצגים בכל קטגוריה ובאיזה סדר
```

- `brand` מקבל גם עמודה אמיתית על `products` (לא רק מפתח jsonb): הוא נחוץ
  ל-JSON-LD, לחיפוש ולפילטר הנפוץ ביותר. שאר המאפיינים נשארים ב-jsonb.
- אינדוקס: GIN עם `jsonb_path_ops` על `products.attributes` מכסה שאילתות
  שוויון (`attributes @> '{"brand":"samsung"}'`). לטווחים מספריים חמים
  (למשל גודל מסך) מוסיפים expression index נקודתי כשמזהים צורך, לא מראש.
- אימות ערכים מול ההגדרות נעשה בשכבת האפליקציה (zod בטופס האדמין). trigger
  אימות ב-DB נשקל ונדחה: מאט כל כתיבה ומקשיח סדר מיגרציות, והכותבים היחידים
  הם אדמין/uploader דרך הטופס.
- facets: פונקציית `category_facets(category_id)` מחזירה ערך + ספירה לכל
  מאפיין filterable של הקטגוריה, בשאילתה אחת (סעיף 4.1).

### 1.4 תמחור ותצוגת הנחה

מקור אמת (קיים מ-016, מיושר עם הקוד):

| שדה | משמעות |
|---|---|
| `kenyon_price` | המחיר שמשלמים בקניון EXPRESS. חובה למוצר active |
| `full_price` | מחיר השוק המלא (מחיר ייחוס). nullable |
| `price_ils`, `compare_at_price_ils`, `compare_at_price` | legacy מ-005/014. DEPRECATED, לא נקראים בקוד חדש |

חוקים (030 מוסיפה CHECK אחרי נרמול):

1. `full_price IS NULL OR full_price >= kenyon_price`. שורה שמפרה מנורמלת
   במיגרציה (`full_price = NULL`) לפני הוספת ה-CHECK.
2. **תצוגת הנחה** רק כאשר `full_price > kenyon_price`:
   מחיר מלא בקו חוצה + badge אחוז: `round((1 - kenyon/full) * 100)`.
   `full_price` ריק או שווה: מציגים מחיר יחיד, בלי badge ובלי קו חוצה.
3. תצוגה בשקלים שלמים כשאין אגורות (בהתאם לדף הבית הקיים); הערך ב-DB נשאר
   `numeric(10,2)`.
4. אין "הנחה" מחושבת מ-`platform_percent`: אחוז הפלטפורמה הוא עניין התחשבנות
   (026/027), לא שיווק. שני העולמות לא מתערבבים.
5. לקופונים (`coupon_deals`): `original_price` מול `platform_price` הקיימים;
   אותו כלל תצוגה.

### 1.5 מצבי מלאי

`stock_quantity` (nullable) + `low_stock_threshold` (חדש, ברירת מחדל 3) +
`status` הקיים. הזמינות היא **נגזרת**, לא עמודה:

| מצב | תנאי | תצוגה | schema.org |
|---|---|---|---|
| `untracked` | `stock_quantity IS NULL` | כפתור רכישה רגיל | `InStock` |
| `in_stock` | `stock > threshold` | רגיל | `InStock` |
| `low_stock` | `0 < stock <= threshold` | "נותרו X אחרונים" | `LimitedAvailability` |
| `out_of_stock` | `stock = 0` | "אזל מהמלאי", כפתור מנוטרל | `OutOfStock` |
| `sold_out` | `status = 'sold_out'` | ידני, לדילים שנסגרו | `SoldOut` |

- מוצר שאזל **נשאר active ומאונדקס** (הדף חי, 200, עם `OutOfStock`).
  מחיקה/ארכוב הם החלטת אדמין, ואז הדף מחזיר 410 או 301 לקטגוריה (סעיף 3.3).
- שירותים וקופונים הם תמיד `untracked` (או מוגבלים דרך `max_uses` של הדיל).
- הורדת מלאי קורית ב-`paid` בלבד (כלל קיים מ-026). אין שריון מלאי בעגלה.

---

## 2. חיפוש בעברית

### 2.1 מגבלות FTS של Postgres בעברית: ניתוח כן

ל-Postgres אין stemmer לעברית. אין `hebrew` config, אין snowball, ו-Hunspell
עברי (hspell) לא זמין ב-Supabase managed. המשמעויות:

1. **אין נורמליזציית מורפולוגיה**: "טלפונים" לא ימצא "טלפון". בעברית זה כואב
   פחות מבאנגלית לצורות רבים (ים/ות הן סיומות קבועות) אבל עדיין קיים.
2. **אותיות שימוש (מש"ה וכל"ב)**: "לטלפון", "והמסעדה" הן מילים אחרות מבחינת
   ה-tokenizer. זו הבעיה הגדולה באמת בעברית, ופתירה בצד השאילתה (2.3).
3. **כתיב מלא/חסר**: "פיצה"/"פיצא", "וילה"/"ווילה". לא פתיר ב-FTS; פתיר
   ב-trigram (2.4) ובמילון נרדפות (2.3).
4. **ניקוד**: לא רלוונטי בקטלוג מסחרי, מתעלמים.

לכן הבחירה: `to_tsvector('simple', ...)` (בלי stemming בכלל) + הרחבת שאילתה
אפליקטיבית + trigram fallback. זה מכסה מעל 90% מהשאילתות בקטלוג בסדר גודל של
אלפי מוצרים, והשאר מטופל בסעיפים 2.6-2.7.

### 2.2 אינדוקס: עמודת `search_vector` נוצרת (generated)

```sql
products.search_vector tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', coalesce(name_he,'')),                                    'A') ||
  setweight(to_tsvector('simple', coalesce(name_en,'')||' '||coalesce(brand,'')||' '||coalesce(sku,'')), 'B') ||
  setweight(to_tsvector('simple', coalesce(search_keywords,'')),                            'B') ||
  setweight(to_tsvector('simple', coalesce(description_he,'')),                             'C')
) STORED
```

- `search_keywords` (עמודה חדשה): מילות נרדפות ידניות פר מוצר שהאדמין ממלא
  ("סלולרי, פלאפון" למוצר ששמו "טלפון"), וגם היעד שאליו האפליקציה שופכת ערכי
  מאפיינים עם `is_searchable=true` בעת שמירה.
- generated column ולא trigger: אי אפשר לשכוח לעדכן, ואי אפשר להזרים ממנו
  דאטה מטבלאות אחרות בטעות (שם ספק למשל נשאר בחוץ בכוונה: הוא לא ציבורי).
- אינדקסים: GIN על `search_vector`, GIN trigram על `name_he`,
  GIN `jsonb_path_ops` על `attributes`.
- אותו דפוס בדיוק על `coupon_deals` (title_he A, business_name B,
  location_he C) כדי שחיפוש אחד יכסה גם דילים.

### 2.3 הרחבת שאילתה: `he_tsquery()`

פונקציית SQL שהופכת קלט חופשי ל-tsquery מורחב:

```
"לטלפון סמסונג"
  -> (לטלפון:* | טלפון:*) & (סמסונג:* | <נרדפות מ-search_synonyms>)
```

האלגוריתם, פר טוקן (אחרי sanitization לאותיות עברית/לטינית/ספרות):

1. הטוקן עצמו, עם prefix match (`:*`), כדי ש"טלפ" ימצא "טלפון".
2. אם מתחיל באות שימוש (ו/ה/ב/כ/ל/מ/ש) ואורכו 4+: גם הגרסה בלי האות הראשונה.
3. אם מתחיל בצירוף כפול (וה/וב/ול/וכ/ומ/וש/שה/לה/בה/מה/כש) ואורכו 5+: גם
   הגרסה בלי שתי הראשונות.
4. נרדפות מטבלת `search_synonyms` (term -> synonyms[]): מנוהלת באדמין, נזרעת
   מדוח ה-zero-results (2.7).

הגרסאות מחוברות ב-OR בתוך הטוקן, והטוקנים ב-AND ביניהם. הסרת prefix עלולה
להוסיף false positives ("הודו" -> "ודו"?) אבל סף האורך (4+) והעובדה שהדירוג
מעדיף התאמה מלאה (המילה המקורית מקבלת גם היא match) שומרים על הדיוק.

### 2.4 trigram fallback לשגיאות כתיב

`pg_trgm` כבר מותקן (001). כאשר ה-FTS מחזיר פחות מ-3 תוצאות, שכבה שנייה בתוך
`search_products()` מוסיפה מועמדים לפי
`word_similarity(query, name_he) > 0.35`, מסומנים `match_type='fuzzy'`.

- זה תופס "סמסונע" -> "סמסונג", "פלאפל"/"פלפל", חוסר/יתור אות.
- trigram על עברית עובד טוב: 3-גרמים של קודפוינטים, בלי תלות בשפה.
- ה-GIN trigram על `name_he` משרת גם את זה וגם את ה-autocomplete.
- סף 0.35 נבחר start-point; מכוונן לפי דוח `search_queries` אחרי השקה.

### 2.5 דירוג

הציון ב-`search_products()` הוא שילוב לינארי, מנורמל ל-0..1:

```
score = 0.55 * lexical    -- ts_rank_cd(search_vector, q, 32): רלוונטיות, משקולות A/B/C
      + 0.15 * fuzzy      -- word_similarity על name_he (0 להתאמת FTS מלאה שאין לה fuzzy)
      + 0.15 * freshness  -- exp(-גיל_בימים / 30) על published_at: דעיכה של חודש
      + 0.10 * margin     -- coalesce(platform_percent, 10) / 100
      + 0.05 * featured   -- is_featured
```

- רלוונטיות שולטת (0.55 + 0.15): מוצר לא רלוונטי לא מטפס בזכות מרג'ין.
- margin הוא tie-breaker מודע-עסק: בין שני מוצרים רלוונטיים באותה מידה, זה
  שמכניס יותר לפלטפורמה מוצג קודם. 10% משקל = לכל היותר עשירית מהציון.
- freshness מונע קטלוג "קפוא" ונותן דחיפה לדילים חדשים, מתיישב עם אופי האתר
  (דילים מתחלפים).
- המשקולות הן קבועים בפונקציה אחת, מכווננים במקום אחד.

### 2.6 autocomplete

פונקציית `autocomplete_products(prefix, limit)`:

- מחזירה עד 8 שורות משולבות: קטגוריות תואמות (עד 2) ואז מוצרים.
- התאמת prefix על תחילת מילה: `name_he ILIKE 'q%' OR name_he ILIKE '% q%'`,
  נתמך ע"י ה-GIN trigram (ILIKE נעזר בו). לא FTS: ל-autocomplete אין צורך
  ב-tsquery, וצריך latency של עשרות מילישניות.
- מיון: featured תחילה, אז published_at. בהמשך: מכירות (sold_count כשיתווסף).
- צד לקוח: debounce 150ms, מינימום 2 תווים, ביטול בקשות קודמות.
- כל בחירה/אי-בחירה נרשמת ל-`search_queries` עם `source='autocomplete'`.

### 2.7 אפס תוצאות

שרשרת fallback בתוך זרימת החיפוש (אפליקציה):

```
FTS מורחב (he_tsquery) -> pod תוצאות < 3 -> trigram fuzzy -> עדיין 0:
  1. log_search_query(query, 0)            -- הדלק לשיפור
  2. הצעת תיקון: המילה הקרובה ביותר מאוצר שמות המוצרים (trigram) -> "אולי התכוונת: X"
  3. תוכן חלופי: מוצרים מובילים מהקטגוריה אם חיפשו בתוך קטגוריה, אחרת featured
```

טבלת `search_queries` (query, results_count, source, session/user) היא הדאטה
החשוב ביותר לשיפור החיפוש: דוח שבועי של שאילתות עם 0 תוצאות מזין את
`search_synonyms` ואת `search_keywords` של מוצרים. הכתיבה דרך
`log_search_query()` (SECURITY DEFINER) בלבד, מה-server, כדי שלקוח לא יוכל
להציף את הטבלה ישירות.

### 2.8 מתי עוברים לחיפוש חיצוני, ומה הטריגר

ההמלצה החיצונית כשנגיע: **Meilisearch** (self-host זול, טיפול טוב בעברית דרך
נורמליזציה + typo tolerance מובנה, facets מהירים). סנכרון: trigger על
products שכותב ל-outbox table + עדכון דחוף מה-server actions.

טריגרים מדידים למעבר (נבדקים מ-`search_queries` ומ-p95 בלוגים), מספיק אחד:

| מטריקה | סף |
|---|---|
| שיעור אפס-תוצאות שבועי (אחרי synonyms) | מעל 12% לאורך חודש |
| p95 של `search_products()` | מעל 250ms |
| גודל קטלוג | מעל ~30k מוצרים פעילים |
| דרישת מוצר: facet counts + fuzzy + merchandising בשאילתה אחת | קיימת |

עד אז Postgres מספיק, והמעבר לא ישבור כלום: `search_products()` היא נקודת
כניסה יחידה, מחליפים את המימוש שלה בקריאת HTTP ל-Meilisearch מאחורי אותו
API אפליקטיבי.

---

## 3. SEO

### 3.1 החלטה: slugs לטיניים, לא עברית ב-URL

**הוכרע: slugs באנגלית/תעתיק לטיני.** `hot-deals`, `spa-massage-60min`.

הנימוקים, כולל הצד השני:

- בעד עברית: Google מציג עברית ב-SERP קריא, ומילת מפתח ב-URL היא סיגנל (חלש).
- נגד עברית, וזה שהכריע: כל העתקה/שיתוף של URL עברי מחוץ לדפדפן הופכת
  ל-percent-encoding באורך פי 6 (`%D7%98%D7%9C...`), בדיוק בערוץ המכירה
  המרכזי של האתר (WhatsApp). קישור מכוער = פחות קליקים. בנוסף: ערבוב RTL/LTR
  בשורת כתובת, שבירת כלי אנליטיקס/CSV, וסיכוני double-encoding בכל שרשרת
  redirect. ה-DB כבר בנוי כך (`hot-deals`, `restaurants-cafes`), והקוד הקיים
  עושה `decodeURIComponent` ליתר ביטחון.
- את סיגנל מילת המפתח מקבלים ב-title, H1, meta ו-JSON-LD, ששם משקלו גבוה
  בהרבה.
- אם האתר הוורדפרסי הישן השתמש ב-slugs עבריים: כולם מקבלים 301 דרך
  `seo_redirects` (3.3), עם ה-path הישן שמור percent-encoded ומנורמל.

חוקי slug: `^[a-z0-9]+(-[a-z0-9]+)*$`, נגזר ידנית או בתעתיק אוטומטי בטופס
האדמין, ייחודי גלובלית (constraint קיים). שינוי slug לעולם לא שובר קישור:
trigger כותב 301 אוטומטי (3.3).

### 3.2 מבנה URL

```
/                          בית
/category/[slug]           קטגוריה (אב או בן; שטוח, בלי שרשור אב/בן)
/products/[slug]           דף מוצר (שטוח, בלי קטגוריה ב-path)
/coupons/[slug]            דף דיל קופון (slug חדש על coupon_deals)
/search?q=...              תוצאות חיפוש (noindex)
```

- **מוצר שטוח, בלי קטגוריה ב-path**: מוצר ששייך לשתי קטגוריות או שקטגוריה
  שלו שונתה לא מצמיח שני URLs. ה-breadcrumb (מוצג + JSON-LD) נותן את ההקשר
  ההיררכי, לא ה-path.
- **קטגוריה שטוחה**: `/category/pizza` ולא `/category/restaurants-cafes/pizza`.
  אותו נימוק: העברת בן לאב אחר לא משנה URL. הייחודיות הגלובלית של slug
  מבטיחה שאין התנגשות.
- הערה: כיום קיים route בשם `/product/[slug]` (יחיד). ההחלטה כאן ובהתאם
  ל-STATE.md היא `/products/[slug]` (רבים). בעת המימוש: העברת ה-route + שורת
  redirect קבועה `/product/:slug -> /products/:slug` (שאלה פתוחה 6.1).

### 3.3 רציפות מוורדפרס: `seo_redirects`

טבלה + זרימה:

```
seo_redirects (old_path UNIQUE, new_path, status_code 301|308|302|307|410,
               source 'wordpress_import'|'slug_change'|'manual', hits, last_hit_at)
```

1. **ייבוא**: לפני הניתוק, סריקה מלאה של האתר הישן (Screaming Frog) + ייצוא
   כל ה-URLs מ-GSC (עמודים עם קליקים) + sitemap ישן. כל URL ממופה ידנית או
   בכלל גזירה ליעד החדש, ונטען כ-`wordpress_import`. עמודים בלי יעד ענייני
   (תגיות וורדפרס, עמודי מחבר): 301 לקטגוריה הקרובה או לבית.
2. **אכיפה ב-runtime**: ב-`proxy.ts` (המחליף של middleware ב-Next 16) או
   ב-`not-found` flow, בדיקה על 404 בלבד (לא על כל בקשה): lookup לפי path
   מנורמל (percent-decoded, בלי trailing slash), החזרת `status_code`,
   הגדלת `hits` דרך `touch_seo_redirect()`.
3. **שינוי slug עתידי**: trigger בשם `record_slug_redirect` על
   `products`/`categories`/`coupon_deals` כותב שורת 301 אוטומטית, מקרוס
   שרשראות (A->B ואז B->C מתקפל ל-A->C) ומוחק self-redirects.
4. **מוצר שנמחק לצמיתות**: שורת 410 (`status_code=410`) או 301 לקטגוריה,
   החלטת אדמין פר מקרה. ברירת מחדל: 301 לקטגוריה הראשית.
5. אחרי ההשקה: מעקב GSC על 404 + על ה-hits; redirect בלי תנועה אחרי שנה
   אפשר לארכב.

### 3.4 JSON-LD

מיוצר ב-server components (לפי מדריך json-ld של Next 16), משוקע כ-`<script
type="application/ld+json">` עם דאטה מה-DB בלבד:

| דף | ישויות |
|---|---|
| בית | `Organization` (לוגו, sameAs לרשתות) + `WebSite` עם `SearchAction` (sitelinks searchbox) |
| קטגוריה | `BreadcrumbList` + `ItemList` של המוצרים בעמוד (url בלבד, בלי מחירים כפולים) |
| מוצר | `BreadcrumbList` + `Product` + `Offer` |
| דיל קופון | `Product` + `Offer` עם `validFrom`/`priceValidUntil` מ-valid_from/valid_until |

`Product`/`Offer` למוצר:

```json
{
  "@type": "Product",
  "name": "<name_he>",
  "image": ["<images[0..n]>"],
  "description": "<description_he נקי>",
  "sku": "<sku>",
  "brand": {"@type": "Brand", "name": "<brand>"},
  "offers": {
    "@type": "Offer",
    "url": "https://<domain>/products/<slug>",
    "priceCurrency": "ILS",
    "price": "<kenyon_price>",
    "availability": "https://schema.org/<מסעיף 1.5>",
    "itemCondition": "https://schema.org/NewCondition"
  }
}
```

- וריאציות עם מחירים שונים: `AggregateOffer` עם `lowPrice`/`highPrice`
  במקום `Offer` יחיד. לא `ProductGroup` (אין צורך בלי URLs פר וריאציה).
- אין `aggregateRating`, אין `review` (אין ביקורות, עיקרון 0.5).
- מחיר תמיד `kenyon_price`; `full_price` לא נכנס ל-JSON-LD (אין לו שדה תקני,
  והוא לא המחיר המוצע).

### 3.5 meta פר סוג דף

שדות override חדשים: `seo_title`, `seo_description` על `products`,
`categories`, `coupon_deals`. כשריקים, נופלים לתבנית:

| דף | title (תבנית) | description |
|---|---|---|
| בית | `קניון EXPRESS: דילים וקופונים במחירים הכי טובים בישראל` | תבנית קבועה שיווקית |
| קטגוריה | `{name_he} במבצע: קניון EXPRESS` | `description_he` או תבנית עם דוגמאות מוצרים |
| קטגוריה עמוד N | `{name_he} עמוד {N}: קניון EXPRESS` | כמו קטגוריה |
| מוצר | `{name_he} ב-{kenyon_price} ש"ח: קניון EXPRESS` | 155 תווים ראשונים של `description_he` נקי |
| דיל קופון | `{title_he}: {discount}% הנחה: קניון EXPRESS` | terms_he מקוצר |
| חיפוש | `חיפוש: {q}` | noindex, אין תיאור |

- אורך: title עד ~60 תווים לפני קיצוץ (עברית צרה יותר, יש מרווח), description
  עד ~155.
- מותג האתר תמיד בסוף, מופרד בנקודתיים (לא במקף מיוחד).
- מימוש: `generateMetadata` פר route, עם helper משותף שמקבל את השורה מה-DB.

### 3.6 חוקי canonical לדפים מסוננים

העיקרון: **פרמטר שמצמצם תוכן לא מייצר דף אינדקסביל, אלא אם הוחלט אחרת בכוונה.**

| מצב | canonical | robots |
|---|---|---|
| `/category/x` | עצמו | index,follow |
| `/category/x?page=2` | עצמו (כולל page) | index,follow |
| `/category/x?sort=price_asc` | `/category/x` (בלי sort) | index,follow |
| `/category/x?f_brand=samsung&...` (כל פילטר) | `/category/x` | noindex,follow |
| `/products/y?variant=123` | `/products/y` | index,follow |
| `/search?q=...` | אין | noindex,follow |

- עמודי pagination הם self-canonical (canonical לעמוד 1 מרוקן את עומק
  האינדוקס; `rel=prev/next` מת מבחינת Google, פשוט מוודאים שקישורי העמודים
  הם `<a href>` אמיתיים).
- פילטרים ב-noindex,follow ולא ב-canonical בלבד: canonical הוא רמז, noindex
  הוא הוראה. ה-follow משאיר את זרימת ה-PageRank למוצרים.
- סדר פרמטרים מנורמל בקוד (מפתחות בסדר אלפביתי) כדי לא לייצר וריאנטים.
- **עמודי נחיתה מכוונים**: כשעולה צורך עסקי (למשל "טלפונים של סמסונג" כעמוד
  מתחרה בגוגל), לא פותחים פילטר לאינדוקס אלא יוצרים קטגוריית `collection`
  עם rule מתאים ו-URL נקי משלה. כך יש שליטה מלאה על title/description/תוכן.

### 3.7 OpenGraph לשיתוף WhatsApp

WhatsApp מושך את ה-preview בלי להריץ JS ועם מגבלות קשיחות. החוקים:

1. כל התגיות ב-HTML הראשוני (Next Metadata API רץ בשרת, מכוסה).
2. `og:image`: 1200x630 (יחס 1.91:1), JPEG/WebP **מתחת ל-300KB** (מעל
   ~600KB וואטסאפ מוותר בשקט), URL אבסולוטי https, נגיש אנונימית בלי redirect.
   ה-buckets כבר public. לכל מוצר נגזרת תמונת OG מהתמונה הראשית דרך
   ה-image pipeline (resize בזמן העלאה, לא on-the-fly בדף).
3. `og:image:width`/`og:image:height` מוצהרים: וואטסאפ מציג את ה-preview בלי
   להוריד את התמונה קודם.
4. `og:title` = תבנית ה-title בלי שם האתר; `og:description` כולל את המחיר
   ("רק 99 ש"ח במקום 199"): זה הטקסט שמוכר בקבוצות.
5. `og:locale=he_IL`, `og:type=product` למוצר (נדרש prefix `product:` רק אם
   מוסיפים תגיות product:*, לא חובה), `og:site_name`.
6. וואטסאפ מקשה cache אגרסיבית פר URL. שינוי תמונה/מחיר מהותי: מוסיפים
   query גרסה ל-og:image (`?v=2`) כדי לשבור את הקאש בשיתופים חדשים.
7. `twitter:card=summary_large_image` (טלגרם/טוויטר משתמשים).

### 3.8 sitemaps + robots

- `app/sitemap.ts` מפוצל לוגית: קטגוריות, מוצרים (active בלבד), דילים.
  מעל 50k כתובות: sitemap index עם קבצים פר סוג (Next תומך ב-
  `generateSitemaps`). `lastModified` מ-`updated_at`.
- `app/robots.ts`: `Disallow: /admin, /account, /supplier, /api, /search`
  (חיפוש ממילא noindex; החסימה חוסכת crawl budget), הפניה ל-sitemap.
- אין hreflang (שפה אחת).
- אחרי ההשקה: שליחת ה-sitemap ב-GSC של אותו property של הדומיין הישן,
  ומעקב Coverage שבועי חודש ימים.

---

## 4. דפי listing (קטגוריה, חיפוש)

### 4.1 ארכיטקטורת פילטר + מיון

עיקרון: **ה-URL הוא ה-state**. אין state client-side לפילטרים.

```
/category/phones?f_brand=samsung&f_screen=6.1&price_max=2000&sort=price_asc&page=2
        |
        v  server component קורא searchParams (zod, page-params.ts הקיים)
   RPC יחיד: filter_products(category_id, filters jsonb, sort, page, page_size)
        |            במקביל: category_facets(category_id) לספירות בפאנל
        v
   גריד + פאנל פילטרים (RSC) ; אינטראקציית הפילטר = ניווט (router.push עם params)
```

- שינוי פילטר הוא ניווט מלא ב-App Router (עם `<Link>` או router.replace):
  back/forward עובדים, כל מצב ניתן לשיתוף, וה-SEO רואה דפים אמיתיים.
- הפילטרים נבנים מ-`category_attributes` (1.3): הקטגוריה מכתיבה אילו פילטרים
  יש, `category_facets` מספק ערכים + ספירות. פילטר בלי תוצאות מוצג מנוטרל
  (לא נעלם: יציבות UI).
- מיונים: `newest` (published_at), `price_asc`, `price_desc`, `popular`
  (בינתיים featured+freshness; sold_count כשיהיה). ברירת מחדל בקטגוריה:
  merchandising ידני (`sort_order` ב-product_categories) ואז newest.
- חיתוך פילטרים: AND בין מאפיינים שונים, OR בתוך ערכי אותו מאפיין
  (brand=samsung|apple). ממומש על ה-GIN של attributes.

### 4.2 pagination, לא infinite scroll

**הוכרע: עימוד ממוספר.** הקומפוננטה כבר קיימת (`Pagination.tsx` מ-phase 4).

- Googlebot לא גולל ולא לוחץ "טען עוד"; עם infinite scroll טהור כל מה שמעבר
  לעמוד הראשון לא מאונדקס, וזה בדיוק ה-long tail שאמור להביא תנועה.
- עמוד = URL (`?page=2`), self-canonical (3.6), קישורי `<a>` אמיתיים בחלון
  עמודים קומפקטי.
- שיפור UX אופציונלי בהמשך: כפתור "טען עוד" שמבצע ניווט ל-page הבא ומשרשר
  ויזואלית (progressive enhancement מעל אותם URLs). לא בגרסה ראשונה.
- גודל עמוד: 24 (מתחלק ב-2/3/4 עמודות גריד).

### 4.3 אסטרטגיית ISR (Next 16, Cache Components)

לפי `node_modules/next/dist/docs`: המודל הנוכחי הוא `use cache` +
`cacheLife` + `cacheTag`, עם `revalidateTag`/`updateTag` לביטול. האסטרטגיה
פר שכבת דאטה (לא פר דף, כי לדפים יש searchParams דינמיים):

| פונקציית דאטה | cacheLife | cacheTag |
|---|---|---|
| `getProductBySlug` | `hours` | `product:<id>`, `products` |
| `getCategoryTree` (תפריט, breadcrumb) | `days` | `categories` |
| `getCategoryProducts` (עמוד 1 בלי פילטרים) | `hours` | `category:<id>`, `products` |
| דפים מסוננים / חיפוש / page>1 | בלי cache (דינמי) | אין |
| facets פר קטגוריה | `hours` | `category:<id>` |

- מוטציות אדמין (שמירת מוצר/קטגוריה) קוראות
  `revalidateTag('product:<id>', 'max')` וכו' בתוך ה-server action; לטופס
  האדמין עצמו `updateTag` (read-your-writes).
- דפי מוצר: `generateStaticParams` ל-N המוצרים החמים (featured + חדשים,
  ~500), והשאר נבנים on-demand ונכנסים לקאש. עם אלפי מוצרים אין לבנות הכול
  ב-build.
- שינוי מחיר/מלאי מגיע דרך טופס האדמין, כלומר תמיד עובר revalidateTag: אין
  חלון של מחיר ישן מעבר לניווט שכבר בטיסה.
- fallback אם `cacheComponents` לא מופעל בפרויקט: אותה טבלה בדיוק עם
  `unstable_cache`/`export const revalidate` (מדריך caching-without-cache-components),
  אבל ההמלצה היא להפעיל `cacheComponents: true` לפני בניית ה-listing.

---

## 5. מה 030 כוללת (ומה לא)

כוללת (הכול idempotent, לא הוחל):

1. `categories`: `kind`, `rule`, `name_en`, `seo_title`, `seo_description`,
   `og_image_url` + trigger עומק + backfill של קטגוריות ה-collection.
2. `products`: `brand`, `search_keywords`, `seo_title`, `seo_description`,
   `low_stock_threshold`, `has_variants`, `variant_axes`,
   `platform_percent` (מגונן, בנוסח 027), CHECK מחירים אחרי נרמול,
   `search_vector` generated + כל האינדקסים.
3. `product_variants`: `option_values` + unique פר מוצר.
4. `product_categories`, `attribute_definitions`, `category_attributes`.
5. `coupon_deals`: `slug`, `seo_title`, `seo_description`, `search_vector`.
6. `search_synonyms`, `search_queries` + `log_search_query()`.
7. `seo_redirects` + `touch_seo_redirect()` + trigger `record_slug_redirect`
   על products/categories/coupon_deals.
8. פונקציות חיפוש: `he_tsquery()`, `search_products()`,
   `autocomplete_products()`, `category_facets()`.
9. RLS מלא לכל טבלה חדשה, audit triggers על טבלאות הניהול, updated_at בכל מקום.

לא כוללת: קוד אפליקציה, ייבוא ה-redirects מוורדפרס (דורש את ה-crawl), זריעת
attribute_definitions (יוגדרו לפי הקטגוריות בפועל), שינוי RLS קיים, מחיקת
עמודות legacy (price_ils וחבריו: מיגרציית ניקוי נפרדת אחרי cutover בקוד).

החלה (כשיוחלט): דרך Supabase MCP `apply_migration` בלבד, כמו 019/020/021/025.
תנאים מוקדמים ב-DB החי: 016 (name_he/kenyon_price/full_price), 025 (audit fn).
אחרי החלה: `generate_typescript_types` ועדכון `src/types/database.ts`.

---

## 6. שאלות פתוחות

1. **`/product/[slug]` מול `/products/[slug]`**: הקוד הקיים בנה את הראשון,
   STATE.md מתכנן את השני. ההחלטה כאן: רבים. לאשר, ואז להעביר את ה-route
   ולהוסיף redirect קבוע. ה-trigger ב-030 כותב `/products/`.
2. **מפת ה-URLs של וורדפרס**: נדרש crawl מלא + ייצוא GSC של האתר הישן לפני
   הניתוק. בלי זה טבלת ה-redirects ריקה וה-continuity לא קיים. מי מספק גישה
   ל-GSC ולאתר הישן, ומתי?
3. **דומיין**: אותו דומיין כמו האתר הישן או חדש? כל האסטרטגיה בסעיף 3 מניחה
   אותו דומיין. מעבר דומיין = פרויקט SEO אחר (Change of Address ב-GSC).
4. **תעתיק אוטומטי לעברית בטופס האדמין**: ספריית transliteration או מילוי
   ידני של slug? המלצה: ידני עם הצעה אוטומטית, האדמין מאשר.
5. **`sold_count`**: מופיע ברשימת השדות של דף המוצר (STATE.md) ורלוונטי לדירוג
   `popular`. מחכה ל-026 (נגזר מ-order_items) או עמודה מתוחזקת? מוצע: נגזר,
   לא עמודה, עד שיש דאטה אמיתי.
6. **קופונים בחיפוש הראשי**: `search_products()` מחפש במוצרים; לדילים יש
   vector משלהם. לאחד לתוצאה אחת בחיפוש (UNION עם boost נפרד) או טאב נפרד?
   מוצע: UNION בשלב ה-UI של החיפוש, אחרי שדף המוצר עולה.
7. **שפת description ל-meta כשאין `description_he`**: להשאיר ריק (גוגל יגזור
   מהעמוד) או תבנית גנרית? מוצע: ריק עדיף על תבנית זהה לאלפי דפים
   (duplicate descriptions).
