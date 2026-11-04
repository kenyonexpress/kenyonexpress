# מלאי קוד מת

‏נמדד ‏02.09.2026 (‏STEP 83). **מחיקת קבצים היא עצירה קשה לפי כללי
הפרויקט**, ולכן זה היה מלאי לאישור אופיר, לא מחיקה שבוצעה.

**‏05.11.2026 (‏M09-c361): נמחק.** תור הסגירה מורה להסיר תלויות וקוד מת בלי
לשאול. ‏`src/db/schema/` ו-`drizzle.config.ts` הוסרו, וכך גם שתי התלויות.
‏`src/db/__tests__/` נשאר: אלה טסטי ‏RLS על ‏supabase-js, לא ‏Drizzle.
הפירוט ב-`docs/M09-c361.md`.

## מת מוכח, נמחק ב-05.11

| מה | ראיה |
| --- | --- |
| `drizzle-orm` + `drizzle-kit` (‏package.json) | אפס imports בכל ‏src/apps/scripts/e2e מלבד ‏src/db עצמו |
| `src/db/schema/commerce.ts` + `commerce-managed.ts` | לא מיובאים מאף מקום (האזכור היחיד — הערה בטסט); תפקיד "הסכימה כקוד" שייך ל-`src/types/database.ts` (שנוצר מפרודקשן) ול-`supabase/migrations/` |
| `drizzle.config.ts` | משרת רק את השניים למעלה |

צעד המחיקה שבוצע:

```bash
git rm -r src/db/schema drizzle.config.ts
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
