# מלאי קוד מת — ממתין לאישור מחיקה

‏נמדד ‏02.09.2026 (‏STEP 83). **מחיקת קבצים היא עצירה קשה לפי כללי
הפרויקט**, ולכן זה מלאי לאישור אופיר, לא מחיקה שבוצעה.

## מת מוכח, בטוח למחיקה

| מה | ראיה |
| --- | --- |
| `drizzle-orm` + `drizzle-kit` (‏package.json) | אפס imports בכל ‏src/apps/scripts/e2e מלבד ‏src/db עצמו |
| `src/db/schema/commerce.ts` + `commerce-managed.ts` | לא מיובאים מאף מקום (האזכור היחיד — הערה בטסט); תפקיד "הסכימה כקוד" שייך ל-`src/types/database.ts` (שנוצר מפרודקשן) ול-`supabase/migrations/` |
| `drizzle.config.ts` | משרת רק את השניים למעלה |

צעד המחיקה, כשמאושר:

```bash
git rm -r src/db drizzle.config.ts
pnpm remove drizzle-orm drizzle-kit
pnpm type-check && pnpm test && pnpm build
```

## נבדק ונמצא חי (לא למחוק)

- ‏`node-forge` — חתימת pkpass (‏wallet), עם טסט.
- ‏`qrcode` — ‏QR לשוברים (‏qr-image.ts).
- ‏`recharts` — דשבורד האנליטיקות.

## הערת הקשר

הספק של STEP 26 ביקש "‏SQL aggregates עם drizzle" — אבל ה-ORM מעולם לא
חובר; שכבת הנתונים כולה ‏supabase-js. התלות נכנסה בשלב מוקדם ונשארה.
