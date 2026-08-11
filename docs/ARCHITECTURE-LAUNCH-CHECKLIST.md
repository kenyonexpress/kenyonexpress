# ארכיטקטורה: צ'קליסט השקה (Launch gates)

שערי Go-Live מחייבים: Resend מאומת, Cardcom production, התראות Sentry, דומיינים ב-Vercel, מדיניות גיבוי, ו-10 קופוני השקה חיים.

Status: **ACTIONABLE / BINDING gates** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים (סדר ביצוע מפורט יותר):

```
docs/GO-LIVE-CHECKLIST.md
docs/LAUNCH-CHECKLIST.md
docs/LAUNCH-WEEK-RUNBOOK.md
docs/LAUNCH-VALIDATION.md
docs/RUNBOOK-LAUNCH-DAY.md
GO-LIVE.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/CARDCOM-ARCHITECTURE.md
docs/BACKUP-RESTORE-RUNBOOK.md
docs/ARCHITECTURE-OBSERVABILITY.md
docs/SECURITY-AUDIT-CHECKLIST.md
docs/PAYOUT-ARCHITECTURE.md
```

כלל: **כסף אמיתי רק אחרי שכל שערי P0 למטה מסומנים PASS עם ראיה** (צילום / לוג / timestamp).

---

## 0. המלצה אחת (מחייבת)

**ששת השערים האלה חוסמים soft-open עם תשלום אמיתי:** Resend verified · Cardcom production credentials · Sentry alerts · Vercel domains · backup policy חיה · 10 קופונים ראשונים live עם `platform_percent` מלא.

פירוט בעלות/סדר ארוך: `GO-LIVE-CHECKLIST.md` + `LAUNCH-CHECKLIST.md`. המסמך הזה הוא **שערי הארכיטקטורה** שחייבים להיות ירוקים.

---

## 1. Resend verified (P0 לתקשורת הזמנה)

| שער | ראיה |
|---|---|
| דומיין שולח מאומת ב-Resend (SPF/DKIM) | צילום Domains ב-Resend |
| From קבוע בעברית RTL (למשל הזמנות@דומיין) | מייל ניסיון inbox |
| `RESEND_API_KEY` ב-Vercel server env בלבד | dashboard env |
| Smoke: `order_paid` / `voucher_issued` אחרי תשלום בדיקה | לוג outbox `sent` |
| אין שיווק בלי opt-in (`ARCHITECTURE-NOTIFICATIONS.md`) | preferences / מדיניות |

בלי Resend מאומת: אפשר soft-open טכני רק אם יש ערוץ חלופי מתועד ל-OTP/קריטי; **לא** מומלץ לכסף אמיתי.

---

## 2. Cardcom production credentials (P0 לכסף)

| שער | ראיה |
|---|---|
| מסוף **production** פתוח ומאומת עסקית | פאנל Cardcom |
| `CARDCOM_TERMINAL_NUMBER` | Vercel prod |
| `CARDCOM_API_NAME` | Vercel prod |
| `CARDCOM_API_PASSWORD` | Vercel prod (חובה לזיכויים) |
| `CARDCOM_WEBHOOK_SECRET` + IndicatorUrl HTTPS | URL + secret |
| Smoke: תשלום → return → `GetLpResult` → `paid` → voucher `issued` | לוג הזמנה |
| Smoke refund (`RefundByTransactionId`) | לוג refund |
| רק אז: `CHECKOUT_ENABLED=true` | env + audit |

בלי `API_PASSWORD`: חיובים עלולים לעבוד והחזרים ייכשלו בשטח.  
Payout לספק: לפי `PAYOUT-ARCHITECTURE.md` (TransferFromDigitalBank / CSV) לפני כסף אמיתי לספק.

---

## 3. Sentry alerts (P0 לתצפית)

| שער | ראיה |
|---|---|
| DSN פרוד מוגדר (server + client לפי מדיניות PII) | Sentry project |
| Alert: error spike / תסמין checkout | rule פעיל |
| Alert: redeem failures / DLQ notifications | rule או מקביל |
| Alert: Cardcom finalize / refund failed | rule |
| אין PAN/PII באירועים | sample event נקי |
| ערוץ התראה למפעיל (מייל/Slack/SMS) | הודעת ניסיון |

פירוט: `ARCHITECTURE-OBSERVABILITY.md` + `INCIDENT-RESPONSE-RUNBOOK.md`.

---

## 4. Vercel domains (P0 למותג ציבורי)

| שער | ראיה |
|---|---|
| `kenyonexpress.co.il` מחובר בפרויקט | Domains UI |
| DNS → Vercel | dig / אשף |
| SSL תקף (HTTPS) | `curl -I` |
| `NEXT_PUBLIC_APP_URL=https://kenyonexpress.co.il` | env |
| Production deploy ירוק על הענף המוסכם | Deployments |
| Instant Rollback ידוע | תרגול קצר |
| Preview ≠ Production | הפרדת env |

HSTS preload: רק אחרי יציבות (P1).

---

## 5. Backup policy (P0 לנתונים)

| שער | ראיה |
|---|---|
| Supabase **Pro** + **PITR** דלוק | dashboard |
| מדיניות RPO/RTO מתועדת | `BACKUP-RESTORE-RUNBOOK.md` / BACKUP-RECOVERY |
| תרגול restore מתוכנן או בוצע | הערת תאריך |
| `pg_dump` offsite מוצפן (לפחות שבועי) | מיקום + checksum |
| מיגרציות prod רק דרך **MCP**, אחת-אחת | נוהל |
| RLS: אין טבלת `public` בלי rowsecurity | שאילתת ספירה = 0 |

בלי PITR: אין עלייה לכסף אמיתי.

---

## 6. First 10 coupons live (P0 לקטלוג השקה)

| שער | ראיה |
|---|---|
| 10 דילי קופון מהשקה קיימים ב-`products` | רשימת IDs / slugs |
| כל אחד: `status=active`, תמונה, מחיר קופון, **`platform_percent` פר מוצר** | שאילתה |
| ספק מקושר עם כתובת/לוגו מינימום ל-publish | `suppliers` |
| אין תעריף ברמת ספק; אחוז מוסכם פר דיל | `ARCHITECTURE-SUPPLIER-ONBOARDING.md` |
| PDP מציג מחיר אתר + יתרה בעסק (No Escrow) | צילום |
| אימות מול פרוד | `LAUNCH-VALIDATION.md` |
| קנייה אמיתית אחת (אחרי Cardcom smoke) על דיל מהרשימה | order_id |

מקור רשימה היסטורי: `scripts/seed/catalogue-data.mjs` / `launch-week-plan.md` / `PROGRESS-REPORT-AUG.md`.

---

## 7. שערי P1 (לא חוסמים soft-open צר, חוסמים שיגור מלא)

- [ ] Meilisearch פרוד + אינדוקס  
- [ ] QStash / CF Worker ל-notifications drain  
- [ ] Analytics consent + PostHog/GA4  
- [ ] 2FA לאדמין  
- [ ] SEC-QR / SEC-WALLET סגורים לפי SECURITY  
- [ ] עמוד מדיניות ביטולים מאושר עו״ד  

---

## 8. סדר הפעלה מומלץ

```text
1. Vercel domains + env שלד
2. Backup / PITR
3. Cardcom production + smoke charge/refund
4. Resend verified + מייל ניסיון
5. Sentry alerts
6. 10 קופונים live + LAUNCH-VALIDATION
7. CHECKOUT_ENABLED=true
8. קנייה אמיתית אחת + redeem בשטח
```

---

## 9. Acceptance (כל ה-P0)

- [ ] Resend verified + smoke מייל הזמנה  
- [ ] Cardcom prod credentials + smoke charge/refund  
- [ ] Sentry alerts חיים למפעיל  
- [ ] Vercel domain + HTTPS + APP_URL  
- [ ] PITR + מדיניות גיבוי  
- [ ] 10 קופונים חיים עם percent פר מוצר  
- [ ] No Escrow בנוסח ובתשלום  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | יצירה: שערי Resend/Cardcom/Sentry/Vercel/backup/10 coupons |
