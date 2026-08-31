# ספר תפעול יומי

תאריך: 2026-08-19.
ענף: `phase5/homepage`.
היקף: docs בלבד.

מיזם עם מפעיל יחיד. אין NOC. כל בלוק למטה רץ כמו שהוא. לא להמציא נתיב.

שורש הפרויקט (חובה לפני כל פקודה שמסומנת Terminal):

```
/Users/ofir/kenyonexpress-web/kenyonexpress
```

התראות:
`https://ntfy.sh/kenyon-ofir-limit`

כלל כסף: אנומליה (חיוב בלי הזמנה סגורה, שובר בלי תשלום, webhook כפול שנקלט פעמיים) = כיבוי checkout לפני כל דבר אחר. אין `db push`. אין down-migration. אין force-push ל-`main`.

עד DNS cutover האתר
`https://kenyonexpress.co.il`
עדיין WordPress. `/api/health` שם יחזיר 404. זה לא אומר שה-Next מת. לבדוק גם את ה-deployment ב-Vercel.

---

## 1. חמש פקודות בוקר

Terminal, אחת אחרי השנייה, מהשורש. ירוק = ממשיכים. אדום = סעיף 2 או 6.

### 1.1 הלולאה והמכונה לא ישנה

```bash
pgrep -fl kenyon-loop.sh; pgrep -fl caffeinate; pmset -g | grep -i sleep
```

צפי: לפחות שורת
`kenyon-loop.sh`,
לפחות
`caffeinate -dims`,
ו-
`SleepDisabled 1`
או
`sleep 0`
עם caffeinate ברשימת המונעים. ריק ב-pgrep הראשון = הלולאה מתה (סעיף 3).

### 1.2 האתר נושם

```bash
curl -sS -o /dev/null -w 'apex:%{http_code} time:%{time_total}\n' https://kenyonexpress.co.il/
curl -sS -o /dev/null -w 'health:%{http_code} body:' https://kenyonexpress.co.il/api/health; echo
curl -sS https://kenyonexpress.co.il/api/health; echo
```

צפי אחרי cutover: apex 200, health 200, גוף
`{"ok":true,"database":"ok",...}`.
health 503 = DB למטה (סעיף 6). health 404 על ה-apex = עדיין WP, לא בהלה. אז:

```bash
npx --yes vercel@latest ls kenyonexpress --prod
```

ולפתוח את ה-URL של Production ב-Chrome. אם גם הוא 5xx: סעיף 6.

### 1.3 אין שני סוכני קוד על אותו עץ

```bash
pgrep -fl 'claude|cursor.*agent' | grep -v grep
git -C /Users/ofir/kenyonexpress-web/kenyonexpress worktree list
git -C /Users/ofir/kenyonexpress-web/kenyonexpress status -sb
```

צפי: לולאה אחת, worktree ראשי על
`phase5/homepage`.
שני תהליכי
`claude --print`
עם cwd זהה = סעיף 2. קבצים מלוכלכים ארוכים שלא זזים שעות = סוכן תקוע או סוכן שני.

### 1.4 הלולאה כותבת, לא שותקת

```bash
tail -n 40 ~/kenyon-loop.log
python3 -c 'import os,time; p=os.path.expanduser("~/kenyon-loop.log"); print("age_sec", int(time.time()-os.path.getmtime(p)))'
```

צפי: מחזור בשעה האחרונה, או backoff מתועד אחרי מכסה. שקט מעל שעתיים בלי
`backing off`
= תקוע (סעיף 2).

### 1.5 Git והתור לא קפאו

```bash
cd /Users/ofir/kenyonexpress-web/kenyonexpress && git fetch origin && git log --oneline -5 && git status -sb && grep -n -A 8 '^## המשך מ:' STATE.md | head -n 40
```

צפי: `phase5/homepage` מסונכרן או ahead קטן. שורת
`המשך מ:`
זזה מאז אתמול. אותו goal במשך יממה בלי קומיט = סעיף 2.

אם אחת מחמש נכשלה: לא לפתוח שלושה צ'אטים. סעיף אחד רלוונטי, לפי הסדר: אתר למטה (6) → webhook/כסף (5) → סוכן (2) → לולאה (3).

---

## 2. איך מזהים שסוכן נתקע

סימנים (מספיק אחד):

- `~/kenyon-loop.log` בלי שורה חדשה יותר משעתיים, ואין `backing off`.
- אותו
  `המשך מ:`
  ב-
  `STATE.md`
  מאז אתמול, בלי קומיט חדש.
- `git status` מלא בקבצים חצויים או `UU` מקונפליקט.
- שני
  `claude`
  על
  `kenyonexpress`.
- CPU של
  `claude`
  0% זמן ארוך, או 100% בלי קומיטים.
- ntfy שקט אחרי goal שאמור היה להסתיים.

### 2.1 צילום מצב (גזור)

```bash
date
pgrep -fl claude
pgrep -fl kenyon-loop
git -C /Users/ofir/kenyonexpress-web/kenyonexpress worktree list
git -C /Users/ofir/kenyonexpress-web/kenyonexpress status -sb
git -C /Users/ofir/kenyonexpress-web/kenyonexpress log -3 --oneline
tail -n 80 ~/kenyon-loop.log
```

### 2.2 מה לא לעשות

לא לפתוח סוכן קוד שני על אותו repo (זה אחד מארבעת האיסורים). לא
`git reset --hard`
על עבודה שלא נדחפה בלי לקרוא את
`git status`.
לא למחוק worktree עם שינויים לא מקומיטים.

### 2.3 שחרור תקיעה בטוח

Terminal:

```bash
touch ~/.kenyon-loop.stop
```

חכה עד ש-

```bash
pgrep -fl kenyon-loop.sh
```

ריק (עד דקה אחרי סוף המחזור, או יותר אם claude עוד רץ). אם תקוע ולא יוצא 10 דקות:

```bash
pkill -f kenyon-loop.sh
```

זה הורג את הלולאה, לא את Cursor. תהליך
`claude --print`
שנשאר:

```bash
pgrep -fl claude
```

אם הוא הילד של הלולאה (בלוג: cycle starting) ואחרי pkill של הלולאה הוא עדיין חי:

```bash
# רק אחרי שזיהית PID של הלולאה, לא של צ'אט Cursor
kill <PID>
```

אחר כך סעיף 3. קונפליקט git: להשאיר, לתעד ב-
`STATE.md`,
לא למזג בכוח.

---

## 3. איך מאתחלים את הלולאה

רק אחרי שסעיף 2.3 סיים ו-
`pgrep -fl kenyon-loop.sh`
ריק.

### 3.1 ניקוי דגל עצירה

```bash
rm -f ~/.kenyon-loop.stop
```

קובץ PID ישן: הסקריפט ישתלט אם התהליך מת. אם
`~/.kenyon-loop.pid`
קיים והתהליך חי, לא למחוק. אם התהליך מת:

```bash
rm -f ~/.kenyon-loop.pid
```

### 3.2 הפעלה

```bash
cd /Users/ofir/kenyonexpress-web/kenyonexpress
nohup caffeinate -dims ./kenyon-loop.sh >> ~/kenyon-loop.log 2>&1 &
echo "started pid:$!"
sleep 2
pgrep -fl kenyon-loop.sh
tail -n 15 ~/kenyon-loop.log
```

צפי בלוג:
`loop started`
ואז
`cycle N starting`.
ntfy:
`kenyon-loop: started`.

אם
`loop already running`:
יש מופע חי. לא להריץ שוב.

### 3.3 עצירה מסודרת (בלי אתחול)

```bash
touch ~/.kenyon-loop.stop
```

או:

```bash
pkill -f kenyon-loop.sh
```

### 3.4 שינה אחרי אתחול

```bash
caffeinate -dims &
sudo pmset -a disablesleep 1
pmset -g | grep -i sleep
```

`sudo pmset` דורש סיסמה במחשב. בלי זה, לפחות
`caffeinate -dims`
חי.

---

## 4. Rollback ל-deployment ב-Vercel

קודם בלם כסף אם החשד הוא תשלומים. אחר כך חזרה לגרסה הקודמת. בלי לגעת ב-DB.

הענף שוורסל מגיש כפרודקשן **אינו בהכרח**
`main`.
נמדד כ-
`cursor/add-supabase-3c830`.
לפני rollback: לוודא ב-Dashboard איזה פרויקט ואיזה Production Branch.

### 4.1 בלם (Vercel Dashboard)

1. Chrome: Vercel → הפרויקט → Settings → Environment Variables → Production.
2. `CHECKOUT_ENABLED` = `false` (המחרוזת הזאת בדיוק).
3. Save. Redeploy Production, או Instant Rollback אחרי זה.

בלי Redeploy יש Lambda חמה שעדיין עם `true`. לא לסמוך על "רק שמרתי".

### 4.2 Instant Rollback ב-UI (הדרך המהירה)

Chrome: Vercel → הפרויקט → Deployments → השורה **Ready** הקודמת שסומנה Production → תפריט ⋮ → Instant Rollback / Promote to Production.

חכה ל-Ready. אחר כך סעיף 4.4.

### 4.3 Rollback ב-CLI

Terminal:

```bash
cd /Users/ofir/kenyonexpress-web/kenyonexpress
npx --yes vercel@latest ls kenyonexpress
```

העתק את ה-URL של ה-deployment היציב האחרון (לא הנוכחי השבור). אז:

```bash
npx --yes vercel@latest rollback https://<deployment-id>.vercel.app --yes
```

אם ה-CLI מבקש scope: אותו חשבון שמחובר לפרויקט החי.

### 4.4 אימות אחרי rollback

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://kenyonexpress.co.il/
curl -sS https://kenyonexpress.co.il/api/health; echo
```

Chrome: בית, PDP קופון, עגלה. לא לעשות תשלום אמיתי עד שסעיף 5 ירוק.

### 4.5 אסור ב-rollback

```bash
# אסור
git push --force origin main
git push --force origin phase5/homepage
npx supabase db push
```

מיגרציה שבורת פרודקשן לא מתוקנת ב-rollback של Vercel. קוד חוזר, DB לא. אם המיגרציה כבר רצה: זה SEV1, לא הסעיף הזה.

Git revert (רק אם Instant Rollback לא מספיק והקוד הרע כבר ב-origin):

```bash
cd /Users/ofir/kenyonexpress-web/kenyonexpress
git fetch origin
git checkout phase5/homepage
git revert <badsha>
git push origin phase5/homepage
```

לא ל-
`main`
כל עוד מדיניות 19.08 בתוקף.

---

## 5. Cardcom webhook נופל

עובדות מהקוד, לא לנחש:

- הנתיב:
  `/api/payments/cardcom/webhook?s=<CARDCOM_WEBHOOK_SECRET>`
- Cardcom **לא חותם** גוף. האותנטיות היא `?s=` **ו** GetLpResult שרת-לשרת.
- Replay תקין = 200
  `{ok:true,replay:true}`.
- כשל כתיבה ליומן = **503** (Cardcom יינסה שוב). זה טוב.
- סוד שגוי על גוף שכן נראה כמו Cardcom = **200** עם אזעקה. Cardcom מפסיק לנסות, ההזמנה נשארת פתוחה, הלקוח חויב. זה התרחיש הרע.

### 5.1 בלם מיידי

Vercel Dashboard: Production
`CHECKOUT_ENABLED=false`
ואז Redeploy (סעיף 4.1).

### 5.2 האם זה בכלל ה-webhook

Chrome: Vercel → Logs. סנן
`/api/payments/cardcom/webhook`.

Terminal (בלי להדפיס סודות):

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -X POST https://kenyonexpress.co.il/api/payments/cardcom/webhook
```

צפי בלי `?s=`: 200 (סורק, לא Cardcom). 404 על apex = עדיין WP; אז ה-URL אצל Cardcom חייב להיות ה-host של Next, לא וורדפרס.

### 5.3 סוד לא תואם (השקט)

סימן: ntfy/Sentry
`cardcom_webhook_secret`
או
`cardcom callback rejected`.
הזמנות
`paid`
חסרות / שוברים 0 אחרי שהכרטיס חויב.

Vercel: ל-
`CARDCOM_WEBHOOK_SECRET`
יש ערך, וה-URL בטרמינל Cardcom (IndicatorUrl / Low Profile) מכיל **אותו** `s`.

סיבוב סוד: לא להחליף בבת אחת.

1. `CARDCOM_WEBHOOK_SECRET_PREVIOUS` = הערך הישן.
2. `CARDCOM_WEBHOOK_SECRET` = החדש.
3. Redeploy.
4. עדכון IndicatorUrl ב-Cardcom ל-`s` החדש.
5. אחרי שפג תוקף דפי Low Profile פתוחים: מחקים PREVIOUS.

### 5.4 503 על persist

סימן: לוג
`event_not_recorded`
או
`cardcom_webhook_persist`.
Cardcom אמור לנסות שוב. אם Supabase down: סעיף 6. לא "לתקן" עם 200 ידני.

### 5.5 חיוב בלי שובר

Chrome: `/admin/payments` (חשבון אדמין). שורות שנגבו בלי הזמנה סגורה.

Supabase → SQL Editor (קריאה בלבד, לא UPDATE). אם
`relation "payment_webhook_events" does not exist`
הטבלה עוד לא הוחלה בפרוד. לא להריץ מיגרציה מהטלפון. זה עצירה מספר 3.

```sql
SELECT o.id, o.paid_at, o.status
FROM public.orders o
WHERE o.paid_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.vouchers v WHERE v.order_id = o.id
  )
ORDER BY o.paid_at DESC
LIMIT 50;
```

```sql
SELECT signature_valid, verified_against_api, created_at, external_event_id
FROM public.payment_webhook_events
WHERE provider = 'cardcom'
ORDER BY created_at DESC
LIMIT 30;
```

`signature_valid = false` עם payload אמיתי = סעיף 5.3.
`verified_against_api = false` = GetLpResult לא רץ או נכשל. בלי זה אסור לסגור הזמנה ידנית.

Cron שמיועד לזה (אחרי שה-secret ב-Vercel):
`/api/cron/stranded-payments`
עם
`Authorization: Bearer $CRON_SECRET`.
לא להריץ מהמחשב בלי הסוד.

### 5.6 אחרי תיקון

1. סוד ו-URL תואמים.
2. GetLpResult עובד (לוג
   `verified_against_api`).
3. הזמנת טסט בסכום מינימלי בכרטיס שלך: charge → webhook → שובר.
4. רק אז
   `CHECKOUT_ENABLED=true`
   + Redeploy.
5. Replay ישן עם אותו
   `external_event_id`
   חייב להישאר no-op (לא שובר שני).

---

## 6. האתר למטה

סדר: לא להריץ מיגרציה. לא לפתוח סוכן. לא למחוק.

### 6.1 מי מת: DNS, Vercel, או DB

```bash
dig kenyonexpress.co.il A +short
dig kenyonexpress.co.il NS +short
curl -sS -I https://kenyonexpress.co.il | head -n 15
curl -sS -o /dev/null -w 'apex:%{http_code}\n' https://kenyonexpress.co.il/
curl -sS https://kenyonexpress.co.il/api/health; echo
npx --yes vercel@latest ls kenyonexpress --prod
```

| תוצאה | פירוש | פעולה |
|---|---|---|
| apex 200, HTML של WordPress, health 404 | cutover עוד לא היה | לא rollback. Next נבדק ב-URL של Vercel |
| apex 5xx / timeout, dig מחזיר Cloudflare | Vercel או origin | 4.2 Instant Rollback. בלם checkout אם זה אחרי deploy |
| health 503 `"database":"down"` | Supabase לא עונה | Chrome: status.supabase.com. לא להחיל מיגרציה. לא `db push` |
| health 200, דפים 5xx | באג ב-deploy | סעיף 4 |
| dig ריק / NS לא Cloudflare | DNS נשבר | לא לגעת ב-TTL בלי גיבוי zone. זה cutover, אחת מארבע העצירות |
| SSL שגיאה | תעודה | Vercel Domains. לא HSTS preload |

### 6.2 בלם ציבורי אם זה כסף או עגלה שבורה

`CHECKOUT_ENABLED=false` + Redeploy (4.1). הלקוחות רואים חנות בלי קופה. עדיף מחיוב כפול.

### 6.3 Supabase down

Chrome: Supabase Dashboard של הפרויקט החי → בודקים שהפרויקט לא paused.

אין restore בבוקר בלי תרגול. PITR / restore = עצירה (מחיקת DB / שינוי פרוד). לתעד ב-
`STATE.md`
ולפתוח את
`docs/ARCHITECTURE-BACKUP-DR.md`.
לא להריץ dump על הלקוח.

### 6.4 אחרי חזרה

```bash
curl -sS https://kenyonexpress.co.il/api/health; echo
curl -sS -o /dev/null -w '%{http_code}\n' https://kenyonexpress.co.il/
```

Chrome: בית, קטגוריה, PDP. ntfy שורה אחת מה קרה. לא לפתוח checkout עד 5.6 אם הכשל היה תשלום.

---

## 7. כיבוי קופה בלבד (בלי rollback)

כשהאתר חי והסליקה חשודה.

Vercel → Env Production:

```
CHECKOUT_ENABLED=false
```

Redeploy Production.

אימות (אחרי שה-deploy Ready): לחיצת "לתשלום" חייבת להיחסם. אם לא, ה-env לא הגיע ל-lambda.

הדלקה רק אחרי smoke: עגלה → Google → Cardcom sandbox או סכום מינימלי → שובר אחד.

```
CHECKOUT_ENABLED=true
```

רק המחרוזת
`true`.
ריק / `TRUE` / `1` בפרודקשן = כבוי.

---

## 8. ארבע עצירות (לא לעקוף מהטלפון)

1. Push לפרודקשן Vercel (קידום domain חי, לא Instant Rollback של גרסה ישנה).
2. מחיקת DB או מחיקת קבצים.
3. הרצת migration על הפרודקשן.
4. סוכן קוד שני על אותו repo.

Rollback (סעיף 4) וכיבוי checkout (סעיף 7) **מותרים** והם ברירת המחדל בתקלה.

---

## Revision

| Date | Change |
|---|---|
| 2026-08-19 | ספר תפעול יומי: 5 פקודות בוקר, סוכן תקוע, אתחול לולאה, Vercel rollback, webhook, אתר למטה |
