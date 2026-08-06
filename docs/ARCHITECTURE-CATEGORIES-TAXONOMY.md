# ארכיטקטורה: טקסונומיית קטגוריות

עץ קטגוריות לשוק הישראלי (קופונים ומוצרים פיזיים).

Status: **BINDING** · עודכן: 2026-08-06  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-SEARCH-UX.md
docs/ARCHITECTURE-SEO-PERFORMANCE.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md
```

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

לא יותר מעומק 2. בנים נוספים לפי ביקוש בלבד.

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

---

## 3. SEO / UX

- URL: `/category/{slug}` בעברית RTL  
- BreadcrumbList בעברית  
- Collection: canonical ל-taxonomy או `noindex` אם חופפת סינון  
- מעטפת listing זהה לחיפוש  

---

## 4. Acceptance

- [ ] עומק ≤ 2 נאכף  
- [ ] 8 אבות ישראליים כבסיס  
- [ ] primary category חובה ל-publish  
- [ ] RTL + breadcrumb  

---

## 5. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | עץ קטגוריות לשוק הישראלי (עומק 2) |
