# מפרט יכולות מיקום (Geo)

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`

מסמכים קשורים: `ARCHITECTURE-GEO-FEATURE.md`, `SEED-SUPPLIERS-SPEC.md`.

---

## החלטה

| # | הכרעה |
|---|---|
| G1 | ברירת מחדל: **כל הארץ**. |
| G2 | עיר בקטגוריה; **לא** ב-header. |
| G3 | "קרוב אליי" רק אחרי הרשאה. |
| G4 | מרחק מ-`suppliers.lat/lng` מאומתים. |
| G5 | JSON-LD geo רק בקואורדינטות אמיתיות. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| lat מ-WP לא מאומת | G4 |
| geo ב-header | G2 |

---

## סכמת DB

```text
suppliers: lat, lng, city, opening_hours
user_location_prefs (יעד)
```

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | geocode נכשל | active; near מדלג |
| CE2 | lat בלי lng | reject seed |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | "פתוח עכשיו" | phase 2 |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: BINDING 5 סעיפים |
