# ארכיטקטורה: תפעול (OPS)

סביבות, Vercel, Sentry, גיבויים, התאוששות, runbooks Cardcom. מפעיל יחיד, אין NOC.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**. ראיות כסף ב-DB append-only.

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/ARCHITECTURE-OBSERVABILITY.md
docs/ARCHITECTURE-PRODUCTION-OPS.md
docs/ARCHITECTURE-ENV-SECRETS.md
docs/ARCHITECTURE-SECURITY.md
docs/DEPLOY.md
```

עקרון: **התראה שלא מובילה לפעולה היא רעש.**

---

## 0. החלטה (OPS1 עד OPS10)

| # | הכרעה |
|---|---|
| OPS1 | שלוש סביבות: dev (local), Preview (PR), Production (פרויקט Supabase נפרד). |
| OPS2 | Preview לעולם לא נוגע ב-DB/card terminal של prod. |
| OPS3 | `vercel.json`: regions `fra1` + crons (expire, reconcile, money-alarms). |
| OPS4 | `src/lib/env.ts` + `instrumentation.ts`: כשל בעליה, לא בבקשה. |
| OPS5 | `/api/health` רדוד; deep checks ב-cron מאומת. |
| OPS6 | Sentry למסלול כסף; scrub לפני שליחה; ntfy SEV1. |
| OPS7 | גיבוי: Supabase daily + `pg_dump` מוצפן ליעד חיצוני. |
| OPS8 | Rollback = Vercel Instant Rollback; **לא** rollback DB. |
| OPS9 | `CHECKOUT_ENABLED` kill switch לפני תקלת ספק. |
| OPS10 | תרגיל שחזור DB רבעוני עם זמן מדוד (חוסם שיגור). |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| פרויקט Supabase יחיד לכל הסביבות | OPS1; blast radius |
| deep health פומבי (DB+Cardcom ping) | information leak |
| alert על כל 4xx | noise למפעיל יחיד |
| PagerDuty enterprise v1 | ntfy + Better Stack מספיק |
| rollback DB עם rollback קוד | OPS8; expand/contract |

---

## 2. סכמת DB

**אין DDL חדש במסמך זה.** טבלאות תפעוליות:

| טבלה | שימוש OPS |
|---|---|
| `payment_webhook_events` | dedup, DLQ, reconcile |
| `settlement_events` | reconcile יומי |
| `audit_log` | פעולות admin |
| `v_money_alarms` (view) | אזעקות כסף |
| `voucher_redemptions` | fraud runbook R-5 |

`assert_seeds_allowed` חוסם seed בפרוד.

---

## 3. סביבות ו-Vercel (תמצית)

| | Development | Preview | Production |
|---|---|---|---|
| Supabase | local Docker | dev project | **prod project חדש** eu-central-1 |
| Cardcom | mock | sandbox | terminal אמיתי |
| `CRON_SECRET` | - | **אסור** | חובה |
| Sentry env | - | preview | production |

**פערים מדודים (2026-07-29):** אין `vercel.json` (cron expire לא רץ), אין `/api/health`, אין `env.ts`, פרויקט DB יחיד.

### חמש התראות (מקסימום)

| # | התראה | ערוץ |
|---|---|---|
| A1 | כשל תשלום | push + מייל |
| A2 | webhook חתימה שגויה | מייל |
| A3 | `v_money_alarms` | push + מייל |
| A4 | cron נכשל | מייל |
| A5 | >25 שגיאות / 5 דק | מייל |

פריסה: מיגרציה expand → verify → deploy → smoke → Instant Rollback אם צריך.

---

## 4. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| OP-E1 | deploy עם env חסר | boot fail (יעד env.ts) |
| OP-E2 | cron expire לא רץ | vouchers לא מזוכים; LEG-04 exposure |
| OP-E3 | stranded payment (paid at Cardcom, pending order) | reconcile R-2 |
| OP-E4 | PITR מעל prod תחת לחץ | **אסור**; פרויקט חדש |
| OP-E5 | `pg_dump` corrupt | `pg_restore --list` catch |
| OP-E6 | Cardcom down | CHECKOUT_ENABLED=false |
| OP-E7 | secret leak service_role | rotate + audit wallet/vouchers |

---

## 5. Runbooks Cardcom (תמצית)

| סימן | runbook |
|---|---|
| "חויבתי, אין שובר" | R-2: payments + webhook_events + reconcile |
| כל התשלומים נכשלים | R-3: config vs Cardcom status |
| `signature_valid=false` | rotate webhook secret |
| `v_money_alarms` | R-4: אדם בלבד, ledger append |

---

## 6. פתוחות

| # | פער | חומרה |
|---|---|---|
| OPS-1 | פרויקט Supabase יחיד | **קריטי** |
| OPS-2 | אין vercel.json / cron | **קריטי** |
| OPS-3 | אין גיבוי חיצוני + restore test | **קריטי** |
| OPS-4 | env.ts / instrumentation חסרים | גבוה |
| OPS-5 | reconcile-cardcom cron חסר | גבוה |

שער שיגור O1-O15: O10 (restore) ו-O15 (fire drill) לא ניתנים לזייף.

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-29 | מסמך OPS מלא (mega-docs) |
| 2026-08-12 | batch-2: DOCS-TEMPLATE-BINDING |
