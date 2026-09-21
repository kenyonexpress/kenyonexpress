# האפליקציה המותקנת (‏STORE-APP)

‏SECTIONS 87. נמדד ‏22.09.2026 מול ה-build ‏(`pnpm start` על ‏3311) ומול הקוד.

## למה המסמך הזה

הסעיף מונה: ליטוש ‏PWA להתקנה ‏(manifest, אייקונים, ‏splash, ‏prompt), תצורת
‏TWA ל-Google Play ‏(Bubblewrap), ‏meta ל-iOS, ‏deep links, ניווט כמו באפליקציה,
‏E2E. **חמישה מהשישה היו קיימים או הושלמו כאן; אחד, ה-TWA, נדחה במפורש בגלל
החלטה שכבר התקבלה ומתועדת, וזה כתוב למטה ולא הוסתר.**

| # | פריט | היה | נוסף ב-87 |
|---|------|-----|-----------|
| 1 | ‏manifest | ‏`src/app/manifest.ts` מוקלד, ‏standalone, ‏rtl, צבעים מהטוקנים, ‏3 אייקונים ‏(any 192/512 + maskable) | ‏`id: '/'`, ‏`prefer_related_applications: false`, ‏3 ‏shortcuts לדפים אמיתיים ‏(הטסט בודק שהם על הדיסק) |
| 2 | אייקונים | ‏`scripts/generate-pwa-icons.mjs` מייצר ‏192/512/maskable/apple-touch ‏180 מ-`public/logo.png` | — |
| 3 | ‏splash | **לא היה.** ‏Safari מציג לבן בפתיחה בלי ‏`apple-touch-startup-image` מדויק למכשיר | ‏`src/lib/pwa/splash.ts` ‏(10 מסכים, ‏iPhone SE עד ‏16 Pro Max), ‏`scripts/generate-pwa-splash.mjs` ‏(sharp, ‏9–24 ‏kB לקובץ), ‏`appleWebApp.startupImage` ב-layout. נמדד: ‏10 תגי ‏link בבית |
| 4 | ‏prompt התקנה | ‏`InstallPrompt.tsx`: ‏`beforeinstallprompt`, אחרי אינטראקציה, לא במסלולי הכסף, פעם אחת למכשיר, לא כשכבר ‏standalone | — |
| 5 | ‏TWA / Bubblewrap | לא היה | **נדחה.** ‏`docs/ARCHITECTURE-MOBILE-SUPERAPP.md` ‏§11.6 ‏D1: "עטיפות החנות ‏(TWA ל-Play, ‏Capacitor ל-App Store) **הוחלפו** ב-M1 ‏(RN+Expo); ‏PWA = גשר בלבד". האפליקציה לחנויות היא ‏`apps/mobile` ‏(`co.il.kenyonexpress.app`, ‏`docs/MOBILE-RELEASE.md`). תצורת ‏Bubblewrap הייתה מחיה החלטה שמתה ומעמידה שתי אפליקציות עם אותו שם בחנות |
| 6 | ‏meta ל-iOS | ‏`appleWebApp` ‏(capable, ‏title, ‏statusBarStyle), ‏apple-touch-icon, ‏theme-color | ‏`viewportFit: 'cover'` ‏(ה-tab bar כבר מרפד ב-`env(safe-area-inset-bottom)`), ‏startupImage |
| 7 | ‏deep links | **חסר, וזה היה פגם חי:** ‏`apps/mobile/app.json` מצהיר ‏`autoVerify: true` על ‏`/account`, ‏`/checkout`, ‏`/product` ו-`applinks:kenyonexpress.co.il`, ואף אחד משני הקבצים שהטלפון מחפש לא היה קיים | ‏`/.well-known/assetlinks.json` ו-`/.well-known/apple-app-site-association`: ‏route handlers מ-`src/lib/pwa/deep-links.ts`, מונעי ‏env ‏(`ANDROID_APP_SHA256_FINGERPRINTS`, ‏`IOS_APP_TEAM_ID`), **‏404 עד שהערכים מוגדרים**. הטסט מוודא שהמזהים והנתיבים שווים למה שב-`app.json` |
| 8 | ניווט כמו באפליקציה | ‏`BottomTabBar` ‏(md:hidden, ‏safe-area), ‏`/offline` סטטי, ‏`public/sw.js` עם ‏network-first לניווט | ‏shortcuts במניפסט |
| 9 | ‏E2E | לא היה ‏spec ל-PWA | ‏`e2e/pwa.spec.ts`: מניפסט וכל אייקון שהוא מונה, ‏sw.js, ‏`/offline`, תגי ‏iOS ו-10 תמונות פתיחה שכולן ‏200, וקבצי ה-deep-link ‏(404 או ‏JSON תקין, לעולם לא ‏placeholder). **‏8/8 עוברים** ב-chromium ו-mobile-chrome |

## מה נמדד

| בדיקה | תוצאה |
|-------|-------|
| ‏`/manifest.webmanifest` | ‏200, ‏`application/manifest+json` |
| ‏`/sw.js` | ‏200, ‏`application/javascript` |
| ‏`/.well-known/assetlinks.json`, ‏`/.well-known/apple-app-site-association` | ‏404 ‏(ה-env לא מוגדר; זו התשובה הנכונה) |
| ‏`/splash/*.png` | ‏10 קבצים, ‏9,447 עד ‏23,750 בייט, ‏200 |
| תגי ‏`apple-touch-startup-image` בבית | ‏10 |
| ‏`viewport` | ‏`width=device-width, initial-scale=1, viewport-fit=cover` |
| ‏`mobile-web-app-capable` | ‏Next 16 כותב את השם התקני ולא ‏`apple-`; ‏iOS ‏17.4+ מכבד אותו, וה-spec מקבל את שניהם |

## איך מפעילים את ה-deep links ‏(צעדי בעלים)

1. ‏Play Console → ‏App integrity → ‏App signing → ‏SHA-256 של מפתח החתימה ‏(של
   ‏Google, לא של ה-upload). לשים ב-`ANDROID_APP_SHA256_FINGERPRINTS` ב-Vercel
   ‏(פסיקים בין כמה טביעות אצבע).
2. ‏Apple Developer → ‏Membership → ‏Team ID. לשים ב-`IOS_APP_TEAM_ID`.
3. **לפרוס מחדש.** שני ה-routes הם ‏`○` ‏(סטטיים) ב-build, כך שה-env נקרא בזמן
   ה-build ולא בכל בקשה. זה מכוון: הקבצים נמשכים על ידי ‏Google ו-Apple דרך
   ‏CDN ואין סיבה שיהיו דינמיים.
4. לוודא: ‏`curl -sI https://kenyonexpress.co.il/.well-known/apple-app-site-association`
   מחזיר ‏200 ו-`application/json` בלי ‏redirect ‏(Apple מסרב ל-redirect).

## החלטות

- **‏TWA נדחה** ‏(#5 למעלה). לא החלטה חדשה: ציטוט של ‏D1→M1.
- **‏404 ולא ‏placeholder** בקבצי ה-deep-link. קובץ עם טביעת אצבע מזויפת אינו
  "כמעט מוגדר": מערכת ההפעלה שומרת תוצאת אימות כושלת ליום.
- **‏splash מיוצר, לא מצויר ידנית**, מאותה סיבה שהאייקונים: כשהלוגו או טבלת
  המכשירים משתנים, מריצים סקריפט. הטסט קורא ‏IHDR ובודק גודל בפיקסלים.
- **‏related_applications לא הוצהר.** האפליקציה עוד לא בחנות; מזהה שאינו קיים
  ב-Play היה מייצר כפתור התקנה שבור.

## מה לא נעשה

- תצורת ‏Bubblewrap ‏(ראה ‏#5).
- צילומי מסך ‏(`screenshots`) במניפסט, שמאפשרים ל-Chrome להציג דיאלוג התקנה
  עשיר: דורשים צילומים אמיתיים במידות קבועות, ולא מתמונת ‏placeholder.
- הערכים עצמם של ה-env ‏(בעלים).

## קבצים

- ‏`src/lib/pwa/deep-links.ts` ‏(+test), ‏`src/app/.well-known/{assetlinks.json,apple-app-site-association}/route.ts`, ‏`.env.example`
- ‏`src/lib/pwa/splash.ts` ‏(+test), ‏`scripts/generate-pwa-splash.mjs`, ‏`public/splash/*.png`
- ‏`src/app/layout.tsx`, ‏`src/app/manifest.ts` ‏(+test), ‏`e2e/pwa.spec.ts`
