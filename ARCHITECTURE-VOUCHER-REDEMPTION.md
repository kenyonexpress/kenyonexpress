# ARCHITECTURE: Voucher Redemption

Status: authoritative for the voucher lifecycle as of 2026-07-24.
Supersedes every earlier escrow / payout description of the coupon flow
(`ARCHITECTURE-SUPPLIER-PORTAL.md` sections on escrow, `047_checkout_settlement.sql`
escrow tables, `docs/ARCHITECTURE-SUPPLIER-REDEMPTION.md`). Those documents stay
in the tree for the legacy `coupon_codes` path; nothing in this document depends
on them.

---

## 0. Business model (source of truth)

| Rule | Meaning |
| --- | --- |
| `coupon_price` | An absolute shekel amount the admin sets on the product page. Not a percent. |
| Online charge | The customer pays exactly `coupon_price` on the site through Cardcom. Nothing else is charged online. |
| Balance | `remaining_amount_due = full_price - coupon_price`. The customer pays it at the business, in cash or on the business terminal, at scan time. The platform never touches it. |
| Money custody | Everything charged online stays with the platform. There is no escrow, no hold, no payout to the supplier, no split. `platform_percent = 100` for every voucher. |
| Single use | A scan burns the voucher permanently. There is no partial redemption and no re-scan. |
| `offer_valid_until` | Per product calendar deadline. The voucher expires automatically at that instant and the deadline is displayed to the customer on the product page, at checkout and on the voucher itself (Israeli consumer protection law). |
| Tenancy | There is no `tenant_id`. Row visibility is decided purely by `auth.uid()`: a customer sees only their own vouchers, a supplier member sees only vouchers redeemed at their own supplier. |

### 0.1 What is deliberately absent

- No `escrow_holds` row is written for a voucher. The escrow machinery in 047
  belongs to the legacy `coupon_codes` path only.
- No `payout_statements` line is generated on redemption.
- No supplier bank transfer is triggered by a scan.
- No commission arithmetic at redemption time. The commission question was
  already answered at purchase time by `platform_percent = 100`.

### 0.2 Money conservation invariant

```
face_value_agorot = coupon_price_agorot + remaining_amount_due_agorot
```

Enforced by a table level `CHECK`, not by application code. The values are
snapshots taken at issue time. Later edits to the product never move money that
was already charged.

All money is stored as integer agorot. Never floats. `src/lib/commerce/money.ts`
is the only conversion surface.

---

## 1. Component map

```
Purchase (Cardcom paid webhook)
  |
  v
issueVoucher()                      src/server/domain/vouchers/issue.ts
  |  generateVoucherCode()          src/server/domain/vouchers/code.ts
  |  signQrPayload()                src/server/domain/vouchers/qr.ts
  v
public.vouchers  (status = issued)
  |
  |  customer view: /account/vouchers
  |    QR image (qrcode -> data URL, server rendered)
  |    short code, status badge, valid-until, balance due
  |
  v
supplier scan: /supplier/scan
  |    POST /api/supplier/vouchers/redeem
  |      1. auth.getUser()                       -> 401
  |      2. resolveSupplierMembership()          -> 403
  |      3. checkUserRateLimit('voucher_scan')   -> 429
  |      4. verifyQrPayload() (HMAC, timing safe) or short code
  |      5. rpc redeem_voucher(code, supplier, idempotency_key)
  v
public.vouchers  (status = redeemed, redeemed_at, redeemed_by_supplier_id)
public.voucher_redemptions  (append only audit of every attempt)
```

Layering rule: everything that can be decided without the database lives in
`src/server/domain/vouchers/` as pure functions with unit tests. Everything that
needs atomicity lives in the `redeem_voucher` SQL function. The API route is a
thin adapter between them.

---

## 2. Data model

### 2.1 `public.voucher_status`

```
issued | redeemed | expired | cancelled | refunded
```

`used` is deliberately not reused from `public.coupon_status`; the new enum is a
separate type so the legacy path cannot drift into the new one.

### 2.2 `public.vouchers`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `code` | text unique not null | 10 chars, Crockford base32, `CHECK` on the alphabet |
| `qr_payload` | text not null | `KEV1.<payload-b64url>.<hmac-b64url>` |
| `qr_key_id` | text not null | key id for HMAC rotation, default `v1` |
| `order_id` | uuid not null | restrict |
| `order_item_id` | uuid not null | cascade with the item |
| `product_id` | uuid not null | restrict |
| `supplier_id` | uuid not null | restrict, the business that may redeem |
| `user_id` | uuid not null | owner, `auth.users` |
| `status` | voucher_status not null default `issued` | |
| `face_value_agorot` | integer not null | full price at the business, snapshot |
| `coupon_price_agorot` | integer not null | charged online, snapshot |
| `remaining_amount_due_agorot` | integer not null | collected at the business |
| `platform_percent` | numeric(5,2) not null default 100 | `CHECK = 100` |
| `offer_valid_until` | timestamptz not null | consumer facing deadline |
| `expires_at` | timestamptz not null | effective TTL, see 3.3 |
| `issued_at` | timestamptz not null default now() | |
| `redeemed_at` | timestamptz | |
| `redeemed_by_supplier_id` | uuid | which supplier actually redeemed |
| `redeemed_by_user_id` | uuid | which supplier member scanned |
| `redeemed_amount_collected_agorot` | integer | what the business reported collecting |
| `cancelled_at` | timestamptz | |
| `refunded_at` | timestamptz | |
| `status_reason` | text | free text for cancel / refund |
| `created_at` / `updated_at` | timestamptz | `set_updated_at` trigger |

Constraints:

- `vouchers_conservation`: `face_value_agorot = coupon_price_agorot + remaining_amount_due_agorot`
- `vouchers_platform_percent_full`: `platform_percent = 100`
- `vouchers_code_format`: `code ~ '^[0-9A-HJKMNP-TV-Z]{10}$'`
- `vouchers_redeemed_fields`: `status = 'redeemed'` implies `redeemed_at`, `redeemed_by_supplier_id` and `redeemed_by_user_id` are all non null, and the converse for non redeemed rows
- `vouchers_expires_within_offer`: `expires_at <= offer_valid_until`

Indexes: unique on `code`; `(user_id, status)`; `(supplier_id, status)`;
`(order_item_id)`; partial `(expires_at) WHERE status = 'issued'`;
partial `(redeemed_by_supplier_id, redeemed_at DESC) WHERE status = 'redeemed'`.

### 2.3 `public.voucher_redemptions`

Append only. One row per redemption **attempt**, successful or not. This is the
audit trail a dispute is settled with.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `voucher_id` | uuid null | null when the code did not resolve |
| `code_entered` | text not null | truncated to 32 chars |
| `supplier_id` | uuid null | the scanning supplier |
| `scanned_by` | uuid null | the scanning user |
| `scan_method` | text | `camera` or `manual` |
| `outcome` | voucher_scan_outcome not null | see 4.2 |
| `idempotency_key` | text unique | client supplied, scoped per supplier |
| `amount_collected_agorot` | integer | echo of the balance due on success |
| `metadata` | jsonb not null default `{}` | |
| `created_at` | timestamptz not null default now() | |

Single use arbiter: `voucher_redemptions_one_success_per_voucher`, a partial
unique index on `(voucher_id) WHERE outcome = 'success'`. Even if the conditional
`UPDATE` guard were ever removed, a second success row cannot be inserted.

`idempotency_key` is unique across the table: a retried HTTP request with the
same key hits the unique violation, the function detects it, and replays the
stored outcome instead of redeeming twice.

### 2.4 Product columns added

| Column | Type | Notes |
| --- | --- | --- |
| `products.coupon_price_ils` | numeric(12,2) | absolute online price of the coupon, admin set |
| `products.offer_valid_until` | timestamptz | calendar deadline of the offer |

`coupon_price_ils` is validated against `price_ils` by
`products_coupon_price_within_price`: when both are present,
`0 < coupon_price_ils <= price_ils`. A coupon product cannot go live without
both fields; that is enforced in the admin form and by `issueVoucher()`, which
refuses to issue when either is missing rather than inventing a default.

---

## 3. Code generation

### 3.1 Alphabet and entropy

Crockford base32 minus the ambiguous letters: `0123456789ABCDEFGHJKMNPQRSTVWXYZ`
(32 symbols, no I, L, O, U). 10 symbols gives 32^10 = 2^50 = 1.1e15 possible
codes. The code is read aloud and typed by hand at a counter, so it is grouped
for display as `XXXXX-XXXXX` but stored and compared without the separator.

Generation is `crypto.randomBytes` with rejection sampling, never
`Math.random()` and never a modulo of a byte (which would bias the first 8
symbols of the alphabet).

### 3.2 Collision handling

Two layers:

1. `generateUniqueVoucherCode(exists)` retries up to 8 times, asking the caller
   supplied `exists` probe each round. At 2^50 possible codes and a realistic
   corpus below 10^7 the probability of a single collision is under 1e-8, so a
   retry is already a near impossible event.
2. The database `UNIQUE(code)` is the real arbiter. `issueVoucher()` catches
   `23505` on insert and retries the whole generate-and-insert cycle. After the
   retries are exhausted it throws `VoucherCodeCollisionError`. It never
   silently reuses or mutates a code.

Codes are never derived from the order id, the user id or a counter. A guessable
code is a free lunch at the counter.

### 3.3 TTL

```
expires_at = min(issued_at + product.coupon_expiry_days, product.offer_valid_until)
```

`offer_valid_until` always wins. If the product deadline has already passed at
purchase time, `issueVoucher()` refuses to issue rather than minting a dead
voucher.

Expiry is enforced in three places, deliberately redundant:

- `redeem_voucher()` treats `expires_at <= now()` as expired regardless of the
  stored status, so a lazy sweep can never let a stale row be redeemed.
- `expire_vouchers()` is a service role sweep that flips `issued -> expired`.
- The customer UI derives the badge from `expires_at` as well as `status`.

---

## 4. Redemption

### 4.1 QR payload

```
KEV1.<base64url(JSON payload)>.<base64url(HMAC-SHA256(secret, header + '.' + payload))>
```

Payload fields: `v` (1), `c` (code), `s` (supplier id), `u` (user id),
`e` (expiry unix seconds), `k` (key id).

- The MAC covers the full `KEV1.<payload>` prefix, so the version cannot be
  swapped without breaking the signature.
- Key material comes from `VOUCHER_QR_SECRET`. `VOUCHER_QR_SECRET_PREVIOUS`
  is accepted on verify only, which makes rotation a two deploy operation with
  no invalidated vouchers.
- Comparison is `timingSafeEqual` on equal length buffers.
- The payload carries no personal data beyond opaque ids; it is not an
  authorization token. Possession of a valid payload proves the QR was minted by
  the platform, nothing more. Single use is still decided by the database.

This replaces the legacy `verifyQrPayload` in
`src/server/domain/orders/redemption.ts`, whose digest is a bare `sha256` with
no secret and is therefore forgeable by anybody who reads this repository. The
legacy function is left untouched for the legacy path and is not used by any
voucher code.

### 4.2 Outcomes

`public.voucher_scan_outcome`:

| Outcome | HTTP | Meaning | Told to the scanner |
| --- | --- | --- | --- |
| `success` | 200 | Redeemed now | full detail, including balance to collect |
| `already_redeemed` | 409 | Was redeemed before | when and by whom, own supplier only |
| `expired` | 409 | Past `expires_at` or status `expired` | the deadline |
| `cancelled` | 409 | Order cancelled before redemption | generic |
| `refunded` | 409 | Money returned to the customer | generic |
| `wrong_supplier` | 404 | Valid voucher of another business | reported as `not_found` |
| `not_found` | 404 | No such code | `not_found` |
| `invalid_signature` | 404 | QR failed the HMAC check | `not_found` |
| `unauthorized` | 401/403 | Not logged in, or not a supplier member | generic |
| `rate_limited` | 429 | Over 30 scans per minute per user | generic |

Anti enumeration: `wrong_supplier`, `not_found` and `invalid_signature` all
return the same body to the caller. The precise outcome is recorded in
`voucher_redemptions` so support and fraud review still see the truth.

### 4.3 Atomicity

`redeem_voucher(p_code, p_scan_method, p_idempotency_key)` is
`SECURITY DEFINER`, runs in one transaction, and does exactly one write that can
change money state:

```sql
UPDATE public.vouchers
SET status = 'redeemed', redeemed_at = now(), ...
WHERE code = p_code
  AND supplier_id = v_supplier_id
  AND status = 'issued'
  AND expires_at > now()
RETURNING * INTO v_voucher;
```

The row lock taken by the first transaction serialises concurrent scans. The
loser re-evaluates the predicate after the winner commits, matches zero rows,
and reports `already_redeemed`. No advisory locks, no `SELECT ... FOR UPDATE`
dance, no read-then-write window.

Double scan protection therefore has three independent layers:

1. the conditional `UPDATE` predicate (`status = 'issued'`),
2. the partial unique index on successful `voucher_redemptions`,
3. the `idempotency_key` unique index, which collapses a retried HTTP request
   into a replay of the first answer.

### 4.4 Idempotency

The client generates a UUID per scan intent and sends it as
`idempotency_key`. Behaviour:

- Key unseen: normal path, the key is stored on the resulting audit row.
- Key seen and the stored row is a success on the same voucher: the stored
  outcome is replayed, no second redemption.
- Key seen with a different code: rejected as `invalid_request`. Reusing a key
  for a different voucher is a client bug, not something to guess through.

### 4.5 Supplier authorization

The scanning user must have an active `supplier_members` row. The supplier id
comes from that row, never from the request body and never from the QR payload.
A forged payload naming another supplier changes nothing, because the `UPDATE`
predicate compares `vouchers.supplier_id` to the membership derived id.

Users belonging to several suppliers are handled by resolving the membership
that matches the voucher, out of the set of the user's active memberships. A
membership the user does not hold can never be selected.

---

## 5. State machine

```
                 +-----------+
                 |  issued   |
                 +-----+-----+
                       |
     REDEEM ---------> | ---------> redeemed   (terminal)
     EXPIRE ---------> | ---------> expired    (terminal)
     CANCEL ---------> | ---------> cancelled  (terminal)
     REFUND ---------> | ---------> refunded   (terminal)

  redeemed / expired / cancelled / refunded: no outgoing transitions
```

Every non `issued` state is terminal. This is the whole point of the model: once
a voucher leaves `issued` the customer either consumed the value at the business
or got the money back, and nothing can move it again.

### 5.1 Legal transitions

| From | Event | To | Guard |
| --- | --- | --- | --- |
| `issued` | `REDEEM` | `redeemed` | scanning supplier equals `supplier_id`, `now < expires_at` |
| `issued` | `EXPIRE` | `expired` | `now >= expires_at` |
| `issued` | `CANCEL` | `cancelled` | admin or order cancellation, before any scan |
| `issued` | `REFUND` | `refunded` | payment refunded before any scan |

Everything else is illegal and raises `VoucherTransitionError`.

### 5.2 Edge cases and how they are answered

| Case | Answer |
| --- | --- |
| Cancel after redemption | Illegal. `redeemed -> cancelled` is not in the table. The value was already consumed at the business; the platform cannot un-consume it. Handle it as a commercial dispute (`supplier_disputes`), not as a state change. |
| Refund after redemption | Illegal for the same reason. A goodwill refund is a wallet credit, a separate money movement that does not touch the voucher row. |
| Wrong supplier scans | `wrong_supplier` internally, `not_found` to the scanner, audit row written. The voucher stays `issued` and is still redeemable at the right business. |
| Double scan, same supplier, same second | One `UPDATE` wins the row lock. The loser reports `already_redeemed`. Exactly one success row exists. |
| Double submit of the same HTTP request | The `idempotency_key` unique index turns the second into a replay. |
| Scan after `offer_valid_until` | `expired`, even when the sweep has not run yet, because the predicate checks `expires_at > now()`. |
| Scan of a cancelled order's voucher | `cancelled`. Order cancellation flips every `issued` voucher of the order. |
| Refund of a partially scanned order | Only the `issued` vouchers of that order flip to `refunded`. Already redeemed ones are untouched. |
| Customer disputes the balance charged | `voucher_redemptions.amount_collected_agorot` versus the snapshot `remaining_amount_due_agorot` on the voucher. Both are immutable. |
| Product price edited after purchase | Irrelevant. Every money figure on the voucher is a snapshot. |
| Supplier deleted | `ON DELETE RESTRICT`. A supplier with vouchers cannot be hard deleted; suppliers are soft deleted. |
| Expiry sweep never runs | Redemption still refuses expired vouchers. The sweep is a display convenience, not a control. |

### 5.3 Where the machine lives

The transition table is defined once, in
`src/server/domain/vouchers/state-machine.ts`, and mirrored in the SQL function.
The Vitest suite asserts the full cartesian product of states and events so any
future addition to the enum fails loudly until the table is updated.

---

## 6. RLS

`auth.uid()` is the only tenancy signal. No `tenant_id` column exists anywhere in
this feature.

### 6.1 `vouchers`

| Policy | Op | Rule |
| --- | --- | --- |
| `vouchers_owner_read` | SELECT | `user_id = auth.uid()` |
| `vouchers_supplier_read_redeemed` | SELECT | `public.is_supplier_member(redeemed_by_supplier_id)` |
| `vouchers_admin_read` | SELECT | `public.is_admin()` |

The supplier read policy is keyed on `redeemed_by_supplier_id`, not on
`supplier_id`. That is the strict reading of the brief: a supplier sees what was
actually redeemed at their business, not the outstanding vouchers of every
customer who ever bought their product. Outstanding vouchers reach the supplier
only through the scan RPC, one at a time, on presentation of the code.

No INSERT, UPDATE or DELETE policy exists on `vouchers`. Issuing happens in the
service role path; redemption happens in `redeem_voucher()`, which is
`SECURITY DEFINER` and therefore bypasses RLS by design. A compromised supplier
session cannot flip a status with a direct `UPDATE`, because there is no policy
that would allow it.

### 6.2 `voucher_redemptions`

| Policy | Op | Rule |
| --- | --- | --- |
| `voucher_redemptions_owner_read` | SELECT | the row's voucher belongs to `auth.uid()` |
| `voucher_redemptions_supplier_read` | SELECT | `public.is_supplier_member(supplier_id)` |
| `voucher_redemptions_admin_read` | SELECT | `public.is_admin()` |

Read only for everybody. The table is written exclusively by
`redeem_voucher()`.

### 6.3 Function grants

| Function | Granted to |
| --- | --- |
| `public.redeem_voucher(text, text, text)` | `authenticated` |
| `public.expire_vouchers()` | `service_role` |
| `public.cancel_vouchers_for_order(uuid, text)` | `service_role` |
| `public.refund_vouchers_for_order(uuid, text)` | `service_role` |

`REVOKE ALL ... FROM PUBLIC, anon` precedes every grant.

---

## 7. Screens

### 7.1 `/supplier/scan`

Server component guard: `requireSupplierMember()` redirects a non member to
`/login`. RTL, Hebrew, single column, designed for a phone held at a counter.

Flow: enter or scan a code, review what the platform says the voucher is worth,
confirm, collect the balance. The confirm step is explicit and separate from the
lookup because the scanner is standing in front of a customer and a mis-scan
that instantly burns a voucher is unrecoverable.

- Input accepts a raw code (with or without the display hyphen, case
  insensitive) or a pasted QR payload. The client normalises before sending.
- Camera capture uses `BarcodeDetector` when the browser exposes it, and falls
  back to manual entry otherwise. No scanner library is added to the bundle.
- The result panel shows: product name, customer first name, what was paid
  online, and in the largest type on the screen, the balance to collect now.
- Failures are shown in Hebrew, with the generic wording for the anti
  enumeration outcomes.
- Every submit carries a fresh `idempotency_key`, so a double tap on a flaky
  connection cannot double redeem.

### 7.2 `/account/vouchers`

Server component under the existing `/account*` proxy protection. Lists the
signed in customer's vouchers, newest first, active ones before terminal ones.

Each card shows: product, supplier, status badge, the QR as a server rendered
data URL, the short code in grouped form for reading aloud, the amount already
paid, the balance to pay at the business, and the validity deadline with an
explicit "valid until" line as consumer protection law requires.

The QR is rendered only for `issued` vouchers that are still in date. A redeemed
or expired voucher shows the terminal status instead, so nobody presents a dead
QR at a counter.

---

## 8. Files

| Path | Role |
| --- | --- |
| `supabase/migrations/051_voucher_redemption.sql` | schema, RLS, RPCs |
| `src/server/domain/vouchers/state-machine.ts` | transition table, guards |
| `src/server/domain/vouchers/code.ts` | code generation, TTL, formatting |
| `src/server/domain/vouchers/qr.ts` | HMAC sign / verify |
| `src/server/domain/vouchers/redemption.ts` | pure outcome resolution, money |
| `src/server/domain/vouchers/issue.ts` | DB issuing with collision retry |
| `src/server/queries/vouchers.ts` | customer and supplier read queries |
| `src/app/api/supplier/vouchers/redeem/route.ts` | redemption endpoint |
| `src/app/(supplier)/supplier/scan/page.tsx` | supplier scan screen |
| `src/app/(account)/account/vouchers/page.tsx` | customer voucher screen |
| `src/server/domain/vouchers/*.test.ts` | Vitest, full state machine coverage |

Untouched on purpose: `src/lib/payments/**`, `src/server/payments/**`,
`src/server/actions/payments/**` (owned by a parallel branch), every existing
migration, and the legacy `coupon_codes` redemption path.

---

## 9. Environment

```
VOUCHER_QR_SECRET=<32+ random bytes, base64 or hex>
VOUCHER_QR_SECRET_PREVIOUS=   # optional, verify only, for rotation
VOUCHER_QR_KEY_ID=v1
```

Absence of `VOUCHER_QR_SECRET` is a hard failure at sign time and at verify
time. It never falls back to an unsigned or constant key: a default secret in a
public repository is the same as no signature at all.

---

## 10. Open items

- Issuing is wired as a callable domain function. Hooking it into the Cardcom
  paid webhook is left to the payments branch, which owns that file.
- `expire_vouchers()` needs a schedule (pg_cron or a Vercel cron hitting a
  service role route). The system is correct without it; the sweep only keeps
  the displayed status honest.
- Supplier scan history and daily totals are a supplier portal concern and land
  with that branch, reading `voucher_redemptions` through the RLS policy defined
  here.
