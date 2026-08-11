# ארכיטקטורה: צ'קליסט השקה (Launch gates)

שערי Go-Live מחייבים לפני כסף אמיתי על Next + Supabase + Vercel.

Status: **BINDING** · עודכן: 2026-08-12 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #35/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/GO-LIVE-CHECKLIST.md
docs/LAUNCH-CHECKLIST.md
docs/LAUNCH-WEEK-RUNBOOK.md
docs/ARCHITECTURE-PRODUCTION-OPS.md
docs/ARCHITECTURE-OBSERVABILITY.md
docs/ARCHITECTURE-BACKUP-DR.md
docs/ARCHITECTURE-CARDCOM-WEBHOOKS.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/CONTRADICTIONS.md
```

כלל: **כסף אמיתי רק אחרי שכל שערי P0 מסומנים PASS עם ראיה** (צילום / לוג / timestamp).

מודל כסף: **No Escrow**. אין held. אין default ל-`platform_percent`.

---

## 0. ששת שערי P0 (חוסמים)

1. Resend verified  
2. Cardcom production credentials  
3. Sentry alerts  
4. Vercel domains + HTTPS  
5. Backup policy (Pro + PITR + offsite)  
6. 10 קופוני השקה live עם `platform_percent` מפורש פר מוצר  

---

## 1. Resend verified

| שער | ראיה |
|---|---|
| דומיין שולח מאומת (SPF/DKIM) | צילום Resend Domains |
| From קבוע בעברית RTL | מייל ניסיון inbox |
| `RESEND_API_KEY` ב-Vercel server env | dashboard |
| Smoke: `order_paid` / voucher issued | outbox `sent` |
| אין שיווק בלי opt-in | preferences |

---

## 2. Cardcom production

| שער | ראיה |
|---|---|
| מסוף production פתוח | פאנל Cardcom |
| `CARDCOM_TERMINAL_NUMBER` / `API_NAME` / `API_PASSWORD` | Vercel prod |
| `CARDCOM_WEBHOOK_SECRET` + IndicatorUrl HTTPS עם `?s=` | URL + secret |
| Smoke: תשלום → return → `GetLpResult` → `paid` → voucher `issued` | לוג הזמנה |
| Smoke refund | לוג refund |
| רק אז: `CHECKOUT_ENABLED=true` | env + audit |

בלי `API_PASSWORD`: חיובים עלולים לעבוד והחזרים ייכשלו.  
אין HMAC על גוף webhook. אימות = `?s=` + `GetLpResult`.

---

## 3. Sentry alerts

| שער | ראיה |
|---|---|
| DSN פרוד (server + client לפי מדיניות PII) | Sentry project |
| Alert: error spike / checkout | rule פעיל |
| Alert: redeem failures / notification DLQ | rule |
| Alert: Cardcom finalize / refund failed | rule |
| אין PAN/PII באירועים | sample נקי |
| ערוץ למפעיל (מייל/Slack/ntfy) | הודעת ניסיון |

---

## 4. Vercel domains

| שער | ראיה |
|---|---|
| `kenyonexpress.co.il` מחובר | Domains UI |
| DNS → Vercel + SSL | dig / `curl -I` |
| `NEXT_PUBLIC_APP_URL` = דומיין הקנוני | env |
| Production deploy ירוק | Deployments |
| Instant Rollback ידוע | תרגול קצר |
| Preview ≠ Production | הפרדת env |

HSTS preload: רק אחרי יציבות (P1).

---

## 5. Backup policy

| שער | ראיה |
|---|---|
| Supabase **Pro** + **PITR** | dashboard |
| RPO/RTO מתועדים | BACKUP-DR |
| תרגול restore מתוכנן/בוצע | תאריך |
| `pg_dump` offsite מוצפן (לפחות שבועי) | מיקום + checksum |
| מיגרציות prod רק MCP | נוהל |
| אין טבלת `public` בלי rowsecurity | שאילתה = 0 |

בלי PITR: אין עלייה לכסף אמיתי.

---

## 6. First 10 coupons live

| שער | ראיה |
|---|---|
| 10 דילי קופון השקה ב-`products` | IDs / slugs |
| כל אחד: `status=active`, תמונה, מחיר קופון, **`platform_percent` מפורש** (בלי default) | שאילתה |
| ספק מקושר עם מינימום publish | `suppliers` |
| אין תעריף מחייב ברמת ספק | PRICING-RULES |
| PDP: מחיר אתר + יתרה בעסק (**No Escrow**) | צילום |
| קנייה אמיתית אחת אחרי Cardcom smoke | `order_id` |

אסור: מוצר בלי `platform_percent`; אסור להמציא 5%/10% כברירת מחדל.

---

## 7. שערי P1 (שיגור מלא)

- [ ] Meilisearch פרוד + אינדוקס  
- [ ] Drain notifications (QStash / Worker)  
- [ ] Analytics consent + PostHog/GA4  
- [ ] 2FA לאדמין  
- [ ] עמוד מדיניות ביטולים מאושר עו״ד (statutory fee ≠ commission)  
- [ ] SEO redirects smoke מנתיבי WP ישנים  

---

## 8. סדר הפעלה

```text
1. Vercel domains + env שלד
2. Backup / PITR
3. Cardcom production + smoke charge/refund
4. Resend verified + מייל ניסיון
5. Sentry alerts
6. 10 קופונים live + validation
7. CHECKOUT_ENABLED=true
8. קנייה אמיתית אחת + redeem בשטח
```

---

## 9. Acceptance (כל ה-P0)

- [ ] Resend verified  
- [ ] Cardcom prod + smoke charge/refund  
- [ ] Sentry alerts חיים  
- [ ] Vercel domain + HTTPS + APP_URL  
- [ ] PITR + מדיניות גיבוי  
- [ ] 10 קופונים עם percent פר מוצר (בלי default)  
- [ ] No Escrow בנוסח ובתשלום  

---

## 10. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | שערי Resend/Cardcom/Sentry/Vercel/backup/10 coupons |
| 2026-08-12 | batch-2 #35: BINDING על arch/docs-batch-2; הדגשת אין default percent / No Escrow |
| 2026-08-12 | batch-2 #35 pass-2: BINDING על arch/docs-batch-2 (המשך תור) |
