# ארכיטקטורה: יכולות Geo

תגיות עיר, מיון מרחק, אינדקסים, ובורר UI. אין השפעה על מודל כסף.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד.

מודל כסף: **No Escrow**. Geo לא נוגע ב-`platform_percent`.

מסמכים קשורים:

```
docs/GEO-FEATURES-SPEC.md
docs/CITY-LANDING-CONTENT.md
docs/ARCHITECTURE-SEARCH-UX.md
docs/ARCHITECTURE-SEO-PERFORMANCE.md
docs/ARCHITECTURE-COMMERCE.md
docs/ARCHITECTURE-CATEGORIES-TAXONOMY.md
docs/CONTRADICTIONS.md
```

**יחס ל-`GEO-FEATURES-SPEC.md`:** מסמך זה = BINDING ארכיטקטורה. ה-SPEC לפירוט מוצר; במקרה סתירה גובר המסמך הזה.

---

## החלטה

| # | הכרעה |
|---|---|
| GF1 | ברירת מחדל בחנות: **כל הארץ**. |
| GF2 | בורר עיר בפילטרים / קטגוריה; **לא** ב-header הראשי. |
| GF3 | "קרוב אליי" רק אחרי הרשאת geolocation; כשל → עיר/ארץ. |
| GF4 | מרחק מ-`suppliers.lat/lng` מאומתים בלבד. |
| GF5 | תגיות עיר על מוצר/ספק לתצוגה ופילטר; לא מחליפות קואורדינטות. |
| GF6 | JSON-LD LocalBusiness+geo רק עם lat/lng אמיתיים. |
| GF7 | אסור לדרוש מיקום בכניסה לאתר. |
| GF8 | tie-break במיון מרחק: rank / `updated_at`. |
| GF9 | רדיוס ברירת מחדל: 25 ק"מ (ניתן לשינוי ב-prefs). |

### תגיות עיר

| שכבה | ייצוג |
|---|---|
| ספק | `city` text + אופציונלי `city_slug` |
| מוצר | יורש מספק ו/או `product_cities` M2M לקמפיינים רב-עירוניים |
| נחיתה | `/city/[slug]` מתוכן `CITY-LANDING-CONTENT.md` |

פילטר: `WHERE city_slug = $1 OR product overlapping cities`.

### מיון מרחק

```text
user point (lat,lng) or city centroid
  → ORDER BY distance(suppliers.lat, suppliers.lng, user)
  → tie-break: rank / updated_at
```

| מצב | התנהגות |
|---|---|
| אין מיקום | מיון ברירת מחדל (featured / חדש) |
| רדיוס | `preferred_radius_km` מ-prefs |
| בלי lat/lng לספק | בסוף הרשימה או סינון החוצה במצב "קרוב אליי" |

### UI selector

| רכיב | מיקום | התנהגות |
|---|---|---|
| בורר עיר | פילטרים בקטגוריה / חיפוש | רשימת ערים + "כל הארץ" |
| קרוב אליי | ליד הבורר | מבקש permission; שומר prefs למשתמש מחובר |
| תג עיר בכרטיס דיל | מתחת לשם ספק | טקסט בלבד |
| מפה | PDP ספק / עמוד ספק | אופציונלי phase 2 |

אורח: localStorage לעיר בלבד; לא נשלח לשרת בלי הסכמה.  
Permissions-Policy ממוקד; אין geolocation גלובלי בלי הצדקה.

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| בורר עיר ב-header | GF2: מפריע לניווט; רק בפילטרים. |
| geolocation חובה בכניסה | GF7: חוסם גלישה; fallback חובה. |
| מרחק מ-city text בלבד | GF4: לא מדויק; צריך lat/lng. |
| PostGIS day-1 | ops: Haversine + B-tree עד עומס; GiST/PostGIS אחר כך. |
| geo משפיע על מחיר/עמלה | No Escrow: GF לא נוגע בכסף. |
| JSON-LD geo בלי קואורדינטות | GF6: SEO מטעה. |

---

## סכמת DB

```text
suppliers (
  city text,
  city_slug text,
  lat numeric,
  lng numeric,
  ...
)

cities (
  slug text PK,
  name_he text,
  centroid_lat numeric,
  centroid_lng numeric
)

product_cities (
  product_id uuid FK,
  city_slug text FK,
  PRIMARY KEY (product_id, city_slug)
)

user_location_prefs (
  user_id uuid PK,
  preferred_city text,
  preferred_radius_km int DEFAULT 25,
  last_lat numeric,
  last_lng numeric,
  updated_at timestamptz
)
```

| אינדקס | מטרה |
|---|---|
| `(city_slug)` על suppliers / cities | פילטר עיר |
| GiST / `earthdistance` על `(lat,lng)` | מרחק (phase 2) |
| `(status, city_slug)` חלקי למוצרים פעילים | listing |
| `seo_redirects` לעיר ישנה | 301 |

הרחבות Postgres: `cube`/`earthdistance` או PostGIS רק אחרי החלטת ops; עד אז Haversine ב-SQL עם B-tree על lat/lng לסינון גס.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | משתמש דוחה geolocation | fallback לעיר שנבחרה או "כל הארץ" |
| CE2 | ספק בלי lat/lng | בסוף רשימה; מוסתר ב"קרוב אליי" |
| CE3 | עיר לא ב-`cities` | לא בבורר; admin מוסיף slug |
| CE4 | מוצר multi-city + פילטר עיר | OR על `product_cities` |
| CE5 | centroid עיר רחוק מהמרכז | מרחק משוער; לא GPS מדויק |
| CE6 | redirect עיר ישנה | 301 דרך `seo_redirects` |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | PostGIS vs earthdistance | החלטת ops לפי עומס |
| O2 | מפה ב-PDP ספק | phase 2 |
| O3 | `user_location_prefs` migration | pending |
| O4 | `product_cities` M2M | pending לקמפיינים |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING: city tags, distance sort, indexes, UI selector |
| 2026-08-12 | batch-2: תבנית חובה (5 סעיפים) |
