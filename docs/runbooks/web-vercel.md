# ‏Runbook: האפליקציה ב-Vercel

| שדה | ערך |
| --- | --- |
| רכיב | אפליקציית ‏Next.js 16, ‏`src/app/`, מוגשת מ-Vercel |
| ספק | ‏Vercel, פרויקט ‏`kenyonexpress` (‏`prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP`, צוות ‏`team_TUMTPVDP8218QHwedSjmgJWl`) |
| כרטיס ב-/admin/health | `async_offload` (ה-Worker של ‏Cloudflare; האפליקציה עצמה נמדדת מבחוץ, ראה §2) |
| כונן | אופיר |
| חומרה ברירת מחדל | ‏SEV1 כשהדומיין לא עונה או ‏5xx בדף הבית; ‏SEV2 כשדף אחד שבור |
| סולם הסלמה | ‏`README.md` §סולם ההסלמה |

‏נמדד ‏05.10.2026: ‏production branch הוא ‏`audit/final-audit`, ‏previews כבויים,
**כל ‏push לענף הזה הוא ‏deploy לפרודקשן**. הכתובות: ‏`kenyonexpress.co.il`,
‏`www`, ו-`kenyonexpress.vercel.app` (עובדת גם כשה-DNS לא; ראה ‏`dns-domain.md`).

## 1. רדיוס פגיעה

כל האתר: קטלוג, עגלה, ‏checkout, אזור אישי, אדמין, כל מסלולי ה-API כולל
ה-webhook של ‏Cardcom וה-cron. כש-Vercel למטה, גם ‏`/api/cron/health` לא רץ
ולכן **לא מתריע**; ההתראה מגיעה רק מהמוניטור החיצוני.

## 2. זיהוי

- ‏UptimeRobot על ‏`/api/health` כל חמש דקות, מתריע ל-ntfy ולטלגרם דרך
  ‏`/api/alerts/uptimerobot` (‏`RUNBOOK.md` §1).
- ‏`production-smoke.yml` אחרי כל ‏deploy ו-`auto-rollback.yml` אחריו.
- ‏Sentry: גל שגיאות עם ‏`environment=production` (רוב האירועים שם הם מחשבים
  מקומיים; לסנן לפי התג לפני שמסיקים).
- ידני:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://kenyonexpress.co.il/
curl -sS https://kenyonexpress.vercel.app/api/health; echo
```

## 3. טריאז'

1. **‏`vercel.app` עונה והדומיין לא?** זו תקרית ‏DNS/TLS, לא אפליקציה. עבור
   ל-`dns-domain.md`.
2. **‏5xx בכל דף?** בדוק את ה-deploy האחרון:

```bash
vercel ls kenyonexpress
vercel inspect <url-של-ה-deploy-האחרון> --logs
```

   ‏Build שנכשל משאיר את הקודם באוויר; ‏Build ירוק עם ‏5xx בזמן ריצה הוא
   ‏deploy רע. במקרה השני עבור ל-§4 **לפני** האבחון.
3. **דף אחד או מסלול אחד?** קרא את השגיאה ב-Sentry לפי ‏`release` (ה-sha
   של ‏HEAD). אם היא בקוד שנכנס ב-push האחרון, ‏§4 צעד ‏1 מספיק.
4. **רק ‏checkout?** ‏`payments-cardcom.md` §3, והבלם שם קודם לכל.

## 4. צעדי Rollback

1. **קודם בלם כסף** אם החשד נוגע לתשלומים: ב-Vercel ‏Settings > Environment
   Variables > Production, ‏`CHECKOUT_ENABLED` = ‏`false`, ואז ‏redeploy
   (‏Lambda חמה ממשיכה עם הערך הישן בלי ‏redeploy).
2. **אוטומטי**: ‏`auto-rollback.yml` כבר ניסה אם ה-smoke נכשל. קרא את הריצה
   ב-`gh run list --workflow=auto-rollback.yml`. יציאה ‏2 פירושה שאין
   ‏`VERCEL_TOKEN` ב-secrets ולכן הוא **רק מדד ולא הזיז**; המשך לצעד ‏3.
3. **מהמכונה**: ‏`VERCEL_TOKEN=... pnpm deploy:rollback:dry` מראה את היעד
   (ה-deployment הקודם במצב ‏READY) בלי להזיז. אם היעד נכון:
   ‏`VERCEL_TOKEN=... pnpm deploy:rollback --reason "..."`. הסקריפט מריץ
   ‏smoke על היעד ומודיע לטלפון.
4. **‏Dashboard**: ‏Deployments > סינון ‏Production > השורה ‏READY הקודמת >
   ‏Promote to Production. זה המסלול כשצעד ‏3 יצא ‏1 (היעד נכשל ב-smoke
   שלו) או ‏3 (אין ‏deployment ישן יותר במצב ‏READY).
5. **‏git revert** רק אם ה-rollback לא מספיק והקוד הרע כבר ב-origin:

```bash
git fetch origin && git checkout audit/final-audit
git revert <sha-רע> && git push origin audit/final-audit   # ה-push הוא ה-deploy
```

   לעולם לא ‏`git push --force`, ולעולם לא ל-`main` (מוגן, דורש ‏PR).
6. **מתגי כיבוי בלי קוד** (‏`src/lib/resilience/kill-switches.ts`), כל אחד
   משתנה סביבה שמקבל ‏`1` ודורש ‏redeploy כדי להגיע למופע חדש:
   ‏`KILL_SWITCH_CACHE`, ‏`KILL_SWITCH_SEARCH`, ‏`KILL_SWITCH_RECS`,
   ‏`KILL_SWITCH_NOTIFICATIONS`. כולם מדרדרים ולא שוברים.

## 5. מה לא ניתן להחזיר

- **מיגרציה שכבר רצה.** ‏Rollback של ‏Vercel מחזיר קוד, לא סכימה. אם הקוד
  הישן קורא עמודה שהמיגרציה החדשה שינתה, ה-rollback עצמו שובר. ראה
  ‏`database-supabase.md` §4.
- משתני סביבה אינם מגורסים עם ה-deployment: ‏Promote של ‏deployment ישן רץ
  עם הערכים **הנוכחיים**.
- ‏`.vercelignore` לא מעוגן כבר הפיל חמישה ‏deploys (‏04.10). ‏`vercel inspect
  --logs` לפני שמאשימים ‏env.

## 6. מתי להסלים

- הגדרת ‏`VERCEL_TOKEN` ב-GitHub או כל שינוי ‏env בפרודקשן: חשבון של אופיר.
- ‏`deploy --prod` ידני מהמכונה (אחד מארבעת המצבים הקבועים).
- ‏Rollback שנכשל גם מה-Dashboard: ‏SEV1, ספק (‏Vercel support) דרך אופיר.
- הפרויקט האח ‏`kenyonexpress-prod` בונה ונכשל על כל ‏push: רעש ידוע, לא
  תקרית, לא לגעת.

## 7. אימות אחרי

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://kenyonexpress.co.il/
curl -sS https://kenyonexpress.co.il/api/health; echo
gh workflow run production-smoke.yml
```

בדפדפן: בית, דף מוצר, עגלה. **לא תשלום אמיתי** עד ש-`payments-cardcom.md` §7
ירוק. אם ‏`CHECKOUT_ENABLED` כובה בצעד ‏1, להחזיר אותו הוא החלטה נפרדת של
אופיר.

## 8. מסמכים קשורים

‏`../RUNBOOK.md` §5.1, ‏`../DEPLOY-PIPELINE.md`, ‏`../DEPLOYMENT.md`,
‏`../RELEASE-PROCESS.md`, ‏`../INCIDENT-PLAYBOOKS.md` ‏Playbook 5,
‏`scripts/deploy/rollback.mjs`.
