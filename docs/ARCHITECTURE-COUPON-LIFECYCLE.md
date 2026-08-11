# ארכיטקטורה: מחזור חיי קופון

יצירה אחרי תשלום, QR חתום, סריקה אטומית, פקיעה, ו-race conditions. סטטוס סופי למימוש: `redeemed`.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #3/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/COUPON-LIFECYCLE-SPEC.md
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/ARCHITECTURE-COUPON-REDEMPTION-UX.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ARCHITECTURE-CARDCOM-WEBHOOKS.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/CONTRADICTIONS.md
docs/BUSINESS-MODEL.md
```

**יחס ל-`COUPON-LIFECYCLE-SPEC.md`:** כאן הכרעות מחייבות. ה-SPEC לפירוט מוצר/טבלאות; בהתנגשות גובר המסמך הזה.

מודל כסף: **No Escrow**. מקדמה באתר = הכנסת פלטפורמה ב-`paid`. יתרה בבית העסק מחוץ לפלטפורמה. סריקה לא משחררת payout.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| CL1 | הנפקה רק אחרי order `paid` מאומת ב-GetLpResult (לא מ-return בלבד). |
| CL2 | סטטוסים קנוניים: `issued` \| `redeemed` \| `expired` \| `refunded`. כתיבה חדשה: `redeemed` (לא `used`). |
| CL3 | מימוש = CAS אטומי `UPDATE … WHERE status='issued' … RETURNING` (RPC `redeem_voucher`). |
| CL4 | QR = מטען חתום (`KEV1` + HMAC); בעלות על תמונת QR אינה מספיקה בלי עדכון DB. |
| CL5 | ספק סורק רק שוברים של `supplier_id` שלו; wrong shop → תשובה אחידה (anti-enum). |
| CL6 | snapshots אגורות על השורה/שובר; `supplier_due` מהפלטפורמה = 0. |
| CL7 | אחרי `redeemed` אין unwind אוטומטי ל-`issued`. |
| CL8 | כל מעבר + סריקה נכשלת → audit / `voucher_redemptions` / `log_voucher_scan`. |
| CL9 | `order_item_status` אין ערך `redeemed`; אחרי מימוש: `item_status` נשאר `issued`, `settlement_status` → `redeemed`. |

---

## 1. יצירה (mint)

```text
finalizeOrder (paid)
  → לכל order_item מסוג coupon × quantity:
       אם כבר issued_count >= quantity → skip (idempotent)
       INSERT voucher (
         status=issued,
         code unique,
         qr_payload signed,
         face / coupon_price / balance_due snapshots (agorot),
         expires_at = min(paid_at + expiry_days, offer_valid_until),
         order_item_id, user_id, supplier_id, product_id
       )
  → order_items: settlement_status=platform_settled, item_status=issued
  → outbox: voucher_issued / order_paid
```

| כלל | פירוט |
|---|---|
| שער | רק אחרי תשלום מאומת |
| מכסה | אכיפה מול quota לפני/בתוך finalize |
| Idempotency | ספירת vouchers ל-`order_item_id`; replay webhook לא מנפיק כפול |
| כשל אחרי paid | reconcile משלים הנפקה; **לא** מבטל `paid` |

---

## 2. QR

| רכיב | תפקיד |
|---|---|
| `code` | הזנה ידנית; נרמול A-Z0-9 |
| `qr_payload` | `KEV1.<body>.<HMAC>` עם key id לרוטציה |
| אימות בנתיב סריקה | אם נשלח payload: HMAC קודם; כשל → `invalid_signature` + תשובת `not_found` ללקוח |
| תצוגה | אזור אישי / אפ; אופליין לתצוגה בלבד |

אסור: מימוש מקומי על המכשיר בלי RPC. אסור קודי ניחוש קצרים בלי rate limit (FRAUD).

---

## 3. סריקה (redeem)

קצה:

```
POST /api/supplier/vouchers/redeem
```

```text
JWT ספק (auth.uid)
  → parse code | qr_payload (+ optional idempotency_key)
  → verify QR HMAC אם יש payload
  → redeem_voucher RPC (user-scoped client; SECURITY DEFINER)
       derive supplier from membership (לא מהבקשה)
       SELECT … FOR UPDATE
       gates: issued, not expired, same supplier
       UPDATE status='redeemed', redeemed_at=now() WHERE status='issued'
       INSERT redemption / scan log
  → markOrderItemRedeemed → settlement_status=redeemed
  → outbox: voucher_redeemed
```

`amount_collected_agorot` / יתרת עסק = תיעוד גבייה מקומית בלבד. **לא** יוצר payout פלטפורמה→ספק.

| Outcome | HTTP | משמעות |
|---|---|---|
| `success` | 200 | הועבר ל-`redeemed` |
| `already_redeemed` | 409 | כבר מומש / race |
| `expired` / `cancelled` / `refunded` | 409 | לא ניתן |
| `not_found` | 404 | קוד לא קיים או wrong shop (אחיד) |
| `unauthorized` | 401 | אין session |
| `rate_limited` | 429 | יותר מדי סריקות |

---

## 4. Race conditions

| תרחיש | התנהגות |
|---|---|
| שני סורקים במקביל | UPDATE אחד מצליח; השני 0 rows → `already_redeemed` |
| HTTP retry אחרי success | idempotency_key / status≠issued → replay בטוח בלי side effects כפולים |
| סריקה + refund במקביל | FOR UPDATE; refund רק מ-`issued`; אחרי redeemed אין refund אוטומטי לכרטיס |
| סריקה + expire cron | expire רק `WHERE status='issued' AND expires_at<=now()` |
| סריקה + webhook replay finalize | finalize לא נוגע ב-redeemed; mint cap לפי quantity |

אין optimistic UI שמסמן "מומש" לפני תשובת שרת.

---

## 5. פקיעה

| מנגנון | כלל |
|---|---|
| `expires_at` | נקבע ב-mint מ-`coupon_expiry_days` / `offer_valid_until` (snapshot) |
| Cron | באצ' `issued` → `expired`; idempotent |
| אחרי expired | אין redeem |
| Breakage כסף | לפי LEGAL / ארנק פנימי; לא זיכוי אשראי כברירת מחדל |

---

## 6. מכונת מצבים

```text
(none) ──mint──► issued ──redeem──► redeemed (terminal)
                   │
                   ├──expire──► expired (terminal)
                   └──refund──► refunded (terminal)
```

מעברים אסורים: `redeemed`→`issued`; `expired`→`redeemed`; mint לפני `paid`.

---

## 7. Audit והרשאות

| אירוע | איפה |
|---|---|
| mint | audit_log + שורת voucher |
| redeem success/fail | `voucher_redemptions` / `log_voucher_scan` |
| expire / refund | audit + timestamps |
| admin override | actor + סיבה חובה |

| פעולה | מי |
|---|---|
| סריקה | `supplier_members` עם הרשאת scan (+ PIN באפ אם מופעל) |
| היסטוריית סריקות | אותו ספק (RLS) |
| הנפקה / מחיר / % | admin בלבד |
| refund | admin/legal; לא מסלול ספק |

---

## 8. Acceptance

- [ ] Mint רק אחרי paid מאומת  
- [ ] Redeem CAS + outcomes מלאים  
- [ ] QR HMAC לפני RPC כשיש payload  
- [ ] Race דו-סורקים / refund / expire מוגדרים  
- [ ] פקיעה idempotent  
- [ ] No Escrow; אין payout על redeem  
- [ ] `settlement_status=redeemed` בלי לשבור `order_item_status` enum  

---

## 9. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING: יצירה, QR, redeem, races, expiry, audit, הרשאות |
| 2026-08-12 | batch-2 #3: חידוד outcomes, settlement_status, קישור ל-WEBHOOKS |
