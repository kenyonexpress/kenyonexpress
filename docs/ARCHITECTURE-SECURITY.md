# ארכיטקטורה: אבטחה (Security ADR)

הכרעות אבטחה מחייבות ל-KenyonExpress. בהתנגשות עם מסמך אחר על בקרות אבטחה, מסמך זה גובר.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-SECURITY-RLS.md
docs/ARCHITECTURE-SECURITY-AUDIT.md
docs/ARCHITECTURE-TRUST-SAFETY.md
docs/ARCHITECTURE-CARDCOM-WEBHOOKS.md
docs/ARCHITECTURE-OBSERVABILITY.md
docs/CONTRADICTIONS.md
```

Stack: Next.js (proxy/middleware), Supabase Postgres + RLS, Cardcom Low Profile.  
כסף באגורות (integer) בלבד. מודל: **No Escrow**.

תפקידים:

```
customer, content_uploader, vendor, admin, super_admin, support
```

---

## 0. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| S1 | RLS + FORCE על כל טבלאות כסף. אין כתיבת כסף מ-JWT לקוח. |
| S2 | כתיבות כסף: SECURITY DEFINER או `adminClient` אחרי `requireAdminSession()` בלבד. |
| S3 | ספק: scope דרך `supplier_members(is_active)` + helper membership; לא `supplier_id` מה-body. |
| S4 | Rate limit: מסלולי כסף/redeem **fail-closed**; UX ציבורי fail-open מותר. יעד: Upstash. |
| S5 | CSRF: mutations = Server Actions / POST; Origin check ב-proxy; cookies SameSite. |
| S6 | Cardcom webhook: אותנטיות `?s=` + מקור אמת `GetLpResult` (ראה WEBHOOKS). |
| S7 | SAQ-A: אין PAN/CVV אצלנו; `cardcom_token` revoked מדפדפן. |
| S8 | QR שובר: חתימה keyed (HMAC/Ed25519), לא digest לא-מפתח. |
| S9 | Secrets ב-Vercel; סיבוב מתועד; אין secrets ב-git/client bundle. |
| S10 | נוסח/מודל כסף: שולם באתר + יתרה בעסק. אסור נאמן / held / J5 כבקרת אבטחה. |
| S11 | Anti-enumeration בסורק: `wrong_supplier` → תשובה חיצונית `not_found`. |
| S12 | Audit append-only לפעולות כסף/ספק/קופון; 2FA לאדמין לפני soft-open כסף מלא. |

### ממצאים פתוחים (חייבים סגירה לפני פרוד מלא)

| ID | חומרה | תמצית |
|---|---|---|
| SEC-QR | Critical | QR חייב keyed HMAC (לא sha256 פתוח) |
| SEC-WALLET | Critical | `fn_wallet_transfer`: REVOKE מ-PUBLIC; GRANT ל-`service_role` בלבד |
| SEC-RL | High | limiter כסף fail-closed (לא fail-open) |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| כתיבת כסף ישירות מ-JWT authenticated | כל משתמש יכול לזייף claims; RLS + service path בלבד. |
| `supplier_id` מה-body ב-redeem | זיוף ספק; membership מה-DB בלבד. |
| Rate limit fail-open על checkout/redeem | מאפשר brute force ו-double redeem; fail-closed חובה. |
| sha256 פתוח ל-QR payload | ניתן לזיוף בלי secret; HMAC keyed חובה. |
| HMAC על גוף webhook Cardcom | Cardcom לא מספקת; `?s=` + GetLpResult (ראה WEBHOOKS). |
| שמירת PAN/CVV/token מלא ב-DB | SAQ-A; token בלבד מ-Cardcom, revoked מ-client SELECT. |
| Escrow / held / J5 כבקרת אבטחה | לא במודל העסקי; No Escrow. |
| Secrets ב-`.env` ב-git או ב-bundle | דליפה קבועה; Vercel env + bundle scan. |
| Admin write על money דרך RLS policy רגילה | bypass דרך service + session gate. |

---

## 2. סכמת DB (קיים; אין DDL חדש במסמך זה)

| טבלה / אובייקט | שדות / מדיניות רלוונטיים |
|---|---|
| `orders`, `order_items` | RLS: customer own read; vendor scoped read; אין client write |
| `vouchers`, `voucher_redemptions` | redeem רק RPC SECURITY DEFINER; QR signature ב-payload |
| `wallet_accounts`, `wallet_entries` | read own; transfer רק `fn_wallet_transfer` ל-service_role |
| `payment_tokens` | `cardcom_token` REVOKE מ-anon/authenticated SELECT |
| `payments`, `payment_webhook_events` | finalize service-role; dedup UNIQUE event |
| `supplier_members` | `is_active`; basis לכל scope ספק |
| `profiles` | role promotion רק super_admin; trigger anti self-promote |
| `audit_log` | append-only לפעולות כסף/ספק/קופון |

דוגמת REVOKE מחייבת:

```sql
revoke select (cardcom_token) on public.payment_tokens from anon, authenticated;
revoke all on function public.fn_wallet_transfer(...) from public, anon, authenticated;
grant execute on function public.fn_wallet_transfer(...) to service_role;
```

פירוט מטריצת RLS: `ARCHITECTURE-SECURITY-RLS.md`.

---

## 3. Rate limiting

| Route | מפתח | מגבלה יעד | כשל |
|---|---|---|---|
| checkout / begin LP | user+IP | 10/דקה | closed |
| redeem / scan | user / supplier | 30–60/דקה | closed |
| wallet transfer | user | 10/דקה | closed |
| login / OTP | IP | לפי Auth | closed |
| webhook Cardcom | IP | גבוה | open (סוד+API הם השער) |
| קטלוג / חיפוש | IP | רך | open |

---

## 4. CSRF + Session

1. אין state change ב-GET.  
2. Origin/Referer חייב להתאים ל-Host (proxy).  
3. Session מ-`auth.getUser()` בשרת, לא מ-id בלקוח.  
4. חריג מכוון: webhook Cardcom (אין cookie; סוד URL + GetLpResult).

---

## 5. Cardcom (תמצית אבטחה)

סדר מחייב: verify secret → log event (UNIQUE) → GetLpResult → amount gate → finalize service-role.  
פירוט מלא: `ARCHITECTURE-CARDCOM-WEBHOOKS.md`. אין לסמוך על ResponseCode ב-POST לבד.

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

## 8. מקרי קצה (טבלת תפעול)

| קוד | סימפטום | תגובה |
|---|---|---|
| `rls_bypass_attempt` | user B קורא orders של A | 0 rows; ממצא CRITICAL; עצירת merge |
| `rate_limit_checkout` | spam begin LP | 429; fail-closed |
| `csrf_origin_mismatch` | POST מדומיין זר | 403 |
| `qr_forged` | HMAC לא תואם | reject לפני redeem |
| `qr_replay` | voucher כבר מומש | idempotent reject |
| `wallet_transfer_public` | קריאה ל-RPC מ-client | REVOKE; רק service_role |
| `token_leak_select` | client SELECT cardcom_token | policy חוסמת |
| `supplier_scope_wrong` | redeem לספק אחר | `not_found` חיצוני |
| `webhook_no_secret` | POST בלי `?s=` | signature_valid=false; לא paid |
| `admin_self_promote` | admin מעלה role לעצמו | trigger חוסם |
| `secret_in_bundle` | grep על `.next/static` | CRITICAL; rotation + fix |

---

## 9. פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | SEC-QR: מימוש HMAC keyed בפרוד | חוסם go-live מלא |
| O2 | SEC-WALLET: REVOKE + GRANT service_role | חוסם wallet transfer בטוח |
| O3 | SEC-RL: Upstash fail-closed על כל money paths | תלוי infra |
| O4 | 2FA חובה לאדמין: מתי exactly | לפני CHECKOUT_ENABLED מלא |
| O5 | Ed25519 vs HMAC-SHA256 ל-QR | Ed25519 מועדף ל-mobile scan speed |
| O6 | תדירות rotation אוטומטי ל-QR PREVIOUS | לקבוע ב-ENV-SECRETS |

עודכן: 2026-08-12.

---

## 10. Acceptance

- [ ] אין client write על money tables
- [ ] SEC-QR / SEC-WALLET / SEC-RL סגורים או עם תוכנית dated
- [ ] Webhook: secret + GetLpResult + dedup
- [ ] Token column revoked מדפדפן
- [ ] fail-closed על checkout/redeem
- [ ] מטריצת RLS מעודכנת לכל טבלה חדשה
- [ ] חלופות שנדחו + סכמת DB + מקרי קצה + פתוחות

---

## 11. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch #29/50: ריענון BINDING |
| 2026-08-12 | batch-2 pass-2: שכתוב לפי תבנית חובה (החלטה, חלופות, DB, קצה, פתוחות) |
