# MISSION-FINAL — הרצה עד סיום הפרויקט

## חוקי המשך (כל סשן חדש קורא את זה קודם)
- קרא: STATE.md, CLAUDE.md, docs/BUSINESS-MODEL.md, MISSION-FINAL.md
- עבוד אוטונומי, אשר הכל, עצור רק על: push לפרודקשן / מחיקת DB / הרצת migration בפועל / DNS cutover
- אחרי כל שלב: commit + push + עדכון STATE.md עם "המשך מ: [שלב]"
- שאלות פתוחות: כתוב ל-docs/QUESTIONS-FOR-OFIR.md — אל תעצור בגללן, קבל החלטה זמנית סבירה, סמן אותה
- דו"ח בוקר: עדכן docs/MORNING-REPORT.md אחרי כל שלב שהושלם

## מודל עסקי (מוחלט, דורס הכל)
- קופון: coupon_price סכום מוחלט שאדמין מגדיר. לקוח משלם אותו במלואו באתר (Cardcom). יתרה בבית העסק בסריקה. אין Escrow. אחרי סריקה — פג לצמיתות.
- פיזי: תשלום מלא באתר, פיצול לפי platform_percent פר-מוצר, snapshot ל-order_items.
- כסף: agorot שלמים, לעולם לא floats (packages/money.ts).
- Checkout: Guest Cart פתוח, login Google רק בתשלום, token נשמר.
- ארנק פנימי בלבד. אין tenant_id, RLS לפי auth.uid. התראות: Supabase+Resend בלבד.
- תיאור: שדה אחד. offer_valid_until מוצג + פג אוטומטית. פרטי ספק בכל דף מוצר.

## תור סגור עד סיום (לפי סדר, המשך מהנקודה ב-STATE.md)
1. merge 4 ענפי הלילה ל-phase5/homepage: voucher → wallet → supplier → arch-night. פתור conflicts, טסטים ירוקים אחרי כל merge.
2. תקן את packages/payments למודל הנכון (מחק escrow/5%/10%), כל הטסטים מחדש.
3. Checkout מקצה לקצה: cart → login → Cardcom LowProfile sandbox → webhook → order+voucher → דף הצלחה QR. E2E Playwright.
4. איחוד migrations: סדר הרצה נקי מ-0, idempotent, dry-run מקומי. אל תריץ על Supabase remote.
5. compare.mjs על כל הדפים: home, product, category, cart, checkout — כולם מתחת 11%.
6. WP import pipeline לפי ARCHITECTURE-WP-IMPORT-PIPELINE.md — dry-run על data-import/wp-backup.
7. QA מלא לפי docs/qa checklist + תיקון כל באג.
8. lighthouse + accessibility + RTL audit על כל דף.
9. עדכון MORNING-REPORT.md: מה הושלם, מה נשאר, שאלות קריטיות מסודרות.
