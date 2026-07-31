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

Companions: `ARCHITECTURE-ENV-SECRETS.md`, `ARCHITECTURE-BACKUP-DR.md`, `ARCHITECTURE-FEATURE-FLAGS.md`, `ARCHITECTURE-INCIDENT-RESPONSE.md`, checkout-cardcom, notifications V2, analytics KPI, `MASTER-ARCHITECTURE-v2.md`.

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

**מודל כסף בשיגור:**

- קופון: גבייה מלאה של `coupon_price_ils` באתר; הכסף נשאר בפלטפורמה; אין Escrow; ספק מקבל 0 מהאתר.
- פיזי: פיצול לפי `platform_percent` דינמי מצולם ב-`order_items` (בלי ברירת מחדל, בלי 5% קבוע).
- אין Make/Zapier בייצור.

Kill switches (מוכנים לפני C3):

```
CHECKOUT_ENABLED=false
ESCROW_FLOW_ENABLED   # חייב unset/false; אסור true
```

---

## 1. דומיין ו-DNS

| # | בדיקה | P | סטטוס | ראיה |
|---|---|---|---|---|
| DOM1 | Apex `kenyonexpress.co.il` מצביע ל-Vercel (A/CNAME לפי הנחיית Vercel) | P0 | | dig + screenshot DNS |
| DOM2 | `www` → apex (301) או להפך; canonical יחיד ב-SEO | P0 | | curl -I |
| DOM3 | TLS תקף (Let's Encrypt / Vercel); אין mixed content | P0 | | browser padlock |
| DOM4 | Supabase Auth redirect allowlist כולל `https://kenyonexpress.co.il/auth/callback` | P0 | | dashboard |
| DOM5 | Google OAuth client: Authorized redirect URIs ל-prod בלבד (לא localhost ב-client החי) | P0 | | Google Cloud console |
| DOM6 | Resend: דומיין מאומת (SPF/DKIM/DMARC) על שם השולח | P0 | | Resend domain status |
| DOM7 | Cardcom Success/Fail/Webhook URLs על host הפרוד | P0 | | Cardcom terminal settings |
| DOM8 | אין תעודת staging על דומיין הפרוד | P0 | | |

---

## 2. Vercel production

| # | בדיקה | P | סטטוס | ראיה |
|---|---|---|---|---|
| VCL1 | Project מקושר ל-repo הנכון; Production branch מאושר (לא preview בטעות) | P0 | | Vercel settings |
| VCL2 | Production deployment האחרון `Ready`; build log בלי errors | P0 | | deployment URL |
| VCL3 | Environment: Production מופרד מ-Preview / Development | P0 | | env scope screenshot |
| VCL4 | Preview **לא** משתמש ב-Supabase prod / Cardcom prod | P0 | | compare project refs |
| VCL5 | Domains: `kenyonexpress.co.il` + www משויכים ל-Production | P0 | | |
| VCL6 | Cron / scheduled hits ל-`/api/cron/*` עם `Authorization: Bearer CRON_SECRET` | P0 | | |
| VCL7 | Protection: Deployment Protection לא חוסם webhooks של Cardcom (או bypass ייעודי) | P0 | | webhook test |
| VCL8 | `CHECKOUT_ENABLED` מוגדר במפורש ב-Production | P0 | | |

---

## 3. Env vars (Production)

רשימה מלאה + כללים: `ARCHITECTURE-ENV-SECRETS.md`.  
כאן: שערי PASS חובה.

| # | Variable / קבוצה | P | סטטוס |
|---|---|---|---|
| ENV1 | `NEXT_PUBLIC_SUPABASE_URL` + anon key של **prod** | P0 |
| ENV2 | `SUPABASE_SECRET_KEY` (service role) של אותו project; לא demo | P0 |
| ENV3 | Cardcom prod set (ראה §4) | P0 |
| ENV4 | `RESEND_API_KEY` + `RESEND_FROM` | P0 |
| ENV5 | `CRON_SECRET` (ארוך, ייחודי ל-prod) | P0 |
| ENV6 | `VOUCHER_QR_SECRET` (+ optional PREVIOUS) | P0 |
| ENV7 | Meilisearch host + key | P1 |
| ENV8 | R2 credentials (אם מדיה ב-R2) | P1 |
| ENV9 | `SENTRY_DSN` (+ auth token ל-source maps אם בשימוש) | P0 |
| ENV10 | `NTFY_*` או ערוץ alert מקביל ל-SEV | P1 |
| ENV11 | `CHECKOUT_ENABLED=true` רק אחרי שאר P0 התשלום | P0 |
| ENV12 | `ESCROW_FLOW_ENABLED` **לא** מוגדר או `false` | P0 |
| ENV13 | אין `NEXT_PUBLIC_*` שמכיל service role / Cardcom password / Resend key | P0 |

אימות:

```
# Terminal מהשורש (אחרי pull לטיפ השיגור)
# ודא שאין דליפת סודות לקליינט
rg -n "SUPABASE_SECRET|SERVICE_ROLE|CARDCOM_PASSWORD|RESEND_API_KEY" src/ --glob '*.tsx' | head
```

---

## 4. Cardcom production credentials

| # | בדיקה | P | סטטוס | ראיה |
|---|---|---|---|---|
| CC1 | מסוף **ייצור** (לא sandbox) פעיל לפלטפורמה | P0 | | terminal id |
| CC2 | API username/password / Low Profile credentials ב-Vercel Production בלבד | P0 | | |
| CC3 | Webhook URL: `https://kenyonexpress.co.il/api/payments/cardcom/webhook?...` | P0 | | |
| CC4 | URL secret / אימות GetLpResult חובה לפני finalize | P0 | | e2e log |
| CC5 | Success/Fail redirect ל-`/checkout/return` ו-`/checkout/failed` | P0 | | |
| CC6 | חיוב טסט אמיתי בסכום מינימלי → `payments.succeeded` + `orders.paid_at` | P0 | | order id |
| CC7 | סכום ב-Cardcom == `paid_on_site` (קופון = מלוא `coupon_price`) | P0 | | |
| CC8 | קופון אחרי תשלום: `platform_settled`; **אין** שורת `order_escrow_holds` | P0 | | SQL |
| CC9 | Tokenization (אם פעיל): טוקן נשמר ב-`payment_tokens` בלי PAN | P1 | | |
| CC10 | Multi-account: `cardcom_account_key` נשמר; refund על אותו חשבון | P1 | | |
| CC11 | מסמכי התקשרות / אישור סליקה מהספק שמורים אצל הבעלים | P0 | | |

אסור: להשאיר credentials של sandbox ב-Production env.

---

## 5. מוניטורינג Sentry

| # | בדיקה | P | סטטוס | ראיה |
|---|---|---|---|---|
| SEN1 | פרויקט Sentry ייעודי ל-KenyonExpress prod | P0 | | project URL |
| SEN2 | `SENTRY_DSN` ב-Vercel Production; SDK ב-Next (server + client לפי מדיניות) | P0 | | |
| SEN3 | Source maps מועלים ב-deploy (או החלטה מתועדת לוותר) | P1 | | |
| SEN4 | Alert: spike ב-error rate / checkout failures → Ntfy או email | P0 | | alert rule |
| SEN5 | תגיות: `environment=production`, release = git sha | P1 | | event sample |
| SEN6 | אין PII (PAN, full card, tokens) ב-breadcrumbs | P0 | | scrubbing config |
| SEN7 | בדיקת smoke: throw מבוקר ב-preview/staging ואז כיבוי | P1 | | |

ראה גם: `ARCHITECTURE-OBSERVABILITY.md`, `ARCHITECTURE-INCIDENT-RESPONSE.md`.

---

## 6. גיבויים (Backup / DR)

| # | בדיקה | P | סטטוס | ראיה |
|---|---|---|---|---|
| BK1 | Supabase PITR / daily backups מאופשרים על פרויקט ה-prod | P0 | | dashboard |
| BK2 | נקודת שחזור אחרונה < 24ש (או לפי SLA כתוב) | P0 | | |
| BK3 | תרגול restore מתועד לפחות פעם אחת ל-staging (תאריך) | P1 | | runbook note |
| BK4 | לפני cutover / שיגור: snapshot ידני + שם/timestamp | P0 | | |
| BK5 | R2 / מדיה: גרסאות או bucket backup מדיניות כתובה | P1 | | |
| BK6 | סודות לא מגובים ב-git; רק ב-Vercel/password manager | P0 | | |
| BK7 | Runbook DR נגיש (קישור ל-`ARCHITECTURE-BACKUP-DR.md`) | P0 | | |

---

## 7. מיגרציות וסכימה

| # | בדיקה | P | סטטוס |
|---|---|---|---|
| M1 | כל המיגרציות עד הטיפ המאושר הוחלו ב-prod (תהליך מאושר; לא `db push` פראי) | P0 |
| M2 | `platform_percent` NOT NULL על מוצרים פיזיים חיים | P0 |
| M3 | `coupon_price_ils` תקין לכל קופון חי | P0 |
| M4 | RLS דולק על orders, vouchers, wallet, payment_tokens, carts, profiles | P0 |
| M5 | אין `ESCROW_FLOW_ENABLED=true` ב-prod | P0 |
| M6 | vouchers / payment_events / cardcom_accounts קיימות | P0 |
| M7 | Backup/PITR (§6) | P0 |
| M8 | מסלול escrow hold/release לא פעיל בקוד ה-tip | P0 |
| M9 | `payment_tokens.cardcom_token` לא ב-SELECT ל-`authenticated` | P0 |

---

## 8. Auth / עגלה / Checkout / קופונים

| # | בדיקה | P |
|---|---|---|
| A1 | Guest cart בלי login | P0 |
| A2 | שלם → Google → merge → checkout | P0 |
| A3 | `/account` דורש session | P0 |
| A4 | RLS: אין דליפת הזמנות בין משתמשים | P0 |
| A5 | PDP קופון == עגלה == חיוב (`coupon_price_ils`) | P0 |
| V1 | הנפקה + QR אחרי תשלום | P0 |
| V2 | סריקה חד-פעמית; יתרה בעסק | P0 |
| V6 | ספק לא מקבל payout מקופון prepaid | P0 |

---

## 9. התראות / איכות / אבטחה

| # | בדיקה | P |
|---|---|---|
| N1 | Resend מאומת; מפתח לא בדפדפן | P0 |
| N2 | מייל לקוח אחרי רכישת קופון | P0 |
| N4 | אין Make/Zapier בייצור | P0 |
| Q1–Q4 | tsc / vitest / build / playwright checkout | P0 |
| S1 | אין service role ב-`NEXT_PUBLIC_` | P0 |
| S3 | Rate limits: login, checkout, redeem | P0 |
| S4 | תנאי שימוש + פרטיות + ביטול מפורסמים | P0 |

---

## 10. Soft-launch / יום שיגור / Rollback

Soft: כל P0 PASS. GA: P0+P1.

יום השיגור:

```
1. Freeze מיזוגים לא קשורים
2. Backup/snapshot DB (BK4)
3. Deploy Production ב-Vercel
4. Smoke: DNS, home, PDP price, cart, Google pay, Cardcom charge, voucher, redeem
5. Verify webhook + Resend + Sentry receiving
6. Watch 60 דק׳
7. הכרזת soft-launch
```

Rollback: `CHECKOUT_ENABLED=false` → revert deploy → לא down-migration הרסני בלי DR.

---

## 11. ראיות וחתימות

לכל P0: פקודה+timestamp / URL לוג / צילום עם שעון. בלי ראיה = לא PASS.

| תפקיד | שם | תאריך | חתימה |
|---|---|---|---|
| בעלים / כסף | | | |
| הנדסה | | | |
| תוכן/קטלוג | | | |

---

## 12. Revision

| Date | Change |
|---|---|
| 2026-07-31 | צ'קליסט Go-Live ראשוני |
| 2026-07-31 | rev B: escrow/Cardcom/QR |
| 2026-07-31 | rev C: דומיין, Vercel prod, env, Cardcom creds, Sentry, גיבויים |
