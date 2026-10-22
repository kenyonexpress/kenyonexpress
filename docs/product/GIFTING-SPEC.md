# Gifting spec

Status: DRAFT · docs only  
Companions: `supabase/migrations/108_gift_vouchers.sql` (schema exists; do not edit SQL from this file), `src/components/gifts/GiftClaimForm.tsx`

Gifting is for **coupon** lines. Physical gifts are out of v1. Wallet credit is not giftable.

---

## 0. Status

| Piece | Status |
|---|---|
| Checkout gift checkbox (coupon carts) | LIVE |
| Order + voucher gift columns | LIVE |
| Email `voucher_gifted` + `/gift/{token}` | LIVE |
| Claim moves `vouchers.user_id` | LIVE |
| WhatsApp gift message | PLANNED |
| Apple/Google Wallet passes | LIVE for any presentable coupon, not gift-specific |
| Buyer revoke before claim | PLANNED |

---

## 1. Gift flow

1. Cart is coupon-only (or gift applies per coupon line). Physical line: hide the gift checkbox.
2. Checkout checkbox (LIVE):

```
הקופון מיועד למישהו אחר (מתנה)
```

3. Fields (LIVE):

| Field | Rule | UI |
|---|---|---|
| `gift_recipient_email` | required, email | אימייל של מקבל המתנה |
| `gift_recipient_name` | optional, ≤80 | שם המקבל |
| `gift_message` | optional, ≤500 | ברכה |

Placeholder (LIVE):

```
מזל טוב! בקיצור, תיהנו.
```

Privacy (LIVE):

```
אחרי התשלום יישלח למקבל מייל עם קישור אישי לקבלת הקופון. עד שהוא ייאסף הקופון נשאר בחשבון שלכם.
```

4. Pay as the buyer. Voucher is issued to the **buyer** (`user_id` = buyer) until claim.
5. `sendOrderGifts` mints a 32-byte token, stores **SHA-256 only**, queues email with raw token once. Dedupe `gift:{voucher_id}`.
6. Recipient opens `/gift/{token}`, logs in, claims. Ownership moves. `gifted_by_user_id` set. `gift_claimed_at` set. Concurrent claim: `gift_claimed_at IS NULL` guard.

Buyer still sees the voucher in `/account/coupons` until claimed, marked as מתנה ממתינה. After claim it leaves the buyer list.

Recipient never sees the buyer's card or wallet. Buyer never sees the recipient's later redemptions beyond "נאסף".

---

## 2. Claim page

URL:

```
{NEXT_PUBLIC_SITE_URL}/gift/{base64url_token}
```

Metadata: title `קיבלת מתנה`. `robots: noindex,nofollow`. `robots.txt` should `Disallow: /gift/`. Token length 40 to 64. Invalid token: generic error, no oracle on hash existence vs format.

Copy (LIVE):

| State | Hebrew |
|---|---|
| Greeting with name | `{name}, קיבלת מתנה` |
| Greeting | `קיבלת מתנה` |
| Loading | `רגע, טוענים את המתנה…` |
| Expiry | `הקופון בתוקף עד {date}` (he-IL) |
| Unusable | `לא ניתן לקבל את הקופון הזה. אם לדעתכם מדובר בטעות, פנו אלינו.` |
| Already claimed | `המתנה כבר נאספה. אם אתם אספתם אותה, היא נמצאת בקופונים שלי.` |
| Need auth | `כדי לקבל את הקופון לחשבון שלכם צריך להתחבר או להירשם.` |
| Auth CTA | `התחברות וקבלת הקופון` |
| Claim CTA | `קבלת הקופון לחשבון שלי` |
| Pending | `מעביר את הקופון...` |

Errors:

```
קישור המתנה אינו תקין
יש להתחבר כדי לקבל את המתנה
המתנה כבר נאספה
לא ניתן לקבל את הקופון הזה
תוקף הקופון פג
קבלת המתנה נכשלה, נסו שוב
```

After success: redirect `/account/coupons`. Do not show the full `KEV1` payload on the claim page; the coupon page after claim is the place for QR + 10-char code.

Buyer cannot claim their own gift. Same-account claim: error `לא ניתן לקבל מתנה ששלחתם לעצמכם` (PLANNED if HEAD still allows it; spec forbids it).

---

## 3. WhatsApp message (PLANNED)

Email remains the legal delivery (token in mailbox). WhatsApp is an extra ping **if** the buyer typed a recipient mobile and marketing/transactional WA is allowed for this kind.

Do not put the raw claim token in a WhatsApp template if Meta rejects long URLs; send the URL as the only secret. Never send QR images. Never send `KEV1` payload.

Template friendly name: `ke_voucher_gifted`  
Category: UTILITY  
Locale: `he`

Variables:

| n | Meaning |
|---|---|
| `{{1}}` | recipient first name or "שלום" |
| `{{2}}` | sender name |
| `{{3}}` | product name |
| `{{4}}` | claim path `/gift/{token}` |

Body:

```
{{1}},
{{2}} שלח לך מתנה מקניון Express: {{3}}
לאיסוף לחשבון שלך:
https://kenyonexpress.co.il{{4}}
הקישור אישי. אל תעבירו אותו הלאה.
```

If the buyer did not supply a recipient phone: skip WA, email only.

Buyer confirmation WA (optional, to buyer, UTILITY): "המתנה נשלחה למייל שהזנתם." No token in that message.

---

## 4. Wallet passes

Passes are a property of a presentable **issued** voucher, not of the gift email.

- Before claim: buyer may add to Apple/Google Wallet. After claim: buyer pass must update to unusable / removed; recipient may add a new pass.
- Barcode = `qr_payload` byte-identical (`KEV1.<body>.<mac>`). Short code alone will fail scan.
- If Apple/Google credentials are missing: hide buttons, API 404 not 500.
- Hebrew pass fields (existing pass model): `קוד השובר`, `תנאי מימוש`, `הקופון באתר`. Price on the pass is on-site coupon price, not face value.

Gift claim page does not auto-download a pass. Recipient adds it from `/account/coupons` after claim.

---

## 5. Revoke rules (PLANNED UI, spec now)

Revoke = buyer cancels an **unclaimed** gift. Token hash is cleared. Email link dies. Voucher stays on the buyer as a normal issued coupon.

| State | Revoke? |
|---|---|
| Gift sent, not claimed, voucher `issued`, not expired | yes |
| Claimed | no |
| Redeemed | no |
| Refunded / cancelled order | N/A (voucher already dead; token must die with it) |
| Expired unclaimed | auto: token dead, voucher follows expiry policy (wallet credit of on-site amount to **buyer** if that policy runs) |

Hebrew (buyer account):

```
ביטול שליחת המתנה
הקישור למקבל יפסיק לעבוד. הקופון חוזר אליכם.
```

Confirm:

```
לבטל את שליחת המתנה? מי שקיבל את המייל לא יוכל לאסוף את הקופון.
```

Success:

```
המתנה בוטלה. הקופון אצלכם בקופונים שלי.
```

Too late:

```
המתנה כבר נאספה. אי אפשר לבטל.
```

Support: no SQL `UPDATE` on `vouchers.user_id`. Use the claim or revoke path. After redeem, non-transferable.

Refund of a gifted unclaimed order: refund to the **buyer** original method / wallet. Kill the token first.

---

## 6. Email (LIVE)

Kind: `voucher_gifted`  
Dedupe: `gift:{voucher_id}`  
CTA: `קבלת הקופון`

Subject pattern: `{sender} שלח לך מתנה: {product}`  
Footer: `הקישור אישי. אל תעבירו אותו הלאה.`

Payload keys: `product_name`, `sender_name`, `recipient_name`, `gift_message`, `claim_token`, `expires_at`.

---

## 7. Acceptance

- Gift checkbox only on coupon.
- Token hashed at rest. Raw token only in email/WA once.
- Claim requires login and cannot be the buyer.
- Revoke only while unclaimed.
- Passes follow voucher ownership, 404 if unconfigured.
- WhatsApp has no QR image and no PAN.
