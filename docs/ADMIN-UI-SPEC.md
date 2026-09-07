# מפרט UI אדמין

נמדד מול המסלולים והניווט החיים ב-
`src/app/(admin)/admin/`
ו-
`src/components/admin/AdminSidebar.tsx`
. תפקידים לפי
`docs/ROLE-MATRIX.md`
.

## פריסה

- מעטפת: סיידבר כהה + אזור תוכן לבן, ‏`dir="rtl"`.
- כניסה: ‏`/admin` מפנה לפי תפקיד דרך ‏`adminLandingPath`.
- טבלאות: ‏`DataTable` / ‏`ServerDataTable` עם חיפוש, ‏`emptyMessage` בעברית.
- צבעי מותג בסיידבר עדיין עם hex גולמי בחלק מהמקומות; יעד ההעברה ב-
  `DESIGN-TOKENS-AUDIT.md`
  .

## מסכים בניווט

| מסך | נתיב | תפקיד מינימלי | מצבים | קופי עברי עיקרי |
|---|---|---|---|---|
| לוח בקרה | ‏`/admin/dashboard` | admin | כרטיסי ‏StatsCard | מדדים יומיים |
| מוצרים | ‏`/admin/products`, ‏`/new`, ‏`/[id]/edit` | admin / content_uploader | טיוטה, פעיל, חסום פרסום בלי ‏`platform_percent` | פיצול חי: אחוז פלטפורמה + יתרה לספק = 100 |
| קטגוריות | ‏`/admin/categories` | admin | עץ, עריכה, מחיקה | אין קטגוריות |
| קופונים / דילים | ‏`/admin/coupons` | admin | ‏CRUD + קודים | אין קופונים |
| אישורים | ‏`/admin/approvals` | admin | תור pending | אין ממתינים |
| הזמנות | ‏`/admin/orders`, ‏`/[id]` | admin / support | paid, refunded, … | החזר לכרטיס / לארנק מגודר |
| משתמשים | ‏`/admin/users` | admin | תפקיד, חסימה | אין משתמשים |
| ספקים | ‏`/admin/suppliers` | admin | incomplete חוסם פרסום מוצרים | השלמת כתובת/לוגו |
| תשלומים | ‏`/admin/payments` | admin | אירועי סליקה | - |
| דוחות / אנליטיקה | ‏`/admin/reports`, ‏`/analytics` | admin | טווח תאריכים, ריק | אין נתונים בטווח הזה |
| תורים | ‏`/admin/queues` | admin | outbox / DLQ | - |
| דגלי פיצ'רים | ‏`/admin/feature-flags` | admin | on/off + ביקורת | - |
| יומן ביקורת | ‏`/admin/audit-log` | admin | סינון לפי ישות | - |
| מיגרציות | ‏`/admin/migrations` | admin | תצוגת מניפסט | קריאה בלבד |

## מסכים שקיימים בלי סיידבר

‏`/admin/discounts`, ‏`/growth`, ‏`/referrals`, ‏`/reviews`, ‏`/status`,
‏`/vendors` (לגסי). לא למחוק בלי מדידה; לחבר לניווט או לסמן כמורשים בלבד.

## ‏CRUD מוצר: תצוגת פיצול חיה

- ‏`platform_percent` nullable בטיוטה, חובה בפרסום (‏`assertPublishable`).
- **אסור** אחוז ברירת מחדל מקונפיג או ‏env.
- תצוגה חיה ליד השדה: פלטפורמה ‏X% / ספק ‏(100−X)%.
- סירוב מחיר (‏compare-at גבוה מדי) מוצג ברשימה תחת ‏`hidePricing`.

## גידור תפקידים ב-UI

| פעולה | מי רואה |
|---|---|
| מוטציית כסף / החזר | admin (support קורא) |
| שינוי תפקיד משתמש | admin / super_admin |
| דגלי פיצ'ר וקונפיג | admin |
| טיוטות content_uploader | רק שלו + תור אישורים |

בדיקת הרשאה בשרת תמיד גוברת על הסתרת כפתור.

## מצבי ריק ושגיאה

ברירת מחדל לטבלאות: «אין נתונים». מוצרים/קטגוריות/קופונים/משתמשים דורסים
למסר ספציפי. שגיאת שמירה: הודעה מעל הטופס בעברית, בלי stack.
