# ארכיטקטורה: טקסונומיית קטגוריות

עץ קטגוריות לשוק הישראלי (קופונים ומוצרים פיזיים). עומק 2, SEO בעברית, בלי עמלה לפי קטגוריה.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #43/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-SEARCH-UX.md
docs/ARCHITECTURE-SEO-PERFORMANCE.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md
docs/ARCHITECTURE-SEASONAL-CAMPAIGNS.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-GEO-FEATURE.md
docs/CONTRADICTIONS.md
```

עקרון כסף: קטגוריה **לא** קובעת עמלה. `platform_percent` רק במוצר (פר מוצר, בלי default). אין Escrow / held / J5.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| T1 | עומק מקסימלי **2** (אב + בן), נאכף ב-trigger. |
| T2 | `kind`: `taxonomy` (שיוך ידני) או `collection` (כלל חכם). |
| T3 | שמות ותיאורים בעברית (`*_he`); slug יציב ל-URL. |
| T4 | כל מוצר חייב קטגוריית taxonomy ראשית ל-breadcrumb/canonical. |
| T5 | Collections ("עד 99", "חדש") לא מחליפות taxonomy ב-SEO. |
| T6 | עץ התחלתי מותאם שוק ישראלי. |
| T7 | קטגוריה לא קובעת `platform_percent` ולא יוצרת Escrow (PRICING / CONTRADICTIONS). |

---

## 1. עץ יעד (רמה 1)

| slug | name_he | בנים לדוגמה |
|---|---|---|
| `food` | אוכל ומסעדות | מסעדות, בתי קפה, משלוחים, שוברים |
| `spa-wellness` | ספא ויופי | עיסוי, טיפולי פנים, שיער |
| `attractions` | אטרקציות ופנאי | כרטיסים, סדנאות, חוויות |
| `home` | לבית ולגן | ריהוט, חשמל ביתי, גינה |
| `fashion` | אופנה ואקססוריז | בגדים, נעליים |
| `electronics` | אלקטרוניקה | מובייל, מחשבים (זהירות מלאי) |
| `kids` | ילדים ותינוקות | צעצועים, ביגוד |
| `services` | שירותים מקומיים | רכב, לימודים, מקצועי |

לא יותר מעומק 2. בנים נוספים לפי ביקוש בלבד. תיקון מחייב: slug אטרקציות הוא `attractions` (לא `attraced`).

---

## 2. מודל נתונים

```text
categories (
  id, parent_id,
  kind taxonomy|collection,
  name_he, slug, description_he,
  rule jsonb,          -- ל-collection
  sort_order, is_active,
  seo_title_he, seo_description_he
)
product_categories (product_id, category_id, is_primary)
```

`enforce_category_depth`: אסור סבא (parent של parent חייב null).

| כלל | פירוט |
|---|---|
| primary | בדיוק קטגוריית taxonomy אחת עם `is_primary=true` ל-publish |
| collections | מוצר יכול להיות משויך לכמה; לא canonical |
| sort | `sort_order` בתוך אותו parent |
| כיבוי | `is_active=false` מסתיר מ-listing; לא מוחק SEO redirects |

---

## 3. SEO / UX

| נושא | כלל |
|---|---|
| URL | `/category/{slug}` בעברית RTL |
| Breadcrumb | BreadcrumbList בעברית מה-primary taxonomy |
| Collection | canonical ל-taxonomy או `noindex` אם חופפת סינון |
| מעטפת | listing זהה לחיפוש (SEARCH-UX) |
| עיר | פילטר geo לפי GEO-FEATURE; לא חלק מהעץ |

---

## 4. Admin

| פעולה | כלל |
|---|---|
| יצירת קטגוריה | slug ייחודי; עומק ≤ 2 |
| שינוי parent | נדחה אם יוצר עומק > 2 |
| מחיקה | רק אם אין מוצרים משויכים; אחרת archive |
| עמלה | אין שדה עמלה על קטגוריה |

---

## 5. Acceptance

- [ ] עומק ≤ 2 נאכף ב-trigger  
- [ ] 8 אבות ישראליים כבסיס (כולל `attractions`)  
- [ ] primary category חובה ל-publish  
- [ ] RTL + breadcrumb בעברית  
- [ ] collection לא מחליפה canonical  
- [ ] אין `platform_percent` / Escrow ברמת קטגוריה  

---

## 6. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | עץ קטגוריות לשוק הישראלי (עומק 2) |
| 2026-08-06 | QA: קישור SEASONAL; RTL עברית |
| 2026-08-07 | QA re-pass: קישור CONTRADICTIONS (No Escrow + platform_percent) |
| 2026-08-07 | QA audit: T7 + קישור PRICING; קטגוריה בלי עמלה/Escrow |
| 2026-08-12 | batch #43/50: רענון BINDING על arch/docs-batch-2; slug אטרקציות מתוקן ל-attractions |
