# QA ויזואלי: עמוד מוצר מול תבנית electro

סטטוס 2026-08-06: **לא בוצע, localhost לא עולה עם דאטה.**

אותה סיבה כמו דף הבית (ראה qa-visual-homepage.md): אין מוצרים ב-DB (הקטלוג ריק גם בפרויקט ה-Supabase החי), אז אין עמוד מוצר לרנדר, וגם עמוד המוצר של electro חסום מהסביבה הזאת.

לפי ההנחיה: נרשם, עוברים הלאה.

ההשלמה מהמחשב אחרי טעינת סיד:

```bash
node scripts/compare-product-live.mjs
node scripts/qa-local-site.mjs
```

חומר קיים ב-repo לצורך ההשוואה: refs/electro_product_page.mhtml (עותק שמור של עמוד מוצר electro), refs/crop-p-live-* מול refs/crop-p-mine-*, ו-refs/live-product.png.
