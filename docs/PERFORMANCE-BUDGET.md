# PERFORMANCE-BUDGET.md
# תקציב ביצועים (חנות)

מספרים ששינוי לא רשאי לשבור בלי אישור מפורש. משלים את

```
docs/ARCHITECTURE-PERFORMANCE.md
docs/ARCHITECTURE-SEO-PERFORMANCE.md
```

Status: **BINDING (budgets)** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`

מדידה: Lighthouse / CrUX / Web Vitals ב-Vercel. סביבת ייחוס: mid-tier mobile 4G.

---

## 1. Core Web Vitals (יעד השקה)

| מטריקה | בית `/` | PDP | קטגוריה | הערה |
|---|---|---|---|---|
| LCP | ≤ 2.5s | ≤ 2.5s | ≤ 2.8s | תמונת hero / gallery |
| INP | ≤ 200ms | ≤ 200ms | ≤ 200ms | |
| CLS | ≤ 0.1 | ≤ 0.1 | ≤ 0.1 | שמירת מקום לתמונות |
| TTFB | ≤ 800ms | ≤ 800ms | ≤ 1.0s | ISR / cache לפי סוג דף |

cart / checkout: דינמי; LCP משני לפונקציונליות; עדיין CLS ≤ 0.1.

---

## 2. תקציב משקל עמוד (transfer, compressed)

| נתיב | JS ראשוני | CSS | תמונות above-fold | סה״כ העברה ראשונה |
|---|---:|---:|---:|---:|
| home | ≤ 180KB | ≤ 40KB | ≤ 200KB | ≤ 450KB |
| category | ≤ 200KB | ≤ 40KB | ≤ 120KB | ≤ 500KB |
| product | ≤ 220KB | ≤ 40KB | ≤ 150KB | ≤ 550KB |
| cart/checkout | ≤ 250KB | ≤ 50KB | ≤ 80KB | ≤ 600KB |

חריגה: דורשת נימוק ב-PR + מדידה לפני/אחרי.

---

## 3. תמונות (per asset)

| שימוש | תקציב | quality |
|---|---:|---|
| כרטיס מוצר | 40KB | 60 |
| LCP gallery | 120KB | 75 |
| hero | 200KB | 75 |
| thumbnail | 10KB | 60 |

חובה: `next/image`, `sizes`, AVIF/WebP. פירוט: ARCHITECTURE-PERFORMANCE §1.

---

## 4. Caching

| סוג | מדיניות |
|---|---|
| home / category / product | ISR או static לפי המסמך המחייב; revalidate מתועד |
| cart / checkout / account | `no-store` |
| API כסף | אין CDN cache של תשובות אישיות |
| תמונות מוצר | TTL ארוך; URL immutable |

---

## 5. פונטים

- משפחת מותג אחת (Heebo / לפי DESIGN); לא להוסיף משפחות בלי סיבה.  
- `font-display: swap` (או המקבילה בבילד).  
- תקציב קבצי פונט ל-above-fold: ≤ 80KB compressed.

---

## 6. בדיקות חובה ב-PR שנוגע לחנות

- [ ] אין רגרסיה >10% במשקל JS של הנתיב  
- [ ] LCP image עם priority יחיד לדף  
- [ ] אין layout shift מתמונות בלי ממדים  
- [ ] אין ייבוא כבד ל-client בלי צורך (`'use client'` מינימלי)  

כלי: bundle analyzer לפי הצורך; Lighthouse CI אופציונלי אחרי soft-open.

---

## 7. מה מחוץ לתקציב הזה

- ביצועי אדמין / פורטל ספק (יעד נפרד)  
- אפילקציית Expo (ראה MOBILE-APP)  
- שאילתות DB כבדות (observability + indexes)

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | תקציבי CWV, משקל עמוד, תמונות, cache |
