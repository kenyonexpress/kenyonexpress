# ‏MEGA 51-52: נבדק, לא הורץ

תאריך: 2026-09-08. ענף: `closeout/v1-final`. היקף: docs בלבד.

הסקריפט של ‏MEGA 51 (‏"Supplier Onboarding") ו-MEGA 52 (‏"Launch Checklist")
לא הורץ. כל טענה כאן נמדדה מול הפרודקשן (`ixvwfbuvfxxsjiywhbbb`,
‏Postgres 17.6) או מול העץ, ולא הוסקה.

## תקציר

הסקריפט אינו רץ עד הסוף, ומה שכן רץ בו הוא הרסני. שני הקבצים היחידים
שהיו נכתבים בהצלחה הם שני קבצים **קיימים ומנוהלים ב-git** שהיו נדרסים,
ואחריהם `git push`.

---

## ‏1. הנתיב `apps/web/app/` אינו קיים

תחת `apps/` יש `mobile` בלבד. אפליקציית הווב היא `src/app/`.
לכן `cat > apps/web/app/supplier/signup/page.tsx` נכשל,
‏`git add` על אותו נתיב נכשל, ו-MEGA 51 אינו מבצע commit כלל.

## ‏2. `ENCRYPTED` אינו תחביר Postgres

נמדד מול הפרודקשן ב-DO block שהתגלגל אחורה ולא השאיר כלום:

```
create table public._ke_probe_encrypted (bank_iban text not null encrypted)
-> SQLSTATE 42601: syntax error at or near "encrypted"
```

‏(`to_regclass('public._ke_probe_encrypted')` מחזיר `null` אחרי הבדיקה.)
המיגרציה כולה נופלת על השורה הזאת. אין הצפנה ואין טבלה.

## ‏3. הטבלאות משכפלות סכימה חיה

| בסקריפט | בפרודקשן היום |
| --- | --- |
| `supplier_profiles` (חדשה) | `suppliers`, **12 שורות אמיתיות**, ‏`supplier_leads`, `supplier_members`, `supplier_staff`, `supplier_branches` |
| `payout_requests` (חדשה) | `payout_statements`, `payout_statement_lines` |

‏`supplier_profiles` ו-`payout_requests` אינן קיימות (`to_regclass` מחזיר
‏`null` לשתיהן), כלומר הסקריפט לא היה מתנגש בשם אלא יוצר מסלול ספק **שני**
במקביל לזה שכבר עובד.

## ‏4. `NUMERIC(12,2)` לכסף מפר את החוק הקבוע

‏`amount NUMERIC(12,2)` ו-`total_payouts NUMERIC(12,2)`. החוק הוא אגורות,
‏integer בלבד, דרך `src/lib/money.ts`. ‏`migrations/pending/README.md`
קובע `amount_agorot bigint` בלי תאום numeric, ומשפחת המיגרציות ‏138-142
קיימת כדי לחסל בדיוק את הטעות הזאת מהסכימה. הסקריפט מחזיר אותה.

## ‏5. פרטי בנק ו-KYC נשללו בכוונה, ולא נשכחו

`suppliers` מחזיקה **אפס** עמודות `bank`/`iban`/`kyc` (נמדד ב-
`information_schema.columns`). זה מתועד ב-
`src/app/(supplier)/supplier/profile/page.tsx`: אין ריצת payout להזין,
כי הזמנה פיזית נסגרת באותה ריצה של החיוב, וקופון אינו חייב לספק דבר
מאחר שהלקוח משלם לו את היתרה במזומן בדלפק. ‏מיגרציה 085 ביטלה את ה-escrow.
‏`payout_requests` עם `pending/approved/transferred` מתארת מודל עסקי
שהפרויקט הסיר.

## ‏6. ‏onboarding לספק כבר קיים, ובגרסה חזקה יותר

`/suppliers` ציבורי מרנדר את `SupplierLeadForm`, שקורא ל-
`src/server/actions/supplier-lead.ts`. מה שיש שם ואין בטופס שבסקריפט:
שורה נכתבת לפני המייל (ליד לא אובד בנפילת Resend), אפס policies של `anon`
על הטבלה (נמדד ב-`pg_policies`: שתי policies, אף אחת ל-anon) ולכן הכותב היחיד הוא ה-action דרך admin client, אימות טלפון
ב-`isSmsCapableIsraeli`, honeypot, ו-`checkRateLimit`.

הטופס שבסקריפט הוא ‏client component שעושה `insert` ישיר מהדפדפן לטבלה
בלי rate limit ובלי honeypot, מכניס `IBAN` ותעודת זהות ל-DB, ומעלה מסמך
KYC ל-bucket `kyc-documents` שאינו קיים (‏`storage.buckets` מחזיקה שישה:
`category-icons, coupon-images, coupons, product-images, products, vendor-logos`). הוא גם שולח את **הטלפון** בשדה
`email` לנתיב `/api/email/supplier-welcome`, ומכיל מחרוזת שבורה
(`אפload תעודת זהות`).

## ‏7. `docs/LAUNCH-CHECKLIST.md` היה נדרס

הקובץ קיים, ‏478 שורות, עודכן לאחרונה ב-`ae3b0bcdd`. הוא נושא באנר
‏stale מ-01.09 שמפנה למסמך המחייב `docs/LAUNCH-RUNBOOK.md`, ולצידו
`GO-LIVE.md` ו-`docs/ARCHITECTURE-GO-LIVE-CHECKLIST.md`.
הסקריפט מחליף את כל זה בקובץ שמסמן `[x]` על דברים שאינם נכונים:

- ‏"All 50 MEGA migrations applied (up to migration #172)" — ‏162 ו-169 עד
  ‏177 **פתוחות** ב-`migrations/pending/`, אף אחת לא הוחלה.
- ‏"pnpm test passes", "Lighthouse >= 90", "All E2E tests pass" — לא נמדדו
  בריצה הזאת. סימון PASS בלי תאריך ראיה אסור לפי המסמך הקיים עצמו.
- ‏"Encryption vault initialized" — ‏162 חסומה בדיוק כי ה-vault ריק
  (‏0 מתוך 2 ב-07.09).
- ‏"Drizzle prepared statements" — הפרויקט על Supabase client, לא Drizzle
  במסלול הזה.

בנוסף `$(date)` בתוך heredoc במרכאות אינו מתרחב, ולכן התאריך היה נשאר
המחרוזת `$(date)` בגוף המסמך.

## ‏8. `claude_STATE.md` היה נדרס

הקובץ מנוהל ב-git ומחזיק את יומן הסקציות של `closeout/v1-final` עם ה-sha
לכל סקציה. הסקריפט מחליף אותו ב-`Loop Status: STOPPED` ו-"‏PRODUCTION
READY", ואז דוחף. זו מחיקת תיעוד מדוד והחלפתו בהצהרה לא מדודה.

---

## מה באמת פתוח

ללא שינוי מ-`CLAUDE.md` ומ-`migrations/pending/APPLY-ORDER.md`:
עשר מיגרציות ממתינות לאישור (‏162 חסומה על vault, ‏169 עד ‏177 מוכנות),
רוטציית `SUPABASE_SECRET_KEY`, וה-delta של Elementor.
רשימת הפעולות האנושיות היא `docs/OWNER-CHECKLIST.md`, והרצף המחייב הוא
`docs/LAUNCH-RUNBOOK.md`.
