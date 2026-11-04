# S14: transfer coupon

Queue item S14, 04.11.2026. Task: an unredeemed voucher can be transferred to
another email, the recipient claims it, and the old voucher's status becomes
`transferred`. Tests.

## What already existed (read before writing anything)

Most of S14 was built in S10 and earlier. Nothing was rebuilt.

| Piece | Where | State before S14 |
|---|---|---|
| Send a coupon you own to an email | `transferVoucher` in `src/server/actions/gifts.ts`, form at `/account/coupons/<id>/gift` | Works. Mints a hashed claim token on the owner's row and queues one `voucher_gifted` mail to the address typed. Guards in the UPDATE: owner, `status = issued`, no unclaimed link. Rate limit 20 an hour. Revocable (`revokeVoucherTransfer`). |
| Eligibility | `transferEligibility` in `src/lib/gifts/transfer.ts` | Only `issued`, not expired, and no pending link. Redeemed, expired, refunded, cancelled and transferred coupons are refused. |
| Recipient claim | `/gift/<token>` page, `claimGift` | Works. The recipient signs in and opens the link. |
| Old row becomes `transferred` | `transfer_voucher_on_claim` (migration 254, **applied in S10**), called through `src/server/domain/vouchers/transfer.ts` | One transaction with the source row locked. The old row goes to `transferred` and the recipient gets a new row with a new code, QR and 8-digit pin. Order line, money snapshot and `expires_at` stay the same. The rows point at each other. The status guard allows only `issued -> transferred`. |
| Delivery mail | `voucher_gifted` | Still sent. The S12 policy lists it under `REQUESTED_CUSTOMER_EMAIL_KINDS`, because a person pressed send (`src/lib/email/automatic-email-policy.ts`). |
| Labels | `coupon-view.ts`, `admin/voucher-view.ts` | `transferred` is shown as "הועבר במתנה". At the counter it reads as `cancelled` (`redemption.ts`). |

## Gaps S14 closed

1. **"To another email" was not enforced.** An owner could send a coupon to
   their own address. That would mint a link, blank the code on their own
   screens, and mail themselves. Claiming it back would retire the row and
   re-issue it to the same person. `transferVoucher` now returns `SELF`
   ("אפשר להעביר קופון רק לכתובת מייל של אדם אחר") when the recipient matches
   the session's email. The comparison trims and ignores case. It runs
   before any read, write or rate-limit hit. The pure check is `isOwnAddress`
   in `src/lib/gifts/transfer.ts`.
2. **The sender could claim their own pending link.** If the owner opened the
   link while signed in, the RPC retired their row and issued it back to
   them. The recipient's link was spent, and no revoke was recorded.
   `claimGift` now returns `OWN_GIFT`, pointing the owner to the revoke
   action, and calls no RPC. This also covers a sender with no email on the
   session (phone sign-in), where check 1 cannot match.

Both messages arrive through `result.error`, which the existing forms already
render (`GiftClaimForm`, `VoucherTransferForm`). No component was touched.

## Decisions made alone

1. **The claim link is a bearer token. It is not tied to the recipient's
   address.** The sender may know an email that is not the one the recipient
   signs in with. Tying the claim to that address would turn a valid gift into
   a dead end. The link is a 256-bit token that is mailed only to the address
   typed and stored only as a hash. The sender can revoke it until it is
   claimed. This is how the purchase-time gift has always worked.
2. **No migration.** Production already has the enum value, the RPC and the
   grants (probe below).
3. **A refund after a transfer** is still governed by S13. It refunds the
   order's `issued` rows, which includes the recipient's. The `transferred`
   row is left alone, because the guard forbids leaving a terminal state.

## Files

| File | Change |
|---|---|
| `src/lib/gifts/transfer.ts` | `isOwnAddress`. |
| `src/server/actions/gifts.ts` | `SELF` in `transferVoucher`, `OWN_GIFT` in `claimGift`. |
| `src/lib/gifts/transfer.test.ts` | 2 cases for `isOwnAddress`. |
| `src/server/actions/gifts-transfer.test.ts` | New `S14 transfer coupon` block: self-address refusal, owner self-claim refusal, and end to end (send to another email, then recipient claims through the RPC with the audit showing `issued -> transferred`, then the retired row cannot be sent again). |
| `docs/INDEX.md`, `README.md` | Index row, document count 295 to 296. |

## Proof

### Production, read-only probe (04.11.2026)

```
$ supabase db query --linked -f /tmp/s14probe.sql
  "labels": "cancelled,expired,issued,redeemed,refunded,transferred",
  "rpc": 1,
  "anon_exec": false,
  "auth_exec": false,
  "transferred_rows": 0
```

The enum value and the RPC are live. Only `service_role` can execute the RPC.
No real coupon has been transferred since S10.

### Targeted

```
$ pnpm vitest run src/lib/gifts src/server/actions/gifts-transfer.test.ts src/server/domain/vouchers
 Test Files  16 passed (16)
      Tests  237 passed (237)
```

### Full suite

```
$ pnpm test
 Test Files  655 passed | 1 skipped (656)
      Tests  7883 passed | 13 skipped (7896)
exit 0
```

That is 5 tests more than S13's 7,878, and they are the 5 added here.

### Type-check and lint

```
$ pnpm type-check
tsc exit 0

$ <the pnpm lint chain, with biome scoped to src scripts migrations>
lint exit 0
docs-index-gate: OK. 296 documents, all listed; 2 out-of-docs row(s) resolve.
```

A bare `pnpm lint` exits 1, but only on `.lighthouseci/lhr-*.json`. That
folder is untracked and was left by another session. Biome refuses the files
because they are over 1 MiB. None of them is a file of this item, and they were
not deleted, because deleting files is a stop rule.

### Design freeze gate

```
$ git diff --stat design-locked-2026-10-19 -- src/components src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
 .../turnstile/SupplierApplyChallenge.tsx           | 49 +++++++++++++++
 src/components/turnstile/TurnstileRefresh.tsx      | 71 ++++++++++++++++++++++
 2 files changed, 120 insertions(+)
```

Neither file existed at the tag (`git cat-file -e` fails on both). This item
touched nothing under `src/components`.
