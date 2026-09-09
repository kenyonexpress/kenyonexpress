# ARCHITECTURE-REFERRALS.md

ארכיטקטורת **הפניות / שותפים** (referrals & affiliates).

Status: BINDING lite · `ke-arch` · Date: 2026-07-31 · docs only.  
Schema sketch exists in early migrations (`010_referrals_*`); activate only with clear fraud rules.

## Concepts
| Role | Earns when |
|---|---|
| Referrer (customer) | Invitee first paid order (optional wallet credit) |
| Affiliate | Tracked `?ref=` order; payout separately from coupon prepaid |

## Rules
1. Attribution window documented (e.g. 30 days last-click).  
2. Credit is **wallet or affiliate balance**, never card cash-out by default.  
3. Self-referral blocked.  
4. Coupon money model unchanged: platform keeps prepaid.  
5. Admin can claw back on fraud/refund.

## Surfaces
Share link in account · admin affiliates table · KPI: referred GMV.

## Revision
| Date | Change |
|---|---|
| 2026-07-31 | Referrals lite in `ke-arch` (`arch/docs-queue`) |

---

## 2026-09-10: the automatic path was not automatic

Measured against production `ixvwfbuvfxxsjiywhbbb`, from the live function
definitions rather than from reading the TypeScript.

### The defect

| Fact | Evidence |
|---|---|
| `fn_complete_referral` ends the clean case with `{ ok: true, reason: 'ready_to_pay', referral_id }` and leaves `status = 'pending'` | its body; it moves no money and never did |
| `fn_pay_referral(p_referral_id, p_approved_by DEFAULT NULL)` is what moves it | `reviewed_by` / `reviewed_at` are written only when an approver is passed, so the DEFAULT NULL exists for a caller that is not a person |
| the only caller of `fn_pay_referral` in the repo was the admin Approve button | `src/server/actions/admin/referrals.ts` |
| `completeReferralForOrder` logged `ready_to_pay` and returned | `src/server/referrals/complete.ts` |

So with `require_manual_approval` false, which is its default, a referral with
**no fraud signals at all** was marked ready and then sat in
`v_referral_review_queue` waiting for a human. That is exactly what the setting
says is not needed. `ready_to_pay` is an instruction; it was being logged.

The clean referral, the one the fraud guard had nothing to say about, was the
one nothing paid.

### Why calling the payer from the order path is safe

`fn_pay_referral` takes `FOR UPDATE`, answers `already_paid` without moving
anything once the status is `completed`, and both transfers go through
`fn_wallet_transfer` keyed `referral:<id>:referrer` and `referral:<id>:referred`.
A replayed webhook pays nothing twice at two independent layers. It also refuses
before any transfer on `no_reserve_account`, `no_referrer_wallet` and
`no_referred_wallet`, so it cannot half-pay.

Failures are logged and not thrown, for the reason `completeReferralForOrder`
already gives: the card is charged by then, and a throw reaches the webhook as
"payment verified but finalize failed".

### Nobody was ever told

There was no code path enqueueing anything after a referral was paid, and no
kind in `notification_outbox_kind_check` that could have carried one. Both
sides now get exactly one mail, keyed `referral_bonus:<id>:referrer` and
`...:referred` so a replay adds nothing and a failure on one side does not
suppress the other. "One email on credit" is read as one PER CREDIT: two people
were credited and each is owed the sentence about their own money.

`referral_bonus_credited` is its own kind and not a reuse of
`cashback_credited`, which the live constraint already accepts. That one opens
with `נכנס לך קאשבק`, and the referrer bought nothing -- their friend did. The
mail would send them hunting through their own orders for the purchase that
earned it. Same trap `voucher_expiry_credited` was given its own kind to avoid.
The constraint change is `migrations/pending/229`, validated against production
inside a rolled-back `DO` block and not applied. **Unapplied costs the mail and
not the money**: the transfer happens in `fn_pay_referral`, before the enqueue,
and the enqueue degrades on 23514 the way `settlement-reconcile` does for 214.

### The monthly leaderboard shows no one's name, by construction

`buildReferralLeaderboard` returns `{ rank, count, isMe }` and nothing else. No
id, no email, no name. The viewer's id is used on the server to set one boolean
and never reaches the output. That is what makes the one service-role read on
that screen safe: the question ("every referrer this month") is not a per-row
permission, and what leaves the function is arithmetic.

Ties share a rank and the next rank skips (1, 2, 2, 4). The reader's own row is
appended at its true rank when it falls outside the visible table, because a
leaderboard that shows a participant the top ten and not their own standing has
answered everybody's question but theirs. Only `completed` counts: ranking
people by pending referrals would rank them by bonuses that may never be paid.

### Still true, and still deliberate

`referral_program_settings` holds **zero rows**. Its money columns are NOT NULL
with no defaults, so the row cannot exist until somebody decides what a referral
is worth. Every `fn_complete_referral` call therefore returns `program_inactive`
today, and `/account/referrals` says the program is not open rather than
offering a share link next to a bonus of zero. That was already right and is
unchanged.

## Revision
| Date | Change |
|---|---|
| 2026-09-10 | SECTIONS 33: auto-pay on `ready_to_pay`, one mail per credit, monthly leaderboard |
