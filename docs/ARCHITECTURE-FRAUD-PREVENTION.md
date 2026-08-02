# ARCHITECTURE: Fraud Prevention

הגנה מפני סריקת QR כפולה, rate limiting, וזרימת chargeback של Cardcom.

Status: **BINDING** · Updated: 2026-08-02  
Scope: docs only.  
Companions:

```
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/ARCHITECTURE-SECURITY.md
docs/ARCHITECTURE-SUPPLIER-REDEMPTION.md
docs/CARDCOM-ARCHITECTURE.md
docs/RUNBOOK-OPERATIONS.md
```

עקרון: כסף ומניעת כפילות נאכפים ב-DB (אטומיות), לא ב-UI. Rate limits נכשלים סגור בנתיבי כסף כשאפשר; לא fail-open על redeem/checkout.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| F1 | קופון `issued` → `redeemed` פעם אחת בלבד; replay מחזיר `already_used`, לא כפל מימוש. |
| F2 | אימות QR: חתימה (HMAC/Ed25519) + ספק תואם + תוקף + סטטוס. |
| F3 | Rate limit על begin_checkout, login, redeem, search, AI tools. |
| F4 | Chargeback: לא מוחק היסטוריה; ledger + voucher status + audit. |
| F5 | אין auto-refund מלא בלי מסלול אדמין מוגדר; Cardcom dashboard לבד אסור כמקור אמת יחיד. |

---

## 1. Duplicate QR scan protection

### 1.1 מסלול מימוש

```text
Supplier scan (camera / manual code)
  → POST redeem (supplier JWT)
  → verify signature (qr_payload / qr_token)
  → SELECT voucher FOR UPDATE
  → אם status <> issued → already_used | expired | invalid (בלי side effects כספיים)
  → UPDATE status = redeemed + redeemed_at + member_id + collected
  → ledger / escrow release לפי מודל
  → enqueue notification voucher_redeemed
```

### 1.2 הגנות חובה

| הגנה | מימוש |
|---|---|
| אטומיות | `UPDATE … WHERE status = 'issued'` או `FOR UPDATE`; בדיקת `rowcount` |
| Idempotency | מפתח סריקה / `dedupe` על `(voucher_id, success)` בלוג |
| ספק שגוי | `wrong_supplier` בלי לחשוף האם הקוד קיים אצל אחר מעבר לנדרש |
| חתימה | כשל → `invalid_hmac` / not_found אחיד כלפי חוץ כשצריך |
| Screenshot | לא ניתן למנוע; חד-פעמיות ב-DB היא ההגנה |
| Offline customer | מציג QR; לא מבצע redeem בצד לקוח |

### 1.3 לוג

כל ניסיון (הצלחה וכשל) נכתב ל-`voucher_scan_log` / מקביל:

- `voucher_id` (אם ידוע), `supplier_id`, `member_id`, `result`, `ip` truncated, `created_at`
- Burst של `already_used` / `invalid_hmac` → התראת Ntfy / Sentry breadcrumb אדמין

---

## 2. Rate limiting

### 2.1 גבולות יעד

| פעולה | מפתח | גבול התחלתי |
|---|---|---|
| `begin_checkout` | user_id | 10 / דקה |
| Cardcom return/webhook verify | order_id | idempotent; burst guard על IP |
| `redeem` | supplier_id + member_id | הדוק (למשל 30 / דקה) + per voucher |
| `redeem` כשלים | voucher_id / IP | lockout קצר אחרי N כשלונות חתימה |
| login / OTP | IP + email | לפי Supabase + שכבת אפליקציה |
| search | IP | burst protect |
| AI assistant / NLP | user_id | RPM נמוך (עלות + abuse) |
| admin refund / wallet adjust | admin_id | נמוך + `requireRecentAuth` |

### 2.2 יישום

- יעד: Upstash Redis `@upstash/ratelimit` או RPC `check_user_rate_limit`.
- נתיבי כסף: **fail closed** אם מאגר ה-limit לא זמין (או queue delay), לא שחרור חופשי.
- תשובה ללקוח: הודעה כללית בעברית; בלי לחשוף גבולות מדויקים לתוקף.

---

## 3. אותות הונאה נוספים

| אות | תגובה |
|---|---|
| הרבה כרטיסים / כשלי תשלום למשתמש | השהיית checkout / דגל ידני |
| Self-referral / abuse ארנק | דגל; לא שריפת קאשבק אוטומטית בלי חוק |
| סריקות מ-geo בלתי סביר מול ספק | soft flag לביקורת |
| כשלי חתימת webhook | Sentry + בדיקת סודות |
| שיתוף קוד המוני (already_used spike) | תמיכה + אפשרות ביטול/refund לפי מדיניות |

תגובות מדורגות: delay → block checkout flag → תור ביקורת אדמין.  
לעולם לא לשלוח PAN/טוקן במייל התראה.

---

## 4. Cardcom chargeback flow

### 4.1 עקרון

Chargeback / dispute ב-Cardcom הוא אירוע כספי חיצוני. המערכת הפנימית חייבת:

1. לרשום את האירוע (append-only).
2. ליישר סטטוס הזמנה / voucher / ledger.
3. לא למחוק היסטוריית רכישה.

### 4.2 זרימה

```text
Cardcom notify / ops מגלה chargeback
  → פתיחת dispute case באדמין (order_id, payment_id, amount_agorot, reason)
  → הקפאת voucher אם עוד issued (status → frozen/refunded לפי מדיניות)
  → אם כבר redeemed: סימון dispute; לא "לבטל סריקה" בשקט בלי audit
  → ledger: reverse / adjustment עם idempotency_key ייעודי
  → wallet: רק אם מדיניות מזכה ארנק (לא אוטומטי בלי כלל)
  → עדכון payout: קיזוז משורות עתידיות אם כסף ספק כבר תוזמן
  → תשובה ל-Cardcom / שמירת ראיות (חשבונית, לוג מימוש, IP ספק)
```

### 4.3 מצבי הזמנה

| מצב קודם | אחרי chargeback מאושר |
|---|---|
| `paid`, voucher issued | הזמנה `refunded` / disputed; voucher לא ניתן למימוש |
| `paid`, voucher redeemed | disputed + audit; בירור מול ספק על הגבייה בקופה |
| physical shipped | מדיניות החזרה + ראיות משלוח |

### 4.4 מה אסור

- Refund רק ב-Dashboard של Cardcom בלי פעולת אדמין שמעדכנת ledger.
- מחיקת שורת `payments` או `orders`.
- שחרור מחדש של אותו `idempotency_key` כזיכוי כפול.

### 4.5 ראיות שכדאי לשמור

- `payment_events` / webhook payload (בלי PAN)
- זמן מימוש + `member_id`
- התכתבות לקוח
- צילום מדיניות ביטול שהוצגה ב-checkout

---

## 5. Acceptance

- [ ] Double scan חוזר `already_used` ללא כפל ledger
- [ ] Rate limit על checkout + redeem פעיל; fail closed בכסף
- [ ] Chargeback נרשם, מיישר voucher/ledger, לא מוחק היסטוריה
- [ ] אין סודות/PAN בלוגי Sentry של fraud alerts

---

## 6. Revision

| Date | Change |
|---|---|
| 2026-07-31 | טיוטת rate limits / fraud signals |
| 2026-08-02 | מסמך מחייב: duplicate QR, rate limits, Cardcom chargeback flow |
