# ‏Runbook: דומיין, ‏DNS ו-TLS

| שדה | ערך |
| --- | --- |
| רכיב | ‏`kenyonexpress.co.il` ו-`www`, האצלת ‏NS, תעודת ‏TLS, ‏HSTS |
| ספק | רשם ה-`.co.il` (האצלה), ‏Vercel DNS (האזור, התעודה) |
| כרטיס ב-/admin/health | אין (הדף עצמו מאחורי הדומיין; רק ‏UptimeRobot רואה מבחוץ) |
| כונן | אופיר |
| חומרה ברירת מחדל | ‏SEV1: האתר לא נגיש בכתובת הציבורית |
| סולם הסלמה | ‏`README.md` §סולם ההסלמה |

**מצב נמדד ‏25.09.2026:** ההורה של ‏`.co.il` מאציל ל-`ns1/ns2.vercel.com`,
שאינם עונים על פורט ‏53 כלל. ‏Vercel דורש ‏`ns1/ns2.vercel-dns.com`, ושם האזור
שלם ונכון (‏A לאפקס ‏`216.198.79.1` / ‏`64.29.17.1`, ‏`www`). **התיקון הוא
עריכת ‏NS אצל הרשם ותו לא.** לולאת ‏dns-watch (קובץ לא מעוקב ב-checkout הראשי, רץ תחת ‏caffeinate) עדיין
מחכה לרשומות ‏Cloudflare ולא תירה לעולם על ההאצלה הזאת; הלולאה שהיא מפעילה
הושהתה בכוונה.

## 1. רדיוס פגיעה

הכתובת הציבורית בלבד. ‏`https://kenyonexpress.vercel.app` מגיש את אותו ‏deploy
בלי תלות ב-DNS, וה-webhook של ‏Cardcom ממשיך אם ‏IndicatorUrl מצביע עליו.
‏HSTS שנשלח פעם מעל ‏HTTP מצמיד דפדפנים לכתובת המתה עד פקיעת ה-max-age.
רשומות ‏DKIM/SPF של ‏Resend חיות באותו אזור: ‏DNS למטה מפיל גם אימות דומיין
למייל.

## 2. זיהוי

- ‏UptimeRobot ‏`down` על ‏`/api/health` בזמן ש-`vercel.app` עונה.
- ‏Vercel > Domains: ‏"Invalid Configuration" או תעודה שלא הונפקה.

```bash
dig +short A kenyonexpress.co.il @1.1.1.1            # ריק + SERVFAIL = האצלה שבורה
dig +short A kenyonexpress.co.il @ns1.vercel-dns.com   # 216.198.79.1 64.29.17.1 = האזור תקין
dig +short NS kenyonexpress.co.il @a.ns.il             # מה הרשם מאציל
curl -sSI https://kenyonexpress.co.il/ | head -3      # TLS
```

## 3. טריאז'

1. **‏`@1.1.1.1` ריק, ‏`@ns1.vercel-dns.com` עונה?** האצלה. ‏§4 צעד ‏1, רשם בלבד.
2. **שניהם עונים, ‏TLS נכשל?** ‏Vercel עדיין לא הנפיק תעודה (צריך האצלה
   תקינה כמה שעות). להמתין; לא לגעת בהגדרות הדומיין ב-Vercel.
3. **הכול עונה ו-UptimeRobot עדיין אדום?** ‏challenge של ‏Vercel על לקוח עסוק
   (‏403 עם דף ‏checkpoint). לבדוק מכתובת אחרת לפני שמכריזים.
4. **‏vercel.app גם לא עונה?** זו לא תקרית ‏DNS: ‏`web-vercel.md`.

## 4. צעדי Rollback

1. **ההאצלה**: אצל הרשם, ‏NS ל-`ns1.vercel-dns.com` ו-`ns2.vercel-dns.com`.
   ה-"rollback" של רשומת ‏NS הוא אותה פעולה בכיוון ההפוך; ‏TTL של ‏`.co.il`
   הופך כל שינוי לאיטי (שעות) ולכן **לא מתקנים אותו פעמיים ביום**. פעולה של
   אופיר בלבד (כניסה לרשם).
2. **חזרה ל-WordPress הישן**: לא קיים יותר כיעד חי; אין לאן לחזור. אם צריך
   "אתר למעלה" מיידית, זו הפניה ל-`vercel.app` בתקשורת, לא ב-DNS.
3. **רשומות מייל** (‏DKIM/SPF/DMARC של ‏Resend): חיות ב-Vercel DNS; לא לשנות
   אצל הרשם, הן חוזרות ברגע שההאצלה נכונה.
4. **‏HSTS**: אין ביטול מרחוק. דפדפן שננעל מתאושש כש-HTTPS חוזר; עד אז
   לא לשלוח ‏`max-age=0` כי זה דורש בדיוק את ה-HTTPS שאין.

## 5. מה לא ניתן להחזיר

- זמן ההתפשטות של ‏NS ברמת ההורה.
- דפדפנים שהוצמדו ב-HSTS, עד פקיעה או עד ‏HTTPS תקין.
- רישום הדומיין עצמו: פקיעה אצל הרשם היא תקרית של אופיר בלבד, לא טכנית.

## 6. מתי להסלים

- **הכול.** אין צעד ברכיב הזה שהכונן יכול לבצע בלי חשבון של אופיר ברשם
  או ב-Vercel. ‏SEV1 מיידי, עם שלושת ‏`dig` מ-§2 בהודעה, כדי שאופיר לא יאבחן
  מחדש.
- לא להציע ‏Cloudflare, ‏TLS ידני או שינוי בפרויקט ‏Vercel: כבר נמדד, לא זה.

## 7. אימות אחרי

```bash
dig +short NS kenyonexpress.co.il @1.1.1.1      # ns1/ns2.vercel-dns.com
curl -sS -o /dev/null -w '%{http_code}\n' https://kenyonexpress.co.il/   # 200
```

‏UptimeRobot ‏`up`; ‏Resend > Domains ‏Verified; ‏`gh workflow run production-smoke.yml`.

## 8. מסמכים קשורים

‏`../DNS-INCIDENT-2026-09-17.md`, ‏`../DNS-CUTOVER-PLAN.md`, ‏`../OWNER-CHECKLIST.md`
פריט ‏3, ‏`web-vercel.md`.
