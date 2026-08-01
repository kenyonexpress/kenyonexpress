# ARCHITECTURE-CHECKOUT-CARDCOM-VERIFICATION.md

מסמך **אימות** ענק מול הקוד הקיים ב-worktree

```
/Users/ofir/kenyonexpress-web/ke-checkout
```

branch:

```
feat/checkout-cardcom
```

(טיפ ידוע בסשן: `be47a62` ומעלה על אותו branch).

Status: BINDING verification · worktree

```
/Users/ofir/kenyonexpress-web/ke-arch-checkout-verify
```

branch:

```
arch/checkout-cardcom-verification
```

Date: 2026-07-31  
Scope: **docs בלבד.** אין שינוי קוד ב-repo הראשי וב-`ke-checkout` במסגרת המסמך הזה.

Companions (מקור אמת עסקי):

- `ke-checkout/src/server/payments/README.md` (מודל סופי 2026-07-24)
- `ke-checkout/STATE.md` (סבב Cardcom + הכרעת "אין 5% קבוע")
- `ke-arch-cart/docs/ARCHITECTURE-CART-CHECKOUT.md`
- `ke-checkout/docs/CONTRADICTIONS.md` (C3, C11)
- skill:

```
.claude/skills/cardcom-payments/SKILL.md
```

---

## 0. מודל כסף מחייב (יעד האימות)

| סוג | מה הלקוח משלם באתר | מה נשאר בפלטפורמה | מה מקבל הספק מהפלטפורמה | בבית העסק |
|---|---|---|---|---|
| **קופון** | מלוא `products.coupon_price_ils` (סכום מוחלט, בלי ברירת מחדל) | **100% מהחיוב באתר** | **0** | יתרה: face − coupon_price, במזומן/בקופה בסריקה |
| **פיזי** (עתידי מלא / כבר בקוד כ-split ledger) | 100% ממחיר השורה באתר | `platform_percent` מצולם ב-`order_items` | היתרה אחרי העמלה (ledger + payout, לא פיצול אטומי ב-Cardcom) | אין |

אינווריאנטים:

1. **אין Escrow** (לא חיצוני, לא J5, לא "החזקה עד מימוש" שמשחררת כסף לספק מקופון).
2. **אין פיצול קופון** לפי אחוז. אין payout לספק על שורות קופון.
3. **אין אחוז קבוע 5%** (או כל default אחר) בעמלה. `platform_percent` פר-מוצר, חובה, מצולם.
4. כסף מנוע: **אגורות שלמות**. UI מציג שקלים.
5. Guest cart פתוח. Login (Google קודם) רק בלחיצת **שלם**.
6. מקור אמת לתשלום: webhook מאומת / GetLpResult, לא redirect של דפדפן.
7. `finalizeOrder` הוא הכותב היחיד של `paid_at` + הנפקת שוברים + token.

הכרעת C11: **אפשרות (א)** סגורה ומחייבת: המקדמה = הכנסת פלטפורמה במלואה. אפשרות (ב) (פיצול מקדמה לפי `platform_percent` + שחרור לספק במימוש) = **פסולה** לייצור. כל קוד/טבלה/דגל שמממש (ב) הוא שריד למחיקה.

---

## 1. מפת flow מלאה (יעד מול קיים)

```
[Guest browse]
   │  addToCart → carts(+ke_session_id) + Zustand UI
   ▼
[/cart]  RTL / Heebo / #fed700
   │  לחיצת שלם / לתשלום
   ├─ !auth → Google OAuth (returnTo=/checkout) → mergeGuestCart → /checkout
   └─ auth  → /checkout
   ▼
[Checkout form]
   │  פרטים (כתובת אם פיזי), ארנק אופציונלי, תנאים, save_card, token שמור
   │  submit → beginCheckout (server re-price)
   ▼
[Cardcom]
   │  Low Profile / token charge (server only)
   ├─ SuccessRedirect → /checkout/return (קריאה בלבד)
   ├─ FailedRedirect  → /checkout/failed
   └─ Webhook → verify → finalizeOrder
   ▼
[קופון]
   │  charge = coupon_price במלואו
   │  settlement_status → platform_settled (לא escrow_*)
   │  issueVoucher × qty + QR חתום
   │  הודעות (יעד) + דף return מציג QR
   ▼
[פיזי (עתידי/חלקי)]
   │  split_executions לפי snapshot platform_percent
   │  supplier notify + payout T+3 (לא Escrow)
```

### 1.1 טבלת שלבים: יעד מול `ke-checkout`

| # | שלב | יעד | מצב ב-`feat/checkout-cardcom` | פער |
|---|---|---|---|---|
| F1 | Guest cart בלי הרשמה | חובה | קיים (`carts`, `ke_session_id`, Zustand) | קטן (persist localStorage במסמך Zustand נפרד) |
| F2 | שלם → Google אם אורח | חובה | `/checkout` מפנה אורח ל-`/cart`; מיזוג ב-`auth/callback` + password sign-in | בינוני: אין מסלול שלם אחד מתועד/מאוחד "שלם→OAuth→resume" בכל CTA |
| F3 | מיזוג עגלה אחרי OAuth | חובה | `mergeGuestCart` ב-callback | עובד; לוודא `returnTo=/checkout` בכל כניסות Google מתשלום |
| F4 | טופס פרטים + save_card + token | חובה | `CheckoutForm` + `beginCheckout` + `payment_tokens` ב-finalize | token charge path קיים ברמת provider; לוודא UX "כרטיס שמור" מלא |
| F5 | Cardcom charge | חובה | multi-account, signature, webhook, retry queue | חזק יחסית |
| F6 | קופון: 100% לפלטפורמה, בלי Escrow | חובה | **ברירת מחדל** (`ESCROW_FLOW_ENABLED` כבוי): `platform_settled` | **קריטי:** דגל+מודול+טבלאות escrow עדיין חיים ומממשים C11-(ב) כשדולקים |
| F7 | הנפקת קופון+QR | חובה | `issueVoucher` + QR HMAC + return page | טוב |
| F8 | הודעות אחרי רכישה | חובה | כמעט חסר בנתיב finalize (רק audit/events) | **פער גדול** מול arch notifications |
| F9 | פיזי: snapshot + split ledger | חובה לעתיד | `split_executions` + אירוע `split_executed` | קיים; payout/fulfillment חלקי |

---

## 2. מיפוי קבצים ב-`ke-checkout` (inventory)

### 2.1 Checkout / Cardcom

| נתיב | תפקיד |
|---|---|
| `src/server/actions/payments/checkout.ts` | `beginCheckout`, `submitCheckout`, יצירת order+items, קריאה ל-Cardcom |
| `src/server/payments/finalize.ts` | כותב יחיד ל-paid / vouchers / split / token |
| `src/server/payments/webhook-processing.ts` | עיבוד webhook משותף |
| `src/app/api/payments/cardcom/webhook/route.ts` | כניסת webhook |
| `src/app/api/payments/cardcom/retry/route.ts` | ניקוז retry (CRON_SECRET) |
| `src/lib/payments/cardcom.ts` | לקוח Cardcom |
| `src/lib/payments/accounts.ts` | רב-חשבוני / מסוף ספק |
| `src/lib/payments/signature.ts` | HMAC `x-ke-webhook-signature` |
| `src/lib/payments/mock-cardcom.ts` | mock ל-E2E |
| `src/server/actions/payments/refund.ts` | זיכוי |
| `src/app/(store)/checkout/*` | UI checkout / return / failed |
| `src/server/payments/checkout-cardcom.e2e.test.ts` | E2E מקומי כולל מסלול escrow (!) |

### 2.2 Cart / Auth gate

| נתיב | תפקיד |
|---|---|
| `src/server/actions/cart.ts` | `getCart`, mutations, `mergeGuestCart` |
| `src/lib/cart/store.ts` | Zustand optimistic |
| `src/app/auth/callback/route.ts` | OAuth + merge |
| `src/server/actions/auth.ts` | password sign-in + merge |
| `src/app/(store)/checkout/page.tsx` | אורח → redirect `/cart` |

### 2.3 Voucher / QR / Redeem

| נתיב | תפקיד |
|---|---|
| `src/server/domain/vouchers/issue.ts` | הנפקה |
| `src/server/domain/vouchers/qr.ts` | חתימת QR |
| `src/app/api/supplier/vouchers/redeem/route.ts` | מימוש + **קריאה ל-releaseEscrow אם הדגל דולק** |
| `src/app/api/cron/expire-vouchers/route.ts` | פקיעה + **refundEscrow אם הדגל דולק** |

### 2.4 Settlement / state machine

| נתיב | תפקיד |
|---|---|
| `src/server/domain/orders/settlement.ts` | חישוב שורות באגורות |
| `src/server/domain/orders/state-machine.ts` | כולל `HOLD_ESCROW` / `RELEASE_ESCROW` (legacy/flag) |
| `src/server/payments/escrow.ts` | **שריד פעיל מאחורי דגל** |

### 2.5 Docs בתוך ke-checkout שכבר תואמים ליעד

- `src/server/payments/README.md` (אין Escrow, קופון 100% פלטפורמה)
- `ARCHITECTURE-VOUCHER-REDEMPTION.md` / מיגרציה 054 comments
- חלקים ב-`STATE.md` (מודל 2026-07-24)

מסמכים שעדיין מערבבים C11-(ב) / escrow framing: ראו §6.

---

## 3. Flow מפורט לפי שלב

### 3.1 Guest Cart → שלם

**יעד**

1. אורח מוסיף מוצרים בלי מסך הרשמה.
2. ב-`/cart` או drawer לוחץ שלם.
3. אם אין session: Google OAuth עם

```
returnTo=/checkout
```

4. אחרי callback: `mergeGuestCart(userId, sessionId)`, ניקוי session אורח, כניסה ל-checkout עם אותן שורות.

**קיים**

- עגלה אורח + מיזוג ב-callback: כן.
- דף checkout דוחה אנונימי ל-`/cart`: כן (`checkout/page.tsx`).
- `beginCheckout` מחזיר `UNAUTHENTICATED` אם אין user: כן.

**פערים**

| ID | פער | חומרה |
|---|---|---|
| G1 | לא כל CTA "שלם" מתועד כמפעיל Google עם returnTo אחיד (חלק מהזרימה היא "לך ל-/checkout ואז תוחזר ל-/cart") | P1 |
| G2 | מיזוג רץ גם ב-login כללי, לא רק בלחיצת שלם (מקובל, אבל לא זהה לנוסח UX המחייב) | P3 |

### 3.2 Checkout: פרטים + Token כרטיס שמור

**יעד**

- טופס: פריטים, כתובת אם יש פיזי, ארנק, תנאים, checkbox שמירת כרטיס.
- אם יש `payment_tokens`: אפשרות חיוב בטוקן (בלי להזין PAN שוב).
- PAN אף פעם לא בשרת שלנו מעבר לטוקן Cardcom.

**קיים**

- `CheckoutForm`: save_card default checked, סיכום קופון (אתר / עסק).
- `beginCheckout` מעביר `saveToken` ל-provider.
- `finalizeOrder` כותב ל-`payment_tokens` אם חזר token מהספק.
- חשבון: מחיקה / ברירת מחדל לטוקנים (`account` actions).

**פערים**

| ID | פער | חומרה |
|---|---|---|
| T1 | לוודא UI מלא לבחירת כרטיס שמור מול Low Profile חדש (לא רק שמירה אחרי רכישה ראשונה) | P1 |
| T2 | טוקן כבול ל-`cardcom_account_key` (רב-מסופי): רגרסיה אם מחליפים מסוף בלי invalidation | P2 |

### 3.3 Cardcom charge → webhook → finalize

**יעד**

```
beginCheckout → payments(initiated/redirected) → Cardcom
→ webhook verify (URL secret + GetLpResult + HMAC פנימי לתור)
→ finalizeOrder (idempotent)
→ order paid_at
```

**קיים (חוזקות `feat/checkout-cardcom`)**

- Multi-account (`cardcom_accounts`, migration 070).
- `payment_events` append-only.
- Retry queue Upstash + DLQ.
- Mock provider ל-E2E.
- Redirect pages לקריאה בלבד.

**פערים**

| ID | פער | חומרה |
|---|---|---|
| P1 | מיגרציה 070 על remote עדיין לא בהכרח הוחלה (STATE: רק docker מקומי) | P0 לפני prod money |
| P2 | Cardcom עצמה לא חותמת webhook; התלות ב-GetLpResult חייבת להישאר חובה | P0 (קיים, לא לשבור) |

### 3.4 קופון: מלוא מחיר באתר, בלי Escrow, בלי פיצול

**יעד (מחייב)**

```
paid_on_site = coupon_price_ils * qty   (אגורות)
commission_agorot = paid_on_site        (או שקול: הכל פלטפורמה)
supplier_due / supplier_immediate = 0
settlement_status: pending → paid → platform_settled
אין order_escrow_holds / escrow_holds חדשים
redeem: שורף voucher + collect_amount בעסק; payout_ils = 0
```

**קיים כש-`ESCROW_FLOW_ENABLED` כבוי (ברירת מחדל)**

- `finalize.ts`: מנפיק vouchers ואז `platform_settled`.
- Snapshot קופון: `platform_percent` / `commission_percent_snapshot` = **100**.
- מיגרציה 054: "Everything charged online stays with the platform... No escrow".
- README payments: תואם.

**קיים כש-`ESCROW_FLOW_ENABLED=true` (פסול ליעד)**

- `escrow.ts`: hold → release על redeem (ספק מקבל `release_agorot`).
- `checkout.ts`: snapshot אחוז המוצר לקופון; commission חלקי.
- E2E בודק במפורש hold/release עם 10% דוגמה (50 ILS → 5 fee / 45 release).
- redeem route + expire cron קוראים ל-escrow.

זה **סותר ישירות** את המודל המחייב. הדגל אינו "פיצ'ר עתידי"; הוא מסלול כספי שגוי.

### 3.5 יצירת קופון + QR

**יעד:** אחרי תשלום מאומת, לכל יחידה: קוד + QR חתום + snapshot כספי + תוקף מ-`coupon_expiry_days` / `offer_valid_until`.

**קיים:** `issueVoucher`, `qr.ts`, return page עם QRDataURL, account vouchers. אידמפוטנטיות לפי ספירה ל-`order_item_id`.

**פערים**

| ID | פער | חומרה |
|---|---|---|
| V1 | איחוד שמות legacy `coupon_codes` מול `vouchers` בתיעוד/UI | P2 |
| V2 | הודעת מייל/SMS עם QR אחרי רכישה: חסרה ב-finalize | P1 (ראה §3.6) |

### 3.6 הודעות

**יעד**

אחרי `order_paid`:

1. ללקוח: אישור רכישה + קישורים לקופונים/QR + קבלה.
2. לספק (פיזי): הזמנה חדשה למשלוח.
3. לספק (קופון): אופציונלי "נמכר קופון" בלי סכום payout (כי 0).
4. כתיבה ל-`notifications` / תור לפי `ARCHITECTURE-NOTIFICATIONS`.

**קיים**

- `payment_events` + `audit_log` ב-finalize.
- אין קריאה ברורה מ-`finalizeOrder` לשכבת notifications/email.

**פער:** N1 = P1. Flow הכסף יכול להיות ירוק והלקוח עדיין בלי הודעה.

### 3.7 פיזי (עתידי מלא): פיצול לפי snapshot

**יעד**

```
platform_fee = percentageOf(face, platform_percent_snapshot)
supplier_due = face - platform_fee
→ split_executions row
→ settlement_status = split_executed
→ payout batch T+3, min 100 ILS (מדיניות עסקית)
```

Cardcom **לא** עושה split אטומי; הכל ledger פנימי.

**קיים**

- `executeSplitForItem` + אירוע `split_executed`.
- חובת `platform_percent` ב-beginCheckout לפיזי.
- מלאי יורד ב-finalize לשורות פיזיות.

**פערים**

| ID | פער | חומרה |
|---|---|---|
| PH1 | הודעת ספק + fulfillment UI | P1 |
| PH2 | settlement batches / payout אוטומטי מול 062 | P2 |
| PH3 | משלוח / מעקב סטטוסים | P2 |

---

## 4. רשימת שרידי Escrow / 5% / C11-(ב) למחיקה או נטרול סופי

### 4.1 עקרון מחיקה

| פעולה | מתי |
|---|---|
| מחיקת קוד ריצה שמבצע hold/release לספק מקופון | לפני merge ל-prod money |
| השארת ערכי enum/עמודות לקריאה של היסטוריה ישנה | מותר, עם COMMENT "legacy only" |
| דגל `ESCROW_FLOW_ENABLED` | **למחוק**; אין מצב דלוק מותר |
| בדיקות שמצפות ל-escrow_held | להחליף בבדיקות `platform_settled` + supplier_due=0 |
| אזכורי "5%" כעמלת פלטפורמה קבועה | למחוק מכל docs/UI (cashback 5% ברכישה 5 הוא כלל אחר, לא עמלה) |

### 4.2 קוד ריצה (חובה לטפל)

| # | נתיב | מה למחוק / לשנות |
|---|---|---|
| E01 | `src/server/payments/escrow.ts` | **מחיקת הקובץ** (או גרוטו stub שזורק אם נקרא) |
| E02 | `src/server/payments/finalize.ts` | הסרת import/ענף `isEscrowFlowEnabled` / `holdCouponItem`; להשאיר רק `platform_settled` |
| E03 | `src/server/actions/payments/checkout.ts` | הסרת ענפי escrow; קופון תמיד snapshot 100; בלי דרישת platform_percent לקופון לשם escrow |
| E04 | `src/app/api/supplier/vouchers/redeem/route.ts` | הסרת `releaseEscrowForOrderItem` |
| E05 | `src/app/api/cron/expire-vouchers/route.ts` | הסרת לולאת `refundEscrowForOrderItem` (פקיעה = זיכוי ארנק לפי C6, בלי escrow) |
| E06 | `src/server/payments/events.ts` | `escrow_held|released|refunded`: להשאיר רק אם צריך לקרוא לוג ישן; לא לכתוב חדשים |
| E07 | `src/server/domain/orders/state-machine.ts` | `HOLD_ESCROW` / `RELEASE_ESCROW`: legacy-read only או הסרה מנתיב פעיל |
| E08 | `src/server/payments/checkout-cardcom.e2e.test.ts` | מחיקת תרחיש escrow; הוספת assert מפורש: אין שורת `order_escrow_holds`, סטטוס `platform_settled`, commission=paid |
| E09 | `src/server/domain/orders/state-machine.test.ts` | להסיר/לצמצם "walks the escrow leg" כנתיב מומלץ |
| E10 | `.env.example` / docs env | מחיקת `ESCROW_FLOW_ENABLED` |

### 4.3 סכימה / מיגרציות (legacy)

| # | מיגרציה / אובייקט | פעולה מומלצת |
|---|---|---|
| S01 | `047_checkout_settlement.sql` → `escrow_holds`, enum `escrow_status`, עמודות `escrow_*_agorot` | לא DROP מסוכן בפרוד עם היסטוריה; מיגרציה חדשה: COMMENT deprecated + איסור כתיבה חדשה (REVOKE / trigger) |
| S02 | `070_checkout_cardcom_multiaccount.sql` → `order_escrow_holds` | **לא ליצור מחדש בסביבות חדשות**; בפרוד אם כבר נוצר: טבלה ריקה → DROP בטוח אחרי grep; אם יש שורות: archive ואז DROP |
| S03 | `066`/`067` comments | כבר אומרים no-escrow cutover; ליישר את 070 שלא יכניס מחדש C11-(ב) |
| S04 | `settlement_status` values `escrow_held`, `escrow_released` | נשארים ב-enum לקריאה; קוד חדש לא כותב אותם |
| S05 | עמודות `order_items.escrow_held_agorot`, `escrow_release_agorot` | לכתוב תמיד 0; או deprecate |

מיגרציית ניקוי מוצעת (מספר אחרי תיאום עם search 069):

```
071_drop_coupon_escrow_path.sql
```

תוכן לוגי (חוזה, לא ליישם כאן):

1. COMMENT על `order_escrow_holds` / `escrow_holds`: retired.
2. DROP POLICY כתיבה אם קיימת; אין INSERT מאפליקציה.
3. אופציונלי: `DROP TABLE order_escrow_holds` אם count=0.
4. לא מוחקים `payment_events` היסטוריים.

### 4.4 אזכורי 5% (להבדיל מ-cashback)

| מקור | סוג | פעולה |
|---|---|---|
| `platform-fee.ts` עם 5% קבוע | קוד | **כבר נמחק** לפי STATE (לא להחזיר) |
| E2E טקסט "50 ILS held -> 5 ILS fee" | טסט escrow | למחוק עם תרחיש E08 |
| UI ישן "שלם 10% עכשיו" | copy | כבר תוקן ברוב המקומות; grep חוזר על `10%` ב-QA docs |
| `docs/QA-CHECKLIST.md` שורות על פיצול 10%/90% | docs | לתקן לנוסח coupon_price + יתרה בעסק |
| Cashback כל רכישה 5: 5% | מוצר | **לא למחוק** (זה לא עמלת פלטפורמה) |

### 4.5 Docs שרידים (תיקון נוסח)

| מסמך ב-ke-checkout | בעיה |
|---|---|
| `STATE.md` סעיפי escrow flag כ"פיצ'ר" | לנסח: דגל פסול; יעד = מחיקה |
| `docs/CONTRADICTIONS.md` C11 "לא הכרעתי" | לעדכן: **הוכרע (א)**; (ב) מבוטלת |
| `docs/PRODUCT-PAGE-SPEC.md` C11 פתוח | לסגור |
| `ARCHITECTURE-CHECKOUT-PAYMENT.md` / MASTER ישנים | סימון superseded מול README payments |
| `docs/QA-CHECKLIST.md` 10%/90% | תיקון copy |

---

## 5. מה כבר תואם (לא לגעת לרעה)

| אזור | למה זה ירוק |
|---|---|
| חיוב קופון לפי `coupon_price_ils` מוחלט | beginCheckout דוחה בלי מחיר |
| ברירת מחדל finalize בלי דגל | `platform_settled` |
| פיזי: snapshot percent + `split_executions` | קיים |
| QR חתום + redeem | קיים |
| אידמפוטנטיות webhook / finalize | paid_at guard + UNIQUE |
| Multi-account Cardcom + retry | 070 + queue |
| מחיקת מודול 5% הקבוע | בוצע (STATE) |
| אגורות במנוע | 059+ settlement |

---

## 6. מטריצת פערים מרוכזת (עדיפות)

### P0 (חוסם כסף אמיתי)

1. החלת מיגרציות checkout על remote לפי הסדר ב-§7 (בלי `db push` פראי; תהליך הפרויקט).
2. הסרת מסלול `ESCROW_FLOW_ENABLED` מקוד הריצה לפני הפעלת Cardcom חי.
3. שמירת חובת GetLpResult / אימות webhook.

### P1

4. הודעות אחרי רכישה (לקוח + ספק פיזי).
5. CTA שלם → Google → merge → `/checkout` אחיד.
6. UX כרטיס שמור מלא.
7. תיקון E2E/docs שלא ילמדו מחדש את escrow.
8. יישור CONTRADICTIONS C11 ל-(א) סגור.

### P2

9. Payout/settlement batches לפיזי.
10. ניקוי סכימת escrow (071).
11. איחוד מילון vouchers vs coupon_codes ב-UI.
12. Fulfillment פיזי מלא.

### P3

13. מיזוג עגלה גם ב-login לא מתשלום (התנהגות מקובלת).
14. קוסמטיקת labels ל-`escrow_*` בחשבון/אדמין (legacy).

---

## 7. סדר Migrations (חוזה אימות)

### 7.1 שרשרת רלוונטית ל-checkout/cardcom/coupon (קיים ב-ke-checkout)

סדר מספרי כפי שמופיע בעץ המיגרציות (לא להריץ כפול; idempotent לפי כללי הפרויקט):

| סדר | קובץ | תפקיד לאימות |
|---|---|---|
| 1 | `007_orders_schema.sql` | בסיס הזמנות |
| 2 | `008_coupons_schema.sql` | קופונים legacy |
| 3 | `042_commerce_core.sql` | commerce / supplier link |
| 4 | `045_restore_carts.sql` | carts |
| 5 | `046_checkout_runtime.sql` | runtime checkout |
| 6 | `047_checkout_settlement.sql` | settlement + **escrow_holds legacy** |
| 7 | `050_platform_percent_required.sql` | חובת platform_percent |
| 8 | `051_payout_terms.sql` | payout |
| 9 | `054_voucher_redemption.sql` | vouchers, מודל no-escrow קופון |
| 10 | `054_section2_product_coupon_price_fields.sql` | שדות מחיר קופון (שם כפול 054: לבדוק סדר בפועל ב-CI) |
| 11 | `055_account_wallet.sql` | ארנק |
| 12 | `058_ledger_core.sql` | ledger |
| 13 | `059_money_integer_units.sql` | אגורות |
| 14 | `060_idempotency_keys.sql` | idempotency |
| 15 | `061_coupon_single_use.sql` | חד-פעמי |
| 16 | `062_settlement_batches.sql` | batches (no-escrow framing) |
| 17 | `063_reconciliation.sql` | התאמות |
| 18 | `064_money_rls.sql` | RLS כסף |
| 19 | `065_fn_post_journal.sql` | journal |
| 20 | `066_coupon_layer_types.sql` | types אחרי cutover |
| 21 | `067_coupon_layer_data.sql` | data/comments cutover |
| 22 | `068_voucher_expiry_sweep.sql` | פקיעה |
| 23 | `069_*` | **שמור ל-`feat/search-core`** (`069_search_index_dlq.sql`) |
| 24 | `070_checkout_cardcom_multiaccount.sql` | Cardcom accounts + payment_events + **order_escrow_holds** |

הערה: שני קבצים עם קידומת `054_` דורשים אימות סדר ההחלה בפועל (timestamp/CI). לא למזג עיוור.

### 7.2 מיגרציות המשך מוצעות (עדיין לא בקוד; docs בלבד)

| מספר מוצע | שם | מטרה |
|---|---|---|
| 071 | `071_retire_coupon_escrow.sql` | deprecate/DROP `order_escrow_holds`; חסימת כתיבה; יישור COMMENT ל-C11-(א) |
| 072 | `072_notifications_order_paid.sql` | אם חסר hook טבלאי/אירועי להודעות רכישה |
| 073 | `073_physical_fulfillment_*.sql` | רק אם נדרש סטטוסי משלוח מעבר לקיים |

תיאום מספרים: כל עוד 069 תפוס ב-search, **אין** לגנוב 069. 070 כבר תפוס ב-checkout-cardcom.

### 7.3 סדר הפעלה מומלץ בסביבות

```
local docker:
  supabase migrations up (או תהליך הפרויקט) עד 070
  ESCROW_FLOW_ENABLED must be unset/false
  vitest payments + e2e checkout

preview:
  apply 069 (search) + 070 (checkout) in numeric order
  never enable escrow flag

production:
  same order via approved MCP/release path (לא supabase db push פראי)
  071 retire escrow only after code that writes holds is gone
```

---

## 8. רשימת בדיקות אימות (שער)

### 8.1 כסף קופון (חובה)

| # | בדיקה | צפי |
|---|---|---|
| C-T1 | רכישת קופון coupon_price=50, face=200 | charge 50; balance_due 150; supplier_due 0 |
| C-T2 | אחרי webhook | `platform_settled`; אין שורה ב-`order_escrow_holds` |
| C-T3 | redeem | voucher used; payout 0; אין `escrow_released` |
| C-T4 | פקיעה | זיכוי ארנק מלא של paid_on_site (C6) |
| C-T5 | `ESCROW_FLOW_ENABLED=true` ב-CI | **חייב להיכשל** / הדגל לא קיים |

### 8.2 פיזי

| # | בדיקה | צפי |
|---|---|---|
| P-T1 | platform_percent=15, face=100 | commission 15, supplier 85, `split_executed` |
| P-T2 | מוצר בלי platform_percent | beginCheckout נכשל |

### 8.3 זהות / עגלה

| # | בדיקה | צפי |
|---|---|---|
| A-T1 | אורח לוחץ שלם | Google → merge → checkout עם אותן שורות |
| A-T2 | אורח ב-`/checkout` ישיר | redirect ל-cart |

### 8.4 Cardcom

| # | בדיקה | צפי |
|---|---|---|
| K-T1 | webhook בלי חתימה/GetLpResult | נדחה |
| K-T2 | replay | finalize replay=true, בלי כפילות vouchers |
| K-T3 | save_card | שורת `payment_tokens` |

### 8.5 הודעות

| # | בדיקה | צפי |
|---|---|---|
| N-T1 | אחרי paid | הודעת לקוח נוצרת / נשלחת |
| N-T2 | הזמנה פיזית | הודעת ספק |

---

## 9. רצף עבודה מומלץ לתיקון הקוד (אחרי אישור המסמך)

1. יישור מסמכים: C11=(א), STATE בלי "escrow feature".
2. מחיקת `escrow.ts` + ניתוק כל הקוראים.
3. עדכון E2E ל-platform_settled only.
4. מיגרציה 071 retire.
5. חיבור notifications מ-finalize.
6. אימות CTA שלם→Google.
7. רק אז: כסף חי ב-Cardcom.

---

## 10. Out of scope למסמך זה

- מימוש הקוד (docs בלבד).
- Wishlist / search / PWA.
- בחירת PSP שני.
- שינוי מודל הקופון חזרה ל-10%/90% כנגזרת אחוז.

---

## 11. Revision

| Date | Change |
|---|---|
| 2026-07-31 | מסמך אימות מלא מול `feat/checkout-cardcom` / `ke-checkout`: flow מקצה לקצה, פערים, שרידי Escrow/5%/C11-(ב), סדר migrations, שערי בדיקה (`arch/checkout-cardcom-verification`) |
