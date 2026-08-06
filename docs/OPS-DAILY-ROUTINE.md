# OPS-DAILY-ROUTINE.md

שגרת בוקר של 15 דקות. מה בודקים, איפה, ובאיזה סדר.

Status: **RUNBOOK** · 2026-08-07 · Scope: docs only
משלים את `RUNBOOK-PRODUCTION.md` (QA-PASS #5), שמטפל בתקלה. זה מטפל ביום רגיל.

**עקרון הסדר:** מלמעלה למטה לפי **כמה מהר זה נהיה יקר**. כסף שלא נסגר עולה
בשעות. ‏SEO עולה בשבועות. לכן כסף ראשון, ולא הדשבורד היפה.

---

## התור, ‏15 דקות

| # | מה | איפה | דקות |
|---|---|---|---|
| 1 | תשלומים שנתקעו | ‏SQL | 3 |
| 2 | ‏webhooks שנדחו | ‏SQL | 2 |
| 3 | מימושים של אתמול | ‏SQL | 2 |
| 4 | מוצרים שממתינים לאישור | אדמין | 2 |
| 5 | שגיאות | ‏Sentry | 2 |
| 6 | ה-deploy האחרון | ‏Vercel | 1 |
| 7 | תוקף שוברים ומיילים | ‏SQL | 2 |
| 8 | פעם בשבוע: advisors + גיבוי | ‏Supabase | 1 |

---

## 1. תשלומים שנתקעו — 3 דקות

**זה הסעיף היחיד שאם תעשה רק אותו, עשית את העיקר.** הזמנה שהלקוח שילם עליה
ולא נסגרה היא לקוח ששילם ולא קיבל שובר.

```
Supabase > SQL Editor:
```

```sql
select id, status, created_at, now() - created_at as age
from public.orders
where status not in ('paid','refunded','cancelled')
  and created_at > now() - interval '2 days'
  and created_at < now() - interval '30 minutes'
order by created_at desc;
```

**מה מצופה:** אפס שורות.

**אם יש שורות:** ההזמנה עברה את חלון ה-webhook ולא נסגרה. אל תסמן ידנית
`paid`. הדרך הנכונה היא לאמת מול Cardcom (`GetLpResult` הוא מקור האמת היחיד),
ורק לפיו לפעול. ראה `RUNBOOK-PRODUCTION.md`.

**‏30 דקות ולא 5:** ה-webhook חוזר על עצמו, ויש גם מסלול גיבוי בדף החזרה.
סף קצר מדי ייצור אזעקה על הזמנות שנסגרות מעצמן.

---

## 2. Webhooks שנדחו — 2 דקות

```sql
select created_at, signature_valid, external_event_id
from public.payment_webhook_events
where created_at > now() - interval '24 hours'
  and signature_valid = false
order by created_at desc
limit 20;
```

**מה מצופה:** אפס.

**שים לב לשם המטעה:** ‏`signature_valid` **אינה** בדיקת חתימה. ל-Cardcom אין
חתימת webhook כלל. העמודה אומרת "הסוד ב-`?s=` בכתובת התאים". שורה עם `false`
פירושה **מישהו פנה ל-webhook בלי הסוד**, כלומר סריקה או ניסיון, לא תקלת סליקה.
זה רשום כפער `G7` ב-`GAPS-CODE-VS-DOCS.md`.

**כמה שורות בודדות ביום** מבוטים אקראיים הן רעש. **עשרות** הן ניסיון ממוקד:
החלף את `CARDCOM_WEBHOOK_SECRET` ועדכן את ה-IndicatorUrl.

---

## 3. מימושים של אתמול — 2 דקות

```sql
select outcome, count(*)
from public.voucher_redemptions
where created_at > now() - interval '24 hours'
group by outcome
order by 2 desc;
```

**`outcome` הוא כל העניין.** הטבלה מתעדת **גם סריקות שנכשלו**, ולכן:

| מה שרואים | מה זה אומר |
|---|---|
| רק `success` | יום תקין |
| ‏`already_redeemed` בודדים | לקוח שניסה פעמיים. נורמלי |
| ‏`already_redeemed` רבים מאותו ספק | הצוות לא מבין את המסך, או קוד דלף |
| ‏`wrong_supplier` | מנסים לסרוק שובר של עסק אחר. קוד שדלף |
| ‏`unauthorized` / `rate_limited` | סורק בלי הרשאה, או יותר מדי ניסיונות |
| ‏`invalid_signature` | ‏QR מזויף או `VOUCHER_QR_SECRET` שהוחלף בלי `_PREVIOUS` |
| ‏`expired` רבים | תוקף קצר מדי בקטגוריה. עניין תוכן, לא באג |

ערכי ה-enum המלאים (`voucher_scan_outcome`): `success`, `already_redeemed`,
`expired`, `cancelled`, `refunded`, `wrong_supplier`, `not_found`,
`invalid_signature`, `invalid_request`, `unauthorized`, `rate_limited`.

**לעולם אל תספור הכנסה מהטבלה הזו בלי `where outcome = 'success'`.** ספירה
בלי הסינון סופרת ניסיונות כמימושים.

---

## 4. מוצרים שממתינים לאישור — 2 דקות

```
האתר > /admin/approvals
```

עבור על מה שהוגש. שלוש שאלות בלבד, והן מ-`CONTENT-PLAYBOOK.md`:

1. יש `platform_percent`? (בלעדיו המוצר לא ייכנס לאוויר ממילא)
2. ‏`coupon_terms_he` מכיל את **היתרה לתשלום בעסק** ואת שורת הביטול
   ‏(‏5% או 100 ש"ח, הנמוך)?
3. התמונה הראשונה היא המוצר ולא לוגו?

**מוצר שנתקע יומיים בתור הוא ספק שמאבד אמון.** זה הסעיף שהכי משתלם לא לדחות.

---

## 5. שגיאות — 2 דקות

```
Sentry > Issues > Last 24h
```

מיין לפי **שכיחות**, לא לפי חדשות. שגיאה אחת מעניינת פחות משגיאה שקרתה 200 פעם.

**מה שמצדיק עצירה מיידית:** כל דבר מ-`src/server/actions/payments/**` או
מ-`src/server/payments/**`. כל השאר יכול לחכות לסוף היום.

לכל שגיאה יש `request_id`. הוא מקשר את שורת השרת, את ה-API ואת התגובה ללקוח,
והוא הדרך היחידה לקשור תלונת לקוח לאירוע.

---

## 6. ה-deploy האחרון — דקה

```
Vercel > Deployments
```

ירוק, ומהזמן שאתה מצפה לו. **‏deploy שלא ציפית לו הוא הדבר היחיד ברשימה שמצדיק
לעצור הכול ולברר** לפני שתמשיך.

---

## 7. תוקף שוברים ומיילים — 2 דקות

```sql
select count(*) filter (where status = 'issued'
         and expires_at between now() and now() + interval '7 days') as expiring_week,
       count(*) filter (where status = 'issued'
         and expires_at < now())                                    as expired_not_closed
from public.vouchers;
```

- **`expiring_week`**: אלה שיקבלו תזכורת. אם המספר גדול ו-Resend שקט, בדוק
  שהדומיין עדיין מאומת.
- **`expired_not_closed` חייב להיות 0.** שובר שפג ולא סומן פירושו שה-cron של
  `expire-vouchers` לא רץ. **הכסף כאן אמיתי:** בפקיעה בלי מימוש הלקוח מקבל
  זיכוי לארנק, וזיכוי שלא ניתן הוא חוב שלך שלא נרשם.

---

## 8. שבועי — דקה

```
Supabase > Advisors
```

בדוק Security ו-Performance. **טבלה חדשה בלי RLS תופיע כאן ראשונה**, וזה
הממצא שהכי כדאי לתפוס בשבוע ולא ברבעון.

השער הקבוע:

```sql
select count(*) from pg_tables
where schemaname = 'public' and not rowsecurity;
```

חייב להחזיר **0**.

בנוסף: ודא שהגיבוי האוטומטי של Supabase רץ (‏`ARCHITECTURE-BACKUP-DR.md`).

---

## מה **לא** ברשימה, בכוונה

| לא בודקים יומית | למה |
|---|---|
| ‏Lighthouse / ‏Core Web Vitals | זז בשבועות. פעם בחודש |
| דוחות מכירה | ‏`/admin/dashboard` מספיק. לניתוח יש זמן קבוע אחר |
| מסך ה-payouts | **שבור.** אין `payout_statements` בפרודקשן (‏G1). אין מה לבדוק שם עד שייבנה |
| דירוגי גוגל | תנודה יומית היא רעש |

---

## אם יש רק 3 דקות

סעיף 1 (תשלומים תקועים) וסעיף 6 (ה-deploy). כל השאר שורד יום.

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-07 | נכתב. השאילתות מול הסכימה החיה, לא מהזיכרון |
