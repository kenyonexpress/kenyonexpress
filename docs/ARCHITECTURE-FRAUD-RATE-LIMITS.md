# ארכיטקטורה: הגבלת קצב ונוגד הונאה

שכבת מוצר ל-rate limiting, velocity, fraud signals ותגובות. fail-closed על כסף.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**; chargeback/freeze לא "משחררים held" לספק.

מסמכים קשורים:

```
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/FRAUD-PREVENTION-SPEC.md
docs/ARCHITECTURE-TRUST-SAFETY.md
docs/ARCHITECTURE-CHECKOUT-CARDCOM.md
docs/ARCHITECTURE-SUPPLIER-REDEMPTION.md
```

---

## 1. החלטה

| # | הכרעה |
|---|---|
| R1 | Rate limit על מסלולי **כסף וזהות**: **fail-closed** (429 / block), לא fail-open. |
| R2 | שני מנגנוני DB: `rate_limits` (מפתח IP/כללי) + `user_rate_limits` (user+action). |
| R3 | RPC redeem: `check_user_rate_limit` / `check_my_rate_limit` (035) לפני לוגיקת voucher. |
| R4 | Edge/App: Upstash Redis אופציונלי ל-burst IP (search, begin_checkout) במקביל ל-Postgres. |
| R5 | אין שליחת PAN/token במייל אוטומטי; אין auto-refund מתור review. |
| R6 | Fraud signals → soft challenge, `checkout_blocked` על profile, או תור `manual_review` admin. |
| R7 | **No Escrow:** velocity/chargeback לא מפעילים "release held"; freeze voucher בלבד. |
| R8 | Webhook Cardcom: חתימה חובה; כשל חתימה = log + alert, לא finalize. |

### 1.1 Rate limits (יעדי התחלה)

| פעולה | מפתח | סף (כיוון) | חלון | תגובה |
|---|---|---|---|---|
| `begin_checkout` | user_id + IP | 10 | 1 דק' | 429 fail-closed |
| `login` / auth fail | IP (`rate_limits`) | 10 | 1 שעה | delay + lockout |
| `coupon_scan` / redeem | supplier member + code | 30 | 1 דק' | `rate_limited` scan_result |
| `search` | IP | burst protect | 1 דק' | 429 + cache fallback |
| `agent_tools` | user_id | low RPM | 1 דק' | 429 |
| PIN fail (supplier) | member / device | 5 | 15 דק' | lockout + audit |
| webhook replay | idempotency key | 1 | ∞ | ignore duplicate |

מספרים מדויקים בקונפיג env / RPC params; הטבלה מגדירה עקרון.

### 1.2 Fraud signals

| אות | טriggr | פעולה |
|---|---|---|
| Velocity כרטיסים | N כרטיסים שונים / user חדש | `manual_review` |
| Self-referral loop | IP/device משותף referrer+referee | דחיית בונוס |
| Redeem geo mismatch | soft flag (לא block אוטומטי) | alert ops |
| Burst `already_redeemed` | אותו voucher | velocity alert |
| Webhook signature fail | Cardcom | no finalize + Sentry |
| Refund storm | user + payment | review queue |

### 1.3 תגובות (סדר)

1. Soft challenge / delay (אם קיים).  
2. `profiles.checkout_blocked = true` (או דגל שequivalent).  
3. תור admin `manual_review`.  
4. Kill switch env: `CHECKOUT_ENABLED=false`, `SUPPLIER_SCAN_ENABLED=false` (ראה FEATURE-FLAGS).

---

## 2. חלופות שנדחו

| חלופה | נימוק דחייה |
|---|---|
| Rate limit in-memory בלבד (per instance) | Vercel serverless: אין sticky memory; bypass קל. |
| fail-open על checkout ("לא לחסום מכירות") | סיכון כסף > זמינות; Cardcom + velocity עדיפים. |
| Captcha לכל redeem | חוסם UX ספק; rate limit + QR signature מספיקים בשלב 1. |
| Block אוטומטי על geo mismatch | GPS לא אמין; soft flag + review בלבד. |
| Escrow hold על suspicion | No Escrow; freeze voucher / block checkout. |
| LaunchDarkly ל-rate limits | overkill יום 1; Postgres + env מספיקים. |

---

## 3. סכמת DB

**אין DDL חדש.** שימוש בטבלאות ופונקציות קיימות:

### `rate_limits` (002)

| עמודה | סוג | שימוש |
|---|---|---|
| `key` | text UNIQUE | `auth:ip:{ip}`, `checkout:ip:{ip}` |
| `attempts` | integer | counter בחלון |
| `window_start` | timestamptz | reset window |

RPC: `check_rate_limit(p_key, p_max_attempts, p_window_seconds)` → boolean.

### `user_rate_limits` (019)

| עמודה | סוג | שימוש |
|---|---|---|
| `user_id` | uuid | authenticated user |
| `action` | text | `coupon_scan`, `begin_checkout`, … |
| `created_at` | timestamptz | append-only log |

RPC: `check_user_rate_limit(p_user_id, p_action, p_limit, p_window_seconds)` → boolean.  
Post-035: `check_my_rate_limit` (authenticated, keys on `auth.uid()`); `check_user_rate_limit` → service_role only.

### טבלאות audit / fraud

| טבלה | שימוש |
|---|---|
| `coupon_scan_events` | `scan_result` incl. `rate_limited`, `wrong_supplier` |
| `audit_log` | admin decisions, freeze |
| `payment_webhook_events` | idempotency + replay detect |
| `manual_review` (אם קיים / admin) | chargeback, velocity |

Enum `scan_result`: `success`, `not_found`, `already_used`, `expired`, `refunded`, `wrong_supplier`, `unauthorized`, `rate_limited`.

מיגרציות: `002_auth_rate_limits.sql`, `019_user_rate_limits.sql`, `027_suppliers.sql` (redeem RPC), `035_security_hardening.sql`.

---

## 4. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| E1 | race: שני redeem במקביל | אחד `success`, השני `already_used`; אין תשלום כפול |
| E2 | rate limit mid-checkout | beginCheckout 429; cart נשמר; לא charge |
| E3 | cleanup cron לא רץ | `user_rate_limits` גדל; cleanup 24h; לא fail-open |
| E4 | spoof `p_user_id` ב-RPC ישן | 035: authenticated לא קורא `check_user_rate_limit(uuid,...)` |
| E5 | Upstash down + Postgres OK | Postgres path עדיין מגן; edge burst פחות |
| E6 | webhook replay אחרי success | idempotency key; no double `paid_at` |
| E7 | `CHECKOUT_ENABLED=false` | beginCheckout מחזיר CHECKOUT_DISABLED לפני RL |
| E8 | supplier scan `rate_limited` | INSERT audit + return JSON; לא leak voucher exists |
| E9 | chargeback על voucher `redeemed` | manual_review; אין unwind אוטומטי |
| E10 | burst search scraping | IP 429; SQL fallback אם `SEARCH_ENABLED` |

---

## 5. פתוחות

| # | פער | החלטה זמנית | תאריך |
|---|---|---|---|
| O1 | סף מספרי production ב-env | התחלה לפי טבלה §1.1; tune אחרי 30 יום | 2026-08-12 |
| O2 | `profiles.checkout_blocked` column vs flag JSON | ליישר עם admin dashboard spec | 2026-08-12 |
| O3 | Upstash mandatory או optional | optional Phase 1; Postgres חובה | 2026-08-12 |
| O4 | Captcha checkout אחרי N fails | לא Phase 1; review אם chargeback > X% | 2026-08-12 |

---

## 6. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-31 | Fraud/rate-limit binding (`arch/docs-queue`) |
| 2026-08-12 | BINDING מלא: החלטה, חלופות, DB, קצה, פתוחות (`arch/docs-batch-2`) |
