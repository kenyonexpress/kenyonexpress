# Runbook: יום השקה

צ'קליסט ליום ה-cutover מ-WordPress ל-Next על `kenyonexpress.co.il`.

Status: **ACTIONABLE** · עודכן: 2026-08-10  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/LAUNCH-CHECKLIST.md
docs/LAUNCH-VALIDATION.md
docs/RUNBOOK-PRODUCTION.md
docs/GITHUB-SETTINGS.md
docs/ARCHITECTURE-OBSERVABILITY.md
docs/ARCHITECTURE-BACKUP-DR.md
GO-LIVE.md
```

בעלים יחיד על היום: אתה. סדר השערים קשיח; לא מדלגים.

---

## 0. לפני הבוקר (T-1)

- [ ] `LAUNCH-VALIDATION.md`: לפחות הדילים שמסומנים להשקה ב-`verified` (או החלטה מפורשת לעלות עם פחות)
- [ ] Supabase Pro + גיבוי/PITR פעילים
- [ ] Vercel project מצביע ל-branch הנכון לייצור (`main`)
- [ ] `CHECKOUT_ENABLED=false` עד אחרי smoke
- [ ] כרטיס טסט + משתמש ספק טסט מוכנים

---

## 1. Env vars (Vercel Production)

חובה לפני DNS:

| משתנה | תפקיד |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://kenyonexpress.co.il` |
| `NEXT_PUBLIC_SUPABASE_URL` | פרוד |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | פרוד |
| `SUPABASE_SERVICE_ROLE_KEY` / secret | שרת בלבד |
| `CARDCOM_TERMINAL_NUMBER` | מסוף אמיתי |
| `CARDCOM_API_NAME` | |
| `CARDCOM_API_PASSWORD` | זיכויים/ביטולים |
| `CARDCOM_WEBHOOK_SECRET` | `?s=` ב-IndicatorUrl |
| `VOUCHER_QR_SECRET` | הנפקת/אימות QR |
| `CRON_SECRET` | כל cron |
| `RESEND_API_KEY` + `EMAIL_FROM` | מיילים |
| `SENTRY_DSN` (+ `SENTRY_AUTH_TOKEN` ל-sourcemaps) | ניטור |
| `QSTASH_TOKEN` (+ signing keys) | התראות/חיפוש |

אופציונלי לפי פיצ'ר חי: Meilisearch, Meta WA, R2.

אימות: redeploy אחרי שמירת env; `/api/health` מחזיר OK בלי לדלוף סודות.

---

## 2. Cardcom production credentials

1. מסוף ב-
   `https://secure.cardcom.solutions`
2. IndicatorUrl מצביע ל-webhook של הייצור עם `s=$CARDCOM_WEBHOOK_SECRET`
3. הלקוח החי הוא **legacy** `/Interface/*.aspx` (לא להעתיק endpoints מ-v11 docs)
4. עם `CHECKOUT_ENABLED=false`: ודא שהאתר לא מציע checkout שבור
5. אחרי העלאת הדגל: קנייה אמיתית מינימלית → webhook → `paid_at` → מייל/קופון
6. זיכוי לאותה קנייה (מוודא `CARDCOM_API_PASSWORD`)

כשל בשלב 5 או 6: **עצור**. אל תעביר DNS.

---

## 3. DNS cutover מ-WordPress

סדר מחייב:

```text
1. Vercel: הוסף kenyonexpress.co.il + www · Certificate Valid
2. 301 מ-WP ישן לנתיבים החדשים (אם עדיין רלוונטי) כבר ב-Next
3. הורד TTL מראש (בערב T-1) ל-300s אם אפשר
4. עדכן רשומות A/CNAME ב-registrar ל-Vercel (לא להעביר registrar)
5. השאר WP ב-read-only / תחזוקה; אל תמחק מיד
6. בדיקה: curl -I https://kenyonexpress.co.il → Vercel + RTL בדף הבית
```

אחרי cutover:

- [ ] `/` RTL + דילי השקה
- [ ] `/product/{slug}` לדיל verified
- [ ] `/sitemap.xml` חי
- [ ] Search Console: sitemap submit (אחרי יציבות)

חלון מומלץ: בוקר יום חול, לא שישי בצהריים.

---

## 4. ניטור Sentry

| בדיקה | פעולה |
|---|---|
| DSN בפרוד | שגיאות מגיעות לפרויקט הנכון |
| Source maps | release תואם deploy |
| אלרטים | מייל/Ntfy על error rate / payment failures |
| Smoke כסף | קנייה טסט יוצרת אירוע בלי PII בלוג |
| Cron | notifications / expiry לא צוברים `dead` בלי התראה |

לוגים: JSON שורה אחת; scrubber בלי PAN/CVV/tokens.  
דשבורד פתוח על המסך לכל שעת ה-cutover.

---

## 5. Rollback plan

| מצב | פעולה מיידית |
|---|---|
| באג UI, כסף תקין | Vercel Instant Rollback ל-deploy קודם |
| כסף / webhook שבור | `CHECKOUT_ENABLED=false` **קודם**, ואז rollback |
| DNS אסון / תעודה | החזר CNAME/A ל-WP הזמני; WP ב-maintenance עם הודעה |
| ספאם שגיאות Sentry אחרי cutover | freeze checkout + בדוק Cardcom + outbox |
| מיגרציית DB רעה | **לא** reverse עיוור; שחזור לפי `ARCHITECTURE-BACKUP-DR.md` על scratch ואז החלטה |

אסור: `supabase db push` לייצור; מיגרציות רק MCP אחת-אחת.

קריטריון יציאה מ-rollback: קניית טסט ירוקה + אין error spike ב-15 דקות.

---

## 6. צ'קליסט יום השקה (סדר ביצוע)

```text
[ ] Env Production מלא (§1)
[ ] Deploy Vercel Ready + health OK
[ ] Cardcom: קנייה+זיכוי טסט (§2) עם CHECKOUT_ENABLED=true זמנית על preview או אחרי domain
[ ] CHECKOUT_ENABLED=false לפני DNS אם עדיין לא מוכן
[ ] DNS cutover (§3)
[ ] Smoke: בית, PDP, עגלה, login
[ ] CHECKOUT_ENABLED=true
[ ] קניית קופון אמיתית אחת + מייל voucher_issued
[ ] Redeem טסט אצל ספק
[ ] Sentry שקט יחסית (§4)
[ ] עדכון STATE / הודעה פנימית: live
```

---

## 7. Acceptance

- [ ] הדומיין מגיש Next, לא WP  
- [ ] Cardcom prod חי עם זיכוי מאומת  
- [ ] Sentry קולט + אלרט מוגדר  
- [ ] Rollback נוסה לפחות כ-dry-run מנטלי עם הצעדים למעלה  
- [ ] דילי ההשקה לפי `LAUNCH-VALIDATION.md`  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-10 | Runbook יום השקה: env, Cardcom, DNS, Sentry, rollback |
