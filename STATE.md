# KenyonExpress — Project State

Updated: 2026-10-28 (M18-c246: STATE.md קוצר; הגרסה המלאה הועברה ל-docs/STATE-ARCHIVE.md. נשארו רק הרשומות האחרונות.)

**המשך מ: M01-c242 BLOCKED reference-gone (home gate refused at 380/768/1440, no diff measured)**
Updated: 2026-10-28 (M03-c242: `compare.mjs --page=category` ב-380 / 768 / 1440 הורץ מול dev על :3000 (200) ו**סורב** בשלושת הרוחבים, ללא מספר diff. `kenyonexpress.co.il` מגיש את הבילד שלנו (32-34 הפניות `/_next/`, אין wp-content), כך שהשוואה תהיה בילד מול עצמו. לא נערכו קבצי קוד ולא קבצים נעולים; הסירוב לא עוקף. ראה docs/PARITY-REFERENCE.md.)
**המשך מ: M03-c242 BLOCKED reference-gone (category gate refused at 380/768/1440, no diff measured)**
Updated: 2026-10-28 (M02-c243: `compare.mjs --page=product` ב-380 / 768 / 1440 הורץ שוב מול dev על :3000 (200) ו**סורב** בשלושת הרוחבים, ללא מספר diff. `kenyonexpress.co.il/product/מוצר-לדוגמא/` מגיש את הבילד שלנו (33-34 הפניות `/_next/`, אין wp-content), כך שהשוואה תהיה בילד מול עצמו. שלוש שורות `REFUSED` נוספו ל-`docs/UI-PARITY-REPORT.md`. לא נערכו קבצי קוד ולא קבצים נעולים; הסירוב לא עוקף. ראה docs/PARITY-REFERENCE.md.)
**המשך מ: M02-c243 BLOCKED reference-gone (product gate refused at 380/768/1440, no diff measured)**
Updated: 2026-10-28 (M01-c244: `compare.mjs --page=home` ב-380 / 768 / 1440 הורץ שוב מול dev על :3000 (200) ו**סורב** בשלושת הרוחבים, ללא מספר diff. המסמך ב-`kenyonexpress.co.il` ללא סימני WordPress או Next, כך שאין צד שמאל למדידה. שלוש שורות `REFUSED` נוספו ל-`docs/UI-PARITY-REPORT.md`. לא נערכו קבצי קוד ולא קבצים נעולים; הסירוב לא עוקף. ראה docs/PARITY-REFERENCE.md.)
**המשך מ: M01-c244 BLOCKED reference-gone (home gate refused at 380/768/1440, no diff measured)**
**המשך מ: M06-c244 DONE (pnpm build עבר נקי; הדריפט היחיד היה 6 שורות REFUSED של product/category ב-docs/UI-PARITY-REPORT.md, נעשה להן commit)**
Updated: 2026-10-28 (M01-c245: `compare.mjs --page=home` ב-380 / 768 / 1440 הורץ שוב מול dev על :3000 (200). מול `kenyonexpress.co.il` סורב בשלושת הרוחבים (reference-gone, 30-32 הפניות `/_next/`). ניסיון נוסף מול `refs/electro-home-v7.html` (--live=file://) עבר את בדיקת הזהות אך סורב בשלושת הרוחבים: תמונות שלא נטענו ב-reference (13/10/4 ב-380/768/1440, 0 מקומית). לא הופעל COMPARE_ALLOW_PENDING_IMAGES כדי לא לייצר מספר מטעה. אין מספר diff. לא נערכו קבצי קוד ולא קבצים נעולים.)
**המשך מ: M01-c245 BLOCKED reference-gone (home gate refused at 380/768/1440, no diff measured)**
Updated: 2026-10-28 (M01-c246: `compare.mjs --page=home` ב-380 / 768 / 1440 הורץ שוב מול dev על :3000 (200) ו**סורב** בשלושת הרוחבים, ללא מספר diff. `kenyonexpress.co.il` מגיש את הבילד שלנו (32/30/30 הפניות `/_next/`, אין wp-content), כך שהשוואה תהיה בילד מול עצמו. לא נערכו קבצי קוד ולא קבצים נעולים; הסירוב לא עוקף. ראה docs/PARITY-REFERENCE.md.)
**המשך מ: M01-c246 BLOCKED reference-gone (home gate refused at 380/768/1440, no diff measured)**
**המשך מ: M18-c246 DONE**
Updated: 2026-10-28 (M01-c247: `compare.mjs --page=home` ב-380 / 768 / 1440 הורץ שוב מול dev על :3000 (200). מול `kenyonexpress.co.il` סורב בשלושת הרוחבים (reference-gone, 30-32 הפניות `/_next/`). מול `refs/electro-home-v7.html` (--live=file://) עבר את בדיקת הזהות אך סורב בשלושת הרוחבים: תמונות שלא נטענו ב-reference (12/8/4 ב-380/768/1440, 0 מקומית). לא הופעל COMPARE_ALLOW_PENDING_IMAGES כדי לא לייצר מספר מטעה. אין מספר diff. לא נערכו קבצי קוד ולא קבצים נעולים.)
**המשך מ: M01-c247 BLOCKED reference-gone (home gate refused at 380/768/1440, no diff measured)**
Updated: 2026-10-28 (M03-c247: `compare.mjs --page=category` ב-380 / 768 / 1440 הורץ מול dev על :3000 (200) וסורב בשלושת הרוחבים: `kenyonexpress.co.il/product-category/hot-deals/` מגיש את הבילד שלנו (32-34 הפניות `/_next/`, אין wp-content). אין ב-refs קובץ Electro v7 לקטגוריה (רק home ו-product), ולכן אין reference חלופי. אין מספר diff. לא נערכו קבצי קוד ולא קבצים נעולים. ראה docs/PARITY-REFERENCE.md.)
**המשך מ: M03-c247 BLOCKED reference-gone (category gate refused at 380/768/1440, no diff measured)**
