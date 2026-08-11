# INDEX.md

אינדקס **עשרת מסמכי ספרינט התיעוד** (31 ביולי עד 2 באוגוסט 2026), על branch:

```
arch/docs-queue
```

האינדקס המלא של כל ה-docs בפרויקט: `ARCHITECTURE-DOCS-INDEX.md`. הקובץ הזה מסכם את העשירייה שנכתבה/הורחבה בספרינט הזה, עם מה יש בכל אחת.

חוט השדרה של כולם: קופון = גביית מלוא `coupon_price_ils` באתר, נשארת בפלטפורמה; **אין Escrow**; פיזי = פיצול לפי `platform_percent` דינמי שמצולם על שורת ההזמנה; כל הכסף באגורות integer.

---

## שער ותפעול

| # | מסמך | מה בפנים |
|---|---|---|
| 1 | [ARCHITECTURE-GO-LIVE-CHECKLIST.md](./ARCHITECTURE-GO-LIVE-CHECKLIST.md) (rev E) | שערי שיגור P0/P1/P2 עם ראיות: דומיין/DNS/SSL, ‏Vercel, ‏env, ‏Cardcom prod, ‏Sentry, גיבויים, שערי A/V/N/Q/S מלאים, סקריפט smoke ידני, 72 השעות הראשונות |
| 9 | [ARCHITECTURE-ADMIN-DASHBOARD-SPEC.md](./ARCHITECTURE-ADMIN-DASHBOARD-SPEC.md) (rev A) | מפרט מסך-אחר-מסך לאדמין: products עם שדות הכסף הדינמיים, suppliers, orders עם פילטר חריגים, יומן מימושים, settlements דו-שלבי, מטריצת הרשאות |
| 10 | [OPERATIONS-RUNBOOK.md](./OPERATIONS-RUNBOOK.md) (rev A) | תפעול יומי: שגרת בוקר, הוספת מוצר, אישור ספק, תשלום נכשל, webhook שלא הגיע, קופון שלא נסרק, גבולות פעולות ידניות |

## ספקים ולקוחות

| # | מסמך | מה בפנים |
|---|---|---|
| 2 | [ARCHITECTURE-SUPPLIER-ONBOARDING.md](./ARCHITECTURE-SUPPLIER-ONBOARDING.md) (rev C) | תהליך צירוף מלא עם SLA, מסמכים, טופס קליטה, הגדרת percent/coupon_price, ‏FAQ כסף לספקים, ‏offboarding כולל קופונים פתוחים |
| 5 | [ARCHITECTURE-CUSTOMER-SUPPORT.md](./ARCHITECTURE-CUSTOMER-SUPPORT.md) (rev D) | טיקטים, מטריצת החזרים לפי סטטוס voucher, החזר חלקי פר שורה, ‏chargeback, זיכוי ארנק, תבניות מקרו מחייבות |

## מדידה ואבטחה

| # | מסמך | מה בפנים |
|---|---|---|
| 3 | [ARCHITECTURE-ANALYTICS.md](./ARCHITECTURE-ANALYTICS.md) (rev D) | ‏GA4 + אירועי שרת, קטלוג אירועים כולל `checkout_step`, ‏mart יומי, דשבורד מכירות, התראות אנומליה, UTM |
| 4 | [ARCHITECTURE-SECURITY-AUDIT.md](./ARCHITECTURE-SECURITY-AUDIT.md) (rev A) | תוכנית ביקורת: RLS probes עם מטריצת ציפיות, סריקת bundle, ‏headers, תלויות, רישום ממצאים עם SLA, תרחישי pentest לפני שיגור |

## מיגרציה, משפטי, שיווק

| # | מסמך | מה בפנים |
|---|---|---|
| 6 | [ARCHITECTURE-WP-MIGRATION-PLAN.md](./ARCHITECTURE-WP-MIGRATION-PLAN.md) (rev A) | חוזה מיפוי שדה-מול-שדה מה-WXR האמיתי (48 מוצרים, 11 קטגוריות, 404 מדיה), סדר ייבוא, rollback, שערי MAP |
| 7 | [ARCHITECTURE-LEGAL-PAGES.md](./ARCHITECTURE-LEGAL-PAGES.md) (rev A) | תקנון, מדיניות ביטולים לפי חוק הגנת הצרכן (14ג, דמי ביטול, שאלת סיווג 14ח), פרטיות (כולל תיקון 13), הצהרת נגישות |
| 8 | [ARCHITECTURE-LAUNCH-MARKETING.md](./ARCHITECTURE-LAUNCH-MARKETING.md) (rev A) | טבלת 301 מ-WP, ‏Google Merchant עם סייג קופונים, קמפיין תלת-שלבי עם UTM מחייב ושערי עצירה |

---

## סדר קריאה מומלץ

- לפני שיגור: 1 → 4 → 7
- ליום-יום אחרי שיגור: 10 → 9 → 5
- לצירוף ספק חדש: 2
- ל-cutover מ-WP: 6 → 8

## Revision

| Date | Change |
|---|---|
| 2026-08-02 | אינדקס עשרת מסמכי הספרינט |
