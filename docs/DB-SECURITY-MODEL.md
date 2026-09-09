# DB-SECURITY-MODEL.md — RLS, Policies, SECURITY DEFINER

> נשלף חי מ-Postgres 17, פרויקט Supabase `ixvwfbuvfxxsjiywhbbb`, schema `public`. עדכון אחרון: 2026-09-01 (סעיף 4 מפה מלאה; המספרים וסעיף 5.1 נשלפו מחדש אחרי החלת 127).
> כל שורה כאן נשלפה מ-`pg_policies`, `pg_class`, `pg_proc` (aclexplode) בפועל, לא מהזיכרון.
> **מיגרציה 125 הוחלה ואומתה ב-21.08**: הוסרו הרשאות EXECUTE ל-authenticated מ-6 פונקציות עזר יתומות. אומת שוב ב-01.09: לשש כולן `anon=false, authed=false`.
> **⚠️ מיגרציה 127 הוחלה ב-01.09**, אחרי שהאתר עלה לאוויר, והיא משנה את סעיף 5.1. ‏`check_rate_limit` **אינה חשופה יותר** ל-anon ול-authenticated. הוכחה, קריאה אמיתית עם המפתח הפומבי: `POST /rest/v1/rpc/check_rate_limit` מחזיר `401` ו-`42501 permission denied for function check_rate_limit`.
> **הערה על advisors**: ה-cache של Supabase advisors עשוי להציג WARN ישנים. המקור האמין הוא `pg_proc`, לא ה-advisors.

## 0. תמונת מצב מספרית (אחרי 125 ו-127, נשלף 01.09)

**‏53** טבלאות ב-`public`, כולן עם RLS מופעל, כולן `rls_forced = false` (הבעלים ו-`service_role` עוקפים).

**‏52** טבלאות עם policy מתירני (PERMISSIVE) אחד לפחות. **‏9** טבלאות server-only (סעיף ‏6), ובהן שתי צורות שונות של deny-all שכדאי להבחין ביניהן:

| צורה | טבלאות | ‏מה ה-advisor אומר |
|---|---|---|
| אפס policies בכלל (**‏4**) | `payment_webhook_events`, `rate_limits`, `search_index_outbox`, `user_rate_limits` | ‏`rls_enabled_no_policy`, ‏INFO |
| ‏policy יחיד `RESTRICTIVE` עם `USING (false)` (**‏5**) | `legacy_percent_archive_112`, `referral_signals`, `search_index_dlq`, `settlement_events`, `stock_reservations` | לא מסומן: יש policy |

‏**המספר ‏8 שהופיע כאן קודם קדם לשתי מיגרציות.** ‏122 הוסיפה את
‏`deny_all_client_roles` לחמש הטבלאות בשורה השנייה, כך שהן כבר לא "אפס
policies", ו-132 הוסיפה את `search_index_outbox` שאין לה policy כלל.
‏9 = 4 + 5, וכל התשע חסומות לחלוטין ל-anon ול-authenticated.

**‏61** פונקציות SECURITY DEFINER מתוך **‏69** בסך הכל (נמדד 01.09): **‏4** מהן חשופות ל-anon (וגם ל-authenticated), **‏13** חשופות ל-authenticated, השאר service_role בלבד וטריגרים. **כל ‏61 מצמידות `search_path`, אפס לא מוצמדות.**

‏**‏6 הרשאות EXECUTE ל-anon בסך הכל**, לא ‏4: מעבר לארבע ה-SECURITY DEFINER יש ‏`payment_events_append_only` ו-`refunds_force_due_by`, שתיהן פונקציות טריגר שנושאות את ה-grant הציבורי שברירת המחדל של Postgres נותנת. הן מחזירות `trigger` ולא מקבלות ארגומנטים, ולכן קריאה להן דרך PostgREST לא משיגה דבר. ‏audit שסופר grants ולא משטח-תקיפה יראה ‏6 וצריך לדעת שלוש מהן אינרטיות.

Advisors security אחרי 127: **‏23** ממצאים, כולם מכוונים ומתועדים — 8 `rls_enabled_no_policy` (INFO, deny-all מכוון), 3 `anon_security_definer` (WARN, סעיף 5.1), 12 `authenticated_security_definer` (WARN, סעיפים 5.1+5.2). לפני 127 היו 25; שני הממצאים שנעלמו הם בדיוק `check_rate_limit` בשתי הרשימות.

## 1. עקרון-על

PostgREST חושף את ה-DB דרך שני תפקידים ציבוריים: `anon` (אנונימי) ו-`authenticated` (משתמש מחובר). תפקיד שלישי, `service_role`, רץ רק בשרת (Worker / API) ו-**עוקף RLS** (BYPASSRLS).

הכלל: כל טבלה ב-`public` מפעילה RLS. RLS מופעל בלי policy תואם = דחייה. לכן:

טבלה עם RLS ובלי אף policy = חסומה לחלוטין ל-anon ול-authenticated (סעיף 6).

טבלה עם policy ל-SELECT בלבד = קריאה-בלבד; כל DML נדחה ומתבצע רק דרך `service_role` או פונקציית SECURITY DEFINER.

כל כתיבה לנתונים רגישים (כסף, מלאי, שוברים, ארנק, התחשבנות) עוברת דרך `service_role` או פונקציית SECURITY DEFINER מבוקרת.

## 2. מודל האיחוד (Policy Consolidation)

policy יחיד ומאוחד לכל צירוף טבלה/פעולה, בשם `<table>_<cmd>_unified`, עם תנאי `OR` פנימי אחד.

חריג מכוון: טבלאות קטלוג שבהן ל-anon ול-authenticated חשיפה שונה מחזיקות שני policies נפרדים ל-SELECT (`_select_anon` ו-`_select_authenticated`): `products`, `product_variants`, `categories`, `popular_searches`.

## 3. פונקציות העזר ל-Policies

כל בדיקות ההרשאה נשענות על פונקציות SECURITY DEFINER STABLE.

| פונקציה | anon | authenticated | תפקיד |
|---|---|---|---|
| `is_admin()` | כן | כן | האם אדמין. ל-anon מחזירה false |
| `is_supplier_member(uuid)` | כן | כן | האם חבר בספק נתון. ל-anon false |
| `is_support()` | לא | כן | תפקיד תמיכה, קריאה מורחבת |
| `has_role(text)` | לא | כן | בדיקת תפקיד לפי שם |
| `current_user_role()` | לא | כן | ה-enum `user_role` של המשתמש |
| `is_supplier_owner(uuid)` | לא | כן | האם בעל הספק |
| `is_supplier_order(uuid)` | לא | כן | האם ההזמנה שייכת לספק של המשתמש |
| `is_supplier_shipping_order(uuid)` | לא | כן | ספק שמשלֵח בהזמנה |
| `supplier_app_context()` | לא | כן | קונטקסט אפליקציית הספק (apps/mobile) |
| `current_supplier_id()` | לא | **לא (הוסר ב-125)** | עזר פנימי, service_role בלבד |

## 4. מפת RLS מלאה — policy פר טבלה / פעולה / תפקיד

נשלף חי מ-`pg_policies` ב-31.08. מקרא: **א** = anon, **מ** = authenticated, **פ** = public (כל התפקידים), **—** = אין policy, הפעולה חסומה ללקוח ומתבצעת רק דרך `service_role` / SECURITY DEFINER. שם ה-policy מופיע כשאינו במוסכמת `_unified`.

### 4.1 קטלוג ותוכן ציבורי

| טבלה | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `products` | א+מ (נפרדים) | מ | מ | מ |
| `product_variants` | א+מ (נפרדים) | מ | מ | מ |
| `product_images` | פ | פ | פ | פ |
| `categories` | א+מ (נפרדים) | פ | פ | פ |
| `suppliers` | פ | מ | מ | מ |
| `coupon_deals` | פ | מ | מ | מ |
| `coupons` | פ (`Public can view coupons`) | — | — | — |
| `cashback_rules` | פ | מ | מ | מ |
| `media_assets` | פ (`public read`) | מ (`staff insert`) | מ (`staff update`) | מ (`admin delete`) |
| `popular_searches` | א+מ (נפרדים) | מ | מ | מ |
| `seo_redirects` | א+מ (policy אחד) | — | — | — |

ה-policies של INSERT/UPDATE/DELETE בקטלוג בודקים בפנים `is_admin()` / `is_supplier_member()` — התפקיד בעמודה הוא מי שמורשה לנסות, התנאי הפנימי קובע מי עובר.

### 4.2 נתוני לקוח (בעלות לפי `auth.uid()`)

| טבלה | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | מ | — (טריגר `handle_new_user`) | מ | — |
| `carts` | פ ALL (`owner all`) | פ ALL | פ ALL | פ ALL |
| `user_addresses` | מ | מ | מ | מ |
| `push_tokens` | מ (own) | מ (own) | מ (own) | מ (own) |
| `user_recent_searches` | מ (own) | — (דרך `fn_record_recent_search`) | — | מ (own) |
| `orders` | מ | מ | מ | מ |
| `order_items` | מ | מ | מ | מ |
| `invoices` | מ (`owner read`) | — | — | — |
| `newsletter_subscribers` | מ | — | — | — |

### 4.3 כסף, תשלומים, ארנק — קריאה בלבד ללקוח

| טבלה | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `payments` | פ (owner) | — | — | — |
| `payment_tokens` | פ (owner) | — | מ (owner) | מ (owner) |
| `escrow_holds` | פ | — | — | — |
| `split_executions` | פ | — | — | — |
| `wallet_accounts` | פ (owner) | — | — | — |
| `wallet_entries` | פ | — | — | — |
| `wallet_balances` | מ | מ | מ | מ |
| `wallet_transactions` | מ | מ | מ | מ |
| `vouchers` | מ | — | — (מימוש דרך `redeem_voucher`) | — |
| `voucher_redemptions` | מ | — | — | — |
| `discount_redemptions` | מ | — | — | — |

כל policy של SELECT כאן מסנן בפנים לפי בעלות (`auth.uid()`) או `is_admin`/`is_support` — "פ" לא אומר חשיפה ציבורית, אלא שהתנאי הפנימי הוא הקובע.

### 4.4 ספקים, שיווק, ניהול

| טבלה | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `supplier_members` | מ | מ | מ | מ |
| `supplier_staff` | מ (`member read`) | — (דרך `set_supplier_staff_pin`) | — | — |
| `supplier_leads` | מ (`staff read`) | — | מ (`staff write`) | — |
| `vendors` | מ | מ (super_admin) | מ (super_admin) | מ (super_admin) |
| `affiliates` | מ | מ | מ | מ |
| `referrals` | מ | מ | מ | מ |
| `referral_program_settings` | מ (admin) | — | — | — |
| `coupon_codes` | מ | — | — | — |
| `discount_campaigns` | מ (admin) | — | — | — |
| `abandoned_cart_nudges` | מ (admin) | — | — | — |
| `email_suppressions` | מ (admin) | — | — | — |
| `notification_outbox` | פ (admin בפנים) | — | — | — |
| `search_events` | מ (`staff read`) | — | — | — |

### 4.5 audit_log — דחייה מפורשת

| טבלה | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `audit_log` | מ (admin) | מ deny (`no_insert`) | מ deny (`no_update`) | מ deny (`no_delete`) |

שלושת ה-deny הם policies עם תנאי `false` — כתיבה רק דרך הטריגר `audit_log_trigger_fn`.

### 4.6 deny-all (אפס policies)

`legacy_percent_archive_112`, `payment_webhook_events`, `rate_limits`, `referral_signals`, `search_index_dlq`, `settlement_events`, `stock_reservations`, `user_rate_limits`. פירוט בסעיף 6.

## 5. ‏61 פונקציות SECURITY DEFINER — מי מורשה להריץ (סופי, אחרי 125 ו-127)

> ‏**נמדד מחדש 01.09.2026:** ‏`public` מחזיקה **69 פונקציות**, מתוכן **61**
> ‏`SECURITY DEFINER`. ‏61 הוא מספר ה-overloads; שמות שונים יש **60**, כי
> ‏`fn_enqueue_notification` קיימת בשתי חתימות. הספירה 59 שהופיעה כאן קודם
> קדמה לגל 130-146.
>
> ‏**כל 61 מצמידות `search_path`. אפס לא מוצמדות** — מחלקת חטיפת ה-search_path
> סגורה לגמרי.
>
> ‏**מיפוי המספרים, כי הם התחלפו.** ‏125 ו-127 כאן הם שמות ההחלה בפרודקשן;
> בקבצים תחת `migrations/pending/` אותן מיגרציות נקראות **143** ו-**145**.
> הטבלה המלאה: `docs/ARCHITECTURE-OVERVIEW.md` סעיף 8.1.

### 5.1 חשופות ל-anon + authenticated (3, ולא 4)

| פונקציה | תפקיד |
|---|---|
| `is_admin()` | עזר policy, false ל-anon |
| `is_supplier_member(uuid)` | עזר policy, false ל-anon |

> ‏**‏EXECUTE של ‏anon על שני העזרים הוא ‏by design, לא חוב.** ‏18 ‏policies
> ברולים ‏public/anon (בין השאר ‏product_images, ‏coupon_deals, ‏suppliers,
> ‏seo_redirects, ‏cashback_rules, ‏categories, ‏wallet_*, ‏split_executions,
> ‏escrow_holds, ‏payments, ‏carts, ‏notification_outbox) קוראות להן בתוך
> ‏USING/WITH CHECK, ו-quals רצים כזהות הקורא — ‏revoke היה מפיל כל ‏SELECT
> אנונימי בקטלוג ל-42501. מיגרציה ‏165 שניסתה בדיוק את זה בוטלה ב-04.09
> (‏CLOSEOUT §13) ויושבת ב-`migrations/cancelled/` עם הסיבה בראשה. רשת
> הרגרסיה: `src/db/__tests__/anon-catalog.test.ts`.
| `fn_record_recent_search(text)` | רישום חיפוש אחרון. מקבלת את לקוח הסשן של הקורא, קוראת `auth.uid()`, ולא כותבת כלום בלי סשן |

‏**‏`check_rate_limit(text, int, int)` הוסרה מהרשימה הזו ב-01.09 על ידי מיגרציה 127.** היא הייתה `SECURITY DEFINER` עם `anon=X | authenticated=X`, והגוף שלה מכניס את `p_key` כמו שהוא ומעלה את המונה **לפני** ההשוואה ל-`p_max_attempts`. כלומר קורא אנונימי בחר גם את המפתח וגם את הסף: חמש קריאות עם `phone-otp-number:<קורבן>` נעלו מספר ידוע משעה של התחברות ב-OTP, וכל קריאה הייתה כתיבה בלתי מוגבלת של שורות שהתוקף בוחר ל-`rate_limits`.

עכשיו `postgres=X | service_role=X` בלבד. ההחלה הייתה בטוחה כי `src/lib/utils/rate-limit.ts` בונה את הלקוח שלו ב-`createAdminClient()` ולכן שני הלימיטרים מגיעים כ-service_role, והקומיט שעשה זאת (`c85725754`) הוא אב-קדמון של הקומיט שמוגש בפרודקשן. **החלה לפני שהקוד היה חי הייתה מפילה כל לימיטר באתר ל-`return true`.**

### 5.2 חשופות ל-authenticated בלבד (9) — סופי, אומת חי

**RPC מהאפליקציה (3):**

| פונקציה | נקרא מ- |
|---|---|
| `redeem_voucher(code, method, idempotency, ip, ua)` | נקודת הכניסה היחידה למימוש שובר |
| `verify_supplier_staff_pin(pin)` | אימות PIN איש צוות ספק |
| `supplier_app_context()` | apps/mobile/src/lib/supplier/api.ts:64 |

**עזרי policies (6):** `current_user_role`, `has_role`, `is_support`, `is_supplier_order`, `is_supplier_owner`, `is_supplier_shipping_order` — נקראות בתוך policies; REVOKE ישבור את ה-policies, חייבות להישאר.

יחד עם שלוש הפונקציות שבסעיף 5.1 (שחשופות גם ל-anon), סך החשופות ל-authenticated הוא **12**, וזה המספר שנשלף חי מ-`pg_proc`.

**הוסרו ב-125 (6) — עכשיו service_role בלבד:**
`current_supplier_id`, `fn_ensure_referral_code`, `fn_wallet_cashback_amount`, `fn_wallet_cashback_percent`, `log_voucher_scan`, `voucher_success_payload`.
אף אחת לא נקראה דרך rpc() מהקוד (grep מלא 21.08). ההסרה של `voucher_success_payload` גם סוגרת את באג חשיפת full_name דרך שורה מזויפת — הלקוח כבר לא יכול לקרוא לה בכלל.

‏**⚠️ הערה על `fn_ensure_referral_code`:** מאז 01.09 יש לה **קורא אחד** בקוד,
‏`src/server/actions/referrals.ts`, והוא רץ על `createAdminClient()` כלומר
כ-service_role, ולכן ה-REVOKE של 125 אינו שובר אותו. הסיווג הזה נעול
ב-`src/__tests__/revoked-functions-have-no-callers.test.ts`.

### 5.3 service_role בלבד — קריאות (38)

הרשימה מ-20.08 (32) + 6 שהוסרו ב-125. רצות רק תחת Worker / cron:

מלאי: `available_stock`, `reserve_order_stock`, `consume_order_stock`, `release_order_stock`, `release_expired_stock_reservations`.
שוברים: `expire_vouchers`, `credit_expired_vouchers`, `cancel_vouchers_for_order`, `refund_vouchers_for_order`, `enqueue_expiring_voucher_notices`, `log_voucher_scan`, `voucher_success_payload`.
הנחות/הפניות: `fn_claim_discount`, `fn_release_discount`, `fn_claim_referral`, `fn_complete_referral`, `fn_pay_referral`, `fn_reject_referral`, `fn_referral_fraud_signals`, `fn_ensure_referral_code`.
ארנק/התחשבנות: `fn_wallet_transfer`, `product_platform_percent`, `fn_wallet_cashback_amount`, `fn_wallet_cashback_percent`.
עגלות נטושות: `fn_due_abandoned_carts`, `fn_reap_expired_carts`, `fn_attribute_cart_recovery`.
Rate limit: `check_rate_limit` (מאז 127), `check_user_rate_limit`, `cleanup_rate_limits`, `cleanup_user_rate_limits`.
התראות/חיפוש/דיוור: `fn_enqueue_notification` (2 עומסים), `fn_push_targets`, `fn_record_search`, `fn_record_redirect_hits`, `fn_unsubscribe_by_token`.
צוות ספק: `set_supplier_staff_pin`. עזר: `current_supplier_id`.

### 5.4 טריגרים (8)

`handle_new_user`, `audit_log_trigger_fn`, `enforce_product_approval`, `enforce_profile_privilege_columns`, `fn_ensure_wallet_account`, `settlement_events_no_rewrite`, `tg_orders_notify_paid`, `tg_vouchers_notify_redeemed`.

## 6. שמונה הטבלאות הפנימיות — deny-all בכוונה

| טבלה | ייעוד | מי כותב/קורא |
|---|---|---|
| `payment_webhook_events` | יומן webhooks של Cardcom, idempotency | Worker בלבד |
| `settlement_events` | אירועי התחשבנות/פיצול | service_role בלבד |
| `stock_reservations` | תפיסות מלאי זמניות עם TTL | דרך פונקציות המלאי |
| `rate_limits` | מוני קצב גלובליים | דרך `check_rate_limit` |
| `user_rate_limits` | מוני קצב פר משתמש | דרך `check_user_rate_limit` |
| `referral_signals` | אותות אנטי-הונאה | service_role |
| `search_index_dlq` | DLQ לאינדוקס Meilisearch | Worker בלבד |
| `legacy_percent_archive_112` | ארכיון קפוא ממיגרציה 112 | אף אחד בזמן ריצה |

RLS מופעל בלי אף policy = Postgres דוחה כל שורה לכל תפקיד שאינו עוקף RLS. deny-all מכוון, לא באג.

## 7. סיכום שכבות ההגנה (מצב סופי)

תפקיד PostgREST ← הרשאות GRANT (הוקשחו ב-125 וב-127) ← RLS policy מאוחד ← SECURITY DEFINER לפעולות רגישות.

נתוני משתמש ב-`auth.uid()`. נתוני ספק ב-`is_supplier_*`. ניהול ב-`is_admin`/`has_role`/super_admin. תשתית פנימית חסומה חוץ מ-service_role. כל כתיבה כספית דרך SECURITY DEFINER מבוקרת. **גל ההקשחה הושלם — אין REVOKE נוסף אפשרי בלי לשבור פונקציונליות**, ושתי האזהרות שנותרו על `is_admin` ו-`is_supplier_member` הן פרדיקטים של policies: שלילת EXECUTE מהן שוברת את הערכת ה-RLS עצמה.
