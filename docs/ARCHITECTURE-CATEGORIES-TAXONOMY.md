# ARCHITECTURE: Categories Taxonomy

עץ קטגוריות **ישראלי** לקטלוג קופונים ומוצרים פיזיים.

Status: **BINDING** · Updated: 2026-08-03 (pack-20)
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`
אין שינוי קוד. אין נגיעה ב-worktree הראשי (`kenyonexpress`).

Companions:

```
docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md
docs/ARCHITECTURE-SEARCH-UX.md
docs/ARCHITECTURE-SEO-PERFORMANCE.md
docs/ADMIN-ARCHITECTURE.md
```

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| T1 | עומק מקסימלי **2** (אב + בן). נאכף ב-trigger. |
| T2 | `categories.kind`: `taxonomy` (שיוך ידני) או `collection` (כלל חכם ב-jsonb). |
| T3 | שמות ותיאורים בעברית (`*_he`); slug לטיני/עברי יציב ל-URL. |
| T4 | כל מוצר חייב קטגוריית taxonomy ראשית ל-breadcrumb/canonical. |
| T5 | Collections ("עד 99", "חדש", "דילים חמים") לא מחליפות taxonomy ב-SEO canonical. |
| T6 | עץ התחלתי מותאם שוק ישראלי (אוכל, ספא, אטרקציות, בית, אופנה, אלקטרוניקה, ילדים, שירותים). |

---

## 1. עץ יעד (רמה 1)

| slug | name_he | הערות |
|---|---|---|
| `food` | אוכל ומסעדות | בנים: מסעדות, בתי קפה, משלוחים, שוברים |
| `spa-wellness` | ספא ויופי | עיסוי, טיפולי פנים, שיער |
| `attractions` | אטרקציות ופנאי | כרטיסים, סדנאות |
| `home` | לבית ולגן | |
| `fashion` | אופנה ואקססוריז | |
| `electronics` | אלקטרוניקה | זהירות מלאי פיזי |
| `kids` | ילדים ותינוקות | |
| `services` | שירותים מקומיים | רכב, לימודים, מקצועי |

בנים נוצרים לפי ביקוש; לא יותר מעומק 2.

---

## 2. מודל נתונים

```text
categories (
  id, parent_id null|uuid,
  kind taxonomy|collection,
  name_he, slug, description_he,
  rule jsonb,           -- ל-collection בלבד
  sort_order, is_active,
  seo_title_he, seo_description_he
)
product_categories (product_id, category_id, is_primary)
```

`enforce_category_depth`: parent של parent חייב להיות null.

---

## 3. SEO / UX

- URL: `/category/{slug}`
- BreadcrumbList בעברית
- Collection pages: `noindex` אם הן מסננות דינמיות שחופפות taxonomy (או canonical ל-taxonomy)
- דף קטגוריה = listing chrome זהה לחיפוש

---

## 4. Acceptance

- [ ] עומק ≤ 2 נאכף
- [ ] 8 אבות ישראליים כבסיס
- [ ] primary category חובה ל-publish
- [ ] RTL + schema breadcrumb

---

## 5. Revision

| Date | Change |
|---|---|
| 2026-08-03 | pack-20: taxonomy ישראלי עומק 2 |
