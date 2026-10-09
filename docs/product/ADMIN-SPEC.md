# מפרט מסכי אדמין

Status: DRAFT · docs only (לא לערוך `src/app/(admin)` מתוך הקובץ הזה)  
Base: `https://kenyonexpress.co.il/admin`  
Auth: Google / סשן staff. Layout: `requirePanelSession`. כסף: אגורות ב-DB, תצוגה ₪. אין float. אין Escrow חי.

RBAC חי בקוד: `src/lib/admin/permissions.ts` + `src/lib/admin/nav.ts`. יש פער: ה-nav נותן ל-`content_uploader` בעיקר `/admin/products`, בעוד מטריצת `sectionAccess` מאפשרת כתיבת catalog רחבה יותר. **ה-sidebar וה-`requireSection` הם האמת בזמן ריצה.** המסמך מתאר את המסכים הקיימים תחת `src/app/(admin)/admin/**/page.tsx`.

`requireRecentAuth(15)` לפעולות רגישות: העלאת role, התאמת ארנק, mark payout paid, force refund.

---

## 0. תפקידים

| Role | כניסה לפאנל | כסף (GMV/עמלה) |
|---|---|---|
| `content_uploader` | כן, נחיתה `/admin/products` | לא |
| `support` | כן, נחיתה לפי הרשאות קריאה | לא (`canSeeMoney` = false) |
| `admin` | כן, `/admin/dashboard` | כן. לא מעלים ל-`super_admin` |
| `super_admin` | כן | כן, כולל שיוך `super_admin` |
| `customer` / `vendor` | לא | לא |

מטריצה לוגית (`sectionAccess`):

| Section | uploader | support | admin+ |
|---|---|---|---|
| dashboard | none | read | write |
| catalog | write | none* | write |
| orders | none | read | write |
| users | none | read | write |
| payments | none | none | write |
| affiliates | none | read | write |
| analytics | none | none | write |
| audit-log | none | none | write |
| suppliers | none | read | write |
| discounts | none | read | write |

\*Support לא אמור לנהל קטלוג. אם מסך מוצרים נפתח בטעות, זה באג הרשאה.

Audit actions (`AUDIT_ACTION_LABELS`): `created` `updated` `deleted` `restored` `login` `logout` `permission_change` `status_change` `manual_override`. כל מוטציה אמורה לעבור `writeAuditLog`. כשל audit לא שובר את הפעולה (לוג שגיאה), אבל חסר audit הוא חוב.

---

## 1. `/admin` ו-`/admin/dashboard`

**מטרה.** תא הטייס היומי.

**עמודות / כרטיסים.** הזמנות היום, תשלומים היום (מוסתר מ-support), שוברים שהונפקו/מומשו היום, לקוחות חדשים, מוצרים פעילים. תורים מ-`v_admin_pending_queues`: אישורי מוצר, תשלומים תקועים, הזמנות pending שפגו, בקשות affiliate.

**פילטרים.** אין. חלון = היום המקומי של השרת (להעדיף ירושלים בדוחות, ראו KPI spec).

**פעולות.** קישורים לתורים. אין כפתור כסף כאן.

**הרשאה.** `dashboard` read+.

**Audit.** צפייה לא נרשמת. אין.

---

## 2. `/admin/analytics` ו-`/admin/reports` ו-`/admin/growth`

**מטרה.** משפך והכנסות לפי `docs/growth/KPI-DASHBOARD-SPEC.md`.

**עמודות.** תלוי בטבלאות/views: הזמנות עם `paid_at`, GMV on-site אגורות, משפך מ-`analytics_events` (`page_view` / `view_product` / `add_to_cart` / `begin_checkout` / `purchase` בשרת).

**פילטרים.** טווח תאריכים (יעד: שבוע ראשון 00:00 ירושלים).

**פעולות.** ייצוא CSV רק admin+, בלי עמודת אימייל לקוח ברירת מחדל.

**הרשאה.** `analytics` write לאדמין. support: none.

**Audit.** ייצוא: `manual_override` או פעולה ייעודית אם תתווסף. צפייה: אין.

---

## 3. `/admin/products`, `/new`, `/[id]/edit`

**מטרה.** קטלוג. שיגור ציבורי: `type=coupon` ו-`active` בלבד.

**עמודות רשימה.** שם עברי, slug, type, status, ספק, מחיר קופון / מחירון (תצוגת ₪ מתוך אגורות), `platform_percent`.

**פילטרים.** `q`, status: הכל / active / draft / paused / archived. עמוד 20.

**פעולות.** יצירה, עריכה, שמירה כ-draft, בקשת אישור, הקפאה. אין מחיקת היסטוריית הזמנות. AI: טיוטה בלבד.

**שדות כסף בטופס.** `coupon_price`, שווי דיל, יתרה מחושבת, `platform_percent` חובה, בלי default קשיח במסד. צילום ל-`order_items` רק בזמן קנייה, לא בעריכה מאוחרת.

**הרשאה.** `catalog`. uploader: כתיבת טיוטות. פרסום `active`: אדמין (מסך approvals).

**Audit.** `created` `updated` `status_change`.

---

## 4. `/admin/approvals`

**מטרה.** טיוטות ממתינות.

**עמודות.** מוצר, מעלה, תאריך, סיבת דחייה קודמת.

**פילטרים.** pending / rejected.

**פעולות.** approve → `active`. reject + סיבה עברית (קודי `UPLOADER-GUIDE`). אין אישור AI בלי עיניים.

**הרשאה.** אדמין. uploader לא מאשר את עצמו.

**Audit.** `status_change`.

---

## 5. `/admin/categories`, `/new`, `/[id]`

**מטרה.** עץ החי. לא `electronics` מקביל; `courses` noindex עד דיל.

**עמודות.** name_he, slug, parent, ספירת מוצרים פעילים.

**פילטרים.** חיפוש שם/slug.

**פעולות.** CRUD. מחיקת קטגוריה עם מוצרים: דחייה, לא cascade שקט.

**הרשאה.** catalog write לאדמין. Nav כרגע לא פותח קטגוריות ל-uploader.

**Audit.** `created` `updated` `deleted`.

---

## 6. `/admin/suppliers`, `/new`, `/[id]` ו-`/admin/vendors*`

**מטרה.** `suppliers` הוא הקנוני. `vendors` גשר ישן ל-`coupon_deals`. עבודה חדשה: suppliers בלבד.

**עמודות.** שם, עיר, טלפון, מוכנות PDP (לוגו, כתובת), מספר חברי סריקה, סטטוס.

**פילטרים.** `q`, עיר, חסר לוגו.

**פעולות.** יצירה, עריכה, הקפאה. צירוף `supplier_members` (owner/manager/scanner). לא לחשוף GMV פלטפורמה לספק.

**הרשאה.** `suppliers` read ל-support, write לאדמין.

**Audit.** `created` `updated` `status_change`.

---

## 7. `/admin/orders`, `/[id]`

**מטרה.** הזמנות. אמת כסף: `paid_at IS NOT NULL`.

**עמודות רשימה.** מספר/חשבונית, לקוח, סטטוס, סוג (קופון / פיזי / מעורב), סכום שנגבה באתר, תאריך.

**פילטרים.** `q` (חשבונית, שם, אימייל; מחרוזת מנוקה לפני `.or()`), `status`, `from`/`to` (YYYY-MM-DD).

**פעולות בפירוט.** צפייה בשורות snapshot, שוברים, תשלומים. **אין** עריכת סכום. החזר: מסלול payments. כיבוי קופה: env, לא כפתור SQL.

**סטטוסים.** `pending` `paid` `partially_fulfilled` `fulfilled` `cancelled` `refunded`.

**הרשאה.** `orders`. support: read. uploader: none.

**Audit.** צפייה אין. refund / override: `manual_override`.

---

## 8. `/admin/payments` ו-`/admin/queues`

**מטרה.** סליקה תקועה, DLQ, stranded.

**עמודות.** מזהה תשלום, הזמנה, kind charge/refund, status, סכום אגורות, זמן, חתימת webhook.

**פילטרים.** status, stuck, refunds.

**פעולות.** כניסה ל-reconcile לפי קוד. אין ChargeToken חוזר. אין הזנת PAN.

**הרשאה.** `payments` אדמין בלבד. support: none.

**Audit.** `manual_override` על replay אנושי.

---

## 9. `/admin/coupons`, `/new`, `/[id]`, `/codes`, `/codes/[id]`

**מטרה.** שני עולמות שמתבלבלים: (א) שובר מוצר אחרי רכישה, (ב) קוד הנחה שיווקי לאתר.

**עמודות שוברים.** קוד, סטטוס issued/used/expired/refunded, מוצר, הזמנה, תפוגה.

**עמודות קודי אתר.** קמפיין, אחוז/סכום אגורות, תוקף, max uses.

**פילטרים.** סטטוס, ספק, קוד.

**פעולות.** צפייה. אין איפוס שובר מומש ל-issued. קמפיין אתר: תזמון, לא מלאי מזויף.

**הרשאה.** catalog/admin לפי המסך. discounts נפרד לקמפיינים ששורפים עמלה.

**Audit.** `created` `status_change`.

---

## 10. `/admin/discounts`, `/new`, `/[id]`

**מטרה.** קמפיין הנחה על מחיר אתר. זה כסף.

**עמודות.** קוד, סוג, ערך, תוקף, שימושים.

**פילטרים.** active / expired.

**פעולות.** יצירה/עריכה לאדמין. support: קריאה כדי לענות "למה הקוד לא עובד".

**הרשאה.** `discounts`. uploader: none.

**Audit.** `created` `updated`.

---

## 11. `/admin/payouts`

**מטרה.** העברות לספק על **פיזי** (יתרת `supplier_due` אחרי אחוז מצולם). קופון: payout 0 מהפלטפורמה.

**עמודות.** ספק, תקופה, סכום אגורות, סטטוס, חשבון בנק מאומת.

**פילטרים.** unpaid / paid, ספק.

**פעולות.** generate (אדמין), mark-paid + `requireRecentAuth`. אין העברה ידנית מחוץ למסך.

**הרשאה.** אדמין. support: none.

**Audit.** `status_change` `manual_override`.

---

## 12. `/admin/users`, `/[id]`

**מטרה.** תפקידי פאנל, לא סיסמת Google.

**עמודות.** אימייל, שם, role, last login.

**פילטרים.** role, `q`.

**פעולות.** שיוך role לפי `assignableRoles`. admin לא ממנה admin+. super_admin כן. אין מחיקת משתמש עם הזמנות; anonymize לפי מדיניות.

**הרשאה.** `users`. support: read.

**Audit.** `permission_change` חובה.

---

## 13. `/admin/audit-log`

**מטרה.** קריאה בלבד.

**עמודות.** זמן, actor, action (עברית מהמפה), entity, diff (`audit-diff.ts`).

**פילטרים.** action, entity type, משתמש, טווח תאריכים.

**פעולות.** אין עריכה. אין מחיקה.

**הרשאה.** admin+. support: none בחי.

**Audit.** לא רושמים צפייה (רעש). ייצוא עתידי: כן.

---

## 14. `/admin/referrals` ו-`/admin/affiliates`

**מטרה.** תור הפניות / שותפים. תשלום לתוכנית = ארנק, עם תקרות.

**עמודות.** ממליץ, נמען, סטטוס pending/completed/rejected, סכום אגורות.

**פילטרים.** status.

**פעולות.** approve/reject ב-`ReferralQueueRow`. clawback בביטול הזמנה.

**הרשאה.** affiliates. support: read.

**Audit.** `status_change`.

---

## 15. `/admin/search` ו-`/admin/status`

**מטרה.** אבחון חיפוש (Meili מול ILIKE) ובריאות מערכת.

**עמודות.** engine, שאילתה, מספר תוצאות; health checks.

**פעולות.** reindex רק אדמין, מתועד. אין מחיקת אינדקס בלי fallback.

**הרשאה.** אדמין.

**Audit.** reindex = `manual_override`.

---

## 16. כללי מסך

1. סכומים: formatter מ-`src/lib/money.ts`, `dir=ltr`.
2. אין עמודה "נאמנות/Escrow" כפעולה חיה גם אם enum ישן מופיע בתוויות.
3. RTL, יעדי מגע 44px, תוויות מ-`labels.ts`.
4. כשל שמירה: toast עברית, לא 500 שקט.

---

## 17. קישורים

- `docs/ARCHITECTURE-ADMIN.md`
- `docs/ADMIN-PRODUCT-PAGE-SPEC.md`
- `docs/support/ADMIN-RUNBOOK-HE.md`
- `docs/support/UPLOADER-GUIDE-HE.md`
- `docs/growth/KPI-DASHBOARD-SPEC.md`
