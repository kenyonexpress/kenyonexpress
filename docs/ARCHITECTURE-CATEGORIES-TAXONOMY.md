# ארכיטקטורה: טקסונומיית קטגוריות

עץ קטגוריות לשוק הישראלי (קופונים ומוצרים פיזיים). עומק 2, SEO בעברית, בלי עמלה לפי קטגוריה.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף: **No Escrow**. קטגוריה **לא** קובעת `platform_percent` ולא יוצרת held / J5 / נאמן.

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

---

## החלטה

| # | הכרעה מחייבת |
|---|---|
| T1 | עומק מקסימלי **2** (אב + בן), נאכף ב-trigger `enforce_category_depth`. |
| T2 | `kind`: `taxonomy` (שיוך ידני) או `collection` (כלל חכם). |
| T3 | שמות ותיאורים בעברית (`name_he`, `description_he`); slug יציב ל-URL. |
| T4 | כל מוצר חייב קטגוריית taxonomy ראשית (`is_primary=true`) ל-breadcrumb ו-canonical. |
| T5 | Collections ("עד 99", "חדש") לא מחליפות taxonomy ב-SEO. |
| T6 | עץ התחלתי מותאם שוק ישראלי (8 אבות). |
| T7 | קטגוריה **לא** קובעת `platform_percent` ולא יוצרת Escrow (PRICING / CONTRADICTIONS). |
| T8 | URL קטגוריה: `/category/{slug}`; BreadcrumbList בעברית RTL מה-primary taxonomy. |
| T9 | פילטר geo לפי GEO-FEATURE; עיר **לא** חלק מהעץ. |
| T10 | כיבוי קטגוריה: `is_active=false` מסתיר מ-listing; לא מוחק SEO redirects. |

### עץ יעד (רמה 1)

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

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| עומק 3+ (סבא/נין) | מורכבות SEO וניווט; T1 קובע עומק 2. |
| עמלה / `platform_percent` ברמת קטגוריה | סותר T7 ו-C1; אחוז רק פר מוצר. |
| Escrow / held לפי קטגוריה | סותר No Escrow; קטגוריה לא קשורה לכסף. |
| קטגוריה = עיר (תל אביב, חיפה) | GEO-FEATURE מטפל בפילטר; לא בעץ. |
| collection כ-canonical ל-SEO | T5: canonical תמיד taxonomy primary. |
| מחיקה קשה של קטגוריה עם מוצרים | archive / `is_active=false` במקום DELETE. |
| slug `attraced` (טעות היסטורית) | מתוקן ל-`attractions`. |
| עץ אחיד גלובלי (לא ישראלי) | T6: 8 אבות מותאמים שוק מקומי. |

---

## סכמת DB

**אין DDL חדש במסמך זה.** מצביע לטבלאות קיימות.

```text
categories (
  id uuid PK,
  parent_id uuid FK → categories(id) NULL,
  kind text CHECK (kind IN ('taxonomy','collection')),
  name_he text NOT NULL,
  slug text UNIQUE NOT NULL,
  description_he text,
  rule jsonb,              -- ל-collection בלבד
  sort_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  seo_title_he text,
  seo_description_he text,
  created_at timestamptz,
  updated_at timestamptz
)

product_categories (
  product_id uuid FK → products(id),
  category_id uuid FK → categories(id),
  is_primary boolean DEFAULT false,
  PRIMARY KEY (product_id, category_id)
)
```

| כלל | פירוט |
|---|---|
| `enforce_category_depth` | trigger: parent של parent חייב `parent_id IS NULL` |
| primary | בדיוק קטגוריית taxonomy אחת עם `is_primary=true` ל-publish |
| collections | מוצר יכול להיות משויך לכמה; לא canonical |
| sort | `sort_order` בתוך אותו parent |
| אין שדה עמלה | אין `platform_percent` / commission על `categories` |

---

## מקרי קצה

| # | מקרה | התנהגות מחייבת |
|---|---|---|
| CE1 | שינוי parent שיוצר עומק > 2 | נדחה ב-trigger |
| CE2 | publish מוצר בלי primary taxonomy | validation נכשל |
| CE3 | collection עם כלל חופף taxonomy | canonical ל-taxonomy; collection `noindex` אם חופף סינון |
| CE4 | כיבוי קטגוריה עם מוצרים פעילים | `is_active=false`; מוצרים נשארים משויכים |
| CE5 | מחיקת קטגוריה עם מוצרים | archive בלבד; לא DELETE |
| CE6 | slug כפול | נדחה ב-UNIQUE |
| CE7 | מוצר ב-collection בלבד (ללא taxonomy) | לא publishable |
| CE8 | שינוי slug קטגוריה פעילה | redirect 301 מ-slug ישן (SEO) |
| CE9 | admin מנסה להגדיר עמלה על קטגוריה | אין שדה; UI לא מציג |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | רשימת בנים סופית לכל אב (מעבר לדוגמאות) | לפי ביקוש אחרי soft-open |
| O2 | כללי `rule` jsonb ל-collections | SPEC נפרד ל-SEASONAL |
| O3 | backfill primary category למוצרים legacy | מיגרציית נתונים, לא DDL |
| O4 | redirect map ל-slugs שהשתנו | SEO / sitemap |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | עץ קטגוריות לשוק הישראלי (עומק 2) |
| 2026-08-07 | QA: T7 + No Escrow; slug `attractions` |
| 2026-08-12 | batch-2: כתיבה מחדש BINDING (5 סעיפים) |
