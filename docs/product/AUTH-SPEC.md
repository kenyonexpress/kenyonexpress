# Auth spec

Status: DRAFT · docs only  
Audience: product, identity, admin, support  
Companions: `docs/AUTH-MODEL.md`, `docs/ARCHITECTURE-ACCOUNT-IDENTITY.md`

Hebrew is the customer UI. English names are routes, env flags, and table columns.

Skill intent: Google on first visit, OTP on return, password not the long-term returning path. Code today still has email+password as a live secondary rail. This spec keeps password as recovery and as a fallback until OTP is the default returning login. It does not delete the password screens in this docs-only change.

---

## 0. Rails

| Rail | Who | Gate | Status |
|---|---|---|---|
| Google OAuth PKCE | first visit and returning | always | LIVE |
| Email magic link (`signInWithOtp` email) | returning | always | LIVE |
| Israeli mobile SMS OTP | returning, no Google | `PHONE_AUTH_ENABLED` / `NEXT_PUBLIC_PHONE_AUTH_ENABLED` is `true` or `1` | LIVE, off until SMS provider + flag |
| Email + password | fallback / existing accounts | always | LIVE (to be demoted, not ripped out) |
| Password reset | recovery | always | LIVE |

Guest browse and cart: allowed. Login is required when the customer presses Pay. Server `beginCheckout` refuses unauthenticated users.

Pay press today sends guests to Google with `next=/checkout?resume=1`. PLANNED: same stash, then `/login?next=/checkout&resume=1` so magic link and SMS work without forcing Google. Google stays first on that page.

---

## 1. Google first login

Route: `/login`. Button (LIVE):

```
כניסה עם Google
```

Busy: `מתחברים...`

Rules:

1. Google is the first control on the login card, above email and SMS.
2. After Google callback: `mergeGuestCart`, then honor `next`.
3. New profile: create `profiles` row. Send transactional `welcome` once per user. No marketing deals in that mail.
4. Google password never reaches KenyonExpress.
5. Failed callback:

```
הכניסה נכשלה. נסו שוב
```

Checkout guest banner (LIVE):

```
קונית כאן בעבר?
יש ללחוץ כאן כדי להתחבר
```

---

## 2. Israeli phone verification

Channel: SMS OTP via Supabase `signInWithOtp({ phone })` then `verifyOtp` type `sms`.

### 2.1 Number rules

| Layer | Rule | Error |
|---|---|---|
| SMS capable | `+9725` + 8 digits, E.164 length 13 | `יש להזין מספר טלפון נייד ישראלי (05X)` |
| Signup field | `(?:\+972\|972\|0)(5[0-9]\|7[2-9])\d{7}` | `מספר טלפון ישראלי לא תקין (לדוגמה: 050-1234567)` |
| Checkout mobile | `^05\d{8}$` after strip | `מספר נייד ישראלי הוא 10 ספרות ומתחיל ב-05` |
| Placeholder | `050-1234567` | |

Landlines are not an SMS login. Checkout rejects non-05 mobiles.

Before SMS, attach E.164 to an existing `profiles.phone` match so the OTP opens the real account (`phone-merge.ts`).

Disabled flag copy (LIVE):

```
כניסה בטלפון אינה זמינה כרגע
```

### 2.2 Hebrew UI (LIVE)

```
כניסה עם קוד ב-SMS
שליחת קוד ב-SMS
שלחנו קוד ל-{e164}
הקוד מה-SMS
כניסה
שינוי מספר טלפון
```

Errors (LIVE):

```
הקוד שגוי או שפג תוקפו
הקוד פג תוקף, בקשו קוד חדש
הקוד שגוי
שליחת SMS אינה זמינה כרגע
יותר מדי בקשות, המתינו דקה ונסו שוב
```

OTP is 6 digits. `dir=ltr` on the code input. Do not log the code.

---

## 3. OTP returning login

Product default for a customer who already has a profile:

1. Offer Google.
2. Offer email magic link.
3. Offer SMS if the flag is on and they have an Israeli mobile.
4. Password is behind "כניסה עם סיסמה" (PLANNED collapse). Today it is a first-class form. Spec: keep it until magic+SMS cover returning volume, then demote.

Magic link copy (LIVE):

```
כניסה ללא סיסמה (קישור מאובטח לאימייל)
שלחו לי קישור
שלחנו קישור כניסה לאימייל שלך. בדקו את תיבת הדואר
```

Login title (LIVE): `כניסה לחשבון`  
Divider: `או`  
Fields: `אימייל` · `סיסמה` · `כניסה`  
Signup: `אין לכם חשבון?` · `הרשמה`

Mapped errors (LIVE samples):

```
כתובת אימייל או סיסמה שגויים
כתובת האימייל טרם אומתה. בדקו את תיבת הדואר
כתובת האימייל כבר רשומה במערכת
יותר מדי ניסיונות. נסו שוב מאוחר יותר
אירעה שגיאה, נסו שוב
```

Guest cart merge runs on Google callback, email/password sign-in, and phone verify. Cookie `ke_session_id` (httpOnly, SameSite=Lax, 30 days). Delete the cookie only after merge ran.

---

## 4. Rate limits

Postgres `check_rate_limit`. Fail-open if the RPC is down (live). Money docs want fail-closed on checkout; that is `begin_checkout`, not login.

| Action | Key | Max | Window | Customer copy |
|---|---|---|---|---|
| Password login | `login:<ip>` | 10 | 1h | `יותר מדי ניסיונות כניסה. נסו שוב בעוד שעה` |
| Password login | `login-account:<email>` | 20 | 1h | same (anti-oracle) |
| Signup | `signup:<ip>` | 5 | 1h | `יותר מדי ניסיונות הרשמה. נסו שוב בעוד שעה` |
| Magic link | `magic:<ip>` | 5 | 1h | `יותר מדי ניסיונות. נסו שוב בעוד שעה` |
| SMS send | `phone-otp:<ip>` | 5 | 1h | same |
| SMS send | `phone-otp-number:<e164>` | 5 | 1h | `יותר מדי בקשות למספר הזה. נסו שוב בעוד שעה` |
| SMS verify | `phone-verify:<ip>` | 20 | 1h | `יותר מדי ניסיונות. נסו שוב בעוד שעה` |
| Reset request | `reset:<ip>` and `reset-address:<email>` | 5 | 1h | always the generic success |
| Update password | `update-password:<ip>` | 10 | 1h | `יותר מדי ניסיונות. נסו שוב בעוד שעה` |
| Begin checkout | `begin_checkout:user:<id>` | 10 | 60s | `יותר מדי ניסיונות תשלום, המתינו דקה` |

Do not tell the user whether the email exists on reset. `check_user_rate_limit` has no app callers; do not document it as a live login guard.

Upstash is not a required auth backend. If both limiters fail, login fail-open is a known risk; fraud spec covers velocity on Pay.

---

## 5. Recovery

| Surface | Copy / rule |
|---|---|
| Login link | `שכחתם סיסמה?` → `/forgot-password` |
| Page title | `שחזור סיסמה` |
| Body | `הזינו את כתובת האימייל שלכם ונשלח לכם קישור לאיפוס הסיסמה.` |
| Submit | `שלחו קישור לאיפוס` |
| Always-same success | `שלחנו לך קישור לאיפוס הסיסמה. בדקו את תיבת הדואר` |
| Reset page | `בחרו סיסמה חדשה` · `הסיסמה חייבת להכיל לפחות 8 תווים וספרה אחת.` · `עדכנו סיסמה` |
| Expired | `קישור האיפוס פג או שכבר נעשה בו שימוש. בקשו קישור חדש` |
| Retry | `שליחת קישור איפוס חדש` |
| Mismatch | `הסיסמאות אינן תואמות` |

Password rules: min 8 characters and at least one digit. Same on signup.

SMS recovery of a Google-only account: allowed if phone merge bound the number. Email recovery of a phone-only account: only if `profiles` has that email.

There is no support "reset password" SQL. Support sends the customer to `/forgot-password`.

Account deletion is anonymization (`anonymized_at`), not a login recovery path. See privacy docs on other branches; do not invent a restore login.

---

## 6. Admin views

| Route | Title | Who |
|---|---|---|
| `/admin/users` | `משתמשים` | support read, admin+ write |
| `/admin/users/[id]` | `משתמש 360` | same |

List: search `חיפוש לפי שם או אימייל...`. Filter chips by role.

Role labels (LIVE):

```
לקוח
ספק
עורך תוכן
שירות לקוחות
מנהל
מנהל על
```

360 view shows email, phone, join date, role editor, last orders, wallet, coupons. Support must not see GMV / commission. `requireRecentAuth(15)` on role elevation.

Admin must not display PAN, Cardcom token, or SMS OTP. Last 4 on tokens is enough.

Do not let `content_uploader` change roles.

Audit: `login` `logout` `permission_change` via `writeAuditLog`. Viewing a user is not audited.

---

## 7. Guest cart and checkout gate

| Fact | Detail |
|---|---|
| `/checkout` | not in `needsAuth` (proxy) |
| `/checkout/return`, `/failed` | session required |
| Pay | client stash + redirect; server `יש להתחבר לפני התשלום` |
| Merge | `mergeGuestCart` after every successful identity |

PLANNED: Pay redirect lands on `/login` with Google first, magic and SMS visible, password collapsed.

---

## 8. Acceptance

- Google is the first button.
- Israeli SMS only for `05` / `+9725` mobiles, and only with the env flag.
- Magic link returning login works without a password.
- Reset never enumerates emails.
- Rate limits match the table (IP and phone keys).
- Admin 360 has no secrets.
- Guest cart survives Google, magic, password, and SMS.
