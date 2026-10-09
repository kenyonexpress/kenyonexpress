# ‏(24) SEED CONTENT WAVE — דוח הרצה יבשה


> <!-- v1-final-historical:2026-09-01 -->
> 🕯️ **Historical snapshot. Not current guidance.**
>
> This is a seed run, true on the date it carries. It is kept as a record of what
> was measured and decided then, and it is **not** maintained against
> production. Numbers, table names and statuses in it may since have changed.
>
> For the current state see `docs/ARCHITECTURE-OVERVIEW.md`, and
> `docs/INDEX.md` for which document is authoritative on a given subject.

עודכן: ‏2026-08-19. הכלי: `scripts/seed-catalogue.mjs`, הנתונים:
‏`scripts/seed/catalogue-data.mjs`. **לא נכתבה שורה אחת לשום מסד נתונים.**

## מה יש בפועל, לא מה שתוכנן

התור ביקש 60 מוצרים. **מה שקיים ונמדד הוא 40 מוצרים ו-14 ספקים**, וזה נכתב כאן
כמות שהוא ולא מעוגל כלפי מעלה. ההרצה היבשה:

```
DRY RUN. Nothing was written.

suppliers            14  (all with address, city, phone and logo)
products             40
  coupons            37
  physical            3
distinct platform_%  17
categories used      restaurants-cafes, beauty-health, vacation,
                     phones-computers, pets, baby-kids, professionals
```

| נמדד | ערך |
| --- | --- |
| מוצרים | ‏40 (‏37 קופון, ‏3 פיזי) |
| ‏slug ייחודי / ‏id ייחודי | ‏40 / 40 |
| ספקים | ‏14, **כולם** עם כתובת, עיר, טלפון ולוגו |
| ערים | ‏14 שונות: תל אביב, ירושלים, חיפה, באר שבע, ראשון לציון, נתניה, אשדוד, פתח תקווה, רמת גן, אילת, חולון, הרצליה, מודיעין, רעננה |
| ‏`platform_percent` | ‏**‏17 ערכים שונים**, ‏8 עד 24 |
| ‏`coupon_price` שלם | כן, בכל 37 |
| מחיר קופון < מחיר מחירון | בכל 37 |
| ‏`couponExpiryDays` | ‏90 בכולם (‏**D1**) |
| פיזי עם מלאי | ‏3 מתוך 3 |
| פיזי שנושא `coupon_price` | ‏**0** |
| מארח תמונות | ‏`picsum.photos` בלבד |

## כלל העסק, כפי שהוא יוצא ב-SQL

‏**‏`escrow` אינו מופיע ב-SQL הנוצר אף פעם אחת** (נבדק בגרפ על הפלט המלא).

מודל העמלה אינו קבוע בקובץ אלא **נגזר לכל שורה** ממה שהשורה היא:

```sql
(CASE WHEN v.coupon_price IS NULL THEN 'physical_percent'
      ELSE 'coupon_absolute' END)::public.commission_type,
```

כלומר ‏37 הקופונים יוצאים `coupon_absolute` וכל שלושת הפיזיים
‏`physical_percent`, וזה תואם את הפרודקשן שנמדד (‏15 קופונים `coupon_absolute`,
‏46 פיזיים `physical_percent`). ‏**‏`coupon_price` הוא סכום מוחלט**, הלקוח משלם
אותו במלואו, וההפרש מול המחירון נגבה בבית העסק בסריקה. אין תשלום לספק מכסף
הקופון.

## למה זה פולט SQL ואינו כותב בעצמו

שתי סיבות, שתיהן מתועדות בראש הסקריפט:

1. ‏**‏`SUPABASE_SECRET_KEY` המקומי אינו של הפרויקט הזה** אלא מפתח הדמו, והפרויקט
   המאוחסן עונה `Invalid API key` לכל בקשה. זו הסיבה ש-`seed-test-data.mjs`
   שלידו אינו יכול לרוץ כאן כלל. המסלול שכן עובד הוא MCP, ו-MCP מדבר SQL.
2. ‏**החלטה D10 והשכל הישר:** אלה 40 מוצרי דמו שיעדם קטלוג חי שכבר מחזיק
   ‏61 אמיתיים. זו החלטה שנלקחת במפורש, לא תופעת לוואי של הרצת סקריפט.

ברירת המחדל היא הרצה יבשה. ‏`--sql` פולט את הבלוק, ‏`--clean-sql` פולט את
ההסרה המדויקת.

## מה ה-SQL עושה שהאפליקציה עושה לבד

1. ‏**‏`approval_status`.** הטריגר `enforce_product_approval` **יוצא מוקדם
   כש-`auth.uid() IS NULL`**, וזה בדיוק כל מסלול שמריץ SQL דרך MCP או דרך
   ה-service role. לכן המסלול שהיה מסמן `approved` על מוצר שהופעל לא רץ, וזריעה
   שהייתה משמיטה את העמודה הייתה משאירה 40 מוצרים `active` ולא מאושרים — מצב
   שמסכי האדמין קוראים כ"ממתין".
2. ‏**‏`category_id` נפתר לפי slug** מול הקטגוריות הקיימות, ולעולם לא מומצא:
   זריעה שהייתה יוצרת קטגוריות משלה הייתה מכניסה ערכי דמו לניווט האתר.

## אידמפוטנטיות והסרה

כל השורות יושבות על **מזהים קבועים במרחב `5eed…`**:
‏`5eed0000-0000-4000-8000-1000000000NN` לספקים,
‏`5eed0000-0000-4000-8000-2000000000NN` למוצרים. כל משפט הוא upsert על המזהה
הזה, ולכן הרצה שנייה אינה מכפילה דבר.

‏`--clean-sql` מוחק **לפי id ולא לפי `slug LIKE`** — מחיקה לפי דפוס slug הייתה
יכולה למחוק מוצר אמיתי ששמו דומה — ומוחק מוצרים לפני ספקים, כי ההפניה היא
‏`ON DELETE RESTRICT`.

## מה שכבר אומת מול הפרודקשן, בטרנזקציה שגולגלה לאחור

הקו הזה של הסקריפט הורץ בעבר מול הפרודקשן בתוך טרנזקציה שגולגלה, וזה מה שכתב
את רוב הכללים למעלה. ארבע שגיאות אמיתיות שנתפסו שם ותוקנו: ‏`22P02` על UUID עם
‏11 ספרות hex, ‏`42804` כי רשימת `VALUES` היא טקסט לא מטופס ו-`id` נזקק
ל-`::uuid` **בעמודה הראשונה של המשפט הראשון**, ו-`23502` פעמיים — על
‏`commission_percent` ועל `commission_type`. אחרי הגלגול נשארו **אפס שורות
זרועות ו-61 מוצרים פעילים ללא שינוי**.

## מה נדרש כדי להריץ באמת

**אישור של אופיר, ותו לא.** הפקודה:

```bash
node scripts/seed-catalogue.mjs --sql   # לסקירה
# ואז הרצת הבלוק דרך MCP apply_migration
```

**לא מומלץ לקטלוג חי.** ‏61 המוצרים האמיתיים בפרודקשן טובים מ-40 דמו, והערך
של הזריעה הזאת הוא סביבת פיתוח ובדיקות — לא החנות.
