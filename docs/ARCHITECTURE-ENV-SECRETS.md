# ארכיטקטורה: סביבה וסודות (Env & Secrets)

מטריצת **סביבה וסודות** ל-KenyonExpress: מה חייב איפה, מה אסור בדפדפן.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow** · `ESCROW_FLOW_ENABLED` לעולם לא true

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/ARCHITECTURE-ENV-SECRETS.md
docs/GO-LIVE-CHECKLIST.md
docs/ARCHITECTURE-SECURITY.md
docs/ARCHITECTURE-CHECKOUT-CARDCOM.md
docs/ARCHITECTURE-NOTIFICATIONS-V2.md
```

---

## 0. החלטה (E1 עד E8)

| # | הכרעה |
|---|---|
| E1 | כל `NEXT_PUBLIC_*` נחשף לדפדפן. אסור service role / Cardcom password / Resend key שם. |
| E2 | Edge Functions ו-Vercel server actions בלבד מחזיקים סודות כסף. |
| E3 | Preview ≠ Production: מפתחות נפרדים; Preview לא מצביע על DB prod. |
| E4 | סיבוב סוד: תיעוד owner + תאריך; אחרי leak: rotate מיידי. |
| E5 | אין Make/Zapier כמחסן סודות. |
| E6 | `CARDCOM_SANDBOX=false` בפרודקשן; `env.ts` חוסם sandbox+prod. |
| E7 | `CRON_SECRET` פרודקשן בלבד (Preview לא מריץ crons). |
| E8 | `SUPABASE_DB_URL` לא ב-Vercel (כלים מקומיים בלבד). |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| סודות ב-repo (`.env` committed) | דליפה ב-git history |
| client-side Cardcom עם password | E1; PCI + גניבת מפתח |
| secret sharing ב-Slack/email | E4; אין audit rotate |
| env יחיד לכל הסביבות | E3; Preview על prod DB |
| `ESCROW_FLOW_ENABLED=true` | סותר No Escrow; CONTRADICTIONS |

---

## 2. סכמת DB

**אין DDL חדש במסמך זה.**  
סודות לא נשמרים ב-DB למעט hash/reference (אם בכלל).  
`assert_seeds_allowed` ב-DB חוסם seed בפרודקשן (ראה `ARCHITECTURE-OPS.md`).

---

## 3. מטריצת משתנים

| Variable | Vercel Prod | Preview | Edge | Browser | הערות |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | yes | yes | yes | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | yes | yes | yes | RLS-bound |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | isolated | yes | **no** | |
| `CARDCOM_*` | yes | sandbox | no* | **no** | |
| `RESEND_API_KEY` | yes | yes | yes | **no** | |
| `CRON_SECRET` | yes | **no** | yes | **no** | E7 |
| `VOUCHER_QR_SECRET` | yes | yes | yes | **no** | |
| `VOUCHER_QR_SECRET_PREVIOUS` | yes | yes | yes | **no** | rotation |
| `MEILI_ADMIN_KEY` | yes | yes | no | **no** | |
| `R2_*` | yes | yes | no | **no** | |
| `CHECKOUT_ENABLED` | yes | yes | no | no | kill switch |
| `ESCROW_FLOW_ENABLED` | unset/false | unset | unset | n/a | **never true** |
| `SENTRY_DSN` | yes | yes | optional | public ok | |

---

## 4. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| ES-E1 | `NEXT_PUBLIC_*` עם SECRET במפתח | boot failure ב-`env.ts` |
| ES-E2 | Preview עם prod Supabase URL | assert / manual misconfig alert |
| ES-E3 | rotate `VOUCHER_QR_SECRET` | `PREVIOUS` מקבל חלון; QR ישנים עובדים |
| ES-E4 | `CRON_SECRET` leaked | rotate + audit cron calls |
| ES-E5 | missing Cardcom env at runtime | fail at boot (לא בבקשה ראשונה) |
| ES-E6 | Resend key in client bundle | CI secret scan חוסם |
| ES-E7 | `SUPABASE_DB_URL` in Vercel | reject deploy checklist X1 |

---

## 5. סיבוב (מינימום)

| סוד | תדירות | הערות |
|---|---|---|
| `CRON_SECRET` | שנתי / אחרי חשד | עדכן כל cron callers |
| `VOUCHER_QR_SECRET` | לפי צורך | השאר PREVIOUS ל-TTL קצר |
| Cardcom password | לפי ספק | אל תשבור tokens בלי תוכנית |

### בדיקות לפני שיגור

| # | בדיקה |
|---|---|
| X1 | `rg` על service role / Cardcom / Resend תחת client bundles |
| X2 | Production env list ללא חסרים מ-§3 |
| X3 | Preview project ref ≠ prod |
| X4 | `ESCROW_FLOW_ENABLED` לא מוגדר או false |

---

## 6. פתוחות

| # | פער | תאריך |
|---|---|---|
| O1 | `src/lib/env.ts` לא קיים בקוד (יעד מתועד) | 2026-08-12 |
| O2 | מנהל סיסמאות + עותק offline לא-מקוון | 2026-08-12 |
| O3 | אוטומציה rotate reminder | 2026-08-12 |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-31 | מטריצת env/secrets |
| 2026-08-12 | batch-2: DOCS-TEMPLATE-BINDING |
