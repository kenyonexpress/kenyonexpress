# ארכיטקטורה: אבטחה (Security ADR)

הכרעות אבטחה מחייבות. בהתנגשות עם מסמך אחר על בקרות אבטחה, מסמך זה גובר.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: `arch/docs-batch-2` · batch #29/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-SECURITY-RLS.md
docs/ARCHITECTURE-TRUST-SAFETY.md
docs/ARCHITECTURE-CARDCOM-WEBHOOKS.md
docs/ARCHITECTURE-OBSERVABILITY.md
docs/CONTRADICTIONS.md
```

Stack: Next.js (proxy/middleware), Supabase Postgres + RLS, Cardcom Low Profile. כסף באגורות (integer).  
תפקידים: `customer`, `content_uploader`, `vendor` (ספק), `admin`, `super_admin`, `support`.

---

## 0. הכרעות ליבה

| # | הכרעה |
|---|---|
| S1 | RLS + FORCE על טבלאות כסף. אין כתיבת כסף מ-JWT לקוח. |
| S2 | כתיבות כסף: SECURITY DEFINER או `adminClient` אחרי `requireAdminSession()`. |
| S3 | ספק: scope דרך `supplier_members(is_active)` + helper membership; לא `supplier_id` מה-body. |
| S4 | Rate limit: כסף/redeem **fail-closed**; UX ציבורי fail-open מותר. יעד: Upstash. |
| S5 | CSRF: mutations = Server Actions / POST; Origin check ב-proxy; cookies SameSite. |
| S6 | Cardcom webhook: אותנטיות `?s=` + מקור אמת `GetLpResult` (ראה WEBHOOKS). |
| S7 | SAQ-A: אין PAN/CVV אצלנו; `cardcom_token` column revoked מדפדפן. |
| S8 | QR שובר: חתימה keyed (HMAC/Ed25519), לא digest לא-מפתח. |
| S9 | Secrets ב-Vercel; סיבוב מתועד; אין secrets ב-git/client bundle. |
| S10 | נוסח/מודל כסף: שולם באתר + יתרה בעסק. אסור נאמן / held / J5 כבקרת אבטחה. |

### ממצאים פתוחים (חייבים סגירה לפני פרוד מלא)

| ID | חומרה | תמצית |
|---|---|---|
| SEC-QR | Critical | QR חייב keyed HMAC (לא sha256 פתוח) |
| SEC-WALLET | Critical | `fn_wallet_transfer`: REVOKE מ-PUBLIC; GRANT ל-`service_role` בלבד |
| SEC-RL | High | limiter כסף fail-closed (לא fail-open) |

---

## 1. הרשאות (תמצית)

| Principal | כלל |
|---|---|
| customer | own rows דרך `auth.uid()`; קריאה בלבד לכסף |
| vendor | membership פעיל; קריאת הזמנות/שוברים של הספק; redeem רק RPC |
| content_uploader | קטלוג בלבד; אפס כסף/הזמנות |
| support | קריאה רחבה; בלי כתיבת כסף ישירה |
| admin / super_admin | mutations דרך service אחרי session; לא RLS write על money |

פירוט מטריצה: `ARCHITECTURE-SECURITY-RLS.md`.

### כללי עמודות רגישות

```sql
-- דוגמה מחייבת לרעיון
revoke select (cardcom_token) on public.payment_tokens from anon, authenticated;
revoke all on function public.fn_wallet_transfer(...) from public, anon, authenticated;
grant execute on function public.fn_wallet_transfer(...) to service_role;
```

העלאת role ל-admin: רק `super_admin`, לא לעצמו (trigger).

---

## 2. Rate limiting

| Route | מפתח | מגבלה יעד | כשל |
|---|---|---|---|
| checkout / begin LP | user+IP | 10/דקה | closed |
| redeem / scan | user / supplier | 30–60/דקה | closed |
| wallet transfer | user | 10/דקה | closed |
| login / OTP | IP | לפי Auth | closed |
| webhook Cardcom | IP | גבוה | open (סוד+API הם השער) |
| קטלוג / חיפוש | IP | רך | open |

Anti-enumeration בסורק: `wrong_supplier` → תשובה חיצונית `not_found`.

---

## 3. CSRF + Session

1. אין state change ב-GET.  
2. Origin/Referer חייב להתאים ל-Host (proxy).  
3. Session מ-`auth.getUser()` בשרת, לא מ-id בלקוח.  
4. חריג מכוון: webhook Cardcom (אין cookie; סוד URL + GetLpResult).

---

## 4. Cardcom (תמצית אבטחה)

סדר מחייב: verify secret → log event (UNIQUE) → GetLpResult → amount gate → finalize service-role.  
פירוט מלא: `ARCHITECTURE-CARDCOM-WEBHOOKS.md`. אין לסמוך על ResponseCode ב-POST לבד.

---

## 5. טוקן כרטיס (SAQ-A)

| מותר | אסור |
|---|---|
| שמירת token ספק תשלומים בשרת | PAN, CVV, track data |
| הצגת last4 / brand לבעלים | חשיפת `cardcom_token` ל-client SELECT |
| charge עם token בשרת בלבד | לוגים עם token מלא |

---

## 6. QR / קופון

| שכבה | כלל |
|---|---|
| יצירת קוד | CSPRNG; אנטרופיה גבוהה; UNIQUE |
| Payload QR | HMAC עם `VOUCHER_QR_SECRET` (סיבוב עם PREVIOUS) |
| אימות | לפני כל side effect |
| סורק | membership מה-DB |

---

## 7. אדמין + סודות

- 2FA לאדמין (יעד לפני soft-open כסף מלא).  
- `requireAdminSession()` לפני כל mutation.  
- Audit append-only לפעולות כסף/ספק/קופון.  
- סיבוב: Cardcom secrets, webhook `s=`, QR secret, service role (אירוע + רבעוני).

---

## 8. Acceptance

- [ ] אין client write על money tables
- [ ] SEC-QR / SEC-WALLET / SEC-RL סגורים או עם תוכנית dated
- [ ] Webhook: secret + GetLpResult + dedup
- [ ] Token column revoked מדפדפן
- [ ] fail-closed על checkout/redeem
- [ ] מטריצת RLS מעודכנת לכל טבלה חדשה

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch #29/50: ריענון BINDING (ADR highlights בעברית) |
| 2026-08-12 | batch-2 #29 pass-2: BINDING על arch/docs-batch-2 (המשך תור) |
