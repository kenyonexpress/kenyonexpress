# GEO-FEATURES-SPEC.md
# מפרט יכולות מיקום (Geo)

סינון לפי עיר / "קרוב אליי", מיון מרחק, ושדות ספק גאוגרפיים.  
משלים את הסקיצה ב-`ARCHITECTURE-COMMERCE.md` §8.2 ואת LocalBusiness ב-SEO.

Status: **SPEC** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`

מסמכים קשורים:

```
docs/BUSINESS-MODEL.md
docs/ARCHITECTURE-COMMERCE.md
docs/CITY-LANDING-CONTENT.md
docs/ARCHITECTURE-GROWTH-SEO.md
docs/ARCHITECTURE-SEARCH-UX.md
docs/ARCHITECTURE-MOBILE-APP.md
```

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| G1 | ברירת מחדל בחנות: **כל הארץ**. |
| G2 | בחירת עיר ידנית בקטגוריה / פילטרים; **לא** ב-header (logo + 3 אייקונים). |
| G3 | "קרוב אליי" רק אחרי הרשאת geolocation; נכשל → נשארים על עיר/ארץ. |
| G4 | מרחק מחושב מ-`suppliers.lat/lng` מאומתים; לא מ-meta ישן של WP. |
| G5 | JSON-LD LocalBusiness עם geo רק כשיש קואורדינטות אמיתיות. |
| G6 | Permissions-Policy: geolocation לפי צורך בעמודים שמבקשים; לא בכל האתר כברירת מחדל פתוחה. |

---

## 1. נתוני ספק

| שדה | תפקיד |
|---|---|
| `address`, `city` | תצוגה + פילטר עיר |
| `lat`, `lng` | מרחק + מפה |
| `opening_hours` | תצוגה / סינון "פתוח עכשיו" (phase 2) |
| `whatsapp_phone` / `phone` | יצירת קשר |
| `waze_link` (נגזר או שמור) | ניווט |

אינדקס מומלץ: `earthdistance` / GiST על `(lat,lng)` אחרי אימות הרחבה ב-Postgres.

---

## 2. העדפות משתמש

```text
user_location_prefs
  user_id PK
  preferred_city
  preferred_radius_km
  last_lat, last_lng
  updated_at
```

אורחים: העדפה ב-localStorage / cookie קצר; אחרי login אפשר למזג.

---

## 3. API / שאילתות

| קריאה | התנהגות |
|---|---|
| `GET /api/products?city=תל-אביב` | דילים שספק שלהם באותה עיר |
| `GET /api/products?near=lat,lng&radius_km=25` | דילים בטווח |
| מיון | `distance_asc` כשיש near; אחרת דירוג קטלוג רגיל |

אין לחשוף דיוק יתר של מיקום משתמש בלוגים ציבוריים.

---

## 4. UX חנות

| מסך | התנהגות |
|---|---|
| Home | אופציונלי: באנר "דילים לידך" אחרי הרשאה; אחרת ארצי |
| Category | city picker + רדיוס |
| PDP | כתובת ספק + ניווט; מרחק אם ידוע |
| Mobile app | אותם APIs; בקשת location foreground בלבד ל-MVP |

---

## 5. SEO מקומי

- דפי עיר: `CITY-LANDING-CONTENT.md`  
- לא ליצור דפי עיר ריקים בלי דילים  
- geo ב-JSON-LD רק מספק מאומת  

---

## 6. פרטיות

- הסבר בעברית לפני בקשת מיקום  
- אפשרות למחוק העדפת מיקום בחשבון  
- אין למכור נתוני מיקום לצד ג'  

---

## 7. שלבי יישום

| שלב | תוכן |
|---|---|
| Geo-A | שדות ספק + אדמין geocode מכתובת |
| Geo-B | פילטר עיר בקטגוריה |
| Geo-C | near + radius + מיון מרחק |
| Geo-D | "פתוח עכשיו" + מפה עשירה |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | מפרט geo: העדפות, API, UX, SEO, פרטיות |
