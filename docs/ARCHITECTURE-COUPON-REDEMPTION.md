# ארכיטקטורה: מימוש קופון (ספק)

מפרט מחייב לסריקת ספק: RPC `redeem_voucher`, טבלת outcomes, אימות QR, idempotency, RLS, ו-anti-enum לחנות שגויה.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #8/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/ARCHITECTURE-CARDCOM-WEBHOOKS.md
docs/ARCHITECTURE-COUPON-REDEMPTION-UX.md
docs/ARCHITECTURE-MASTER-CHECKOUT-REDEMPTION.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-SECURITY-RLS.md
docs/CONTRADICTIONS.md
```

**יחס ל-LIFECYCLE:** מחזור חיים (mint/expire/refund/race) ב-

```
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
```

כאן: חוזה סריקה ו-RPC בלבד. בהתנגשות על סטטוסים/CAS גובר LIFECYCLE; בהתנגשות על outcomes/API גובר המסמך הזה.

**יחס ל-WEBHOOKS:** הנפקה רק אחרי `paid` מאומת ב-`GetLpResult` (לא מ-return בלבד). ראה

```
docs/ARCHITECTURE-CARDCOM-WEBHOOKS.md
```

מודל כסף: **No Escrow**. סריקה לא משחררת payout. סכומים באגורות integer. סטטוס סופי למימוש: `redeemed`.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| CR1 | כתיבת מימוש יחידה = RPC `redeem_voucher` (SECURITY DEFINER) עם CAS `UPDATE … WHERE status='issued' … RETURNING`. |
| CR2 | קצה HTTP: `POST /api/supplier/vouchers/redeem` עם JWT משתמש (לא service_role), כדי ש-`auth.uid()` יישב. |
| CR3 | QR: אם נשלח `qr_payload`, אימות HMAC (`KEV1`) **לפני** RPC; כשל חתימה → audit פנימי + תשובת לקוח `not_found`. |
| CR4 | `supplier_id` נגזר מ-`supplier_members` / session, **לא** מגוף הבקשה ולא משדה בתוך ה-QR. |
| CR5 | Wrong shop וקוד לא קיים → אותה תשובה חיצונית (`not_found`). פרט פנימי ב-audit בלבד. |
| CR6 | Idempotency: מפתח אופציונלי על `voucher_redemptions`; replay מחזיר outcome קודם בלי mutate שני. |
| CR7 | הצלחה רושמת `amount_collected_agorot` כתיעוד גבייה מקומית; `platform→supplier` = 0. |
| CR8 | כתיבה חדשה: `redeemed` (לא `used`). קוראים ישנים יכולים למפות `used`/`already_used` → `redeemed`/`already_redeemed`. |

---

## 1. זרימה מקצה לקצה

תנאי קדם: הזמנה `paid` אחרי `GetLpResult` + finalize; שוברים `issued` עם snapshots ו-QR חתום (LIFECYCLE + WEBHOOKS).

```text
ספק פותח /supplier/scan
  → מצלמה מפענחת QR או הקלדה ידנית
  → POST /api/supplier/vouchers/redeem
       { code | qr_payload, method, idempotency_key? }
  → auth.getUser
  → אם qr_payload: verifyVoucherQrPayload (HMAC)
       fail → log invalid_signature → { outcome: not_found }
  → supabase.rpc('redeem_voucher', …)  // user JWT
  → (הצלחה חדשה) markOrderItemRedeemed + outbox/emails
  → JSON + הודעת עברית (UX)
```

```text
redeem_voucher:
  auth.uid + membership פעיל
  → replay idempotency_key אם קיים
  → rate limit
  → UPDATE vouchers
       SET status='redeemed', redeemed_at=now(), …
       WHERE code=? AND status='issued' AND expires_at>now()
         AND supplier_id ∈ membership(uid)
       RETURNING *
  → אם FOUND: outcome=success + INSERT redemption
  → אם 0 rows: probe → already_redeemed | expired | refunded | wrong_supplier | not_found
       wrong_supplier/not_found → ללקוח not_found
```

---

## 2. טבלת outcomes

| outcome (קנוני) | HTTP טיפוסי | מתי | מה רואה הספק |
|---|---|---|---|
| `success` | 200 | CAS הצליח (או replay של success) | יתרה לגבייה באגורות + שם מוצר |
| `already_redeemed` | 409 | כבר `redeemed` / הפסד race | "כבר מומש" (+ `redeemed_at` אם יש) |
| `expired` | 409 | `expires_at <= now` או status expired | "תוקף פג" |
| `refunded` | 409 | status refunded | "הוחזר" |
| `not_found` | 404 | קוד לא קיים, חתימה לא תקינה, או wrong shop | "לא נמצא" (אחיד) |
| `unauthorized` | 401 | אין session / אין membership | "אין הרשאה" |
| `rate_limited` | 429 | מעל מכסת סריקות | "יותר מדי סריקות" |
| `invalid_request` | 400 | גוף לא תקין / מפתח replay על קוד אחר | "בקשה לא תקינה" |

מיפוי aliases ישנים (קריאה בלבד): `already_used` → `already_redeemed`; `used` → `redeemed`.

פנימי בלבד (לא ב-JSON ללקוח): `wrong_supplier`, `invalid_signature`.

---

## 3. אימות QR

| רכיב | כלל |
|---|---|
| פורמט | `KEV1.<body_b64url>.<hmac_b64url>` |
| סוד | `VOUCHER_QR_SECRET` (+ optional previous לרוטציה) |
| השוואה | `timingSafeEqual` |
| תוכן | קוד, expiry, key id; **לא** סמכות הרשאה ל-`supplier_id` שבמטען |
| בלי payload | הזנה ידנית לפי `code` מנורמל; עדיין כל שערי ה-RPC |
| אחרי אימות | רק מחלצים `code`; המימוש תמיד ב-DB |

כשל חתימה: לא חושפים "חתימה לא תקינה" ל-UI. תשובה = `not_found` + שורת audit.

פירוט מחזור/הנפקה: LIFECYCLE סעיף QR.

---

## 4. Idempotency ו-race

| מנגנון | התנהגות |
|---|---|
| CAS `WHERE status='issued'` | שני סורקים במקביל: אחד success, אחד `already_redeemed` |
| `idempotency_key` UNIQUE | אותו מפתח + אותו קוד → `{ replayed: true }` + outcome קודם; בלי mutate שני |
| מפתח על קוד אחר | `invalid_request` |
| אינדקס חלקי הצלחה | UNIQUE על `voucher_id` WHERE `outcome='success'` (חגורה מעל ה-CAS) |
| Webhook/finalize replay | לא קשור לסריקה; mint מוגן ב-LIFECYCLE/WEBHOOKS |

אין מימוש "אופליין סופי". תור אופליין (אם קיים ב-UX) שומר קוד + מפתח ומסנכרן כשיש רשת; עד תשובת שרת אין `redeemed`.

---

## 5. RLS והרשאות

| שכבה | כלל |
|---|---|
| Middleware / route | רק משתמש מחובר במסלול ספק |
| Membership | שורה פעילה ב-`supplier_members` (או מקביל קנוני) |
| RPC | SECURITY DEFINER עם `search_path` קבוע; `REVOKE` מ-`anon`/`PUBLIC`; `GRANT` ל-`authenticated` |
| כתיבת status | רק דרך RPC (לא UPDATE ישיר מלקוח) |
| קריאת היסטוריה | RLS: `supplier_id = current_user_supplier_id()` על `voucher_redemptions` / שוברים של אותו ספק |
| לקוח | רואה רק שוברים של `user_id = auth.uid()` (אזור אישי); לא קורא ל-redeem |

אסור: להעביר `supplier_id` מהקליינט כסמכות. אסור service_role בנתיב redeem הרגיל (שובר את `auth.uid()`).

---

## 1b. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| UPDATE ישיר מ-JWT ספק על `vouchers` | עוקף CAS/rate-limit/audit. |
| `supplier_id` מגוף הבקשה או מ-QR | IDOR. |
| הודעות שונות ל-wrong shop | enumeration. |
| Optimistic redeemed ב-UI | race; LIFECYCLE. |
| Payout / Escrow על success | No Escrow. |

---

## 1c. סכמת DB (קיים; אין DDL)

`vouchers`, `voucher_redemptions`, `supplier_members`, `order_items.settlement_status`. מקור: 054/092. אין DDL במסמך זה.

---

## 1d. מקרי קצה

| קוד | תוצאה |
|---|---|
| `scan_race` | אחד success |
| `invalid_qr` | not_found + audit |
| `replay_idempotency` | replayed outcome |
| `rate_limited` | 429 |
| `redeem_after_refund` | 409 refunded |

---

## 1e. פתוחות

| # | פתוח | שמרני |
|---|---|---|
| O1 | PIN חובה | לפי הגדרת ספק; ראה SUPPLIER-REDEMPTION |
| O2 | תור אופליין | אין redeemed לפני שרת |

---

## 6. Wrong shop (anti-enum)

```text
קוד קיים אבל supplier_id ∉ membership(uid)
  → outcome פנימי: wrong_supplier
  → INSERT redemption/audit עם הפרט הפנימי
  → תשובת API זהה ל-not_found (404 + אותה הודעה)
```

מטרה: לא לאפשר מיפוי "האם הקוד קיים אצל מתחרה" דרך הודעות שונות או קודי HTTP שונים.

אותו עיקרון לחתימה מזויפת: חיצונית `not_found`, פנימית `invalid_signature`.

---

## 7. כסף אחרי סריקה

| שדה / פעולה | משמעות |
|---|---|
| `amount_collected_agorot` | יתרת עסק שתועדה (`face - coupon_price` מה-snapshot) |
| `settlement_status` על השורה | → `redeemed` |
| `order_item_status` | נשאר `issued` (אין ערך redeemed ב-enum הפריט) |
| payout | **לא נוצר** (C11א / No Escrow) |

קישור מאסטר:

```
docs/ARCHITECTURE-MASTER-CHECKOUT-REDEMPTION.md
```

---

## 8. Audit

| מאגר | מה נשמר |
|---|---|
| `voucher_redemptions` | כל ניסיון: success + כשלונות, method, IP/UA אם יש, idempotency |
| `audit_log` / `log_voucher_scan` | פעולה + actor + entity |
| סירוב לפני RPC | חתימה לא תקינה / בקשה לא תקינה |

---

## 9. Acceptance

- [ ] Redeem רק עם JWT + membership  
- [ ] HMAC לפני RPC כשיש payload  
- [ ] CAS `issued`→`redeemed` + outcomes מלאים  
- [ ] Wrong shop = `not_found` חיצוני  
- [ ] Idempotency replay בטוח  
- [ ] אין payout / Escrow על success  
- [ ] קישור עקבי ל-LIFECYCLE ול-CARDCOM-WEBHOOKS  

---

## 10. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING batch #8: RPC, outcomes, QR, idempotency, RLS, anti-enum; קישור LIFECYCLE+WEBHOOKS |
