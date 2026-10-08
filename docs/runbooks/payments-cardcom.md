# ‏Runbook: סליקה (‏Cardcom)

| שדה | ערך |
| --- | --- |
| רכיב | ‏checkout, דף ‏LowProfile, ‏webhook, ‏finalize, החזרים, חשבוניות |
| ספק | ‏Cardcom, ממשק ‏legacy ‏`/Interface/*.aspx`; תמיכה ‏03-9436100 |
| כרטיס ב-/admin/health | `cardcom` (קונפיגורציה בלבד; אין ‏endpoint בלי תופעות לוואי) |
| כונן | אופיר |
| חומרה ברירת מחדל | ‏SEV1 תמיד. כסף. |
| סולם הסלמה | ‏`README.md` §סולם ההסלמה |

**כלל ראשון: ‏`ChargeToken.aspx` ו-`RefundDeal.aspx` לעולם לא מנוסים שוב.** אין
‏idempotency key בממשק הזה; ‏POST שני הוא חיוב שני. הקוד מנסה שוב רק קריאות
קריאה (‏`GetLpResult`, ‏`ListTransactions`, ‏`LowProfile`) ורק על כשל תעבורה.

## 1. רדיוס פגיעה

כל רכישה. במצב ‏`CARDCOM_USE_MOCK=true` בפרודקשן האתר **מסיים הזמנות בלי
לחייב כרטיס** (קרה; ‏`mock-payment-provider-served-production`). במצב
‏webhook שבור: לקוח חויב ואין לו הזמנה ולא שובר.

## 2. זיהוי

- ‏`payment_events` מתמלא ב-`low_profile_failed`, ‏`verify_failed`,
  ‏`finalize_failed` או ‏`amount_mismatch`.
- ‏cron ‏`stranded-payments` (כל ‏10 דקות) ו-`reconcile` (‏04:00) מתריעים
  ל-ntfy ולטלגרם; ‏`reconciliation_missing_remotely` הוא התראה דחופה.
- פנייה של לקוח "חויבתי ואין הזמנה".
- ‏`/admin/health`: ‏`cardcom` ‏`not_configured` בפרודקשן הוא כשלעצמו תקרית.

## 3. טריאז'

```sql
select event_type, count(*), max(occurred_at)
from payment_events
where occurred_at > now() - interval '1 hour'
group by event_type order by 2 desc;
```

| האירוע הדומיננטי | משמעות | המשך |
| --- | --- | --- |
| ‏`low_profile_failed`, ‏`low_profile_requested` בלי זוג | ‏Cardcom לא נגיש | ‏§4 צעד ‏1, ואז ‏`INCIDENT-PLAYBOOKS.md` §1a |
| ‏`verify_failed`, ‏`callback_provider_failure` | ‏Cardcom חלקית: חיובים עוברים, ‏callbacks לא | ‏§4 צעד ‏3 |
| ‏`finalize_failed` | **באג שלנו**, לא שלהם | ‏§4 צעדים ‏1 ו-2 |
| ‏`amount_mismatch` | הסכום שאומת שונה מהסכום שנשלח | **לא לסיים את ההזמנה.** ‏§6 |

בדוק גם את שני הדגלים יחד, לא רק ‏credentials:
‏`vercel env ls production | grep -E 'CARDCOM_USE_MOCK|CHECKOUT_ENABLED'`.

## 4. צעדי Rollback

1. **בלם**: ‏`CHECKOUT_ENABLED=false` ב-Vercel ‏Production ו-redeploy.
   ‏`beginCheckout` מחזיר ‏`CHECKOUT_DISABLED`, הקטלוג נשאר חי, אף כרטיס לא
   מחויב. זה הצעד הראשון בכל אחד מהמצבים בטבלה, לפני אבחון.
2. **‏deploy רע על מסלול הכסף**: ‏`web-vercel.md` §4 צעדים ‏2 עד ‏4. ‏`finalize_failed`
   עם ‏`42703` הוא קוד שמניח מיגרציה שלא הוחלה; ‏rollback של קוד, לא החלה.
3. **לקוח חויב ואין הזמנה**: ‏replay של ה-webhook מהאדמין או לפי
   ‏`RUNBOOK.md` §3. בטוח לחזור עליו: ‏`callback_replay` נרשם ביומן והסיום
   אידמפוטנטי. אם ‏replay ממשיך להיכשל, ‏§6.
4. **חיוב שלא היה צריך לקרות**: החזר הוא **שורת ‏payment חדשה** עם
   ‏`kind='refund'` מהאדמין, לא עריכה של המקור. ‏`RefundDeal` פעם אחת; אם
   התשובה אבדה, לבדוק ב-`ListTransactions` לפני ניסיון נוסף.
5. **‏mock בפרודקשן**: ‏`vercel env rm CARDCOM_USE_MOCK production` **רק
   אחרי** ששלושת ‏`CARDCOM_TERMINAL_NUMBER` / ‏`CARDCOM_API_NAME` /
   ‏`CARDCOM_API_PASSWORD` קיימים, ואז ‏redeploy. בסדר הפוך ה-checkout נופל
   קשה במקום לזייף בשקט (‏`DEPLOYMENT.md`).
6. **סוד ‏webhook לא תואם** (‏401 שקט על ‏IndicatorUrl): ‏`RUNBOOK-OPS.md` §5.3
   ו-`secrets.md`. הסוד חייב להיות זהה במסוף ‏Cardcom וב-Vercel.

## 5. מה לא ניתן להחזיר

- חיוב כרטיס. רק החזר, כתנועה חדשה.
- חשבונית שהונפקה ב-`BillGoldPost` (מסמך חוקי). חשבונית כפולה היא בעיה
  בעולם האמיתי, לא ב-DB.
- שובר שנפדה: ‏`redeemed` הוא סופי; החזרת ערך אחרי כן היא זיכוי ארנק, תנועה
  אחרת מול טבלה אחרת.
- שורה ב-`payment_events`: ‏append-only.

## 6. מתי להסלים

- ‏`amount_mismatch` או ‏`reconciliation_missing_remotely` על כל תשלום: מיידי.
- לקוח שאומר שחויב פעמיים (‏`RUNBOOK.md` §"charged twice").
- ‏replay שנכשל פעמיים.
- כל שינוי ‏credential של ‏Cardcom או של סוד ה-webhook: חשבון ‏Cardcom של אופיר.
- החזרת ‏`CHECKOUT_ENABLED` ל-`true` אחרי בלם: החלטה של אופיר, לא של הכונן.
- ‏Cardcom לא נגיש מעל ‏30 דקות: אופיר מול התמיכה שלהם, ‏03-9436100.

## 7. אימות אחרי

1. ‏`/admin/health` ‏`cardcom` ‏`ok`, ושני הדגלים נכונים (‏mock מוסר, ‏checkout
   מופעל) **באותה שאילתה**.
2. הזמנה אמיתית אחת בסכום נמוך, נמצאת ב-dashboard של ‏Cardcom.
3. החזר שלה מהאדמין, נמצא שם גם הוא.
4. ‏`payment_events` לאותה הזמנה: ‏`callback_received` ואז ‏`verify_ok` ואז
   ‏`finalized`, ואז ‏`refund`.

## 8. מסמכים קשורים

‏`../INCIDENT-PLAYBOOKS.md` ‏Playbooks 1 ו-2, ‏`../RUNBOOK.md` §3, §4.1 ו-§"Cardcom:
why the retry is not uniform", ‏`../RUNBOOK-OPS.md` §5, ‏`../DEPLOYMENT.md`,
‏`../ARCHITECTURE-PAYMENT-RECONCILIATION.md`, ‏`src/server/payments/README.md`.
