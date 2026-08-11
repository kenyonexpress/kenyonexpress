# ארכיטקטורה: זהות וחשבון (Account & Identity)

Google OAuth, OTP, session, ומיזוג עגלת אורח.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף: **No Escrow** (זהות לא מחזיקה כסף; סליקה ב-Cardcom אחרי session).

מסמכים קשורים:

```
docs/ARCHITECTURE-CART-GUEST.md
docs/ARCHITECTURE-PERSONAL-AREA.md
docs/ARCHITECTURE-ACCOUNT-WALLET.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/ARCHITECTURE-DATA-EXPORT-GDPR.md
docs/ARCHITECTURE-SECURITY.md
```

---

## 1. החלטה

| # | הכרעה |
|---|---|
| ID1 | Google OAuth (PKCE) הוא שער הכניסה הראשי. |
| ID2 | OTP (אימייל / טלפון דרך Supabase Auth) הוא גיבוי מתועד; אין סיסמה מקומית כנתיב מועדף. |
| ID3 | גלישה ועגלה פתוחים לאורח; login חובה לפני תשלום (`/checkout*`). |
| ID4 | בשרת תמיד `getUser()`, לעולם לא `getSession()` כמקור אמת. |
| ID5 | RLS הוא גבול האמת באזור אישי; אין service role במסכי לקוח. |
| ID6 | אין PAN/CVV אצלנו; רק `payment_tokens` (טוקן Cardcom + last4). |
| ID7 | מחיקת חשבון = מחיקת PII, לא מחיקת היסטוריה כספית (7 שנים). |
| ID8 | מיזוג עגלת אורח: חוזה ב-CART-GUEST; כאן דרישות identity בלבד. |
| ID9 | `profiles.role` לא ניתן לשינוי ע"י הלקוח. |
| ID10 | פעולות רגישות דורשות re-auth טרי (`requireRecentAuth`). |

---

## 2. חלופות שנדחו

| חלופה | נימוק דחייה |
|---|---|
| סיסמה מקומית כנתיב ראשי | OTP/Google מספיקים; תחזוקת hash + reset. |
| `getSession()` בשרת להחלטות הרשאה | JWT stale; ID4 דוחה. |
| magic link כערוץ יחיד | deliverability + UX; OTP/Google עדיפים. |
| open redirect ב-`next` | ID: path יחסי `/` בלבד. |
| service role ב-Server Component לקוח | ID5: RLS + user client. |
| מחיקת orders/wallet ב-GDPR delete | ID7: retention כספי 7 שנים. |

---

## 3. סכמת DB

**אין DDL חדש.** טבלאות רלוונטיות:

### `profiles` (Auth sync)

| עמודה | שימוש |
|---|---|
| `id` | = `auth.users.id` |
| `email`, `full_name`, `phone`, `avatar_url` | פרופיל |
| `role` | RBAC; לא ניתן לעריכה ע"י לקוח |

Trigger: `handle_new_user` מ-`raw_user_meta_data`.

### `payment_tokens`

| עמודה | SELECT ללקוח |
|---|---|
| `last4`, `brand`, `expiry`, `is_default` | כן |
| `cardcom_token` | **לא** (REVOKE מ-authenticated) |

INSERT: service role מ-webhook Cardcom בלבד.

### `user_addresses`

CRUD על כתובות ישראליות; soft delete.

### מחיקת חשבון

`fn_request_account_deletion` → חלון ~30 יום → `fn_execute_account_deletion`:  
PII נמחק; `orders` / `payments` / wallet / vouchers נשארים מנותקים.

---

## 4. Google OAuth + OTP (תמצית)

```text
signInWithGoogle (PKCE)
  → /auth/callback?next=...
  → exchangeCodeForSession
  → handle_new_user / profiles sync
  → mergeGuestCart (CART-GUEST)
  → redirect ל-next בטוח (מתחיל ב-/)
```

OTP: גיבוי; rate limit; אחרי הצלחה אותה שרשרת כמו OAuth.

Session: עוגיות `@supabase/ssr` httpOnly; `proxy.ts` gate על `/account*` ו-`/checkout*`.

---

## 5. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| E1 | OAuth callback עם `next=//evil.com` | reject; fallback `/account` |
| E2 | mergeGuestCart נכשל | session נשמר; log; המשך ל-next |
| E3 | refresh token reuse | Supabase detection; signOut |
| E4 | XSS + גניבת session | httpOnly; CSP (המשך) |
| E5 | enumeration via OTP | הודעות גנריות; rate limit |
| E6 | מחיקה בתוך חלון חרטה | ביטול דרך מייל/link |
| E7 | re-auth stale על delete | `requireRecentAuth` block |
| E8 | guest `ke_session_id` חסר ב-merge | skip merge; עגלה ריקה |

---

## 6. פתוחות

| # | פער | החלטה זמנית | תאריך |
|---|---|---|---|
| O1 | SMS provider production | env לפי Supabase config | 2026-08-12 |
| O2 | CSP מלא | שלב 2 SECURITY | 2026-08-12 |
| O3 | RPC mergeGuestCart אטומי | CART-GUEST | 2026-08-12 |

---

## 7. Acceptance

- [ ] Google OAuth PKCE + callback + `next` בטוח  
- [ ] OTP גיבוי עם rate limit  
- [ ] Gate על `/account*` ו-`/checkout*` מבוסס `getUser()`  
- [ ] מיזוג עגלה לפי CART-GUEST אחרי login  
- [ ] אין חשיפת `cardcom_token` ללקוח  
- [ ] מחיקת חשבון: PII נמחק, כסף נשמר  
- [ ] חלופות + DB + קצה + פתוחות  

---

## 8. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-08 | טיוטת זהות + 029 |
| 2026-08-12 | batch-2: BINDING מלא; תבנית חובה |
