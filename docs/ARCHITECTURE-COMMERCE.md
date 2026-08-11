# ארכיטקטורה: מסחר (Commerce)

סיכום מחייב של כללי המסחר C1–C10 (ו-C11א), מיושר ל-**No Escrow**, עם הערות סכימה שימושיות וסימון פער DDL.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #6/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף: **No Escrow**. אין נאמן, אין J5, **אין** held-until-redeem פנימי שמשחרר מקדמת קופון לספק. מקדמת קופון באתר = הכנסת פלטפורמה מ-`paid`. סכומים פנימיים באגורות integer. `platform_percent` פר מוצר, **אין** default.

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/CONTRADICTIONS.md
docs/BUSINESS-MODEL.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/ARCHITECTURE-PAYOUT-MECHANISM.md
docs/ARCHITECTURE-CARDCOM-WEBHOOKS.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/ARCHITECTURE-WALLET-LEDGER.md
docs/ARCHITECTURE-MASTER-CHECKOUT-REDEMPTION.md
```

מיגרציית טיוטה נלווית (לא הוחלה): `supabase/migrations/026_commerce.sql`.  
היררכיה: `CONTRADICTIONS.md` גובר. זרימת תשלום מפורטת: CHECKOUT-FLOW. תמחור: PRICING-RULES.

---

## 0. החלטה (C1–C10 + C11א)

| # | הכרעה מחייבת |
|---|---|
| C1 | אין ברירת מחדל לעמלה. `products.platform_percent` חובה פר מוצר (`NOT NULL`, בלי `DEFAULT`). |
| C2 | ידית פיצול = `platform_percent` בלבד. `commission_percent` (ושיעורי ספק ישנים) אינם ידית פיצול. |
| C3 | אין Escrow חיצוני, אין J5, אין מסלול held→payout לספק על קופון. |
| C4 | `coupon_price` פר מוצר, שדה מוחלט באתר; יתרה = face − coupon בבית העסק. |
| C5 | פיזי: עמלה מחושבת על הסכום ששולם באתר לפי snapshot. קופון: אין payout לספק מהמקדמה. |
| C6 | קופון שפג בלי מימוש: לפי LEGAL/ארנק (קרדיט פנימי כשחל); לא זיכוי אשראי חיצוני כברירת מחדל. |
| C7 | תוקף קופון: `expiry_days` / `coupon_expiry_days` פר מוצר → `expires_at` על השובר. |
| C8 | Payout פיזי: T+3 ימי עסקים, מינימום יתרה צוברת 100 ₪ (כשחל). קופון: אין payout מהפלטפורמה. |
| C9 | סליקה ואחסון יעד: Cardcom + Vercel בלבד. |
| C10 | `platform_percent` (+ `supplier_split_percent`) מצולמים ל-`order_items` בקנייה; לא רטרואקטיבי. |
| C11א | מקדמת קופון נשארת בפלטפורמה; לספק 0 מהפלטפורמה. גרסת Escrow/שחרור (C11ב) בטלה. |

### מודל כסף בקצרה

| סוג | לקוח באתר | פלטפורמה | ספק |
|---|---|---|---|
| קופון | `coupon_price` | 100% מהמקדמה מ-`paid` | 0 מהפלטפורמה; יתרה בעסק במזומן/מקומי |
| פיזי | 100% מהמחיר | `platform_percent` (snapshot) | יתרה ב-payout בנקאי |
| מנוי | `recurring_amount` למחזור | אותו % מצולם פר חיוב | יתרה פר מחזור |

ארנק: אשראי פנימי באתר בלבד; לא נמשך החוצה; מיושם כהנחה בקופה לפי בקשת משתמש.

אורח: עגלה פתוחה; Google Login בלחיצת תשלום; מיזוג עגלה אחרי login.

תשלומים: Cardcom Low Profile + token; כל קריאות Cardcom מ-`src/server/actions/payments/` בלבד. פירוט מצבים: CHECKOUT-FLOW / CARDCOM-WEBHOOKS.

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Escrow חיצוני / `escrow_holds` כמוצר | סותר C3/C11א; מקדמת קופון = הכנסת פלטפורמה, לא נאמן. |
| held פנימי עד redeem שמזכה ספק בקופון | **אסור** (C11ב בטלה); סריקה לא משחררת כסף פלטפורמה→ספק. |
| עמלה קבועה 5%/10% או `DEFAULT` ל-`platform_percent` | סותר C1; כל מוצר חייב שיעור מפורש. |
| `commission_percent` כידית פיצול בקוד חדש | שריד legacy בלבד; C2 קובע `platform_percent`. |
| Multi-Account split בזמן הסליקה כמודל מחייב | נדחה לטובת ledger + payout פיזי T+3. |
| J5 / הרשאה בלי חיוב לקופון | לא מודל העסק; ChargeOnly / חיוב מלא על on-site. |
| אחסון כסף ב-ILS `numeric(12,2)` בחישוב חדש | סותר כלל אגורות; numeric = שריד DDL בלבד. |
| טבלת `coupons_issued` ישנה | הוחלפה בשוברים חיים + `voucher_redemptions`. |
| החלת `026_commerce.sql` כפי שהיא על prod | פער ILS מול agorot; דורש יישור + MCP לפני החלה. |

---

## 2. סכמת DB

**אין DDL חדש במסמך זה.** מצביע למיגרציות קיימות + טיוטה 026 (לא הוחלה).

### 2.1 טבלאות חיות (בסיס)

| טבלה | מיגרציה | הערה |
|---|---|---|
| `carts` (jsonb items) | 001 | חי; מעבר ל-`cart_items` מנורמל בטיוטת 026 |
| `payment_tokens` | 001 | חי |
| `vendors` / suppliers + שיעורי עמלה ישנים | 001+ | **לא** default לפיצול (C1/C2) |
| `products`, variants | 005+014 | חי; `platform_percent` חובה (050) |
| `coupon_deals` / vouchers | 015 / המשך | חי |
| `orders`, `order_items` | 007+ | snapshots; הרחבות כסף |
| wallet (יתרות / ledger) | 006+ | כיוון double-entry / אגורות |
| `audit_log`, rate limits | 011+019+025 | חי |

Drift ידוע: DB חי לא תמיד זהה לקבצי מיגרציה. לפני החלת טיוטות: אימות מול prod (MCP / RUNBOOK).

### 2.2 `platform_percent`

```sql
platform_percent numeric(5,2) NOT NULL
  CHECK (platform_percent BETWEEN 0 AND 100)
-- אין DEFAULT. חובה פר מוצר (C1). זוג עם supplier_split_percent = 100.
```

Publish מוצר בלי `platform_percent` **נכשל** (C1).

### 2.3 `order_items` (snapshot)

| לוגיקה | משמעות |
|---|---|
| `platform_percent` (+ split) | צילום בקנייה (C10) |
| charged on site | פיזי = total; קופון = coupon_price |
| platform fee | פיזי = % מהשורה; קופון = כל המקדמה |
| supplier due | פיזי = יתרה ל-payout; קופון = **0** |
| balance at business | קופון = face − coupon; פיזי = 0 |

עמודות legacy (`commission_percent`, `supplier_payout_ils` וכו'): backfill/תאימות בלבד; קוד חדש קורא עמודות פיצול / agorot.

### 2.4 תשלומים ו-webhooks

- `payments`: ניסיון Charge/refund אחד לשורה; idempotency; סטטוסים initiated→redirected→succeeded|failed|cancelled (+ refunded).
- `payment_webhook_events`: dedup `(provider, external_event_id)`; אימות חתימה/סוד URL + `GetLpResult`.
- מקור אמת לתשלום: API שרת↔Cardcom, לא Return URL.

### 2.5 מימוש קופון (חי מול טיוטה)

| | טיוטת 026 | פרוד (קנוני) |
|---|---|---|
| טבלה | `coupon_redemptions` | `voucher_redemptions` |
| מפתח | `coupon_code_id` | `voucher_id` |
| סכום | `amount_collected_ils` numeric | `amount_collected_agorot` integer |
| כשלים | לעיתים רק הצלחה בטיוטה | נשמרים עם `outcome`; כסף רק `outcome = 'success'` |

מימוש: CAS אטומי `issued` → `redeemed` (כתיבה חדשה: `redeemed`, לא `used`). סריקה **לא** משחררת כסף מהפלטפורמה לספק.

### 2.6 Payout פיזי

`supplier_payouts` + items: רק שורות פיזי זכאיות; קופון מחוץ למסלול. פרטים: PAYOUT-MECHANISM.

### 2.7 ארנק

כיוון: double-entry, append-only, העברות דרך פונקציית definer. אשראי משתמש ≥ 0. פירוט: WALLET-LEDGER / CASHBACK.

### 2.8 פער ILS numeric מול agorot integer

**מחייב בחישוב ובגבולות חדשים:** אגורות `integer` / `bigint` בלבד. המרה מ-ILS פעם אחת בגבול (`ilsToAgorot` וכד'); ל-Cardcom מחזירים מחרוזת ILS 2dp רק בשכבת הספק.

טיוטת `026_commerce.sql` (ורבות מעמודות הכסף הקיימות) עדיין מתארות `numeric(12,2)` בשקלים. זה **אינו** מבטל את כלל האגורות.

| שכבה | כלל |
|---|---|
| אריתמטיקה | integer אגורות; עיגול half-up פעם אחת על fee; יתרה = total − fee |
| אחסון יעד | עמודות `*_agorot` |
| DDL טיוטה ישן | ILS numeric = שריד / פער; לא מקור אמת לחישוב |
| UI | הצגה ב-₪ עם שני עשרונים |

נוסחת שורה (פיזי):

```text
fee_ag      = round_half_up(line_total_ag * platform_percent / 100)
supplier_ag = line_total_ag - fee_ag
```

קופון: `charged = coupon_price_ag`; `supplier_due_from_platform = 0`; `balance_business = face - coupon`.

---

## 3. מכונות מצבים (תמצית)

### הזמנה

```text
pending → paid (GetLpResult + finalize)
paid → partially_fulfilled | fulfilled
pending → cancelled (expiry / ביטול לפני תשלום)
* → refunded (מסלול refund)
```

ב-`pending`: אין חיוב ארנק סופי ואין הנפקת שובר. ערך נוצר ב-`paid` בלבד.

### תשלום

```text
initiated → redirected → succeeded | failed | cancelled
succeeded → refunded (שורה refund נפרדת)
```

### שובר

```text
issued → redeemed | expired | refunded
```

טרמינלי; אין unwind אוטומטי מ-`redeemed` ל-`issued`.

---

## 4. משטח פעולות (לוגי)

| תחום | פעולות עיקריות | הערה |
|---|---|---|
| עגלה | get/add/update, mergeGuestCart | מחירים לא נשמרים בעגלה |
| Checkout | beginCheckout, chargeWithToken, webhook/finalize | snapshot % בשרת |
| קופון | getMyCoupons, redeem (RPC) | rate limit; supplier binding |
| ארנק | יתרה/היסטוריה; admin adjust | spend רק ב-finalize |
| Payout | draft / approve / paid | פיזי בלבד |

---

## 5. מקרי קצה

| מקרה | תרחיש | התנהגות מחייבת | הערה |
|---|---|---|---|
| CE1 | שינוי `platform_percent` אחרי snapshot | הזמנות ישנות לא משתנות | C10 |
| CE2 | publish מוצר בלי `platform_percent` | נכשל validation | C1 |
| CE3 | קופון מומש, אחר כך refund request | אין auto refund; REFUNDS | C6 |
| CE4 | שני סורקים על אותו QR | CAS: success + already_redeemed | לא double-spend |
| CE5 | webhook replay | dedup `external_event_id`; no-op | CARDCOM-WEBHOOKS |
| CE6 | `amount_mismatch` ב-GetLpResult | **לא** paid; audit P1 | חסימת finalize |
| CE7 | paid בלי mint voucher | S6 חלקי; job השלמה | לא מבטל paid |
| CE8 | double-spend ארנק | idempotency `order:{id}:spend` | WALLET-LEDGER |
| CE9 | quota race (יחידה אחרונה) | אחד נכשל במכסה | אין over-sell |
| CE10 | קופון פג בלי מימוש | expired; קרדיט ארנק לפי LEGAL | לא זיכוי Cardcom default |
| CE11 | payout על שורת קופון | **נדחה** מה-batch | C8/C11א |
| CE12 | זיוף webhook / Return URL | אין paid בלי GetLpResult | CF1 |
| CE13 | float בשורת כסף חדשה | **אסור**; agorot בלבד | money.ts |
| CE14 | שינוי מחיר מוצר בזמן pending | snapshot ב-beginCheckout | לא קורא מחדש ב-finalize |

איומים מרכזיים (תמצית): replay סריקה, double-spend ארנק, זיוף webhook, תמרון מחיר מהלקוח. פירוט יישום: CHECKOUT-FLOW, FRAUD, SECURITY-RLS.

---

## 6. פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | פער שמות עמודות snapshot (`platform_percent` מול `commission_percent_snapshot`) | ליישר מול DB חי בלי DDL במסמך זה |
| O2 | מיגרציה `PENDING-money-integer-fix`: מתי מוחלת על prod | דורש MCP + אישור מפורש |
| O3 | האם `cart_items` מנורמל (026) חובה לפני launch | INVENTORY / CART |
| O4 | TTL מדויק ל-order `pending` | CHECKOUT-FLOW O2 |
| O5 | מדיניות קרדיט ארנק לקופון שפג (C6) | LEGAL + CASHBACK |
| O6 | מנויים / geo: האם C1–C10 חלים אחיד | SUBSCRIPTIONS, GEO |
| O7 | backfill legacy `commission_percent` → snapshot חדש | תאימות בלבד; לא ידית חדשה |

עודכן: 2026-08-12. אין להסתיר פערים אלה כסגורים.

---

## 7. Acceptance

- [ ] C1–C10 + C11א מנוסחים במפורש; אין held-until-redeem לספק על קופון
- [ ] קישור חי ל-CHECKOUT-FLOW, PRICING-RULES, CONTRADICTIONS
- [ ] קופון: `supplier_due` פלטפורמה = 0; פיזי: fee + supplier = line מ-snapshot
- [ ] פער ILS numeric (026) מול אגורות integer מסומן; אין הנחיה להחיל 026 כפי שהיא
- [ ] Publish בלי `platform_percent` נכשל; שיעור ספק לא נקרא בקופה
- [ ] Snapshot לפני LP; שינוי מוצר לא משנה הזמנות ישנות
- [ ] Payout רק פיזי; מימוש קופון לא משחרר כסף פלטפורמה→ספק
- [ ] החלטה + חלופות שנדחו + סכמת DB + מקרי קצה + פתוחות

---

## 8. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-08 | תכנון commerce + טיוטת 026 |
| 2026-08-06 | QA: יישור C1–C10; הסרת באנר STALE שגוי; סימון פער ILS |
| 2026-08-07 | QA: `voucher_redemptions` חי מול טיוטה |
| 2026-08-12 | batch #6/50: כתיבה מחדש BINDING, No Escrow מלא |
| 2026-08-12 | batch-2 pass-3: DOCS-TEMPLATE-BINDING (חלופות, מקרי קצה, פתוחות) |
