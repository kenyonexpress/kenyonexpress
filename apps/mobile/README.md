# apps/mobile — אפליקציית הלקוח (Expo)

## מה זה, ומה זה לא

אפליקציית React Native + Expo Router לפי `docs/ARCHITECTURE-MOBILE-SUPERAPP.md`.
**היא לא מממשת מחדש שום מסלול כסף.** ה-checkout רץ בתוך WebView על האתר עצמו,
דרך אותו `submitCheckout` ואותה `beginCheckout` שהדפדפן מריץ. זה D10 במסמך
הארכיטקטורה, וזו הסיבה שאין כאן עגלה, אין חישוב פיצול ואין קריאה ל-Cardcom.

## ‏⛔ היא מחוץ ל-workspace של pnpm, בכוונה

`pnpm-workspace.yaml` בשורש **אינו** מכיל `packages:`, והתיקייה הזאת לא נוספה
אליו. הסיבה נמדדה ולא שוערה: הוספת `react-native` ו-`expo` לעץ אחד עם Next
מכריחה את pnpm לפתור מחדש את כל התלויות של האתר, כולל את ה-`overrides` על
`sharp` שקיים כדי שמייעל התמונות בכלל יעבוד. שבירה שם היא אתר שלא נבנה.

לכן גם:

- `tsconfig.json` בשורש מוציא את `apps` מה-include.
- `biome.json` מתעלם מ-`apps`.
- `pnpm test` / `pnpm type-check` / `pnpm lint` בשורש **אינם בודקים את הקוד
  שכאן**. מה שכן נבדק בשערי השורש הוא כל הצד השרתי של האפליקציה, והוא הרוב:
  `src/lib/push/*`, `src/lib/app/deep-links.ts`, `src/app/api/app/*`.

התקנה ובדיקת טיפוסים של האפליקציה עצמה, בנפרד:

```bash
cd apps/mobile
pnpm install --ignore-workspace
pnpm type-check
```

## הגדרות שחייבות להיות לפני הרצה

| מפתח | איפה | למה |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | `.env` של האפליקציה או `extra` ב-`app.json` | בלעדיו אין התחברות |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | אותו מקום | המפתח הציבורי, אותו אחד שהאתר שולח לדפדפן |
| `extra.eas.projectId` | `app.json`, נוצר ב-`eas init` | בלעדיו `getExpoPushTokenAsync` נכשל |
| `PUSH_ENABLED=true` | **בשרת**, לא כאן | בלי זה הצנרת מדלגת על כל push ולא מונה ניסיון |

## ‏Deep links: שתי משפחות, לא להחליף ביניהן

- ‏`https://kenyonexpress.co.il/...` — **universal links**. זה מה שהולך למיילים,
  ל-push ולכל דבר שאדם עלול לשתף. נפתח באפליקציה אם היא מותקנת, ובאתר אם לא.
- ‏`kenyonexpress://` — **ערוץ פנימי בלבד**: חזרה מעמוד התשלום ו-redirect של
  OAuth. אף פעם לא במייל ואף פעם לא בשיתוף. טלפון בלי האפליקציה מציג שגיאה.

הסכמה מוגדרת פעם אחת ב-`src/lib/app/deep-links.ts` בצד השרת וב-`app.json` כאן.
שינוי באחד בלי השני שובר את החזרה מהתשלום.

## החזרה מהתשלום: שני מנגנונים, ואף אחד מהם לא מיותר

1. ‏`onShouldStartLoadWithRequest` מזהה את הקידומת `/checkout/app-return` וסוגר
   את ה-WebView לפני שהעמוד בכלל מצויר. זה המסלול הרגיל.
2. אם ה-3-D Secure העיף את המשתמש לדפדפן המערכת, אף אחד לא צופה בניווט — ואז
   העמוד `/checkout/app-return` עצמו קופץ ל-`kenyonexpress://`.

‏`status` בכתובת החזרה הוא **קישוט**. מצב ההזמנה האמיתי נקבע ב-webhook
וב-`GetLpResult` בצד השרת, ומסך `checkout/return` קורא אותו מהמסד.

## מה עוד לא נבנה כאן, ונאמר ולא הוסתר

- **‏QR של קופון לא מצויר באפליקציה.** צריך `react-native-qrcode-svg` +
  `react-native-svg`, שהם מודולים נייטיב שחייבים build שיוכיח אותם. עד אז מסך
  הקופון מציג את הקוד ופותח את עמוד הקופון באתר, שמצייר את ה-QR החתום.
- **אין קטלוג ואין עגלה באפליקציה.** ה-checkout נפתח על העגלה שנבנתה באתר,
  והגשר ב-`/api/app/session` הוא מה שמאפשר לזה לעבוד באותו חשבון.
- **לא בוצע build.** אין כאן EAS credentials, ולכן אף מסך לא רץ על מכשיר.
