# ארכיטקטורה: מחזור חיי קופון

יצירה (mint), QR חתום, סריקה, פקיעה, race conditions, ונעילות. סטטוס מימוש קנוני: `redeemed`.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/COUPON-LIFECYCLE-SPEC.md
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/ARCHITECTURE-COUPON-REDEMPTION-UX.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ARCHITECTURE-CARDCOM-WEBHOOKS.md
docs/ARCHITECTURE-INVENTORY.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/CONTRADICTIONS.md
docs/BUSINESS-MODEL.md
```

**יחס ל-`COUPON-LIFECYCLE-SPEC.md`:** כאן הכרעות מחייבות. ה-SPEC לפירוט מוצר; בהתנגשות גובר המסמך הזה.

מודל כסף: **No Escrow**. מקדמה באתר = הכנסת פלטפורמה ב-`paid`. יתרה בבית העסק מחוץ לפלטפורמה. סריקה לא משחררת payout.

---

## 0. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| CL1 | הנפקה רק אחרי order `paid` מאומת ב-GetLpResult (לא מ-return בלבד). |
| CL2 | סטטוסים קנוניים: `issued` \| `redeemed` \| `expired` \| `refunded`. כתיבה חדשה: `redeemed` (לא `used`). |
| CL3 | מימוש = עדכון אטומי יחיד: `UPDATE vouchers SET status=redeemed WHERE status=issued AND … RETURNING` בתוך RPC `redeem_voucher`. |
| CL4 | QR = `KEV1` + HMAC; בעלות על תמונת QR אינה מספיקה בלי עדכון DB. |
| CL5 | ספק סורק רק שוברים של `supplier_id` שלו (מ-membership של `auth.uid()`). Wrong shop → תשובה אחידה ללקוח (`not_found`); פירוט בלוג/RPC. |
| CL6 | Snapshots אגורות על השורה/שובר; `supplier_due` מהפלטפורמה = 0. |
| CL7 | אחרי `redeemed` אין unwind אוטומטי ל-`issued`. |
| CL8 | כל מעבר + סריקה נכשלת → `voucher_redemptions` / audit. |
| CL9 | `order_item_status` אין `redeemed`; אחרי מימוש: `item_status` נשאר `issued`, `settlement_status` → `redeemed`. |
| CL10 | פקיעה: `expire_vouchers` עם `FOR UPDATE SKIP LOCKED`; redeem בודק `expires_at > now()` בתוך ה-UPDATE האטומי. |
| CL11 | נעילות: שורת voucher תחת row lock של ה-UPDATE/SELECT; אין מימוש בזיכרון בלבד; mint idempotent לפי כמות ל-`order_item_id`. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| הנפקה לפני `paid` / מ-Return URL | סיכון שובר בלי כסף מאומת. |
| סטטוס `used` בכתיבה חדשה | קנוני בפרוד = `redeemed` (054+). |
| מימוש אופטימי ב-UI / מקומי על המכשיר | מרוץ סורקים; האמת רק ב-DB. |
| QR בלי HMAC / קוד קצר לניחוש | FRAUD; נדרש חתימה + rate limit. |
| Escrow / שחרור כסף לספק בסריקה | סותר No Escrow / C11א. |
| `SELECT` בלי עדכון אטומי ואז UPDATE נפרד בלי CAS | חלון race בין שני סורקים. |
| Expire שמוחק שורות | מאבד audit; רק מעבר ל-`expired`. |
| העברת `supplier_id` מגוף הבקשה | IDOR; נגזר מ-membership בלבד. |

---

## 2. סכמת DB (קיים; אין DDL חדש במסמך זה)

מקורות:
`054_voucher_redemption.sql`
,
`068_voucher_expiry_sweep.sql`
,
`092_redeem_voucher_order_item.sql`
.

### 2.1 Enum / סטטוסים

```text
voucher_status (קנוני):
  issued | redeemed | expired | refunded
  (+ cancelled אם קיים בפרוד לביטול)

voucher_scan_outcome (דוגמאות):
  success | already_redeemed | expired | cancelled | refunded
  | not_found | wrong_supplier | unauthorized | rate_limited | invalid_request
```

### 2.2 טבלאות

| טבלה | שדות קריטיים |
|---|---|
| `vouchers` | `code` UNIQUE, `status`, `qr_payload`, `order_item_id`, `user_id`, `supplier_id`, `product_id`, face/coupon/remaining agorot, `expires_at`, `redeemed_at`, `redeemed_by_*` |
| `order_items` | `item_status`, `settlement_status`, snapshots כסף |
| `voucher_redemptions` | append-only: code, outcome, scanned_by, method, `idempotency_key`, voucher_id |
| `supplier_members` | `user_id`, `supplier_id`, `is_active` |
| `orders` | `status`, `paid_at` (שער ל-mint) |

### 2.3 פונקציות מחייבות

| פונקציה | תפקיד | נעילה |
|---|---|---|
| `redeem_voucher(code, method, idempotency_key)` | SECURITY DEFINER; נתיב מימוש יחיד | `UPDATE … WHERE status=issued … RETURNING` (row lock) |
| `expire_vouchers(limit)` | service role / cron | `FOR UPDATE SKIP LOCKED` על באצ' |
| `log_voucher_scan` / INSERT redemptions | audit | append-only |
| issue path ב-finalize (TS `issueVoucher`) | mint אחרי paid | cap לפי count(`order_item_id`) |

---

## 3. מכונת מצבים

```text
(none) ──mint (אחרי paid)──► issued
                               │
                               ├──redeem (CAS)──► redeemed (terminal)
                               ├──expire (sweep)─► expired (terminal)
                               └──refund ────────► refunded (terminal)
```

מעברים אסורים: `redeemed`→`issued`; `expired`→`redeemed`; mint לפני `paid`; redeem אחרי `refunded`.

---

## 4. יצירה (mint)

```text
finalizeOrder (paid_at set / GetLpResult OK או wallet-only)
  → לכל order_item מסוג coupon × quantity:
       issued_count = COUNT vouchers WHERE order_item_id
       אם issued_count >= quantity → skip (idempotent replay)
       INSERT voucher (
         status=issued,
         code unique,
         qr_payload = KEV1 signed,
         face / coupon_price / remaining snapshots (agorot),
         expires_at = min(paid_at + coupon_expiry_days, offer_valid_until),
         order_item_id, user_id, supplier_id, product_id
       )
  → order_items: settlement_status=platform_settled, item_status=issued
  → outbox: voucher_issued / order_paid
```

| כלל | פירוט |
|---|---|
| שער | רק אחרי תשלום מאומת |
| מכסה | מול quota לפני/בתוך checkout+finalize (INVENTORY) |
| Idempotency | cap לפי quantity ל-`order_item_id` |
| כשל אחרי paid | reconcile משלים הנפקה; **לא** מבטל `paid` |
| כסף | אין held לספק |

---

## 5. QR

| רכיב | תפקיד |
|---|---|
| `code` | הזנה ידנית; נרמול A-Z0-9 |
| `qr_payload` | `KEV1.<body>.<HMAC>` (+ key id לרוטציה) |
| אימות בנתיב סריקה | אם נשלח payload: HMAC **לפני** RPC; כשל → log `invalid_signature` + תשובת `not_found` |
| תצוגה | אזור אישי / אפ; אופליין לתצוגה בלבד |

אסור: מימוש מקומי בלי RPC. אסור קודי ניחוש קצרים בלי rate limit.

QR מוכיח שהפלטפורמה הנפיקה; **אינו** authorization token לשימוש חוזר. חד-פעמיות = סטטוס ב-DB.

---

## 6. סריקה (redeem)

קצה:

```
POST /api/supplier/vouchers/redeem
```

```text
JWT ספק (auth.uid)
  → parse code | qr_payload (+ optional idempotency_key)
  → verify QR HMAC אם יש payload
  → redeem_voucher via user-scoped client (כדי ש-auth.uid יישב)
       unauthorized / no membership → outcome
       idempotency_key קיים → replay תוצאה קודמת
       rate limit → rate_limited
       UPDATE vouchers
         SET status=redeemed, redeemed_at=now(), …
         WHERE code=? AND status=issued AND expires_at>now()
           AND supplier_id IN (memberships of uid)
         RETURNING *
       אם FOUND → success + UPDATE order_items.settlement_status=redeemed
       אחרת → probe: not_found / wrong_supplier / already_redeemed / expired / …
       INSERT voucher_redemptions
  → outbox: voucher_redeemed (בהצלחה)
```

`remaining_amount_due_agorot` / `redeemed_amount_collected_agorot` = תיעוד גבייה מקומית. **לא** payout פלטפורמה→ספק.

| Outcome | HTTP (route) | משמעות |
|---|---|---|
| `success` | 200 | הועבר ל-`redeemed` |
| `already_redeemed` | 409 | כבר מומש / הפסד ב-race |
| `expired` / `cancelled` / `refunded` | 409 | לא ניתן |
| `not_found` (כולל מיפוי wrong shop) | 404 | anti-enum |
| `unauthorized` | 401 | אין session / לא ספק |
| `rate_limited` | 429 | יותר מדי סריקות |
| `invalid_request` | 400 | בקשה שבורה / idempotency clash |

---

## 7. נעילות (locks)

| מנגנון | איפה | מה נועל | למה |
|---|---|---|---|
| Row lock מ-`UPDATE … WHERE status=issued … RETURNING` | `redeem_voucher` | שורת voucher אחת | שני סורקים: רק אחד מקבל FOUND |
| בדיקת `idempotency_key` לפני UPDATE | `voucher_redemptions` | לוגי (replay) | HTTP retry לא יוצר side effects כפולים |
| `FOR UPDATE SKIP LOCKED` | `expire_vouchers` באצ' | שורות issued שפג תוקפן | מספר workers של cron בלי לחסום זה את זה |
| Cap mint לפי COUNT | finalize / issueVoucher | לוגית per order_item | webhook replay לא מנפיק מעל quantity |
| Rate limit `voucher_scan` | RPC | per user | מניעת ניחוש/הצפה |
| אין advisory lock גלובלי על כל הספק | (לא מיושם) | (לא מיושם) | נדחה: מספיק row lock per voucher |

סדר מומלץ תחת עומס: idempotency → rate limit → UPDATE CAS → audit. לא לעדכן UI ל-redeemed לפני תשובת שרת.

---

## 8. Race conditions

| תרחיש | נעילה / התנהגות |
|---|---|
| שני סורקים במקביל על אותו code | UPDATE אחד מצליח; השני 0 rows → `already_redeemed` |
| HTTP retry אחרי success | `idempotency_key` → replayed success בלי UPDATE שני |
| סריקה + refund במקביל | refund רק מ-`issued`; אחרי redeemed אין refund אוטומטי לכרטיס |
| סריקה + expire cron | redeem דורש `expires_at>now()` ב-UPDATE; expire נועל SKIP LOCKED רק issued שפג |
| סריקה + webhook replay finalize | finalize לא נוגע ב-redeemed; mint cap |
| שני workers expire | SKIP LOCKED; אין double-expire בעייתי (idempotent status) |
| Wrong shop + enumeration | תשובת לקוח אחידה; לא חושפים ownership |

---

## 9. פקיעה

| מנגנון | כלל |
|---|---|
| `expires_at` | נקבע ב-mint מ-`coupon_expiry_days` / `offer_valid_until` (snapshot) |
| בדיקה ב-redeem | `expires_at > now()` בתוך UPDATE האטומי |
| Cron `expire_vouchers` | באצ' issued→expired; `FOR UPDATE SKIP LOCKED`; service role |
| אחרי expired | אין redeem |
| כסף (breakage) | לפי LEGAL / ארנק פנימי; **לא** זיכוי אשראי כברירת מחדל; sweep **לא** מזיז כסף |

---

## 10. Audit והרשאות

| אירוע | איפה |
|---|---|
| mint | audit_log + שורת voucher |
| redeem success/fail | `voucher_redemptions` |
| expire / refund | audit + timestamps / status_reason |
| admin override | actor + סיבה חובה |

| פעולה | מי |
|---|---|
| סריקה | `supplier_members` פעיל (+ PIN באפ אם מופעל) |
| היסטוריית סריקות | אותו ספק (RLS) |
| הנפקה / מחיר / % | admin בלבד |
| refund | admin/legal; לא מסלול ספק |
| expire sweep | service role / cron בלבד |

---

## 11. מקרי קצה

| קוד | סימפטום | תוצאה |
|---|---|---|
| `mint_before_paid` | ניסיון הנפקה מוקדם | אסור; אין שורות |
| `paid_no_voucher` | paid בלי mint מלא | reconcile; לא מבטל paid |
| `invalid_qr_sig` | HMAC נכשל | not_found + log |
| `scan_race` | שני סורקים | אחד success |
| `wrong_shop` | membership לא תואם | not_found ללקוח |
| `redeem_expired_row` | expires_at עבר אבל status עוד issued | UPDATE לא תופס; outcome expired (או sweep ישלים) |
| `idempotency_clash` | אותו key עם code אחר | invalid_request replayed |
| `rate_limited` | >N סריקות לדקה | 429 |
| `refund_after_redeem` | ניסיון refund לכרטיס | חסום (REFUNDS) |

---

## 12. פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | האם `cancelled` נשאר ב-enum הפרוד לכל הביטולים או רק `refunded`/`expired` | ליישר מול DB חי |
| O2 | מרווח cron ל-`expire_vouchers` (דקות/שעות) | לקבע ב-OBSERVABILITY/env |
| O3 | האם PIN חובה בכל סריקת מצלמה או רק מעל סף סיכון | SUPPLIER-REDEMPTION / אפ |
| O4 | רוטציית מפתח HMAC ל-QR (key id) לוח זמנים | FRAUD + secrets |
| O5 | Breakage: זיכוי ארנק אוטומטי ב-expiry או ידני בלבד | LEGAL; ברירת מחדל = לא אשראי |

עודכן: 2026-08-12.

---

## 13. Acceptance

- [ ] Mint רק אחרי paid + idempotent cap  
- [ ] QR HMAC לפני RPC  
- [ ] Redeem CAS / UPDATE RETURNING מתועד  
- [ ] נעילות: row lock redeem + SKIP LOCKED expire  
- [ ] Races: סורקים / refund / expire / finalize  
- [ ] פקיעה בלי תנועת כסף ב-sweep  
- [ ] No Escrow; אין payout על redeem  
- [ ] חלופות שנדחו + DB + פתוחות  

---

## 14. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING / batch-2 #3 |
| 2026-08-12 | שכתוב לפי תבנית: נעילות, races, mint/QR/scan/expiry, חלופות, DB, פתוחות |
