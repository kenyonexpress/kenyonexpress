# ARCHITECTURE-GO-LIVE-CHECKLIST.md

צ'קליסט **Go-Live** מחייב לשיגור KenyonExpress (כסף אמיתי + קופונים אמיתיים).

Status: BINDING · worktree

```
/Users/ofir/kenyonexpress-web/ke-arch
```

branch:

```
arch/docs-queue
```

Date: 2026-07-31 (rev C)  
Scope: **docs בלבד** בקובץ זה. הביצוע בשערי CI/ops לפי הצ'קליסט.

Companions: `MASTER-ARCHITECTURE-v2.md`, `ARCHITECTURE-ENV-SECRETS.md`, `ARCHITECTURE-BACKUP-DR.md`, `ARCHITECTURE-FEATURE-FLAGS.md`, checkout-cardcom, notifications V2, analytics.

---

## 0. פסיקה

שיגור מותר רק כשכל שערי **P0** מסומנים PASS עם ראיה (פקודה, צילום מסך, או לוג עם timestamp).  
P1 יכולים להישאר עם תאריך יעד אחרי soft-launch.  
P2 לא חוסמים soft-launch מוגבל.

| דרגה | משמעות |
|---|---|
| P0 | חוסם כסף אמיתי / קופון אמיתי / אבטחה |
| P1 | חוסם שיגור ציבורי מלא, לא soft-launch סגור |
| P2 | איכות / חוב טכני |

**מודל כסף בשיגור:** קופון = מלוא `coupon_price_ils` באתר, נשאר בפלטפורמה, **אין Escrow**. פיזי = פיצול לפי `platform_percent` דינמי מצולם ב-`order_items`. אין Make/Zapier בייצור. אין עמלת 5% קבועה.

Kill switches (חובה מוכנים לפני C3):

```
CHECKOUT_ENABLED=false
ESCROW_FLOW_ENABLED   # חייב unset/false; אסור true
```

---

## 1. דומיין ו-DNS / TLS

| # | בדיקה | P | סטטוס | ראיה |
|---|---|---|---|---|
| DOM1 | Apex + www: `kenyonexpress.co.il` מצביעים ל-Vercel prod | P0 | | dig / Vercel domains |
| DOM2 | TLS תקף (HTTPS בלבד, HSTS אופציונלי אחרי יציבות) | P0 | | browser / SSL labs |
| DOM3 | Canonical host אחד (הפניית www↔apex עקבית) | P0 | | curl -I |
| DOM4 | Supabase Auth redirect allowlist כולל `https://kenyonexpress.co.il/auth/callback` | P0 | | dashboard screenshot |
| DOM5 | Google OAuth client: redirect URIs prod בלבד (בלי localhost ב-prod client) | P0 | | |
| DOM6 | Resend: דומיין שולח מאומת (SPF/DKIM) על דומיין האתר או subdomain | P0 | | Resend DNS |
| DOM7 | Cardcom Success/Fail/Webhook URLs על host הפרוד | P0 | | |
| DOM8 | אין תעודת staging על דומיין הפרוד | P0 | | |

---

## 2. Vercel production

| # | בדיקה | P | סטטוס | ראיה |
|---|---|---|---|---|
| VCL1 | Project מחובר ל-repo הנכון; Production branch מאושר (לא preview בטעות) | P0 | | |
| VCL2 | Production deployment האחרון GREEN; build = `pnpm` / Next 15 | P0 | | deploy URL |
| VCL3 | Environment = Production מופרד מ-Preview / Development | P0 | | |
| VCL4 | Preview **לא** מצביע על Supabase prod / Cardcom prod | P0 | | env diff |
| VCL5 | Cron routes מוגנים ב-`CRON_SECRET` (expire vouchers, notifications, webhook retry) | P0 | | |
| VCL6 | Region / edge config יציב; אין ניסויי flag פתוחים ב-prod | P1 | | |
| VCL7 | Rollback: יודעים איך לקדם deployment קודם תוך דקות | P0 | | runbook note |
| VCL8 | `CHECKOUT_ENABLED` ניתן לשינוי ב-Production env בלי redeploy קוד ארוך (או redeploy מהיר) | P0 | | |

---

## 3. Env vars (Production)

מקור מחייב לפירוט: `ARCHITECTURE-ENV-SECRETS.md`. סיכום שערי שיגור:

| # | Variable / קבוצה | P | חובה |
|---|---|---|---|
| ENV1 | `NEXT_PUBLIC_SUPABASE_URL` + anon | P0 | תואם פרויקט prod |
| ENV2 | `SUPABASE_SECRET_KEY` (service role) | P0 | **לא** `NEXT_PUBLIC_`; לא demo |
| ENV3 | Cardcom prod set (§4) | P0 | |
| ENV4 | `RESEND_API_KEY` + `RESEND_FROM` | P0 | |
| ENV5 | `CRON_SECRET` | P0 | |
| ENV6 | `VOUCHER_QR_SECRET` (+ optional PREVIOUS) | P0 | |
| ENV7 | Meilisearch host + key | P1 | חיפוש |
| ENV8 | R2 credentials | P1 | מדיה |
| ENV9 | `SENTRY_DSN` (+ auth token ל-source maps אם בשימוש) | P0 | §5 |
| ENV10 | `CHECKOUT_ENABLED=true` רק אחרי P0 כסף | P0 | |
| ENV11 | `ESCROW_FLOW_ENABLED` unset או false | P0 | |
| ENV12 | `UNSUBSCRIBE_SIGNING_SECRET` | P1 | notifications |
| ENV13 | Ntfy / admin alert vars | P1 | |

בדיקת דליפה:

```
# Terminal (repo root): אין service role / Cardcom password ב-client bundle
```

| # | בדיקה | P |
|---|---|---|
| ENV14 | אף סוד כסף לא תחת `NEXT_PUBLIC_` | P0 |
| ENV15 | רשימת Production env ב-Vercel תואמת §3 (צילום / export אדוםacted) | P0 |

---

## 4. Cardcom production credentials

| # | בדיקה | P | סטטוס | ראיה |
|---|---|---|---|---|
| CC1 | מסוף **Production** (לא sandbox) משויך לחשבון הפלטפורמה | P0 | | |
| CC2 | Terminal number + API name/password ב-Vercel Production בלבד | P0 | | |
| CC3 | Low Profile / CreateAndCharge מוגדר עם Success/Fail/Webhook ל-prod host | P0 | | |
| CC4 | Webhook: URL secret + אימות GetLpResult חובה בשרת | P0 | | |
| CC5 | טבלת `cardcom_accounts` (אם multi-account): שורת platform + keys תקינים | P0 | | |
| CC6 | רכישת קופון טסט חיה בסכום מינימלי: charge → finalize → voucher+QR | P0 | | order id |
| CC7 | Replay webhook = no-op (בלי כפילות שוברים) | P0 | | |
| CC8 | סכום ב-Cardcom == `paid_on_site` (מלוא `coupon_price` לקופון) | P0 | | |
| CC9 | קופון אחרי תשלום: `platform_settled`; אין `order_escrow_holds` חדשים | P0 | | |
| CC10 | Refund path על הזמנת טסט מתועד | P1 | | |
| CC11 | Token שמור: יצירה + חיוב חוזר על אותו `cardcom_account_key` | P1 | | |
| CC12 | כשל תשלום לא משאיר `orders.paid_at` | P0 | | |

אסור: להשאיר סיסמאות Cardcom ב-git, ב-Notion ציבורי, או ב-Make/Zapier.

---

## 5. מוניטורינג Sentry

| # | בדיקה | P | סטטוס |
|---|---|---|---|
| SEN1 | פרויקט Sentry ל-prod (Next.js) מחובר; `SENTRY_DSN` ב-Production | P0 |
| SEN2 | Source maps / release name תואמים deployment | P1 |
| SEN3 | Alert: error spike על checkout / payments routes | P0 |
| SEN4 | Alert: unhandled exceptions ב-Edge notifications / webhook | P1 |
| SEN5 | אין PII (PAN, tokens, service role) ב-Sentry breadcrumbs | P0 |
| SEN6 | תגובה ל-SEV: קישור ל-`ARCHITECTURE-INCIDENT-RESPONSE.md` | P0 |
| SEN7 | Ntfy/admin מקבל גם DLQ תשלומים והתראות (משלים ל-Sentry) | P1 |

Smoke אחרי deploy: יצירת שגיאה מבוקרת ב-preview/staging קודם; ב-prod רק אם יש flag בטוח.

---

## 6. גיבויים (Backup / DR)

פירוט מלא: `ARCHITECTURE-BACKUP-DR.md`. שערי שיגור:

| # | בדיקה | P | סטטוס |
|---|---|---|---|
| BAK1 | Supabase PITR / automated backups מופעלים על פרויקט prod | P0 |
| BAK2 | נקודת שחזור אחרונה < 24ש (או לפי מסמך DR) | P0 |
| BAK3 | תרגול restore מתועד (staging) לפחות פעם אחת לפני כסף חי | P1 |
| BAK4 | לפני cutover גדול (WP/migrate): snapshot ידני + חתימה | P0 |
| BAK5 | R2 / מדיה: גרסת bucket או מדיניות retention מתועדת | P2 |
| BAK6 | סודות לא רק ב-Vercel בלי export מוצפן לבעלים | P1 |
| BAK7 | Runbook: מי מריץ restore ב-SEV1 | P0 |

---

## 7. מיגרציות וסכימה

| # | בדיקה | P |
|---|---|---|
| M1 | מיגרציות עד טיפ מאושר הוחלו ב-prod (תהליך מאושר; לא `db push` פראי) | P0 |
| M2 | `platform_percent` NOT NULL על מוצרים חיים | P0 |
| M3 | `coupon_price_ils` תקין לכל קופון חי | P0 |
| M4 | RLS על orders, vouchers, wallet, payment_tokens, carts, profiles | P0 |
| M5 | אין `ESCROW_FLOW_ENABLED=true` | P0 |
| M6 | vouchers / payment_events / cardcom_accounts קיימים אם checkout ממוזג | P0 |
| M7 | קוד `escrow` hold/release לא פעיל ב-tip | P0 |
| M8 | `cardcom_token` לא ב-SELECT ל-authenticated | P0 |

---

## 8. Auth / עגלה / Checkout / קופונים

| # | בדיקה | P |
|---|---|---|
| A1 | Guest cart בלי login | P0 |
| A2 | שלם → Google → merge → checkout | P0 |
| A3 | `/account` דורש session | P0 |
| A4 | RLS חוצה-משתמשים | P0 |
| A5 | PDP קופון == עגלה == Cardcom (`coupon_price_ils` מלא) | P0 |
| V1 | הנפקה + QR | P0 |
| V2 | סריקה חד-פעמית; יתרה בעסק | P0 |
| V3 | ספק payout מקופון prepaid = 0 | P0 |
| V4 | HMAC QR שגוי נדחה | P0 |

---

## 9. התראות / איכות / אבטחה

| # | בדיקה | P |
|---|---|---|
| N1 | Resend key רק בשרת; מייל רכישת קופון | P0 |
| N2 | אין Make/Zapier בייצור | P0 |
| Q1 עד Q4 | tsc / vitest / build / playwright cart-checkout | P0 |
| S1 עד S7 | אין service role בדפדפן; rate limits; legal pages; RBAC | P0 |

---

## 10. Soft-launch מול GA

| שלב | תנאי | קהל |
|---|---|---|
| Soft | כל P0 PASS | ספקים + קונים מבוקרים |
| GA | P0+P1 PASS + KPI בסיסי | ציבור |

יום שיגור:

```
1. Freeze מיזוגים
2. Backup/snapshot (BAK)
3. Deploy Vercel Production
4. Smoke: domain, PDP price, cart, Google pay, Cardcom, voucher, redeem
5. Sentry + Ntfy ירוקים 60 דק׳
6. Soft-launch
```

Rollback: `CHECKOUT_ENABLED=false` → revert deploy → בלי down-migrations הרסניים.

---

## 11. ראיות וחתימות

לכל P0: פקודה+timestamp / לוג / צילום. בלי ראיה = לא PASS.

| תפקיד | שם | תאריך | חתימה |
|---|---|---|---|
| בעלים / כסף | | | |
| הנדסה | | | |
| תוכן/קטלוג | | | |

---

## 12. Revision

| Date | Change |
|---|---|
| 2026-07-31 | צ'קליסט Go-Live P0/P1/P2 |
| 2026-07-31 | rev B: escrow gates, Cardcom, QR, KPI |
| 2026-07-31 | rev C: Domain, Vercel prod, env matrix, Cardcom creds, Sentry, backups |
