# ארכיטקטורה: קמפיינים עונתיים

חגים ישראליים, מבצעי בזק, וראש השנה / פסח.

Status: **BINDING** · עודכן: 2026-08-06 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-INVENTORY.md
docs/ARCHITECTURE-EMAIL-TEMPLATES.md
docs/ARCHITECTURE-NOTIFICATIONS-MARKETING.md
docs/ARCHITECTURE-CATEGORIES-TAXONOMY.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
```

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| S1 | קמפיין עונתי = ישות עם חלון זמן, אוסף מוצרים/קולקציה, וכללי מחיר/בזק. |
| S2 | שעון שרת + אזור זמן `Asia/Jerusalem` לכל חלון. |
| S3 | מבצע בזק ממומש דרך שדות flash במוצר או דרך campaign override עם snapshot ב-checkout. |
| S4 | תוכן שיווקי כפוף ל-consent (חוק 30א); טרנזקציוני לא דורש opt-in. |
| S5 | ראש השנה ופסח = תבניות קמפיין חובה בלוח השנה העברי/אזרחי. |
| S6 | מלאי/מכסות נאכפים גם תחת לחץ עונתי. |
| S7 | קמפיין משנה מחיר תצוגה/קופון באתר בלבד. **לא** יוצר Escrow/נאמן אשראי. שינוי `platform_percent` רק ב-publish מוצר (admin), פר מוצר, בלי default גלובלי. |

---

## 1. לוח חגים ישראלי (בסיס)

| קמפיין | חלון טיפוסי | דגש תוכן |
|---|---|---|
| ראש השנה | אלול–תשרי | מתנות, מסעדות, ספא |
| יום כיפור / סוכות | תשרי | חופשות קצרות, אטרקציות |
| חנוכה | כסלו | מתנות, משפחות |
| פורים | אדר | בילוי, מסכות/חוויות |
| פסח | ניסן | נופש, אטרקציות, מתנות |
| יום העצמאות | אייר | בילוי, מסעדות |
| ל"ג בעומר / שבועות | אייר–סיון | משפחות, אוכל |
| קיץ / בין הזמנים | יולי–אוגוסט | אטרקציות, ילדים |
| בלאק פריידי / סייבר | נוב–דצמ | הנחות רוחביות (זהירות LEGAL במחיר) |
| מבצע בזק ספונטני | שעות–ימים | flash_price |

תאריכים עבריים: מחושבים מראש ללוח אזרחי לכל שנה בקובץ/טבלת `campaign_calendar`.

---

## 2. מודל קמפיין

```text
seasonal_campaigns (
  id, slug, name_he,
  starts_at, ends_at,           -- timestamptz Asia/Jerusalem
  kind holiday|flash|evergreen,
  hero_copy_he, collection_category_id null,
  is_published
)
campaign_products (
  campaign_id, product_id,
  override_coupon_price_agorot null,
  flash_price_agorot null,
  sort_order
)
```

Checkout בוחר מחיר אפקטיבי: override קמפיין אם פעיל, אחרת flash מוצר, אחרת מחיר רגיל.

---

## 3. מבצעי בזק

| כלל | פירוט |
|---|---|
| תצוגה | טיימר RTL בעברית בדף הקמפיין/PDP |
| סיום | לפי שרת; לא לפי שעון המכשיר בלבד |
| עומס | cache/ISR על דפי קמפיין; checkout תמיד דינמי |
| אחרי סיום | מחיר חוזר; אין לרכוש במחיר ישן בגלל טאב פתוח (אימות שרת) |

---

## 4. ראש השנה ופסח (חובה מוצרית)

| נושא | ראש השנה | פסח |
|---|---|---|
| נחיתה | `/campaigns/rosh-hashanah` | `/campaigns/pesach` |
| אוסף | אוכל, ספא, מתנות | נופש, אטרקציות, משפחה |
| מייל שיווקי | רק ל-opt-in | רק ל-opt-in |
| באנר בית | כן בעונה | כן בעונה |
| תוקף קופון | להימנע מפקיעה באמצע החג בלי גילוי | אותו כלל |

---

## 5. Acceptance

- [ ] חלונות לפי `Asia/Jerusalem`  
- [ ] ראש השנה + פסח מוגדרים כקמפיינים  
- [ ] בזק נאכף בשרת  
- [ ] שיווק רק עם consent  
- [ ] מכסות לא נפרצות בעומס  

---

## 6. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | קמפיינים עונתיים + ראש השנה/פסח + בזק |
| 2026-08-06 | QA: S7 No Escrow + `platform_percent` פר מוצר |
