# ARCHITECTURE: QR Coupon Security

אבטחת קופון QR: מבנה payload חתום, תוקף משובץ, מניעת replay, fallback לסריקה אופליין אצל ספק, רוטציה בחשד לדליפה.

Status: **BINDING** · Updated: 2026-08-03  
Scope: **docs only** · branch `arch/docs-queue`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי.

Companions:

```
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/ARCHITECTURE-MOBILE-APP-V2.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/RUNBOOK-INCIDENTS.md
```

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| Q1 | QR מקודד **payload חתום** (HMAC או Ed25519), לא URL פתוח עם service role. |
| Q2 | מימוש: אטומי ב-DB; חתימה תקינה ≠ מספיק בלי `status=issued`. |
| Q3 | Replay אחרי redeem → `already_used`, בלי side effects. |
| Q4 | סוד החתימה (`VOUCHER_QR_SECRET` או מקביל) רק בשרת; לא ב-client bundle. |
| Q5 | Offline אצל **ספק**: תור סריקה מקומי אופציונלי; commit רק כשיש רשת. לקוח offline = תצוגה בלבד. |
| Q6 | חשד לדליפת סוד → רוטציה + מדיניות invalidate/re-sign. |

---

## 1. Signed payload structure

פורמט לוגי (גרסה בשדה):

```text
KEV1.<base64url(payload_json)>.<base64url(signature)>
```

`payload_json` מינימלי:

```json
{
  "v": 1,
  "vid": "uuid-voucher-id",
  "sid": "uuid-supplier-id",
  "exp": 1735689599,
  "iat": 1700000000
}
```

| שדה | משמעות |
|---|---|
| `v` | גרסת סכמה |
| `vid` | `vouchers.id` |
| `sid` | ספק מורשה למימוש |
| `exp` | unix expiry (שיבוץ ב-QR; גם נבדק מול `vouchers.expires_at`) |
| `iat` | issued-at אופציונלי |

חתימה: HMAC-SHA256 על ה-payload (או Ed25519).  
הקוד האנושי (`code`) יכול להופיע בנפרד במסך; לא חובה בתוך ה-QR אם `vid` מספיק.

אסור ב-payload: מחיר, PII לקוח, service keys.

---

## 2. Expiry embedded

1. `exp` ב-QR חייב להיות ≤ `vouchers.expires_at`.
2. שרת redeem בודק: עכשיו < exp **ו** status issued **ו** DB expires_at.
3. אם DB הוארך/קוצר אחרי הנפקה: **DB מנצח**; QR עם exp ישן עלול להידחות (או מדיניות re-issue).
4. תצוגת לקוח: תאריך עברית מ-DB, לא רק מה-QR.

---

## 3. Replay prevention

| שכבה | מנגנון |
|---|---|
| DB | `UPDATE … WHERE status='issued'` → `redeemed` |
| תשובה | `already_used` על ניסיון שני |
| לוג | `voucher_scan_log` לכל ניסיון |
| Idempotency | אותו בקשת הצלחה כפולה לא משחררת ledger פעמיים |
| Rate limit | על חתימות כושלות / burst |

Screenshot sharing: לא ניתן למנוע; חד-פעמיות ב-DB היא ההגנה.

---

## 4. Offline supplier scan fallback

### 4.1 לקוח

- מציג QR/קוד מה-cache (Mobile V2)
- לא מבצע redeem

### 4.2 ספק (יעד זהיר)

| מצב | התנהגות |
|---|---|
| Online | redeem מיידי מול API |
| Offline | סריקה נשמרת בתור מוצפן במכשיר: payload + timestamp + member_id |
| חזרה לרשת | flush לפי סדר; שרת מיישם אותם כללי already_used |
| התנגשות | שרת מנצח; אם כבר redeemed → סימון מקומי failed/already_used |

מגבלות:

- תור offline קצר TTL (למשל 24–48ש)
- לא לאשר "הצלחה סופית" לקופה בלי ACK שרת (רק "בתור לאימות")
- מדיניות עסקית: חלק מהספקים יידרשו online-only ב-day-0

---

## 5. Rotation on suspected leak

חשד: סוד ב-git, לוג ציבורי, מכשיר נגנב עם secret, burst invalid_hmac.

```text
1. CHECKOUT_ENABLED נשאר (או כיבוי הנפקת קופונים חדשים בלבד)
2. Generate new VOUCHER_QR_SECRET (v2)
3. Deploy server verifying v2; optionally accept v1 for grace window
4. Re-sign issued vouchers OR force customers to open /account/coupons for fresh QR
5. Revoke grace on v1 after window
6. Audit scan logs for abuse
7. Rotate related secrets if shared material
```

תיעוד: תאריך רוטציה, גרסת מפתח, האם נדרש re-issue ללקוחות.

מייל ללקוחות רק אם QR ישנים מושבתים לפני שהם מימשו (נוסח זהיר, בלי פאניקה).

---

## 6. Display and transport security

| ערוץ | כלל |
|---|---|
| `/coupon/[id]` | רק בעלים; אין QR לאורח |
| מייל | קישור חתום או QR מצורף; לא secret גולמי |
| Push | בלי payload מלא |
| Logs | מסכת קוד; לא לוג secret |

---

## 7. Acceptance

- [ ] Payload חתום עם exp + vid + sid
- [ ] Replay → already_used
- [ ] Secret לא ב-client
- [ ] Offline supplier מדיניות מתועדת (queue או online-only)
- [ ] נוהל רוטציה כתוב ובדק ב-tabletop

---

## 8. Revision

| Date | Change |
|---|---|
| 2026-08-03 | מסמך ראשוני על arch/docs-queue |
