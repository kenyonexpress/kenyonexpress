# תפעול אדמין (‏ADMIN-OPS)

‏SECTIONS 85. נמדד ‏22.09.2026 מול פרודקשן ומול הקוד.

## למה המסמך הזה

הסעיף מונה שבעה פריטים: ‏KPI, יומן תשלומים לפי ספק, התאמות ידניות עם סיבה,
ניהול משתמשים ‏(תפקידים וחסימה), צפייה בלוג עם ‏diff, ייצוא ‏CSV ועורך טבלאות
תצורה. **שלושה מהם היו קיימים במלואם ולא נגעתי בהם, וארבעה היו חסרים בחלקם.**
המסמך אומר לכל פריט מה היה, מה נוסף, איפה, ומה נמדד.

| # | פריט | היה | נוסף ב-85 |
|---|------|-----|-----------|
| 1 | ‏KPI: ‏GMV, ‏take rate, מימוש, החזרים | ‏`/admin/analytics`: מחזור, הכנסות פלטפורמה, הזמנות, ממוצע, ‏take rate לפי ‏`platform_percent` | **אחוז מימוש שוברים והחזרים** ‏(4 כרטיסים): ‏`src/lib/analytics/ops-kpis.ts`, ‏`loadOpsKpis` |
| 2 | יומן ‏settlements לפי ספק | ‏`/admin/payouts` רשימת דוחות, בלי סינון לספק ובלי שורות | סינון ‏`?supplier=`, מקטע "יומן תשלומים" בדף הספק, ו-CSV של השורות: ‏`/api/admin/payouts/ledger` |
| 3 | התאמות ידניות עם סיבה | זיכוי ארנק ללקוח עם סיבה ‏(`creditCustomerWallet`), התאמת קאשבק. **לדוח ספק לא היה כלום**, למרות שה-enum ‏`payout_line_type` מכיל ‏`adjustment` מאז ‏081 | ‏`addPayoutAdjustment`: שורת ‏`adjustment` חתומה, בטווח ‏±10,000 ‏₪, סיבה חובה, רק על דוח שטרם אושר |
| 4 | משתמשים: תפקידים וחסימה | תפקידים: ‏`updateUserRole` עם שני שערי הרשאה. **חסימה לא הייתה**, ואין עמודה כזו ב-`profiles` | ‏`banUser` / ‏`unbanUser` דרך ‏`auth.users.banned_until`, עם סיבה ורשומת ‏audit; מצב החסימה בדף המשתמש |
| 5 | לוג פעילות עם ‏diff | ‏`/admin/audit-log` עם ‏`AuditDiffCell` על ‏`before`/`after` | לא נגעתי בתצוגה. נוסף ייצוא ‏(#6) |
| 6 | ייצוא ‏CSV | דוחות מכירות וספקים ‏(`/api/admin/reports/[report]`), מימושי ספק | ‏CSV ללוג הפעילות לפי המסננים ‏(`/api/admin/audit-log/csv`, ה-diff משוטח לשורות ‏`שדה: לפני → אחרי`), ו-CSV ליומן הספק |
| 7 | עורך טבלאות תצורה | ‏`/admin/feature-flags` ‏(83) | ‏`/admin/settings`: עורך ל-`referral_program_settings` וקישור לדגלים |

## מה נמדד, ובאיזה מצב הפרודקשן

| מדידה | ערך |
|-------|-----|
| ‏`audit_log` | ‏927 שורות |
| ‏`profiles` | ‏12; ‏`auth.users` חסומים: ‏0 |
| ‏`vouchers` לפי סטטוס | ‏issued ‏12, ‏redeemed ‏1, ‏refunded ‏1 |
| ‏`refunds` | ‏completed ‏1 |
| ‏`payout_statements` / ‏`_lines` | ‏0 / ‏0 ‏(הטבלאות קיימות; ההערה ב-`actions/admin/payouts.ts` על "‏081 לא הוחלה" היא מ-06.08 ומיושנת) |
| ‏`referral_program_settings` | ‏0 שורות. מדיניות ‏RLS יחידה: ‏`referral_settings_admin_read` ‏(SELECT) |

**מבחני כתיבה יבשים, בטרנזקציה שגולגלה לאחור** ‏(`BEGIN … ROLLBACK`, אפס שורות
נשארו, נבדק אחרי):

- דוח ‏`pending_approval` + שורת ‏`adjustment` של ‏‎-12.50 + עדכון הסך: עבר.
  ה-CHECK ‏`payout_statement_lines_has_subject` מתיר שורה בלי ‏`order_item_id`
  רק כש-`line_type='adjustment'`, וזה מה שהקוד כותב. הטריגרים
  ‏`audit_payout_statements` ו-`audit_payout_statement_lines` כתבו ‏2 רשומות
  ‏audit, כך שהתאמה נרשמת **שלוש פעמים**: שתיים מהטריגרים ואחת מ-`writeAuditLog`
  עם הסיבה. הכפילות מכוונת: לטריגר אין את הסיבה.
- ‏`upsert` על ‏`referral_program_settings` עם ‏`id=true`: עבר. ה-CHECK
  ‏`referral_settings_amounts` דורש ‏`max_per_referrer_month > 0` ו-`year >= month`;
  **הסכימה בקוד תוקנה להתאים לו** אחרי שהמבחן חשף שהטופס התיר ‏0 כ"ללא מגבלה".

## ‏RLS ומסלולי כתיבה

| פעולה | לקוח | מדיניות שמאפשרת | שער בקוד |
|-------|------|------------------|----------|
| ‏KPI ‏(vouchers, refunds) | ‏service role | — | ‏`requireAdminPage` בדף |
| יומן ספק ‏(קריאה + CSV) | **הסשן של האדמין** | ‏`payout_lines: admin all`, ‏`payout_statements: admin all` | ‏`requireSection('payments')` |
| התאמה ידנית | הסשן של האדמין | ‏`payout_lines: admin all` ‏(INSERT/DELETE), ‏`payout_statements: admin all` ‏(UPDATE) | ‏`requireSection('payments','write')` + ‏`canAdjust` |
| חסימה | ‏Auth admin API ‏(service role) | אין טבלה: ‏`auth.users` | ‏`requireSection('users','write')` + ‏`authorizeBan` |
| ‏CSV ללוג | הסשן של האדמין | ‏`audit_log_admin_select` | ‏`requireSection('audit-log')` |
| הגדרות הפניות: קריאה | הסשן של האדמין | ‏`referral_settings_admin_read` | ‏`requireSection('payments')` |
| הגדרות הפניות: כתיבה | ‏service role | אין מדיניות כתיבה לאדמין | ‏`requireSection('payments','write')` |

הכתיבה להגדרות על מפתח השירות היא החלטה ולא מחדל: החלופה היא מיגרציה שמוסיפה
מדיניות ‏`FOR ALL USING is_admin()`, והריפו לא מחיל מיגרציות. השער בקוד הוא
ההרשאה; המפתח הוא התחבורה. אם תיכתב המדיניות, אפשר להחליף את ‏`createAdminClient`
ב-`createClient` בפעולה בלי לשנות דבר אחר.

## החלטות

- **חסימה ב-`auth.users.banned_until` ולא בעמודה ב-`profiles`.** ‏GoTrue מסרב
  לטוקן של משתמש חסום ב-`maybeLoadUserOrSession`, כך ש-`supabase.auth.getUser()`
  נכשל וכל שער בצד השרת שולח ללוגין, כולל ‏`requireSection` ו-`lib/supabase/server`.
  עמודה ב-`profiles` הייתה דורשת בדיקה בכל אחד מהם. המחיר: רשימת המשתמשים לא
  מציגה עמודת "חסום", כי ‏PostgREST לא חושף את ‏`auth.users` ורשימה של ‏12
  משתמשים לא מצדיקה ‏12 קריאות ‏API. דף המשתמש מציג את המצב, ומציג "לא ידוע"
  ואת השגיאה כשה-API לא ענה, במקום "לא חסום".
- **התאמה היא שתי כתיבות ולא ‏RPC.** אין ‏RPC כזה ואין מיגרציה. הסדר: שורה
  קודם, ואם עדכון הסך נכשל השורה נמחקת ‏(ונרשם ‏`payouts.adjustment_total_failed`
  עם ‏`undone`). עדכון הסך מותנה בערך שנקרא ‏(`eq('total_payout_ils', …)`), כך
  ששני אדמינים שמתאימים במקביל לא דורסים זה את זה: השני נכשל ורואה הודעה.
- **‏KPI המימוש נמדד על שוברים שנוצרו בחלון, לא על שוברים שמומשו בו.** זה עונה
  על "ממה שמכרנו לאחרונה, כמה נוצל". שובר שבוטל או הוחזר יוצא מהמכנה.
  יחסים בנקודות בסיס שלמות, מאותה סיבה שכסף באגורות.
- **ייצוא מוגבל ל-5000 שורות** בשני ה-CSV החדשים, ומחזיר ‏413 עם הנחיה לצמצם
  במקום קובץ חתוך שנראה שלם.

## מה לא נעשה

- עמודת חסימה ברשימת המשתמשים ‏(ראה למעלה).
- מדיניות כתיבה לאדמין על ‏`referral_program_settings` ‏(מיגרציה).
- ‏RPC אטומי להתאמה ‏(מיגרציה).
- עורך גנרי לכל טבלה: שתי טבלאות תצורה קיימות, ולשתיהן יש עורך ייעודי עם
  אימות. עורך גנרי היה מוותר על האימות, ובכסף זה לא מקובל.

## קבצים

- ‏`src/lib/analytics/ops-kpis.ts` ‏(+test), ‏`src/server/analytics/queries.ts` ‏(`loadOpsKpis`), ‏`src/app/(admin)/admin/analytics/page.tsx`
- ‏`src/lib/admin/payout-ledger.ts` ‏(+test), ‏`src/server/queries/payout-ledger.ts`, ‏`src/app/api/admin/payouts/ledger/route.ts`, ‏`src/app/(admin)/admin/suppliers/[id]/page.tsx`, ‏`src/app/(admin)/admin/payouts/page.tsx`
- ‏`src/lib/admin/payouts.ts` ‏(`adjustmentSchema`, ‏`canAdjust`, +test), ‏`src/server/actions/admin/payouts.ts` ‏(`addPayoutAdjustment`), ‏`src/app/(admin)/admin/payouts/PayoutActionsClient.tsx`
- ‏`src/lib/admin/user-ban.ts` ‏(+test), ‏`src/server/actions/admin/users.ts` ‏(`banUser`, ‏`unbanUser`), ‏`src/app/(admin)/admin/users/UserBanClient.tsx`, ‏`src/app/(admin)/admin/users/[id]/page.tsx`
- ‏`src/lib/admin/audit-export.ts` ‏(+test), ‏`src/app/api/admin/audit-log/csv/route.ts`, ‏`src/app/(admin)/admin/audit-log/page.tsx`
- ‏`src/lib/admin/referral-settings.ts` ‏(+test), ‏`src/server/actions/admin/referral-settings.ts`, ‏`src/app/(admin)/admin/settings/{page,ReferralSettingsForm}.tsx`, ‏`src/lib/admin/nav.ts`, ‏`src/components/admin/AdminSidebar.tsx`
