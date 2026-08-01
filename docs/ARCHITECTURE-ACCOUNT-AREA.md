# ARCHITECTURE-ACCOUNT-AREA.md

ארכיטקטורת **האזור האישי** (`/account/**`) של KenyonExpress.

Status: BINDING · worktree

```
/Users/ofir/kenyonexpress-web/ke-arch-account-area
```

branch:

```
arch/account-area
```

Date: 2026-07-31  
Scope: **docs בלבד.** אין שינוי קוד ב-repo הראשי במסגרת הקומיט הזה.

Companions:

- `ke-arch-account/docs/ARCHITECTURE-ACCOUNT.md` (מפרט קודם; המסמך הזה **מנצח** על Auth = Google בלבד, קופונים+QR, ארנק, RLS מלא)
- `ke-arch-cart/docs/ARCHITECTURE-CART-CHECKOUT.md`
- `ke-arch-checkout-verify/docs/ARCHITECTURE-CHECKOUT-CARDCOM-VERIFICATION.md`
- skill:

```
.claude/skills/cardcom-payments/SKILL.md
```

Stack: Next.js 15 App Router route group `(account)`, Server Components + Server Actions, Supabase Auth (Google OAuth), request-scoped client + RLS, Cardcom tokens (תצוגה בלבד), כסף באגורות, RTL + Heebo + `#fed700`.

ייחוס עיצובי: Electro home-v7 / מדידות חיות ב-

```
refs/
```

וטוקנים שכבר נעולים ב-

```
src/styles/account.css
```

(container 1320px, ink `#333e48`, primary `#fed700`).

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| A1 | כל `/account/**` דורש session. אורח → `/login?next=...`. Guest cart נשאר פתוח מחוץ לאזור. |
| A2 | **Google OAuth בלבד** לכניסה לאזור האישי ולתשלום. אין UI של סיסמה/OTP באזור הזה. (מסלולי סיסמה ישנים בקוד = legacy לסגירה ב-UX.) |
| A3 | RLS הוא הגבול האמיתי. מסכי לקוח קוראים עם client של המשתמש. `adminClient` רק בחריגים מתועדים עם `.eq('user_id', uid)` חובה. |
| A4 | אין PAN/CVV. `payment_tokens.cardcom_token` לא נבחר ב-SELECT ל-role `authenticated`. |
| A5 | קופונים מטבלת `vouchers` (לא `coupon_codes` לכתיבה/תצוגה חדשה). סטטוסים: פעיל / נסרק / פג (+ זוכה). QR לכל שובר. |
| A6 | ארנק = קרדיט פנימי בלבד. שימוש בקנייה באתר. **אין משיכה**, אין העברה למשתמש, אין זיכוי כרטיס מהארנק. |
| A7 | כסף DB באגורות; UI מציג ₪ ב-`he-IL`, `Asia/Jerusalem`. |
| A8 | RTL + Heebo מ-root layout. צהוב מותג `#fed700`. |
| A9 | התנתקות מהניווט + מדף הפרטים. אחרי logout → `/login`. |
| A10 | קופון: מה ששולם באתר נשאר בפלטפורמה; יתרה בבית העסק; אין Escrow. |

---

## 1. מפת מידע (IA)

```
(account)/layout.tsx     getUser() gate + AccountNav + shell
  /account               סקירה
  /account/coupons       הקופונים שלי (טאבים + QR)
  /account/orders        היסטוריית הזמנות
  /account/orders/[id]   פרטי הזמנה + קופונים/QR שלה
  /account/details       פרטים אישיים + התנתקות
  /account/tokens        כרטיסים שמורים (ברירת מחדל / מחיקה)
  /account/wallet        יתרה + תנועות
  /account/addresses     כתובות למשלוח (פיזי)
```

Nav (עברית, מחייב):

| href | תווית |
|---|---|
| `/account` | סקירה |
| `/account/coupons` | הקופונים שלי |
| `/account/orders` | ההזמנות שלי |
| `/account/details` | הפרטים שלי |
| `/account/wallet` | הארנק שלי |
| `/account/tokens` | אמצעי תשלום |
| `/account/addresses` | כתובות |

Badge בניווט על הארנק: יתרה מעוצבת.  
כפתור **התנתקות** בתחתית ה-nav ובסוף `/account/details`.

Alias קיים בקוד: `/account/vouchers` → להפנות ל-`/account/coupons` (מקור אמת אחד).

---

## 2. עיצוב: RTL, Heebo, מדידות מ-`refs/` + CSS חי

### 2.1 מקורות מדידה

| מקור | שימוש |
|---|---|
| `refs/` live/mine/electro captures | פלטת Electro, רוחב container, צבעי ink/muted |
| `src/styles/account.css` | טוקנים נעולים לאזור האישי |
| root layout Heebo | `--font-heebo` על כל הטקסט |

אין מסך my-account ייעודי ב-`refs/` כקובץ נפרד; האזור יורש את **שפת המותג** של החנות (צהוב, ink, כחול לינקים) ולא דשבורד סגול/כרטיסים עמוסים.

### 2.2 טוקנים מחייבים

```css
/* contract: mirror of account.css */
.account-page {
  --account-yellow: #fed700;
  --account-ink: #333e48;
  --account-muted: #768b9e;
  --account-line: #e4e4e4;
  --account-blue: #0062bd;
  --account-red: #e4002b;
  --account-green: #44b81b;
}

.account-page__inner { max-width: 1320px; padding-inline: 15px; }
.account-shell { grid-template-columns: 260px 1fr; gap: 30px; }
/* ≤900px: עמודה אחת */
```

| אלמנט | כלל |
|---|---|
| כיוון | `dir="rtl"` בירושה מ-`<html>` |
| פונט | Heebo בלבד (לא Inter/system) |
| CTA ראשי | רקע `#fed700`, טקסט `#333e48` |
| כרטיסי תוכן | גבול `#e4e4e4`, רדיוס קטן (4px), בלי צללים מרובים |
| QR | 220 עד 264px, רקע לבן, alt בעברית |
| Chips סטטוס | ok/warn/dead לפי `account-chip--*` |

### 2.3 כללי קומפוזיציה

- כל מסך: כותרת אחת + משפט אחד + תוכן העבודה.
- אין סטריפים שיווקיים, אין badges צפים, אין dashboard widgets מעבר לסקירה.
- Mobile: nav מעל התוכן; לחיצות גדולות מספיק לאצבע.

---

## 3. Auth: Google OAuth בלבד

### 3.1 שער

```
GET /account/**
  → createClient().auth.getUser()
  → if !user: redirect(/login?next=<encoded path>)
  → render shell
```

`/login`:

- כפתור יחיד ראשי: **המשך עם Google**.
- אחרי הצלחה: callback → `mergeGuestCart` אם יש session אורח → `next` או `/account`.
- אין טפסי סיסמה/OTP במסך הזה (A2).

### 3.2 חוזה Server Actions

```ts
// contract
export async function signInWithGoogle(_: AuthState, formData: FormData): Promise<AuthState>
// supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, queryParams } })

export async function signOut(): Promise<void>
// scope: 'local' → redirect('/login')

export async function signOutAll(): Promise<void>
// scope: 'global' (אופציונלי: יציאה מכל המכשירים)
```

### 3.3 אחרי logout

1. `signOut({ scope: 'local' })`
2. ניקוי best-effort של mirror עגלה ב-localStorage (אם קיים)
3. **לא** מוחקים עגלת משתמש בשרת
4. Cookie אורח חדש נוצר רק בפעולת עגלה הבאה אם חסר
5. redirect ל-`/login`

### 3.4 אסור

- להציג "התחבר עם סיסמה" באזור האישי.
- לסמוך על `getSession()` בלבד בשרת (להעדיף `getUser()`).
- לחשוף האם אימייל קיים למשתמש אחר דרך הודעות שגיאה.

---

## 4. סקירה `/account`

תפקיד אחד: "מה המצב שלי עכשיו?"

Widgets (RSC):

1. יתרת ארנק + קישור ל-`/account/wallet` + משפט "לא ניתן למשיכה"
2. הזמנה אחרונה (או ריק)
3. מספר קופונים פעילים (`issued`/`active` ו-`expires_at > now()`)
4. קיצור להזמנות

Empty copy:

| מצב | עברית |
|---|---|
| אין הזמנות | עוד לא ביצעת הזמנות. |
| אין קופונים פעילים | אין כרגע קופונים שממתינים למימוש |

---

## 5. הקופונים שלי `/account/coupons`

### 5.1 מקור נתונים

טבלה:

```
public.vouchers
```

RLS:

```
vouchers_owner_read: user_id = auth.uid()
```

שאילתה (חוזה): בלי filter ידני של user (RLS); `order by issued_at desc`; limit 100; join `products(name_he)`.

### 5.2 טאבים / סטטוסים (UI)

| טאב עברית | DB | תווית chip |
|---|---|---|
| פעיל | `issued` (legacy `active`) | פעיל |
| נסרק | `used` (legacy `redeemed`) | מומש / נסרק |
| פג | `expired`, וגם `refunded` | פג תוקף / זוכה |

מיפוי תוויות מחייב (כבר ב-`format.ts`):

```
issued|active → פעיל
used|redeemed → מומש  (UI account: "נסרק" בטאב; chip יכול להישאר "מומש")
expired → פג תוקף
refunded → זוכה
```

### 5.3 כרטיס קופון (חובה לכל שורה)

| שדה | מקור |
|---|---|
| שם מוצר | `products.name_he` |
| קוד | `vouchers.code` (קיבוץ ויזואלי) |
| QR | `QRCode.toDataURL` מ-`qr_token` או מהקוד החתום; 220 עד 264px |
| תוקף | `expires_at` |
| שולם באתר | `coupon_price_agorot` |
| יתרה בעסק | `remaining_amount_due_agorot` |
| שווי מלא | `face_value_agorot` |
| תאריך סריקה | `redeemed_at` (בטאב נסרק) |

אינווריאנט:

```
face_value_agorot = coupon_price_agorot + remaining_amount_due_agorot
```

### 5.4 QR

- רינדור בשרת (העדפה להזמנה/return) או client component קטן עם `qrcode`.
- QR הוא bearer לתצוגה; האכיפה ב-`redeem` בשרת (חד-פעמי).
- לקופונים לא-פעילים: QR אפור/מוסתר + הודעה "לא ניתן למימוש".

### 5.5 פער מול קוד חי (2026-07)

דף

```
src/app/(account)/account/coupons/page.tsx
```

מציג רשימה בלי טאבים ובלי QR. `/account/vouchers` ו-return page כן יודעים QR.  
**יעד המסמך:** טאבים + QR בכל כרטיס פעיל (ובאופציה גם בנסרק/פג לקריאה בלבד).

---

## 6. היסטוריית הזמנות

### 6.1 רשימה `/account/orders`

מקור: `orders` של המשתמש, חדש לישן, limit 50.

| שדה UI | מקור |
|---|---|
| סכום | `total_*` (agorot→₪) |
| תאריך | `created_at` |
| כמות פריטים | sum `order_items.quantity` |
| סטטוס | derive מ-`settlement_status` / order status |
| יש קופון | שורת coupon כלשהי |

תוויות סטטוס (עברית): ממתינה לתשלום / שולמה / הושלמה / מומשה / זוכתה / בוטלה.

Legacy `escrow_*` בתצוגה: למפות לתווית ניטרלית (שולמה/הושלמה), בלי להזכיר Escrow ללקוח.

### 6.2 פרט `/account/orders/[id]`

- בעלות: `order.user_id === auth.uid()` אחרת 404.
- שורות: שם, סוג (קופון/פיזי), שולם באתר, יתרה בעסק, snapshot `platform_percent` (קריאה בלבד; לקופון תצוגה משנית בלבד).
- קופונים של ההזמנה: קוד + QR כמו ב-§5.
- אין כפתור "בטל הזמנה ששולמה" ללקוח (רק תמיכה/אדמין).

---

## 7. פרטים אישיים + התנתקות `/account/details`

| שדה | עריכה | הערות |
|---|---|---|
| אימייל | לא | מגיע מ-Google; טקסט הסבר |
| שם מלא | כן | `profiles.full_name` |
| טלפון | כן | אימות ישראלי (Zod) |
| תמונת Google | קריאה | אופציונלי |

Actions:

- `updateProfileDetails` → UPDATE `profiles` תחת RLS (בלי שינוי `role`).
- `signOut` / אופציונלי `signOutAll`.

מיגרציה רלוונטית: `090_profiles_no_self_role_change.sql` (אסור ללקוח לשנות role).

---

## 8. Token כרטיס שמור `/account/tokens`

### 8.1 תצוגה

עמודות מותרות ל-SELECT:

```
id, last_4, card_brand, expiry_month, expiry_year, is_default, created_at
```

אסור: `cardcom_token`.

### 8.2 פעולות לקוח

| פעולה | מנגנון |
|---|---|
| קבע כברירת מחדל | UPDATE: נקה `is_default` אצל כולם, הגדר בשורה |
| מחק | DELETE תחת RLS בעלות |
| הוסף כרטיס | **אין טופס PAN.** רק דרך checkout/Cardcom tokenize |

כרטיס פג תוקף: chip "פג תוקף"; חסימת set-default.

### 8.3 אבטחה

- Column privilege / view בלי עמודת הטוקן ל-`authenticated` (ראה §12).
- Rate limit על delete/default.
- אופציונלי: אחרי DELETE, job שמבטל טוקן ב-Cardcom (service role).

---

## 9. ארנק קאשבק פנימי `/account/wallet`

### 9.1 מודל

| כלל | פירוט |
|---|---|
| מה זה | קרדיט אתר בלבד |
| מאיפה נכנס | cashback (כל רכישה 5 לפי כלל), זיכוי פקיעת קופון (C6), קרדיט אדמין |
| לאן יוצא | **רק** כהנחה/כיסוי ב-`beginCheckout` (`apply_wallet`) |
| אסור | משיכה לבנק, העברה למשתמש, refund לכרטיס מהארנק, משיכת API |

### 9.2 UI

1. יתרה גדולה (`wallet_accounts.balance_agorot` או תצוגת ILS נגזרת).
2. משפט קבוע: "לשימוש באתר בלבד. לא ניתן למשיכה."
3. טבלת תנועות: תאריך, סיבה בעברית, +/- סכום, קישור להזמנה אם יש.

מקור תנועות: `v_wallet_ledger` / `wallet_entries` דרך RLS בעלות על החשבון.

### 9.3 כתיבות

אין INSERT/UPDATE/DELETE ללקוח על `wallet_entries` / `wallet_accounts`.  
כסף זז רק ב-RPC (`fn_wallet_transfer` / journal) תחת service role מתוך finalize/cron/admin.

### 9.4 תוויות סיבה (דוגמאות)

| reason | עברית |
|---|---|
| `cashback` | קאשבק |
| `order_spend` | שימוש בהזמנה |
| `voucher_expiry_credit` | זיכוי קופון שפג |
| `admin_credit` | זיכוי מערכת |
| `refund_credit` | זיכוי |

---

## 10. כתובות `/account/addresses` (תמיכה בפיזי)

Soft-delete (`deleted_at`). שדות ישראליים: שם, טלפון, רחוב, מספר, דירה, כניסה, קומה, עיר, מיקוד, הערות לשליח, `is_default`.

כללים: ברירת מחדל אחת; מחיקה רכה; checkout מעדיף default כשיש שורת פיזי.

---

## 11. Types (חוזה)

```ts
export type VoucherStatus = 'issued' | 'used' | 'expired' | 'refunded'

export type AccountProfile = {
  id: string
  email: string
  fullName: string | null
  phone: string | null
  avatarUrl: string | null
}

export type WalletSummary = {
  balanceAgorot: number // integer
  accountId: string | null
}

export type WalletLedgerRow = {
  id: string
  createdAt: string
  reason: string
  direction: 'credit' | 'debit'
  amountAgorot: number
  orderId: string | null
}

export type AccountVoucher = {
  code: string
  status: VoucherStatus | string
  expiresAt: string
  faceValueAgorot: number
  couponPriceAgorot: number
  remainingDueAgorot: number
  redeemedAt: string | null
  productName: string | null
  qrDataUrl: string | null
}

export type AccountPaymentToken = {
  id: string
  last4: string
  cardBrand: string | null
  expiryMonth: number
  expiryYear: number
  isDefault: boolean
  createdAt: string
  // NEVER cardcom_token
}

export type OrderSummary = {
  id: string
  settlementStatus: string
  createdAt: string
  totalAgorot: number
  itemCount: number
  hasVouchers: boolean
}
```

---

## 12. RLS: מדיניות נדרשת לכל טבלה באזור האישי

עקרון: `ENABLE ROW LEVEL SECURITY` על כל טבלה למטה.  
`service_role` עוקף RLS (רק שרת).  
לקוח: `TO authenticated` + `auth.uid()`.

### 12.1 מטריצת חובה

| טבלה / view | SELECT ללקוח | INSERT | UPDATE | DELETE | הערות |
|---|---|---|---|---|---|
| `profiles` | own row | via trigger on signup | own, **בלי role** | אין | 090 חוסם self-role-change |
| `user_addresses` | `user_id = uid` | own | own (לא deleted) | soft: UPDATE deleted_at | ספק: קריאה רק לכתובת הזמנה שלו |
| `orders` | `user_id = uid` | דרך checkout/service | אין ללקוח אחרי יצירה | אין | ספק/אדמין נפרד |
| `order_items` | דרך order בעלות | service | אין ללקוח | אין | |
| `payments` | own order | service | service | אין | בלי raw secrets |
| `vouchers` | `user_id = uid` | service (finalize) | service (redeem) | אין | ספק: redeemed בלבד |
| `voucher_redemptions` | דרך voucher בעלות | service | אין | אין | |
| `payment_tokens` | own **בלי** `cardcom_token` | service (finalize) | own (is_default) | own | |
| `wallet_accounts` | own `user_id` | trigger/service | **אין ללקוח** | אין | יתרה cached |
| `wallet_entries` | entries על חשבונו | **אין** (RPC) | אין | אין | append-only |
| `v_wallet_ledger` | security_invoker / RLS בסיס | n/a | n/a | n/a | לקריאה בלבד |
| `notifications` (אם מוצג) | `user_id = uid` | service | own read flags | אין | companion notifications |
| `audit_log` | אין ללקוח | service | אין | אין | |

### 12.2 חוזי SQL (ייחוס; לא להריץ מהמסמך)

```sql
-- profiles
CREATE POLICY "profiles: owner select" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles: owner update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
-- WITH CHECK must reject role change (090)

-- vouchers
CREATE POLICY vouchers_owner_read ON public.vouchers
  FOR SELECT TO authenticated USING (user_id = auth.uid());
-- no customer INSERT/UPDATE/DELETE

-- payment_tokens
CREATE POLICY payment_tokens_owner_read ON public.payment_tokens
  FOR SELECT TO authenticated USING (profile_id = auth.uid());
CREATE POLICY payment_tokens_owner_update ON public.payment_tokens
  FOR UPDATE TO authenticated
  USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
CREATE POLICY payment_tokens_owner_delete ON public.payment_tokens
  FOR DELETE TO authenticated USING (profile_id = auth.uid());
-- REVOKE SELECT (cardcom_token) FROM authenticated; use column grants or view

-- wallet_accounts
CREATE POLICY wallet_accounts_owner_read ON public.wallet_accounts
  FOR SELECT TO authenticated
  USING (owner_type = 'user' AND user_id = auth.uid());

-- wallet_entries
CREATE POLICY wallet_entries_owner_read ON public.wallet_entries
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.wallet_accounts a
      WHERE a.id IN (wallet_entries.debit_account, wallet_entries.credit_account)
        AND a.user_id = auth.uid()
    )
  );

-- orders
CREATE POLICY orders_user_read ON public.orders
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- user_addresses
CREATE POLICY user_addresses_owner_all ON public.user_addresses
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

### 12.3 בדיקות RLS חובה (CI / SQL)

| # | תרחיש | צפי |
|---|---|---|
| R1 | user A SELECT vouchers of B | 0 rows |
| R2 | user A SELECT payment_tokens כולל ניסיון cardcom_token | עמודה לא זמינה / null אסור להחזיר ערך |
| R3 | user A UPDATE profiles.role | נכשל |
| R4 | user A INSERT wallet_entries | נכשל |
| R5 | user A DELETE order | נכשל |
| R6 | user A soft-delete address של B | 0 rows |
| R7 | anon SELECT כל הטבלאות למעלה | 0 / denied |

---

## 13. מפת קבצים (יעד / קיים)

```
src/app/(account)/layout.tsx
src/app/(account)/account/page.tsx
src/app/(account)/account/coupons/page.tsx      # + tabs + QR (פער)
src/app/(account)/account/orders/page.tsx
src/app/(account)/account/orders/[id]/page.tsx
src/app/(account)/account/details/page.tsx
src/app/(account)/account/wallet/page.tsx
src/app/(account)/account/tokens/page.tsx
src/app/(account)/account/addresses/page.tsx
src/components/account/AccountNav.tsx          # + logout
src/components/account/TokenManager.tsx
src/components/account/ProfileDetailsForm.tsx
src/components/account/CouponQr.tsx            # יעד
src/server/queries/account.ts
src/server/queries/orders.ts
src/server/actions/account.ts
src/server/actions/auth.ts                    # Google + signOut
src/styles/account.css
src/app/login/page.tsx                        # Google only UX
```

מיגרציות עוגן: `001` profiles/orders, `029`/`046`/`055` tokens+wallet RLS, `0545`/`073` vouchers RLS, `082`/`089` wallet provisioning/agorot, `090` profiles role.

---

## 14. פערים מול המימוש החי (phase5 / account pages)

| ID | פער | חומרה |
|---|---|---|
| GAP-1 | `/account/coupons` בלי טאבים פעיל/נסרק/פג ובלי QR | P0 UX |
| GAP-2 | `AccountNav` בלי כפתור התנתקות גלוי | P1 |
| GAP-3 | `/login` עלול עדיין להציע מסלולים שאינם Google | P1 (A2) |
| GAP-4 | חלק מ-order detail עדיין דרך admin client (לצמצם) | P1 אבטחה |
| GAP-5 | תצוגת כסף ב-UI עדיין ILS float במקומות; יעד agorot ב-domain | P2 |
| GAP-6 | Alias `/account/vouchers` מול `/account/coupons` | P2 |
| GAP-7 | הודעות באזור האישי (prefs) | P2 companion |

---

## 15. טסטים נדרשים

### 15.1 Unit

- `couponStatusLabel` / tabs filter
- `walletReasonLabel`
- format dates Asia/Jerusalem
- profile zod phone/name

### 15.2 Integration

- `getMyCoupons` מחזיר רק שורות תחת RLS (mock auth)
- delete token / set default
- update profile לא משנה role

### 15.3 Playwright

| # | תרחיש |
|---|---|
| E1 | אורח ב-`/account` → login Google (mock) → סקירה |
| E2 | קופון פעיל מציג QR + קוד |
| E3 | טאבים: פעיל / נסרק / פג |
| E4 | מחיקת כרטיס שמור |
| E5 | ארנק: יתרה + תנועה; אין כפתור משיכה |
| E6 | התנתקות → `/login` → `/account` שוב דורש Google |
| E7 | הזמנת משתמש אחר → 404 |

---

## 16. רצף יישום מומלץ (אחרי אישור המסמך)

1. Coupons: טאבים + QR (סגירת GAP-1).
2. Nav logout + Google-only login UX.
3. חיזוק column revoke על `cardcom_token`.
4. העברת order detail ל-RLS טהור.
5. e2E E1 עד E6.

---

## 17. Out of scope

- אדמין / ספק dashboards
- Wishlist
- משיכת ארנק או המרה לכסף
- סיסמה/OTP כמסלול ראשי (A2)

---

## 18. Revision

| Date | Change |
|---|---|
| 2026-07-31 | מסמך אזור אישי מלא: coupons+QR+tabs, orders, details, tokens, wallet, Google-only, RTL/Heebo/refs measurements, RLS לכל טבלה, פערים וטסטים (`arch/account-area`) |
