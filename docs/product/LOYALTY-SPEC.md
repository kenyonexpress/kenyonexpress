# Loyalty spec

Status: DRAFT · docs only  
Companions: `docs/ARCHITECTURE-ACCOUNT-WALLET.md`, `.claude/skills/cardcom-payments/SKILL.md`, `docs/OFIR-APPROVALS.md` (D4: launch cashback 0%)

Wallet credit is site credit only. It never withdraws to a bank, card, Bit, or another user. All amounts: integer agorot. Display ₪.

This spec binds the product: **every 5th paid order credits 5% cashback** on the on-site charge. Schema seed exists (`cashback_rules`, `קאשבק 5% בכל רכישה חמישית`). Checkout HEAD currently applies `products.cashback_percent` (default 0) and **does not call** `fn_wallet_cashback_*`. Treat the 5th-order rule as **PLANNED wiring** on top of a LIVE wallet.

Launch D4 (0% cashback) stays until the owner turns the rule `is_active` and the finalize path reads it. Do not show "5% קאשבק" on PDP while the rule is off.

---

## 0. Currencies

| Name | What it is | Status |
|---|---|---|
| Wallet ILS | agorot ledger via `fn_wallet_transfer` only | LIVE |
| Cashback | wallet credit, reason `order_cashback` | LIVE plumbing, 0% default |
| Points | 1 point = 1 agorot of qualifying on-site spend, for badges/tiers only, **not** a second spendable currency | PLANNED |
| Tiers / badges / streaks | derived from paid orders + points | PLANNED |

Do not let points be spent. Spending is wallet ILS at checkout (`order_spend`).

---

## 1. Every 5th order, 5% cashback

### 1.1 Count

```
paid_orders = COUNT(*) FROM orders
WHERE user_id = :id AND paid_at IS NOT NULL AND deleted_at IS NULL
```

The current order is included (count after `paid_at` is set in the same finalize transaction). When `paid_orders % 5 = 0`, the order is a cashback order.

Coupon and physical both count. Wallet-only paid orders count. Gift purchases count for the **buyer**, not the claimant.

### 1.2 Amount

```
base = charged_on_site_agorot   -- what Cardcom + wallet covered on the site
cashback = round_once(base * 5 / 100)
```

Never use deal face value or till remainder as `base`. If `base = 0`, skip.

Cap per order (product floor): `min(cashback, 25000)` agorot (₪250) until finance sets another `max_cashback_*` on the rule row.

Credit through `fn_wallet_transfer` reason `order_cashback`. Idempotent on `order_id`.

### 1.3 Clawback

Refund or cancel of a cashback order: debit wallet for the cashback granted on that order. If balance is too low, record `cashback_reversal_debts` and block further cashback until settled. Do not take it from a card.

A refund that drops the user off a multiple of 5 does not "ungive" a previous 5th-order credit except the refunded order's own cashback.

### 1.4 Hebrew copy

Rule name (seed):

```
קאשבק 5% בכל רכישה חמישית
```

PDP / checkout (only if rule active):

```
כל הזמנה חמישית שמשולמת באתר מקבלת 5% קאשבק לארנק. הקאשבק מחושב ממה ששולם באתר, לא מהיתרה בבית העסק. הארנק לא ניתן למשיכה.
```

Success line:

```
הזמנה מספר {n} אצלנו. נכנס לך קאשבק של {amount} לארנק.
```

Not a 5th order:

```
עוד {k} הזמנות לקאשבק 5% על התשלום באתר.
```

Email subject (LIVE template):

```
נכנס לך קאשבק של {amount}
```

Email body:

```
זיכינו את הארנק שלך ב-{amount} על הזמנה {ref}. אפשר להשתמש בסכום בקנייה הבאה באתר. אין משיכה למזומן ואין העברה לכרטיס.
```

CTA: `לארנק שלי` → `/account/wallet`

Wallet note (LIVE):

```
הארנק משמש לתשלום חלקי או מלא באתר. אין משיכה למזומן ואין העברה למשתמש אחר.
```

Ledger labels: `קאשבק על רכישה` · `שימוש בארנק` · `החזר על ביטול` · `זיכוי ידני` · `קרדיט על קופון שפג`

Forbidden: "החזר לכרטיס", "כסף במזומן", "5% על שווי הדיל".

---

## 2. Points (PLANNED)

| Event | Points |
|---|---|
| Paid order | `charged_on_site_agorot` (1:1 agorot, display as נקודות) |
| Refund | minus the points of the refunded on-site amount |
| Cashback credit | 0 extra points (already counted via the order) |

Display on `/account` as an integer, never as ₪. Points are a progress bar for tiers, not a checkout tender.

Hebrew:

```
נקודות מועדון
הנקודות מציגות את מחזור התשלום באתר. אי אפשר לשלם איתן. התשלום מהארנק או מהכרטיס.
```

---

## 3. Tiers (PLANNED)

Qualifying volume = sum of `charged_on_site_agorot` on paid, non-deleted orders in a rolling 12 months (Asia/Jerusalem), after refunds.

| Tier | Name | Min volume (agorot) | Perks |
|---|---|---|---|
| 0 | רגיל | 0 | 5th-order cashback only |
| 1 | כסף | 200000 (₪2,000) | badge; no extra cash % |
| 2 | זהב | 800000 (₪8,000) | badge; cashback cap per order 50000 agorot |
| 3 | פלטינום | 2500000 (₪25,000) | badge; support SLA note only, still no cash-out |

Perks must not become extra cashback percent stacked on the 5% rule without a new `cashback_rules` row. Default: badges + cap lift only.

Hebrew names above are customer-facing. Do not use English tier names in the UI.

---

## 4. Badges (PLANNED)

Account header chips, Hebrew, not a public PDP flex:

| Badge | Earn |
|---|---|
| הזמנה ראשונה | first `paid_at` |
| קאשבק ראשון | first `order_cashback` credit |
| רצף 3 | streak 3 (see §5) |
| מממש | first voucher `redeemed` |
| זהב / פלטינום | tier |

No invented "99% מרוצים" badge. No purchase-count lie on product cards.

---

## 5. Streaks (PLANNED)

A streak month is a calendar month in Asia/Jerusalem with at least one paid order. Streak = consecutive months ending in the current month (or last month if we are still in a grace of 7 days into the new month).

Break: a full calendar month with zero paid orders after the grace.

Hebrew:

```
רצף הזמנות
חודש עם לפחות הזמנה אחת ששולמה באתר. החודש נספר לפי שעון ישראל.
```

Streak does not multiply cashback. It only feeds the רצף 3 badge.

---

## 6. Flags (abuse and ops)

Human review via `agent_flags`. No autonomous freeze of wallet from an agent.

| Flag | Threshold | Action |
|---|---|---|
| `cashback_velocity` | more than 20000 agorot cashback earned+spent in 48h | review |
| `refund_abuse` | 3+ refund requests / user / 30 days | review; pause cashback credits |
| `wallet_multi_account` | 3+ accounts same phone/device earning referral or cashback | review |
| `loyalty_self_deal` | same payment token on buyer and a referred account | no cashback on that order |

Budget alarm (ops, not customer): benefits (cashback + referrals) > 12% of platform take in a calendar month. Turn the rule `is_active=false` rather than silently cutting percents.

---

## 7. Abuse limits

| Limit | Value |
|---|---|
| Wallet withdraw | never |
| Wallet transfer to another user | never |
| Max units per order | 5 (D5) |
| Cashback base | on-site only |
| 5th-order while rule off | 0 credit, no PDP promise |
| Referral + 5th-order cashback | both allowed on different bases; referral is fixed agorot, cashback is 5% of on-site. Same first order may qualify for both only if referral settings are live. Do not double-count as two 5% |
| Guest orders | no cashback until merged into a user (count starts at first paid as that user) |
| Staff / supplier test orders | exclude `deleted_at` and admin-flagged test profiles |

---

## 8. Acceptance

- Finalize either applies the 5th-order 5% rule or the rule is `is_active=false` and the UI is silent. Never a PDP lie.
- Base is on-site agorot. Remainder at the business is out.
- Clawback on refund. Wallet never cash-out.
- Points/tiers/badges/streaks are display only until tables exist; cashback must not wait on them.
