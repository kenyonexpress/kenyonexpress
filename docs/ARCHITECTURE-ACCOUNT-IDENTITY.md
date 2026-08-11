# ארכיטקטורה: זהות וחשבון (Account & Identity)

Google OAuth, OTP, session, ומיזוג עגלת אורח. מסכי האזור האישי ב-
`ARCHITECTURE-PERSONAL-AREA.md`
. מיזוג עגלה בפירוט ב-
`ARCHITECTURE-CART-GUEST.md`
.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #22/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-CART-GUEST.md
docs/ARCHITECTURE-PERSONAL-AREA.md
docs/ARCHITECTURE-ACCOUNT-WALLET.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/ARCHITECTURE-DATA-EXPORT-GDPR.md
docs/ARCHITECTURE-TRUST-SAFETY.md
docs/ARCHITECTURE-SECURITY.md
docs/CONTRADICTIONS.md
```

מודל כסף: **No Escrow** (זהות לא מחזיקה כסף; סליקה ב-Cardcom אחרי session).

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| ID1 | Google OAuth (PKCE) הוא שער הכניסה הראשי. |
| ID2 | OTP (אימייל / טלפון דרך Supabase Auth) הוא גיבוי מתועד; אין סיסמה מקומית כנתיב מועדף. |
| ID3 | גלישה ועגלה פתוחים לאורח; login חובה לפני תשלום (`/checkout*`). |
| ID4 | בשרת תמיד `getUser()`, לעולם לא `getSession()` כמקור אמת. |
| ID5 | RLS הוא גבול האמת באזור אישי; אין service role במסכי לקוח. |
| ID6 | אין PAN/CVV אצלנו; רק `payment_tokens` (טוקן Cardcom + last4). |
| ID7 | מחיקת חשבון = מחיקת PII, לא מחיקת היסטוריה כספית (7 שנים). |
| ID8 | מיזוג עגלת אורח: חוזה ב-CART-GUEST; כאן רק מצביע + דרישות identity. |
| ID9 | `profiles.role` לא ניתן לשינוי ע"י הלקוח. |
| ID10 | פעולות רגישות דורשות re-auth טרי (`requireRecentAuth`). |

---

## 1. Google OAuth

```text
signInWithGoogle (scopes: openid email profile)
  → redirect /auth/callback?next=...
  → exchangeCodeForSession (PKCE)
  → handle_new_user / profiles sync
  → mergeGuestCart (ראה CART-GUEST)
  → redirect ל-next בטוח (חייב להתחיל ב-/)
```

| רכיב | מיקום יעד |
|---|---|
| כפתור | `/login` · "כניסה עם Google" |
| Action | `signInWithGoogle` |
| Callback | `src/app/auth/callback/route.ts` |
| יצירת פרופיל | trigger `handle_new_user` מ-`raw_user_meta_data` |

שדות מ-Google ל-`profiles`: `email`, `full_name`/`name`, `avatar_url`.  
`phone` ריק עד מילוי משתמש.

Re-auth רגיש: `prompt=select_account`, `max_age=0`.

---

## 2. OTP

| כלל | פירוט |
|---|---|
| ערוץ | אימייל ו/או SMS דרך Supabase Auth (ספק SMS לפי env; rate limit חובה) |
| מתי | גיבוי כשאין Google, או אימות טלפון לפרופיל |
| UI | `/login`: קוד חד-פעמי; עברית RTL |
| אחרי הצלחה | אותה שרשרת כמו OAuth: session → מיזוג עגלה → `next` |
| אבטחה | velocity לפי TRUST-SAFETY; אין enumeration של קיום משתמש מעבר למה ש-Auth מחזיר |

אין SMS OTP כערוץ שיווקי. OTP טרנזקציוני לזהות בלבד.

Magic link / email-password קיימים כ-legacy לסגירה ב-UX; לא מוסיפים מסלול סיסמה חדש.

---

## 3. Session

| שכבה | תפקיד |
|---|---|
| עוגיות `@supabase/ssr` | httpOnly, מקור אמת ל-JWT |
| `proxy.ts` | `getUser()` + רענון; redirect גס ל-`/login` על `/account*` ו-`/checkout*` |
| layout `(account)` | `requireUserSession()` |
| RLS | גם אם ה-guard נכשל, DB מחזיר רק `auth.uid()` |

| כלל | פירוט |
|---|---|
| אורח | cookie `ke_session_id` (לא זהות; רק עגלה) |
| JWT | קצר; refresh reuse detection של Supabase |
| יציאה | `signOut` / `signOutAll` (global) → `/login` |
| Open redirect | `next` חייב path יחסי שמתחיל ב-`/` |

---

## 4. מיזוג עגלת אורח (מצביע)

**מקור מחייב לפירוט:**  
`docs/ARCHITECTURE-CART-GUEST.md`

תמצית זהות:

1. אחרי `auth.getUser()` הצליח ב-callback / server action.
2. קוראים `mergeGuestCart` עם `userId` מה-session בלבד (לא מהלקוח) + `sessionId` מ-cookie.
3. מיזוג כמויות לפי מפתח מוצר/וריאנט; cap 99; מחיקת עגלת אורח.
4. כשל מיזוג לא מבטל session.

יעד DB (כשמוחל): RPC אטומי + advisory lock + unique חלקי על `carts.profile_id`.

---

## 5. פרופיל ואמצעי תשלום

| שדה | עריכה |
|---|---|
| `full_name` | כן |
| `phone` | כן (ולידציית IL) |
| `email` | דרך Auth בלבד (לא עריכה חופשית במסך) |
| `avatar_url` | תצוגה; מקור Google |
| `role` | קפוא ללקוח |

כתובות: CRUD על `user_addresses` (פורמט ישראלי).

`payment_tokens`:

- SELECT: last4, brand, expiry, is_default (בלי `cardcom_token`)
- DELETE + set-default דרך fn
- INSERT רק service role מ-webhook Cardcom

---

## 6. מחיקת חשבון (תמצית)

```text
/account/privacy + re-auth
  → fn_request_account_deletion (חלון חרטה ~30 יום)
  → cron: fn_execute_account_deletion
       · profiles → tombstone / anonymized_at
       · מחיקת כתובות, טוקנים, עגלות, העדפות
       · scrub PII מ-audit
       · orders / payments / wallet ledger / vouchers נשארים מנותקים מזהות
```

פירוט משפטי: LEGAL-COMPLIANCE + DATA-EXPORT-GDPR.

---

## 7. העדפות התראות (מינימום)

| שדה | ברירת מחדל |
|---|---|
| עדכוני הזמנה / פקיעת קופון | on (טרנזקציוני) |
| שיווק email/SMS | **off** (opt-in, חוק ספאם) |

---

## 8. איומים (תמצית)

| איום | מיטיגציה |
|---|---|
| XSS + גניבת session | httpOnly cookies; CSP בהמשך |
| JWT מזויף | `getUser()` בשרת |
| קריאת טוקן Cardcom | REVOKE עמודה מ-authenticated |
| הרעלת מיזוג עגלה | userId מה-session; lock/RPC; אין מחירים בעגלה |
| מחיקה זדונית | re-auth + חלון חרטה + מייל ביטול |

---

## 9. Acceptance

- [ ] Google OAuth PKCE + callback + `next` בטוח
- [ ] OTP גיבוי מתועד עם rate limit
- [ ] Gate על `/account*` ו-`/checkout*`
- [ ] מיזוג עגלה לפי CART-GUEST אחרי login
- [ ] אין חשיפת `cardcom_token` ללקוח
- [ ] מחיקת חשבון: PII נמחק, כסף נשמר
- [ ] שיווק opt-in בלבד

---

## 10. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-08 | טיוטת זהות + 029 |
| 2026-07-17 | ציות LEGAL / retention |
| 2026-08-12 | batch #22: BINDING ממוקד OAuth+OTP+session + מצביע CART-GUEST |
