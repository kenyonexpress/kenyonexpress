# ארכיטקטורה: יכולות Geo

תגיות עיר, מיון מרחק, אינדקסים, ובורר UI. אין השפעה על מודל כסף.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #49/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/GEO-FEATURES-SPEC.md
docs/CITY-LANDING-CONTENT.md
docs/ARCHITECTURE-SEARCH-UX.md
docs/ARCHITECTURE-SEO-PERFORMANCE.md
docs/ARCHITECTURE-COMMERCE.md
docs/ARCHITECTURE-MOBILE-APP.md
docs/ARCHITECTURE-CATEGORIES-TAXONOMY.md
docs/CONTRADICTIONS.md
```

**יחס ל-`GEO-FEATURES-SPEC.md`:** מסמך זה = BINDING ארכיטקטורה. ה-SPEC לפירוט מוצר; במקרה סתירה גובר המסמך הזה.

מודל כסף: **No Escrow**. Geo לא נוגע ב-`platform_percent`.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| GF1 | ברירת מחדל בחנות: **כל הארץ**. |
| GF2 | בורר עיר בפילטרים / קטגוריה; **לא** ב-header הראשי. |
| GF3 | "קרוב אליי" רק אחרי הרשאת geolocation; כשל → עיר/ארץ. |
| GF4 | מרחק מ-`suppliers.lat/lng` מאומתים בלבד. |
| GF5 | תגיות עיר על מוצר/ספק לתצוגה ופילטר; לא מחליפות קואורדינטות. |
| GF6 | JSON-LD LocalBusiness+geo רק עם lat/lng אמיתיים. |
| GF7 | אסור לדרוש מיקום בכניסה לאתר. |

---

## 1. תגיות עיר

| שכבה | ייצוג |
|---|---|
| ספק | `city` text + אופציונלי `city_slug` |
| מוצר | יורש מספק ו/או `product_cities` M2M לקמפיינים רב-עירוניים |
| נחיתה | `/city/[slug]` מתוכן `CITY-LANDING-CONTENT.md` |

פילטר: `WHERE city_slug = $1 OR product overlapping cities`.

---

## 2. מיון מרחק

```text
user point (lat,lng) or city centroid
  → ORDER BY distance(suppliers.lat, suppliers.lng, user)
  → tie-break: rank / updated_at
```

| מצב | התנהגות |
|---|---|
| אין מיקום | מיון ברירת מחדל (featured / חדש) |
| רדיוס | `preferred_radius_km` מ-prefs; ברירת מחדל מוצר (למשל 25 ק״מ) |
| בלי lat/lng לספק | בסוף הרשימה או סינון החוצה במצב "קרוב אליי" |

---

## 3. אינדקסים

| אינדקס | מטרה |
|---|---|
| `(city_slug)` על suppliers / cities | פילטר עיר |
| GiST / `earthdistance` על `(lat,lng)` | מרחק |
| `(status, city_slug)` חלקי למוצרים פעילים | listing |
| `seo_redirects` לעיר ישנה | 301 |

הרחבות Postgres: `cube`/`earthdistance` או PostGIS רק אחרי החלטת ops; עד אז Haversine ב-SQL עם אינדקס B-tree על lat/lng לסינון גס.

---

## 4. UI selector

| רכיב | מיקום | התנהגות |
|---|---|---|
| בורר עיר | פילטרים בקטגוריה / חיפוש | רשימת ערים + "כל הארץ" |
| קרוב אליי | ליד הבורר | מבקש permission; שומר prefs למשתמש מחובר |
| תג עיר בכרטיס דיל | מתחת לשם ספק | טקסט בלבד |
| מפה | PDP ספק / עמוד ספק | אופציונלי phase 2 |

Prefs:

```text
user_location_prefs(user_id, preferred_city, preferred_radius_km, last_lat, last_lng, updated_at)
```

אורח: localStorage לעיר בלבד; לא נשלח לשרת בלי הסכמה.  
Permissions-Policy ממוקד; אין geolocation גלובלי בלי הצדקה.

---

## 5. Acceptance

- [ ] ברירת מחדל כל הארץ  
- [ ] בורר עיר מחוץ ל-header  
- [ ] אינדקס מרחק מתועד  
- [ ] קרוב אליי עם fallback  
- [ ] אין geo בלי קואורדינטות ב-JSON-LD  
- [ ] אין השפעה על עמלה / Escrow  

---

## 6. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING: city tags, distance sort, indexes, UI selector |
| 2026-08-12 | batch #49/50: רענון על arch/docs-batch-2 |
