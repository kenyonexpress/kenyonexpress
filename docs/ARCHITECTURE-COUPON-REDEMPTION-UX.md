# ARCHITECTURE-COUPON-REDEMPTION-UX.md

מפרט **UX מחייב** למימוש קופון (ספק + לקוח).

Status: BINDING for `feat/coupon-redemption` (2026-08-02)  
Companions: `docs/ARCHITECTURE-COUPON-REDEMPTION.md` (ארכיטקטורה מלאה), `ARCHITECTURE-VOUCHER-REDEMPTION.md` (lifecycle), Electro tokens מ-

```
refs/ke_live_singlefile.html
```

Scope: docs + יישום על branch `feat/coupon-redemption`.

---

## 0. מודל כסף (חייב להופיע נכון במסכים)

| כלל | UI |
|---|---|
| שולם באתר | `coupon_price` (₪) |
| יתרה לגבייה בעסק | `face - coupon_price` (המספר הגדול אחרי סריקה מוצלחת) |
| סריקה חד-פעמית | `issued` → `redeemed` בלבד; סריקה שנייה = "כבר מומש" |
| אין Escrow בנוסח | לא לכתוב נאמן / Escrow |
| `order_items` | אחרי מימוש: `settlement_status = redeemed` |

---

## 1. מסלולים

| Route | קהל | תפקיד |
|---|---|---|
| `/supplier/scan` | ספק (member) | מצלמה + הקלדה + אישור + תוצאה |
| `/coupon/[id]` | לקוח בעלים | קופון בודד + QR + סטטוס |
| `/account/vouchers` | לקוח | רשימה עם QR לפעילים |
| `POST /api/supplier/vouchers/redeem` | ספק | מימוש אטומי |

---

## 2. `/supplier/scan` (mobile-first)

### 2.1 שלבים

1. **קלט:** מצלמה (BarcodeDetector) ו/או הקלדה ידנית (תמיד).
2. **אישור:** הצגת קוד מנורמל; כפתור "אשר וממש" (ייעול כפול נחסם ב-idempotency_key).
3. **תוצאה:** הצלחה = יתרה לגבייה בטיפוגרפיה הגדולה ביותר; כשל = הודעה בעברית בלי לחשוף ספק זר.

### 2.2 מדידות / טוקנים (Electro)

| פריט | ערך |
|---|---|
| כיוון | `dir="rtl"` על המעטפת |
| גופן | Heebo (stack האתר) |
| CTA ראשי | רקע `#333e48`, טקסט לבן; הדגשת מותג `#fed700` על פס הצלחה |
| יעד מגע | ≥ 44px בגובה |
| קוד | `dir="ltr"`, mono, מרווח אותיות |
| container | max-width ~480px למובייל; מיושר למרכז |

### 2.3 הודעות עברית (מחייבות)

| outcome | טקסט |
|---|---|
| success | השובר מומש בהצלחה |
| already_redeemed | השובר כבר מומש |
| expired | תוקף השובר פג |
| not_found | קוד שובר לא נמצא |
| unauthorized | אין הרשאת ספק |
| rate_limited | יותר מדי סריקות, המתן רגע |

---

## 3. `/coupon/[id]` (לקוח)

- דורש session; רק `user_id` של בעל השובר.
- מציג: שם מוצר, קוד, QR מ-`qr_payload`, שולם באתר, יתרה בעסק, תוקף, סטטוס.
- קופון שמומש/פג: בלי QR פעיל; סטטוס ברור.

---

## 4. Acceptance (UX)

- [ ] Scan RTL, CTA 44px+, יתרה בולטת בהצלחה
- [ ] QR נוצר בהנפקה ונראה ב-`/coupon/[id]` וב-`/account/vouchers`
- [ ] סריקה שנייה נדחית בעברית
- [ ] `order_items.settlement_status` עובר ל-`redeemed` אחרי הצלחה
- [ ] Vitest: qr / issue / redemption / mark-order-item
- [ ] compare: דף קופון PDP / coupon UI מתחת ל-11% כשיש סביבה; scan אין מקבילה ב-WP

---

## 5. Revision

| Date | Change |
|---|---|
| 2026-08-02 | UX binding for feat/coupon-redemption |
