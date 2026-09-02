# ‏HANDOVER — מסירת הפרויקט

‏נכתב ‏02.09.2026, בסוף ‏17 מגה-בלוקים (‏STEPS 2–97). מסמך הכניסה למי
שמקבל את המערכת. לצידו: ‏`docs/OWNER-CHECKLIST.md` (מה שרק אופיר יכול),
‏`docs/ONBOARDING.md` (מפתח חדש), ‏`docs/INDEX.md` (מפת כל המסמכים).

## מה קיים

חנות דילים עברית RTL מלאה על ‏Next 16 + ‏Supabase, פרוסה ב-Vercel
(‏kenyonexpress.vercel.app; הדומיין עוד מצביע על וורדפרס — ה-cutover אצל
אופיר): קטלוג CTI (קופון/פיזי/מנוי) עם וריאנטים ושריון מלאי אטומי;
‏checkout ‏Cardcom LowProfile (‏mock עד מפתחות ייצור) עם ארנק, הנחות,
הפניות ו-cashback; שוברים חתומי-QR עם סורק ספקים, אפליקציית קופה
(‏Expo) ו-wallet passes; פורטל ספקים (תפקידי owner/manager/scanner);
אדמין מלא (קטלוג, הזמנות+משלוחים, תשלומים+התאמה, אנליטיקות, ‏audit
append-only, תור אישורים עם גבול-כסף למעלי תוכן); ‏12 crons מ-GitHub
Actions; ‏PWA; נגישות axe-אפס + מטרות-מגע; ‏SEO מלא.

## איך מריצים / בודקים / מדפלים

‏ONBOARDING.md סעיפים 2–3 (שערים), ‏DEPLOYMENT.md (ל-Vercel),
‏LAUNCH-RUNBOOK.md (רצף העלייה, שלבים 1–6 בוצעו), ‏DR-RUNBOOK.md (שחזור,
‏RTO<2h). ‏rollback רגיל: ‏Vercel → Deployment קודם → Promote.

## המתוזמנים (‏12)

‏`scripts/cron-jobs.json` הוא מקור האמת (נאכף בטסט מול ‏cron.yml,
‏CRON-EXTERNAL.md וספריית המסלולים): ‏notifications, ‏health, ‏invoices,
‏stock, ‏stranded-payments, ‏abandoned-cart, ‏subscriptions, ‏reap-carts,
‏reconcile, ‏expire-vouchers, ‏retention (חודשי), ‏weekly-digest (שישי).
‏Sentry Uptime ‏2159284 על ‏/api/health.

## מיגרציות ממתינות: ‏147–157, בסדר הזה

‏`migrations/pending/APPLY-ORDER.md` מחייב (‏150 לפני 155; ‏149 לפני 157).
כל קובץ נושא dry-run מגולגל מול פרודקשן בכותרתו. אחרי ההחלה:
‏`pnpm db:types` ו-commit של הטיפוסים. עד אז: ביקורות/משאלות/משלוחים־
מעקב/payouts/refunds-destination/analytics-ingest/ai — "מושבתים בעדינות"
(הקוד עונה עברית או מדלג, לא נופל).

## צעדים ידניים (כולם אצל אופיר)

‏OWNER-CHECKLIST.md: ‏(1) המיגרציות; ‏(2) ‏Cardcom ייצור + הסרת
‏CARDCOM_USE_MOCK; ‏(3) ‏DNS (שים לב: זון-העריכה אינו הזון-המגיש —
‏DNS-CUTOVER-PLAN.md, כולל שתי רשומות פגומות לתיקון); ‏(4) מיזוג ‏PR
הריליס. לא-חוסמים: ‏Resend verify, ‏Leaked-Password toggle, ‏5 ספקים בלי
פרטים, ‏14 slugs שגויים, אישור עו"ד לדפים משפטיים, סבב הטוקן שהודבק
בצ'אט (‏SECRETS-ROTATION.md), אישור מחיקת קוד מת (‏DEAD-CODE.md).

## ידוע ולא מתוקן

‏KNOWN-ISSUES.md — ‏9 סעיפים עם בעלים; הגדולים: מובייל 380/768 (פער מבני
מול הרפרנס; ‏320px בלי גלילה צידית כן נאכף), ‏bundle 255KB מול יעד 180
(‏ratchet מחזיק), ‏2 advisories טרנזיטיביים.

## מה הוצע ולא נבנה (‏roadmap שמור)

‏MEGA-BLOCK-AUDIT.md מתעד כל דחייה עם נימוק. הקבוצות: מערכת טיקטים
(כשיש נפח פניות); קמפיינים אוטומטיים פר-מוצר וסגמנטים (כשיש רשימת
תפוצה); רב-סניפיות ואנליטיקות פר-עובד (כשיש ספק כזה); פורנזיקת הונאות
ו-chargebacks (עם מסוף אמיתי); ‏payment_discrepancies פרסיסטנטי (עם
עסקאות); ‏web-push (ערוץ Expo קיים); ‏react-email; ‏seed פיתוח (עם DB
נפרד); פרטישן ל-audit (עם נפח).
