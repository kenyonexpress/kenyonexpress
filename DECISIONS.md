# DECISIONS.md: הכרעות מימוש phase6/admin

תאריך: 2026-07-23. כל הכרעה כאן התקבלה אוטונומית במהלך בניית
ה-Admin Super App, עם הנימוק המלא. משלים את
`admin-arch/ARCHITECTURE-ADMIN-OPS-V2.md` (המסמך המחייב) ואת
`ARCHITECTURE-ADMIN.md` (מסמך המימוש).

## D1: בסיס הענף הוא phase5/homepage, לא main

הבקשה הייתה "branch מ-main". בפועל `origin/main` נעצר ב-2026-06-04
והוא 161 קומיטים מאחורי ה-trunk האמיתי. `phase5/homepage`
(2026-07-21) מכיל את חנות הבית, העגלה וה-checkout שהאדמין חייב
לחיות מעליהם. בנייה מ-main הייתה זורקת חודש וחצי של עבודה.
`phase6/admin` הישן נמחק ונוצר מחדש מ-`phase5/homepage`; ה-tip
הקודם (97647b3) נשאר נגיש ב-reflog וב-origin עד ה-push הראשון.

## D2: הרחבת הפאנל הקיים, לא בנייה מאפס

הבסיס כבר מכיל פאנל אדמין עובד (8 סקשנים: products, categories,
coupons, suppliers, orders, users, audit-log, dashboard + approvals
מ-048). "Scaffold מלא" מומש כהשלמת המודולים החסרים מהמפרט (payments,
affiliates, analytics, users 360, RBAC מורחב) ושכתוב השבורים
(audit-log, orders list, dashboard), בלי למחוק קוד עובד.

## D3: editor ממופה ל-content_uploader; support נולד; אין ערך enum בשם editor

המפרט ביקש תפקידים super_admin / editor / support. ה-enum החי
`user_role` כבר מכיל את content_uploader שהוא בדיוק "editor"
(כתיבת קטלוג בלבד, בלי כסף). הוספת ערך editor מקביל הייתה יוצרת
שני תפקידים זהים ושוברת את `has_role()` ההיררכית ואת טריגר
ההרשאות מ-035. לכן: editor = content_uploader (תווית עברית: "עורך
תוכן"), ו-support נוסף כערך enum חדש לפי הכרעת V2 (ADM-13), מחוץ
להיררכיה, עם `is_support()` ומדיניות SELECT מפורשות.

## D4: תשלומים על Cardcom, לא Stripe + Payoneer

המפרט הזכיר Stripe ו-Payoneer. ספק הסליקה החי של הפרויקט הוא
Cardcom (skill קבוע `cardcom-payments`, טבלאות payments /
payment_webhook_events / escrow_holds / split_executions חיות עם
עמודות cardcom_*). מודול התשלומים נבנה מול הנתונים האמיתיים; שדה
`provider` קיים ב-payment_webhook_events ומשאיר פתח לספקים נוספים.
אינטגרציית Stripe/Payoneer לא קיימת בשום שכבה ולכן לא הומצאה.

## D5: אין טבלאות roles/permissions ב-DB

המפרט ביקש "migrations for roles, permissions". מודל ההרשאות החי
והמוכרע (V2 סעיף 6, מיגרציות 003/035) הוא enum על `profiles.role` +
פונקציות SECURITY DEFINER + RLS + מטריצה בקוד. טבלאות
roles/permissions דינמיות היו מודל שני סותר, בלי צרכן אמיתי (אין
UI להגדרת תפקידים דינמיים). "RBAC with Supabase RLS" ממומש במלואו:
מיגרציה 049 מוסיפה תפקיד, פונקציה ומדיניות; המטריצה חיה
ב-`src/lib/admin/permissions.ts` עם בדיקות יחידה.

## D6: אין שחזור של admin_audit_log

הטבלה `admin_audit_log` (003) מוזגה לתוך `audit_log` ונמחקה
במיגרציה 025 שכבר הוחלה על ה-DB החי (133 שורות ב-audit_log).
יצירתה מחדש הייתה מפצלת את היומן לשניים. מודול audit-log נכתב מול
`audit_log` (actor_id, actor_role, action enum, entity, changes),
וכתיבת audit מכל mutation עוברת דרך helper יחיד
`src/lib/admin/audit.ts`.

## D7: מספור מיגרציות: שחזור 048 ואז 049

המיגרציה `048_product_approval_workflow.sql` הוחלה על ה-DB החי
מהענף שנמחק, אבל הקובץ לא היה קיים בענף החדש. הקובץ שוחזר verbatim
מהקומיט 42a11b0 כדי שהריפו ישקף את ה-DB (בלי זה, מפתח שמריץ סביבה
מקומית היה מקבל סכימה שונה מהחיה). העבודה החדשה יושבת ב-049.

## D8: is_support() משווה role::text ולא ערך enum

ב-Postgres אסור להשתמש בערך enum חדש באותה טרנזקציה שבה הוא נוסף
(`ALTER TYPE ... ADD VALUE`). מיגרציה 049 מוסיפה את support וגם
יוצרת מדיניות שתלויות בו, לכן ההשוואות בפונקציה נעשות על
`role::text IN ('support','admin','super_admin')`. זה מאפשר קובץ
אחד אטומי במקום שתי מיגרציות תלויות-סדר.

## D9: מסכים מעוגנים ב-DB החי בלבד

הסדרה 026-042 (analytics views, settlements, payout_statements,
agents, notifications) היא טיוטות שלא הוחלו. לפי ADM-17 אף מסך לא
נבנה מעל טבלה שלא קיימת: analytics מחושב באגרגציות RSC על
orders/payments/coupon_codes החיים במקום `v_*` חסרים; reconciliation
מלא (קבצי Cardcom) יחכה ל-027; affiliates נולד עכשיו ב-049 כי
המודול נדרש במפרט והטבלאות (בצורת 010) פשוטות ועצמאיות.

## D10: מצב רשימות ב-URL, לא ב-state לקוח

כל ה-pagination, המיון והסינון עוברים דרך searchParams עם סכימות
Zod (`page-params.ts`). זה נותן RSC טהור (אפס fetch בצד לקוח,
עיקרון "אדמין רואה אמת עדכנית"), קישורים שיתופיים, ותאימות ל-Next
16 (searchParams הוא Promise, נקרא עם await בעמוד). כל הרשימות,
כולל audit-log, על offset עם `count: 'exact'`: בהיקף הנוכחי cursor
הוא מורכבות בלי תמורה, והמעבר אליו יתבצע כשהלוג יגיע לעשרות אלפי
שורות.

## D11: מעטפת ActionResult לפעולות חדשות בלבד

פעולות חדשות מחזירות `ActionResult<T>` אחיד. הקבצים הקיימים
(products, categories, coupon-deals) שעובדים עם `useActionState`
בצורת `{ error } | { success }` לא הוסבו בכפייה, כדי לא לגעת
בטפסים עובדים באמצע פאזה; הם מוסבים בהזדמנות (F6 של V2).

## D12: פקודות infra/audit תוקנו: worktree + pnpm

הבקשה המקבילה להקים `infra/audit` כללה `npm i`. הפרויקט נעול על
`pnpm@11.1.2` (שדה packageManager); npm היה יוצר package-lock.json
כפול. בוצע עם pnpm, בתוך worktree נפרד
(`/Users/ofir/kenyonexpress-web/kenyon-audit`) כדי לא להחליף branch
באמצע עבודת האדמין בתיקייה הראשית.
