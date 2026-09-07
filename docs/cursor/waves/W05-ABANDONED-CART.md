# W05 Abandoned cart

Code-agent spec. Cron and table already exist. This wave makes the **existing** recovery **correct**, not a second engine.

**Already live.** `GET /api/cron/abandoned-cart` (Bearer `CRON_SECRET`), `abandoned_cart_nudges`, `fn_due_abandoned_carts`, unique `cart_id` (one nudge forever by design). MEGA-BLOCK-AUDIT STEP 15: a second 24h incentive email was **rejected** (spam, 30א', wallet enum).

---

## What the wave builds

1. Eligibility: non-empty sellable lines, not checked out, owner has not paid since, consent `marketing_email` (newsletter confirmed). WhatsApp marketing is W30, not this wave.
2. Deep link `/cart`. Re-price on open. Do not honour jsonb unit prices from `carts.items`.
3. Suppress if any line is now unsellable or fails `isImplausibleDiscount` (do not nudge the ₪1 master row).
4. Copy must not promise a stale ₪.
5. Admin visibility of nudge rows. No blast UI.

**Do not build.** Second touch with 5% wallet credit. New `abandoned_cart_incentive` wallet type. A second unique key that allows one nudge per day (that is a product reversal of the unique `cart_id`).

---

## Tables

| Table | Write? |
|---|---|
| `abandoned_cart_nudges` | Insert on send (service_role cron). Unique `cart_id`. |
| `carts` | Read `items` jsonb + `updated_at`. Do not trust prices inside jsonb. |
| `newsletter_subscribers` / consent | Read. No send without confirmed marketing consent. |
| `email_suppressions` | Skip suppressed addresses. |
| `notification_outbox` | Only if the kind is already in `notification_outbox_kind_check`. If abandoned-cart mail is a direct Resend call today, do not invent a new kind without W45. |
| `orders` | `fn_due_abandoned_carts` already excludes owners who ordered since. |

---

## RLS

Cron uses service_role. Clients must not INSERT nudges. View `v_abandoned_cart_recovery` is service_role. Anon must not SELECT other people's carts (existing `carts` policy: constructed `session_id=` cookie).

---

## Money invariants

- Re-price through `src/lib/commerce/money.ts` / cart pricer on click.
- No float percent incentive.
- Do not snapshot client prices into the email.
- Master SKU / 95% ceiling: if the guard would refuse checkout, do not nudge.

---

## Tests that must exist before close

| Test | If deleted |
|---|---|
| Cron 401 without Bearer | Open mailer |
| Unique `cart_id` still one nudge | Spam |
| No send without marketing consent | 30א' |
| Unsellable / implausible line skips the cart | Nudge to a ₪1 test SKU |
| Double scheduler (Actions + 162) does not double-send (unique + Resend idempotency) | Two emails |

Existing: `src/app/api/cron/abandoned-cart/route.test.ts`, `cron-schedule-inventory.test.ts`.

---

## Feature flag

`KILL_SWITCH_NOTIFICATIONS` already skips outbound mail. Off: events stay, send skipped. Do not add `FF_ABANDONED_CART` that bypasses consent.

---

## Docs to update

`POST-LAUNCH-ROADMAP.md` P3, `OUTBOX-CONTRACT.md`, `LAUNCH-BLOCKERS.md` (H1 Resend is a dependency, not this wave).

---

## Edge cases

- Guest cart: no email unless an address was collected with consent. Do not scrape Cardcom.
- Cart edited after nudge: unique `cart_id` means no second mail. That is intended. Do not "fix" it.
- Checkout in flight: pending order must exclude the cart.
- Two schedulers: SQL unique is the guard; do not enable 162 and Actions together (W49 / playbook 162).

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| Subject (recommend) | שכחת משהו בעגלה בקינון אקספרס |
| CTA | חזרה לעגלה |
| Do not quote ₪ | Never put a unit price in the body. Name the products, link `/cart`. |
| Unsellable skip | (no email) |
| Unsub footer | להסרה מרשימת הדיוור |

Abandoned cart is **marketing** (30א'), not transactional. The footer must not look like an order confirmation.

---

## Open questions

| Q | Best answer |
|---|---|
| Second email at 24h with 5% wallet? | **No.** Unique `cart_id`, 30א', wallet enum. MEGA-BLOCK STEP 15. |
| New outbox kind? | Only if CHECK + `buildNotification` move together (contract OUTBOX). If today's cron calls Resend directly, do not invent a kind in this wave. |
| Guest without email? | **No send.** |

---

## Depends on / close

Depends on H1 (Resend delivers) and H5 (cron 200). Does not block W49 storefront. Close: consent, re-price, unique, tests, no wallet incentive.
