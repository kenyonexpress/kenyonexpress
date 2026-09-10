# ‏מה רק אתה יכול לעשות

‏נכתב ‏10.09.2026. **כל שורה כאן נמדדה מול פרודקשן באותו יום, לא הועתקה ממסמך
קודם.** אם פריט לא נמצא כאן, סימן שהוא נעשה בקוד ואינו דורש אותך.

‏**הפרויקט ב-Vercel שמגיש את ‏`https://www.kenyonexpress.co.il` נקרא
‏`kenyonexpress`.** לא ‏`kenyonexpress-prod` ולא ‏`kenyonexpress-web`. שלושתם
קיימים תחת ‏`kenyonexpress-projects` ולשלושתם משתני סביבה שונים. כל פקודה כאן
מכוונת במפורש לפרויקט הנכון, כי הגדרה על הפרויקט הלא נכון נראית כמו הצלחה
ואינה משנה כלום.

```bash
cd /Users/ofir/kenyonexpress-web/kenyonexpress
npx vercel link --yes --project kenyonexpress --scope kenyonexpress-projects
```

---

## ‏1. שלושת אישורי החיוב של קארדקום, ואז כיבוי המוק

‏**זה הפריט היחיד שחוסם כסף אמיתי, והוא גם הפריט שמנע נזק עד היום.** נמדד:
‏`CARDCOM_TERMINAL_NUMBER`, ‏`CARDCOM_API_NAME` ו-`CARDCOM_API_PASSWORD`
**אינם קיימים באף סביבה של אף אחד משלושת הפרויקטים.** מה שכן היה מוגדר על
הפרויקט החי הוא ‏`CARDCOM_USE_MOCK="true"` יחד עם ‏`CHECKOUT_ENABLED="true"`.

‏**הצירוף הזה לא אמר "אי אפשר לגבות". הוא אמר "אפשר להזמין בלי לשלם".**
‏`getPaymentProvider` מחזיר את ספק המוק כש-`useMock` דלוק, המוק מאשר במסלול
התקין, והזמנה הייתה נסגרת ומנפיקה שובר בלי שאף כרטיס חויב. **נסגר בקוד היום**
‏(`src/lib/payments/env.ts`): על ‏`VERCEL_ENV=production` המוק כבר לא יכול
להגיש לקוחות, והתשלום מסרב בעברית במקום לאשר. לכן אין דחיפות של דקות, ויש
דחיפות של ימים: כרגע **אי אפשר לגבות שקל.**

```bash
npx vercel env add CARDCOM_TERMINAL_NUMBER production
npx vercel env add CARDCOM_API_NAME production
npx vercel env add CARDCOM_API_PASSWORD production
npx vercel env rm  CARDCOM_USE_MOCK production   # או: הגדר אותו ל-false
```

‏את שלושת הערכים מקבלים מקארדקום בטלפון. ‏`CARDCOM_WEBHOOK_SECRET` כבר מוגדר
ולא נוגעים בו. **אחרי ההגדרה חייב redeploy** (פריט ‏2), כי משתני סביבה נקראים
בזמן בנייה ובזמן ריצה של פריסה חדשה בלבד.

## ‏2. ‏Redeploy של פרודקשן

‏**‏8 מתוך ‏18 מסלולי ה-cron מחזירים ‏404 מהפריסה החיה.** נמדד אחד-אחד מול
‏`https://kenyonexpress.vercel.app`: ‏`price-schedule`, ‏`price-snapshot`,
‏`wishlist-alerts`, ‏`whatsapp`, ‏`retention`, ‏`weekly-digest`,
‏`settlement-reconcile` ו-`webhook-dlq` אינם קיימים שם. העשרה האחרים מחזירים
‏401, שזו הצלחה: הם פרוסים ו-`CRON_SECRET` מוגדר.

‏זה לא באג בחיווט. **הפריסה החיה פשוט ישנה מהריפו**, והמסלולים האלה נכתבו
אחריה. הם לא ירוצו לעולם עד ל-deploy, ובהם היושבים על הכסף: התאמת הסליקה
היומית ותור ה-webhook התקוע.

```bash
npx vercel --prod --scope kenyonexpress-projects
```

## ‏3. ‏`RESEND_API_KEY` על הפרויקט החי

‏**נמדד: המשתנה אינו קיים על ‏`kenyonexpress`.** ‏`src/lib/email/resend.ts`
מתייחס למפתח חסר כאל השבתה מכוונת ולא כאל שגיאה, ורושם
‏`email.disabled` וממשיך. כלומר **אף לקוח לא מקבל שום מייל מפרודקשן**: לא אישור
הזמנה, לא שובר, לא קישור התחברות. אין שגיאה, אין תור מת, ואין שום סימן חיצוני.

```bash
npx vercel env add RESEND_API_KEY production
```

‏המפתח נמצא ב-`https://resend.com/api-keys`. ‏DNS של הדומיין ב-Resend מתועד
ב-`docs/LAUNCH-CHECKLIST.md` פרק ‏2.

## ‏4. ‏`SENTRY_DSN` על הפרויקט החי

‏נמדד: אינו קיים על ‏`kenyonexpress` (קיים על ‏`kenyonexpress-prod`, שאינו
מגיש). לכן שום שגיאת פרודקשן אינה מדווחת, וזה מסביר למה כל האירועים
ב-Sentry הם ממחשבים ניידים.

```bash
npx vercel env add SENTRY_DSN production
npx vercel env add NEXT_PUBLIC_SENTRY_DSN production
```

## ‏5. אימות ‏WhatsApp מול Meta

‏דורש חשבון עסקי שהוא שלך, ‏`https://business.facebook.com`. עד לאימות מערכת
ה-WhatsApp כתובה ומחווטת ואינה שולחת. אין פקודה, זה תהליך בדפדפן.

## ‏6. פרטי העסק החוקיים

‏שם החברה, ‏ח.פ., כתובת רשומה וטלפון. נכנסים לתקנון, למדיניות הפרטיות ולחשבונית.
‏העמודים עצמם חיים ומחזירים ‏200 (`/terms-and-conditions`, ‏`/privacy-policy`,
‏`/accessibility`, ‏`/refund_returns`), והם מחכים לערכים האמיתיים.

## ‏7. תמונה למוצר אחד

‏**נמדד: ‏43 מתוך ‏44 המוצרים הפעילים כבר נושאים תמונות**, אף אחת אינה
‏placeholder ואף אחת אינה מתארחת עוד על וורדפרס. חסר מוצר אחד:

```
מזקקת וויסקי - סיור מופלא במזקקת ויסקי מובילה     slug: מזקקת-ויסקי
```

‏העלאה דרך ‏`/admin/products`. **זה לא חוסם עלייה לאוויר**, והוא כאן רק כדי
שהרשימה תהיה מלאה.

## ‏8. אישור להחיל ‏42 מיגרציות ממתינות

‏`migrations/pending/` מחזיק ‏42 קבצי ‏`.sql`. הסדר והתנאים המוקדמים ב-`migrations/pending/APPLY-ORDER.md`.
‏**אני לא מחיל אותן בלי מילה ממך**, זה אחד מארבעת המצבים שבהם עוצרים. הן אינן
חוסמות את העלייה לאוויר: המערכת רצה על הסכימה הקיימת.

## ‏9. עותק של האתר הישן, אם אתה רוצה ששער ההשוואה החזותית יחזור לעבוד

‏**‏`CLAUDE.md` מחייב מדידה חזותית מתחת ל-11% בכל שלב, והמדידה הזאת בלתי אפשרית
היום.** ‏`scripts/compare.mjs` משווה את הבנייה שלנו לאתר שממנו היא נבנתה, וכל
כתובת ‏`LIVE_*` בו מצביעה על ‏`kenyonexpress.co.il`. **הדומיין הזה כבר מגיש
אותנו.** השער מסרב במפורש (יציאה ‏5) במקום להשוות את הבנייה שלנו לעצמה ולדווח
על ‏0% כאילו זו נאמנות מושלמת. נמדד היום, והסירוב נרשם מעצמו
ב-`docs/UI-PARITY-REPORT.md`.

‏**‏`refs/ke_live_*.html` אינם תחליף** ונבדקו: הם נשמרו עם כתובות יחסיות-לפרוטוקול,
ולכן תחת ‏`file:` כל ‏143 המשאבים נכשלים והעמוד נצבע מ-16 בלוקים מוטמעים בלי
תמונות. **וגם ‏Wayback נבדק ב-09.09 ואינו עובד** (‏31 תמונות שבורות ומרונדרות,
‏110 שניות לטעינה). הפירוט ב-`docs/PARITY-REFERENCE.md`, כולל הבקשה המפורשת לא
לחזור ולבדוק את ‏Wayback שוב.

‏**מה שיפתור:** גיבוי או snapshot של התקנת הוורדפרס הישנה, או גישה לאחסון הישן
כדי להריץ עליו ‏`scripts/capture-live-singlefile.mjs`. **רק לך יש את זה.** בלי
זה, כל טענה על "נאמנות חזותית" בפרויקט הזה אינה נמדדת, וזה כולל את מה שכתוב
במסמכים קודמים.

---

## מה **לא** ברשימה הזאת, ולמה

‏**‏`CRON_SECRET` וכן ‏`VOUCHER_QR_SECRET` כבר מוגדרים** על הפרויקט החי, שניהם
מלפני ‏10 ימים. כל טענה קודמת ששובר ‏QR אינו ניתן לחתימה בפרודקשן מיושנת.

‏**‏CSP ו-HSTS חיים.** נמדד בכותרות התגובה של פרודקשן:
‏`strict-transport-security: max-age=63072000; includeSubDomains; preload`,
ו-CSP מלא עם ‏`frame-ancestors 'none'` ו-`object-src 'none'`.

‏**המתזמן חי.** עשרת המסלולים הפרוסים עונים ‏401 לבקשה לא מאומתת, כלומר הם
סגורים לאינטרנט ו-`CRON_SECRET` תואם.

‏**‏`ALLOW_INCOMPLETE_ENV`** מוגדר על ‏`kenyonexpress-prod` בלבד, שאינו מגיש
לקוחות. אין צורך לגעת בו. על הפרויקט החי הוא אינו קיים, וזה הנכון:
‏`scripts/deploy-preflight.mjs` מסרב לבנות איתו.
