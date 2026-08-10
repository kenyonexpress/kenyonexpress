# SLA וניטור התראות

יעדי זמינות, alerting ב-Sentry וב-Vercel, ומי מקבל התראה מתי.

Status: **RUNBOOK** · עודכן: 2026-08-10  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

**מקור מחייב (ארכיטקטורה):**

```
docs/ARCHITECTURE-OBSERVABILITY.md
```

מסמכים נוספים:

```
docs/RUNBOOK-PRODUCTION.md
docs/RUNBOOK-LAUNCH-DAY.md
docs/ARCHITECTURE-BACKUP-DR.md
docs/CONTRADICTIONS.md
```

הקשר: מפעיל יחיד עם טלפון. אין NOC.

---

## 1. יעדי זמינות (MVP)

| שירות | יעד | הערה |
|---|---|---|
| Storefront (דפי קטלוג) | 99.5% חודשי | לא כולל תחזוקת DB מתוכננת עם באנר |
| Checkout + Cardcom return | 99.9% בשעות פעילות | כשל → `CHECKOUT_ENABLED=false` |
| Redeem / סריקת ספק | 99.5% | SEV2 אם יורד |
| Cron notifications / search index | best-effort + DLQ | לא מפיל אתר |

חלון מדידה: חודש קלנדרי. תחזוקה מתוכננת עם הודעה מראש לא נספרת כהפרת SLA פנימי.

---

## 2. מקורות התראה

| מקור | מה | איפה |
|---|---|---|
| Sentry | exceptions, SEV tags | פרויקט Sentry + אינטגרציה לטלפון |
| Vercel | deploy failed, serverless errors, cron failures | Dashboard + email/Slack אם מוגדר |
| Ntfy / Better Stack | כסף ו-SEV1 | לפי OBSERVABILITY |
| `/api/health` | רדוד; לא מחליף Sentry | מוניטור חיצוני אופציונלי |

---

## 3. מי מקבל ומהי

| SEV | דוגמה | ערוץ | מקבל | זמן תגובה יעד |
|---|---|---|---|---|
| SEV1 | checkout/payment/webhook כסף | טלפון (ntfy) + Sentry | בעלים | ≤ 15 דק' |
| SEV2 | redeem / notifications outbox | Sentry + push | בעלים | ≤ 1 שע' עסקים |
| SEV3 | UI / non-money | Sentry יומי | בעלים | ≤ 1 יום עסקים |
| Deploy | Preview/Production build אדום | Vercel notification | בעלים | באותו יום; Production מיידי |

מחוץ לשעות: SEV1 עדיין מעיר. SEV3 לא.

---

## 4. כללי Vercel

| אירוע | פעולה |
|---|---|
| Production deploy failed | לא ממשיכים; בודקים לוג; rollback אם כבר היה canary שבור |
| Preview אדום על PR | חוסם merge אם required check |
| Spike ב-5xx | פותחים Sentry + בודקים Cardcom/Supabase |

אין שינוי env מתוך מסמך זה (רק מדיניות).

---

## 5. כסף ומדדים

מדדים מותרים: ledger + snapshot של `platform_percent`.  
אסור: מדדי Escrow / held / J5.

---

## 6. Acceptance

- [ ] SEV1 מגיע לטלפון תוך דקות בתרגיל
- [ ] deploy Production כושל מדווח
- [ ] health רדוד לא מסתיר כשל כסף ב-Sentry

---

## 7. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-10 | יעדי זמינות + מטריצת התראות Sentry/Vercel |
