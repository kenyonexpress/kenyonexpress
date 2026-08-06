# QA ויזואלי: דף הבית מול electro home-v7

סטטוס 2026-08-06: **לא בוצע, localhost לא עולה עם דאטה.**

מה נבדק בפועל בסביבה המרוחקת:

1. pnpm install + pnpm dev רצים, השרת עונה.
2. דף הבית מחזיר 500 (__next_error__): קריאות Supabase חסומות ברשת של הסביבה, ואין fallback. אין דף לרנדר, אין מה להשוות.
3. בנוסף electro.madrasthemes.com חסום מכאן (proxy 403 + Cloudflare), כך שגם צד ההשוואה לא זמין.

לפי ההנחיה: נרשם, עוברים הלאה.

ההשלמה מהמחשב (שני הצדדים זמינים שם):

```bash
node scripts/compare.mjs
node scripts/qa-local-site.mjs
```

וההשוואה המפורטת סקשן-סקשן קיימת חלקית כבר ב-repo מהעבודה הקודמת: refs/band-*-live מול refs/band-*-mine ו-DESIGN-MEASURED.md.

הערה קשורה: הסיבה שאין דאטה היא ממצא בפני עצמו. הקטלוג ריק גם ב-DB החי (products/categories/coupons = 0 שורות, ראה qa-localhost-container-findings.md). גם במחשב דף הבית יעלה ריק עד שנטען סיד.
