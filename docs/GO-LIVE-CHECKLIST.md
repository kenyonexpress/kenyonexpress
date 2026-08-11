# GO-LIVE-CHECKLIST.md
# צ'קליסט עלייה לאוויר (KenyonExpress)

שערי Go-Live לכסף אמיתי וקופונים אמיתיים. מסודר לפי **בעלות + עדיפות**.  
סדר ביצוע קשיח נוסף:

```
GO-LIVE.md
docs/LAUNCH-CHECKLIST.md
docs/LAUNCH-WEEK-RUNBOOK.md
docs/RUNBOOK-LAUNCH-DAY.md
docs/PAYOUT-ARCHITECTURE.md
```

Status: **ACTIONABLE** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`

מסמכים קשורים:

```
GO-LIVE.md
docs/LAUNCH-CHECKLIST.md
docs/LAUNCH-VALIDATION.md
docs/PAYOUT-ARCHITECTURE.md
docs/CARDCOM-ARCHITECTURE.md
docs/BACKUP-RESTORE-RUNBOOK.md
docs/SECURITY-AUDIT-CHECKLIST.md
docs/ANALYTICS-SPEC.md
docs/GITHUB-SETTINGS.md
docs/INCIDENT-RESPONSE-RUNBOOK.md
```

מקור מספרי היסטורי (קריאה בלבד מהראשית): `docs/FINAL-REPORT.md` §7 (חסמי נתונים: ספקים בלי כתובת/לוגו, דילי בית שבורים, legal). שערי CI שם נמדדו; נותר קונפיג אנושי.

כלל: שיגור כסף אמיתי רק כשכל שערי **P0** מסומנים PASS עם ראיה (לוג / צילום / timestamp).

---

## 0. דרגות

| דרגה | משמעות |
|---|---|
| P0 | חוסם כסף אמיתי / קופון אמיתי / אבטחת כסף |
| P1 | חוסם שיגור ציבורי מלא; אפשר soft-open מוגבל בלעדיו |
| P2 | אחרי השקה / שיפור |

בעלות: **אתה** (מפעיל יחיד) לכל השערים אלא אם צוין אחרת.

---

## 1. דומיין ו-DNS (P0 לפני מותג ציבורי)

- [ ] דומיין `kenyonexpress.co.il` מחובר בפרויקט Vercel  
- [ ] רשומות DNS מצביעות ל-Vercel (A/CNAME לפי האשף)  
- [ ] SSL תקף (HTTPS ירוק)  
- [ ] `NEXT_PUBLIC_APP_URL=https://kenyonexpress.co.il`  
- [ ] תוכנית rollback DNS מתועדת  
- [ ] HSTS preload רק אחרי ≥48ש יציבות (P1)

ראיה: צילום Domains ב-Vercel + `curl -I` HTTPS.

---

## 2. Vercel Production (P0)

- [ ] פרויקט מצביע ל-branch הייצור הנכון (`main` / הענף המוסכם)  
- [ ] Production deploy אחרון ירוק  
- [ ] Preview נפרד מ-Production  
- [ ] Instant Rollback ידוע למפעיל  
- [ ] אין secrets ב-`.next/static` (grep אחרי build)

---

## 3. Env vars (P0)

מול `.env.example` (שמות מדויקים ב-Vercel server env):

| משתנה | חובה |
|---|---|
| `NEXT_PUBLIC_APP_URL` | כן |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | כן |
| `SUPABASE_SERVICE_ROLE_KEY` | כן (server only) |
| `CARDCOM_TERMINAL_NUMBER` | כן לפרוד |
| `CARDCOM_API_NAME` | כן |
| `CARDCOM_API_PASSWORD` | כן (זיכויים / Financial) |
| `CARDCOM_WEBHOOK_SECRET` | כן (`?s=` ב-IndicatorUrl) |
| `VOUCHER_QR_SECRET` | כן (32+ bytes) |
| `CRON_SECRET` | כן |
| `CHECKOUT_ENABLED` | כן (`false` עד smoke) |

אופציונלי להשקה מלאה: Resend, Sentry DSN, Meilisearch, QStash, R2.

- [ ] טבלת שמות env מאומתת מול הדשבורד (login אנושי)  
- [ ] אין service role ב-client  

---

## 4. Cardcom production (P0)

- [ ] מסוף production פתוח ומאומת עסקית  
- [ ] מסוף בדיקות זמין ל-smoke  
- [ ] Low Profile / Interface חי לפי הקוד  
- [ ] Webhook URL ציבורי HTTPS + secret  
- [ ] Smoke: תשלום → return → אימות (`GetLpResult`) → `paid` → voucher `issued`  
- [ ] Smoke refund  
- [ ] רק אז: `CHECKOUT_ENABLED=true`  
- [ ] (פיזי / payout) בנק דיגיטלי + הרשאת `TransferFromDigitalBank` לפני תשלום ספק אמיתי (`PAYOUT-ARCHITECTURE.md` §11; `CARDCOM-ARCHITECTURE.md` §1.5)

---

## 5. מסד נתונים וגיבויים (P0)

- [ ] Supabase **Pro** + **PITR** מופעל  
- [ ] תרגול restore מתועד או מתוכנן (`BACKUP-RESTORE-RUNBOOK.md`)  
- [ ] `pg_dump` offsite מוצפן (לפחות שבועי)  
- [ ] RLS: `NOT rowsecurity` = 0 על `public`  
- [ ] מיגרציות רק דרך **MCP**, אחת-אחת  
- [ ] `platform_percent` מלא בכל מוצר חי  
- [ ] `coupon_price` / מחיר קופון מלא לדילי השקה  

---

## 6. אבטחה (P0 כסף)

- [ ] סעיפי כסף/QR/ארנק ב-`SECURITY-AUDIT-CHECKLIST.md`  
- [ ] SEC-QR keyed לפני פרוד מלא  
- [ ] SEC-WALLET: אין EXECUTE ל-PUBLIC על `fn_wallet_transfer`  
- [ ] Rate limit fail-closed על checkout/redeem  

---

## 7. מוניטורינג (P0 soft-open / P1 ציבורי)

- [ ] Sentry מחובר ל-Production (בלי PII/PAN)  
- [ ] התראת error spike למפעיל  
- [ ] לוגים עם request-id  
- [ ] Cron health / admin status אם קיים  

---

## 8. מדידה ו-consent (P1 גבוה)

- [ ] באנר עוגיות חי  
- [ ] Consent Mode: אין Pixel לפני marketing grant (`ANALYTICS-SPEC.md`)  
- [ ] GA4 Measurement ID בפרוד  

---

## 9. תוכן ודילי השקה (P0 מסחרי)

מיושר ל-`FINAL-REPORT.md` §7 (קריאה מהראשית) + `LAUNCH-VALIDATION.md`:

- [ ] ≥ 5/10 דילי seed `verified` מול `suppliers`  
- [ ] תמונות + מחיר + יתרה בעסק בדף  
- [ ] אין קישורי בית ל-slug מוצר שלא קיים (8 דילים שבורים היסטורית ב-FINAL-REPORT)  
- [ ] ספקי השקה: כתובת + לוגו מינימליים לתצוגה  
- [ ] `/about` עם תוכן בסיסי (P1)  
- [ ] עמודי legal בסיסיים קיימים; ניסוח סופי **[דורש עו״ד]** (P1 לפרסום ממומן)  

---

## 10. Payout פיזי (P1 אם יש פיזי בהשקה; P0 לפני תשלום ספק)

לפי `PAYOUT-ARCHITECTURE.md`:

- [ ] מיגרציית `supplier_bank_accounts` + `payout_statements` (+ lines) הוחלה ב-MCP  
- [ ] חשבונות בנק מאומתים (`verified_at`) לספקי פיזי  
- [ ] מסך `/admin/payouts` חי  
- [ ] Sandbox: statement → `TransferFromDigitalBank` → `GetMoneyTransfers` ירוק  
- [ ] Kill switch ל-cron Transfer (בלי לכבות סליקת לקוח)  
- [ ] CSV fallback מנוסה  
- [ ] Reconciliation יומי מוגדר (Sentry/דוח)  
- [ ] שערי §11 ב-PAYOUT-ARCHITECTURE מסומנים  

קופונים בלבד: אפשר soft-open בלי payout.

---

## 11. GitHub / CI (P1)

- [ ] Required checks לפי `GITHUB-SETTINGS.md`  
- [ ] Branch protection על הענף לייצור  
- [ ] תג release על ה-commit המועמד (P2)  

### 11.1 שערי מדידה היסטוריים (`FINAL-REPORT.md`, קריאה מהראשית)

נמדדו ב-2026-08-07 על build נקי; **לא מחליפים** smoke Cardcom חי. לפני cutover ציבורי: לאשר שהענף הנוכחי עדיין ירוק באותם סוגי שערים.

| שער | תוצאה שנמדדה אז | חובה עכשיו |
|---|---|---|
| `pnpm test` (Vitest) | 1833/1833 | ירוק על הענף לייצור |
| Playwright E2E | 191 passed / 0 failed | ירוק (`E2E_WEB_COMMAND='pnpm start'`) |
| `pnpm type-check` / `lint` / `build` | clean | ירוק |
| `compare.mjs` home/category | מתחת לשער 11% | ירוק אם עדיין בשימוש |

מה שנשאר אנושי (לא קוד): env ב-Vercel, DNS, PITR, Cardcom production, דילי seed, אישור עו״ד ל-legal.

---

## 12. Soft-open (סדר יום)

1. כל P0 למעלה PASS  
2. `CHECKOUT_ENABLED=true`  
3. רכישת אמת אחת + redeem אצל ספק אחד  
4. באנר/מודעה אורגנית בלבד  
5. מדיה ממומנת רק אחרי D1–D2 יציבים (`MARKETING-LAUNCH-PLAN.md`)  

Kill switch מיידי: `CHECKOUT_ENABLED=false` + `INCIDENT-RESPONSE-RUNBOOK.md`.

---

## 13. אחרי 48 שעות

- [ ] אין diff Cardcom↔ledger לא מוסבר  
- [ ] Sentry שקט יחסית  
- [ ] עדכון `STATE.md` / `PROGRESS-REPORT-AUG.md`  
- [ ] החלטת HSTS / הרחבת מדיה  
- [ ] אם פיזי שולם לספק: reconcile payout יומי ירוק  

---

## 14. Acceptance מסמך

- [ ] אין שפת Escrow בצ'קליסט  
- [ ] מפעיל יודע היכן kill switch  
- [ ] קישור ל-PITR ול-payout הקנוני  
- [ ] חסמי FINAL-REPORT §7 מכוסים בסעיף 9  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | צ'קליסט Go-Live: דומיין, Vercel, env, Cardcom, PITR, אבטחה, דילים, payout |
| 2026-08-11 | יישור ל-FINAL-REPORT §7 + שערי TransferFromDigitalBank מפורטים |
| 2026-08-11 | §11.1: שערי CI שנמדדו ב-FINAL-REPORT + מה שנשאר אנושי |
