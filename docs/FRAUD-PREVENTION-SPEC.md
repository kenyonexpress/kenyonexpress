# FRAUD-PREVENTION-SPEC.md
# מפרט מניעת הונאה (מוצר ותפעול)

שכבת מוצר מעל ההכרעות המחייבות ב-

```
docs/ARCHITECTURE-FRAUD-PREVENTION.md
```

Status: **SPEC** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`

מסמכים קשורים:

```
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/COUPON-LIFECYCLE-SPEC.md
docs/SECURITY-AUDIT-CHECKLIST.md
docs/CHECKOUT-OPTIMIZATION.md
docs/DISPUTE-RESOLUTION.md
docs/INCIDENT-RESPONSE-RUNBOOK.md
docs/VENDOR-PAYOUT-SPEC.md
```

עקרון: כפילות נחסמת ב-**DB אטומי**. Rate limit על כסף: **fail-closed**.

---

## 1. משטחי תקיפה

| משטח | סיכון | הגנה עיקרית |
|---|---|---|
| Double redeem | מימוש כפול | `issued`→`redeemed` אטומי |
| זיוף QR | קופון מזויף | HMAC/Ed25519 keyed |
| שיתוף צילום | שימוש ע״י אחר | חד-פעמיות + מייל "אם לא אתם" |
| Checkout abuse | כרטיסים גנובים | velocity + Cardcom + RL |
| Chargeback | אובדן כסף אחרי paid | freeze + review ידני |
| Supplier fraud | סריקות פיקטיביות | geo/off-hours/velocity על scanner |
| Payout fraud | משיכת יתרה פיזית | אישור אדמין + חשבון מאומת |

---

## 2. Velocity (יעדי התחלה)

| פעולה | חלון | סף כיוון | פעולה בחריגה |
|---|---|---|---|
| begin_checkout / IP | 10 דק' | N ניסיונות | 429 fail-closed |
| redeem / ספק | 1 דק' | M סריקות | האטה + התראה |
| חשבונות חדשים→purchase | 1 שע' | K הזמנות | manual_review |
| כרטיס נכשל חוזר | 1 שע' | לפי Cardcom | חסימה זמנית |

מספרים מדויקים בקונפיג; כאן העיקרון.

---

## 3. Chargeback playbook (תמצית)

1. קבלת התראה → תיק `manual_review`.  
2. אם voucher `issued` → freeze מיידי.  
3. אם `redeemed` → אין unwind אוטומטי; ראיות מימוש + DISPUTE.  
4. אין מחיקת payments/orders.  
5. פיזי אחרי payout → `supplier_debit` לפי PAYOUT.  

---

## 4. תור review באדמין

| שדה | שימוש |
|---|---|
| reason | chargeback / velocity / supplier_alert |
| entity refs | order_id, voucher_id, supplier_id |
| status | open / approved / rejected |
| audit | מי החליט ומתי |

אין auto-refund מלא מתוך התור בלי לחיצת admin.

---

## 5. סימני אדום לספק

| אות | פעולה |
|---|---|
| redeem מחוץ לשעות עסק קיצוני | התראה |
| קפיצות geo בין סריקות | review |
| יחס chargeback גבוה | השעיית דילים (QUALITY) |

---

## 6. Acceptance

- [ ] SEC-QR סגור לפני פרוד מלא  
- [ ] RL fail-closed על checkout/redeem  
- [ ] בדיקת עומס double-redeem  
- [ ] תסריט תמיכה ל-chargeback ב-PLAYBOOK  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | מפרט הונאה: משטחים, velocity, chargeback, review |
| 2026-08-11 | יישור סטטוס מימוש ל-`redeemed` (פרוד 054) |
