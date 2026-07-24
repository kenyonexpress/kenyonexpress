# GO-LIVE

צ'קליסט העלאה לאוויר של kenyonexpress.co.il. כל שורה היא שער: לא ממשיכים עד
שהיא ירוקה. הרקע הארכיטקטוני: `ARCHITECTURE-DEPLOYMENT.md`.

## שלב 0: הקפאה

- [ ] ‏`phase5/homepage` ירוק מלא: ‏type-check, ‏vitest, ‏build, ‏reset מקומי מאפס.
- [ ] אין worktrees וענפים פתוחים מלבד הענף הראשי (ראה STATE.md, יום המיזוג).
- [ ] תג release חתום על ה-commit המועמד.

## שלב 1: סביבה

- [ ] כל משתני ה-[required] מ-`.env.example` מוגדרים ב-Vercel (server env).
- [ ] ‏`VOUCHER_QR_SECRET` הוגרל (32+ bytes) ונשמר במנהל סודות.
- [ ] ‏`CHECKOUT_ENABLED=false` עד שער התשלומים (שלב 4).
- [ ] אימות שאין secret בשום bundle לקוח: ‏grep על ‏`.next/static`.

## שלב 2: מסד נתונים

- [ ] גיבוי מלא של הפרודקשן לפני כל החלה.
- [ ] החלת 052..057 בלבד, אחת-אחת, דרך MCP, עם SELECT אימות אחרי כל אחת.
- [ ] **לא** מחילים 058-065 (משפחת האגורות) לפני cutover קוד.
- [ ] ‏`SELECT count(*) FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity;` חייב להחזיר 0.
- [ ] מילוי `platform_percent` פר מוצר חי, ואז החלת 050 (שער החובה שלה).
- [ ] מילוי `coupon_price_ils` לכל מוצר קופון פעיל (המודל המחייב: מחיר מוחלט).

## שלב 3: תוכן ונתונים

- [ ] ריצת ה-WP import ביבש (`WP_IMPORT_ALLOW_WRITES` לא מוגדר) ובדיקת דוח.
- [ ] ייבוא אמת רק מול staging מקומי, אימות, ורק אז החלטה על פרודקשן.
- [ ] תמונות: pipeline R2 פעיל או fallback ל-Supabase Storage מאומת.
- [ ] ‏alt עברי לכל תמונת מוצר (חסימת ההעלאה כבר אוכפת).

## שלב 4: תשלומים (שער נפרד)

- [ ] ארבעת משתני Cardcom + secret ה-webhook בסביבה.
- [ ] עסקת בדיקה בטרמינל בדיקות: תשלום, webhook, הנפקת ואוצ'ר, סריקה, פקיעה.
- [ ] ‏refund בדיקה עובר.
- [ ] רק אז: ‏`CHECKOUT_ENABLED=true`.

## שלב 5: אחרי ההעלאה

- [ ] ‏Lighthouse מובייל על עמוד הבית, מוצר, קטגוריה (baseline: ‏LCP ‏9.2s, יעד שיפור).
- [ ] מעקב לוגים: ‏webhooks, ‏4xx/5xx, ‏RLS denials, שגיאות cron.
- [ ] ‏DNS + HSTS preload רק אחרי 48 שעות יציבות.
- [ ] עדכון STATE.md עם תאריך ה-go-live ורשימת החריגים שנצפו.

## נקודת חזרה

כל שלב הפיך: ‏Vercel rollback לפריסה קודמת, ‏DB restore מהגיבוי של שלב 2.
‏`CHECKOUT_ENABLED=false` הוא הבלם המהיר אם התשלומים מתנהגים חריג.
