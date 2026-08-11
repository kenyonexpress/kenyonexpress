# ארכיטקטורה: מסחר (Commerce)

סיכום מחייב של כללי המסחר C1–C10 (ו-C11א), מיושר ל-**No Escrow**, עם הערות סכימה שימושיות וסימון פער DDL.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #6/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
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

מודל כסף: **No Escrow**. אין נאמן, אין J5, **אין** held-until-redeem פנימי שמשחרר מקדמת קופון לספק. מקדמת קופון באתר = הכנסת פלטפורמה מ-`paid`. סכומים פנימיים באגורות integer.

---

## 0. הכרעות C1–C10 (+ C11א)

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

---

## 1. מודל כסף בקצרה

| סוג | לקוח באתר | פלטפורמה | ספק |
|---|---|---|---|
| קופון | `coupon_price` | 100% מהמקדמה מ-`paid` | 0 מהפלטפורמה; יתרה בעסק במזומן/מקומי |
| פיזי | 100% מהמחיר | `platform_percent` (snapshot) | יתרה ב-payout בנקאי |
| מנוי | `recurring_amount` למחזור | אותו % מצולם פר חיוב | יתרה פר מחזור |

ארנק: אשראי פנימי באתר בלבד; לא נמשך החוצה; מיושם כהנחה בקופה לפי בקשת משתמש.

אורח: עגלה פתוחה; Google Login בלחיצת תשלום; מיזוג עגלה אחרי login.

תשלומים: Cardcom Low Profile + token; כל קריאות Cardcom מ-`src/server/actions/payments/` בלבד. פירוט מצבים: CHECKOUT-FLOW / CARDCOM-WEBHOOKS.

---

## 2. סכימה קיימת (בסיס)

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

---

## 3. הערות סכימה שימושיות (טיוטה + חי)

### 3.1 `platform_percent`

```sql
platform_percent numeric(5,2) NOT NULL
  CHECK (platform_percent BETWEEN 0 AND 100)
-- אין DEFAULT. חובה פר מוצר (C1). זוג עם supplier_split_percent = 100.
```

### 3.2 `order_items` (snapshot)

שדות יעד לוגיים (שמות חיים/טיוטה עשויים להתפצל):

| לוגיקה | משמעות |
|---|---|
| `platform_percent` (+ split) | צילום בקנייה |
| charged on site | פיזי = total; קופון = coupon_price |
| platform fee | פיזי = % מהשורה; קופון = כל המקדמה |
| supplier due | פיזי = יתרה ל-payout; קופון = **0** |
| balance at business | קופון = face − coupon; פיזי = 0 |

עמודות legacy (`commission_percent`, `supplier_payout_ils` וכו'): backfill/תאימות בלבד; קוד חדש קורא את עמודות הפיצול החדשות / אגורות.

### 3.3 תשלומים ו-webhooks

- `payments`: ניסיון Charge/refund אחד לשורה; idempotency; סטטוסים initiated→redirected→succeeded|failed|cancelled (+ refunded).
- `payment_webhook_events`: dedup `(provider, external_event_id)`; אימות חתימה/סוד URL + `GetLpResult`.
- מקור אמת לתשלום: API שרת↔Cardcom, לא Return URL.

### 3.4 מימוש קופון (חי מול טיוטה)

| | טיוטת 026 | פרוד (קנוני) |
|---|---|---|
| טבלה | `coupon_redemptions` | `voucher_redemptions` |
| מפתח | `coupon_code_id` | `voucher_id` |
| סכום | `amount_collected_ils` numeric | `amount_collected_agorot` integer |
| כשלים | לעיתים רק הצלחה בטיוטה | נשמרים עם `outcome`; כסף רק `outcome = 'success'` |

מימוש: CAS אטומי `issued` → `redeemed` (כתיבה חדשה: `redeemed`, לא `used`). סריקה **לא** משחררת כסף מהפלטפורמה לספק.

### 3.5 Payout פיזי

`supplier_payouts` + items: רק שורות פיזי זכאיות; קופון מחוץ למסלול. פרטים: PAYOUT-MECHANISM.

### 3.6 ארנק

כיוון: double-entry, append-only, העברות דרך פונקציית definer. אשראי משתמש ≥ 0. פירוט: WALLET-LEDGER / CASHBACK.

---

## 4. פער כסף: DDL ב-ILS numeric מול אגורות integer

**מחייב בחישוב ובגבולות חדשים:** אגורות `integer` / `bigint` בלבד. המרה מ-ILS פעם אחת בגבול (`ilsToAgorot` וכד'); ל-Cardcom מחזירים מחרוזת ILS 2dp רק בשכבת הספק.

**פער מתועד:** טיוטת `026_commerce.sql` (ורבות מעמודות הכסף הקיימות) עדיין מתארות `numeric(12,2)` בשקלים (`charged_on_site_ils`, `platform_fee_ils`, …). זה **אינו** מבטל את כלל האגורות. אותו פער מסומן גם ב-MASTER-CHECKOUT-REDEMPTION ובמיגרציות ממתינות לאישור (למשל כיוון `PENDING-money-integer-fix`). **אין להחיל** את 026 כפי שהיא על prod בלי יישור אגורות + MCP.

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

## 5. מכונות מצבים (תמצית)

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

## 6. משטח פעולות (לוגי)

| תחום | פעולות עיקריות | הערה |
|---|---|---|
| עגלה | get/add/update, mergeGuestCart | מחירים לא נשמרים בעגלה |
| Checkout | beginCheckout, chargeWithToken, webhook/finalize | snapshot % בשרת |
| קופון | getMyCoupons, redeem (RPC) | rate limit; supplier binding |
| ארנק | יתרה/היסטוריה; admin adjust | spend רק ב-finalize |
| Payout | draft / approve / paid | פיזי בלבד |

איומים מרכזיים (תמצית): replay סריקה, double-spend ארנק, זיוף webhook, תמרון מחיר מהלקוח. פירוט יישום: CHECKOUT-FLOW, FRAUD, SECURITY-RLS.

---

## 7. מה לא ליישם / שרידים

| שריד | סטטוס |
|---|---|
| Escrow חיצוני / `escrow_holds` כמוצר | אסור; היסטוריה בלבד |
| held פנימי עד redeem שמזכה ספק בקופון | **אסור** (סותר C3/C11א) |
| עמלה קבועה 5%/10% או default לספק | אסור (C1) |
| Multi-Account split בזמן הסליקה כמודל מחייב | נדחה לטובת ledger + payout פיזי |
| טבלת `coupons_issued` ישנה | הוחלפה בשוברים חיים + redemptions |
| תווית מיגרציה "032" | שגויה; טיוטת commerce = 026 (לא להחיל עיוור) |

מנויים / geo / UX ספק: מסמכים נפרדים (SUBSCRIPTIONS, GEO, SUPPLIER-*). כל פיצול חייב לציית ל-C1/C10 ולאגורות.

---

## 8. Acceptance

- [ ] C1–C10 + C11א מנוסחים במפורש; אין held-until-redeem לספק על קופון
- [ ] קישור חי ל-CHECKOUT-FLOW, PRICING-RULES, CONTRADICTIONS
- [ ] קופון: `supplier_due` פלטפורמה = 0; פיזי: fee + supplier = line מ-snapshot
- [ ] פער ILS numeric (026) מול אגורות integer מסומן; אין הנחיה להחיל 026 כפי שהיא
- [ ] Publish בלי `platform_percent` נכשל; שיעור ספק לא נקרא בקופה
- [ ] Snapshot לפני LP; שינוי מוצר לא משנה הזמנות ישנות
- [ ] Payout רק פיזי; מימוש קופון לא משחרר כסף פלטפורמה→ספק

---

## 9. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-08 | תכנון commerce + טיוטת 026 |
| 2026-08-06 | QA: יישור C1–C10; הסרת באנר STALE שגוי; סימון פער ILS |
| 2026-08-07 | QA: `voucher_redemptions` חי מול טיוטה |
| 2026-08-12 | batch #6/50: כתיבה מחדש BINDING, No Escrow מלא (בלי held פנימי לספק), סיכום C1–C10, קישורים, פער אגורות |
