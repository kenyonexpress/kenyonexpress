# Data retention and deletion

This pack lives under
`docs/cursor/`
on branch
`ke-cursor-docs`.
It is markdown only.

Root
`docs/DATA-RETENTION.md`
(2026-09-01) says there is no deletion endpoint. **That is stale.** Live tree:

- Customer action
  `deleteAccount`
  in
  `src/server/actions/account.ts`
- Pure planner
  `src/lib/account/delete-account.ts`
  (typed phrase
  `מחק את החשבון שלי`)
- RPC
  `fn_anonymize_user`
  (migration 150) with a non-atomic service-role fallback if
  `PGRST202`
- Monthly cron
  `/api/cron/retention`
  →
  `fn_audit_retention_sweep`
  (157 pending: IPs in
  `audit_log`
  null after 365 days)
- Cart reaper
  `/api/cron/reap-carts`
  (in
  `scripts/cron-jobs.json`,
  GitHub Actions; not Vercel Hobby cron)

Privacy policy:
`src/app/(legal)/_content/privacy.ts`
at
`/legal/privacy`,
section id
`retention`,
heading
`תקופות שמירה ומחיקת חשבון`.

Policy classes (as published):

| Class | Promise |
|---|---|
| A | Account/contact while active + a reasonable period after |
| B | Financial records for tax/bookkeeping law, **even after deletion** |
| C | Coupons/redemptions for disputes / limitation |
| D | Security logs for a short period |

The policy does **not** hard-code "seven years". Code comments and
`DELETION_EFFECTS`
do (Israeli bookkeeping practice). If legal wants a number in the policy, that is a human copy change, not a schema change.

---

## 1. What a deletion request must touch

Confirmation: exact phrase, trimmed, not case-fuzzed.

Order of operations (load-bearing):

1. Read email **before** hash (goodbye mail).
2. Anonymize data (RPC or fallback).
3. Soft-delete
   `auth.users`
   (`deleteUser(id, true)`).
   **Hard** delete cascades to
   `profiles`
   and **orphans orders**. Forbidden.

### 1.1 Erased (category A)

| Target | How |
|---|---|
| `profiles.email` | `deleted+<md5(id)[:16]>@anonymized.invalid` |
| `profiles.full_name` | `משתמש שנמחק` |
| `profiles.phone` | `null` |
| `user_addresses` | delete rows |
| `payment_tokens` | delete (fallback column
`profile_id`) |
| `push_tokens` | delete |
| `carts` | delete |
| `user_recent_searches` | delete |
| Auth login | soft-disable |

Fallback satellite loop is listed in
`runDeleteAccount`.
RPC 150 is the atomic version of the same story. Prefer applying 150 over living on the fallback.

### 1.2 Kept (category B)

`orders`,
`payments`,
`invoices`,
`audit_log`
(and the anonymized
`profiles`
row they still FK).

Also kept in practice because they are books or dispute evidence, even if not in the four-line
`DELETION_EFFECTS.kept`
array:

| Table | Why it must survive | PII leftover |
|---|---|---|
| `order_items` | Snapshots, commission | Supplier name snapshot, not the buyer name |
| `payment_events` | Append-only trigger. Schema **refuses** ordinary DELETE | Provider payload in
`detail` |
| `refunds` | Statutory | `reason_he`, actor ids |
| `wallet_accounts` /
`wallet_entries` | Ledger | `user_id` of the anonymized profile |
| `vouchers` /
`voucher_redemptions` | Category C | Gift fields, IP/UA on redemptions |
| `split_executions` /
`settlement_events` | Settlement | No extra contact |
| `email_suppressions` | **Must remember opt-out.** Deleting this to "honour erasure" re-mails them | email |
| `notification_outbox` | Proof we sent / dead-letter | `recipient_email` |

`DELETION_EFFECTS`
is the UI/test contract. A SAR (subject access) checklist must include the extra tables above or you will under-collect.

### 1.3 What the fallback can miss vs 150

If 150 adds satellites not in the TS loop, a fallback delete **leaves them**. Operator: apply 150; do not extend the loop on a docs branch. Code branch must keep the list and the SQL function identical.

Gift columns on
`vouchers`
/
`orders`
(`gift_recipient_email`,
name, message,
`gift_claim_token_hash`):
not in
`DELETION_EFFECTS.erased`.
**Open:** whether a deletion must hash gift recipients on orders the user **sent**. See
`docs/cursor/OPEN-QUESTIONS.md`.

---

## 2. Automatic clocks (what actually runs)

Scheduler: GitHub Actions,
`scripts/cron-jobs.json`,
Bearer
`CRON_SECRET`.
If Actions quota dies, **nothing ages out**.

| Job | Path | Period | Effect |
|---|---|---|---|
| reap-carts | `/api/cron/reap-carts` | 03:40 daily | `fn_reap_expired_carts`. Default cart
`expires_at`
~30 days, bumped on write.
`abandoned_cart_nudges.cart_id`
is
`ON DELETE SET NULL`
(101) so nudge history survives. |
| retention | `/api/cron/retention` | 05:00 on day 1 | `fn_audit_retention_sweep`: NULL
`audit_log.ip_address`
older than 365 days. WHO/WHAT stay. Until 157: HTTP
`ok: true, pending: '157_audit_ip_retention'`. |
| expire-vouchers | `/api/cron/expire-vouchers` | 23:15 daily | Status
`expired` (redeemability). **Not** row deletion. |
| abandoned-cart | `/api/cron/abandoned-cart` | hourly | Nudges, not erasure. |
| notifications | `/api/cron/notifications` | */5 | Drain outbox. Does not delete sent rows. |

`cleanup_rate_limits`
exists; it is not the monthly retention job. Rate-limit rows are short-lived **if** that cleanup is invoked (limiter path / opportunistically). Do not promise GDPR-short
`rate_limits`
without checking the caller.

---

## 3. Table map (personal data)

### 3.1 Identity (A)

| Table | Fields | Clock |
|---|---|---|
| `profiles` | email, name, phone, role | Until deletion anonymize; row remains |
| `user_addresses` | name, phone, address | Soft
`deleted_at`
in schema; **hard delete** on account erasure |
| `push_tokens` | device token | Erased with account |
| `auth.users` | email, phone (Supabase) | Soft delete with account |

### 3.2 Money (B) — indefinite by design

`orders`
(including gift columns),
`order_items`,
`payments`,
`payment_events`
(cannot delete),
`payment_webhook_events`
(raw callbacks; admin must use service client),
`invoices`,
`refunds`,
`wallet_*`
live pair.
Fossil
`wallet_balances` /
`wallet_transactions`:
0 rows, do not write, still personal if ever filled.

### 3.3 Vouchers (C)

`vouchers.expires_at`
governs scan, not DELETE.
`voucher_redemptions`
stores
**`ip_address`,
`user_agent`**,
staff, every outcome including
`not_found`.
That is D-shaped data on a C clock. Tension is unresolved: dispute evidence vs "short security logs". 157 only ages
`audit_log`
IPs, **not** redemption IPs.

### 3.4 Security / product (D)

| Table | Clock as implemented |
|---|---|
| `audit_log` | Forever for actor/action; IP NULL after 365d **once 157 applied** |
| `search_events`,
`user_recent_searches` | Searches erased on account delete; events table not in the fallback loop |
| `rate_limits` | Short if cleanup runs |

**Category D "short period" is not fully implemented.** Search events and redemption IPs grow until a human writes another pending file.

### 3.5 Marketing

| Table | Rule |
|---|---|
| `newsletter_subscribers` | Consent UA + email. Deletion request should remove or hash; confirm 150. |
| `email_suppressions` | Keep. |
| `abandoned_cart_nudges` | Survives cart reap. Contains email. Deletion should drop or hash; confirm 150. |
| `referrals` / `affiliates` / `referral_signals` | `user_id` remains as books if commissions exist. |

---

## 4. What a human SAR (access) must export

Not implemented as a button. Operator with service_role + audit:

- `profiles` (even anonymized)
- `user_addresses` (if any left)
- `orders` + items + payments + invoices + refunds
- `vouchers` + redemptions
- `wallet_entries`
- `notification_outbox` rows to that email
- `audit_log` for that
  `actor_id`
- Newsletter / nudges / referrals

Do not dump
`payment_webhook_events`
raw into an email. It is a provider blob.

---

## 5. What must not be "fixed" by deletion

- Dropping
  `email_suppressions`
  for the same person.
- Hard-deleting
  `auth.users`
  (orphans money).
- Deleting
  `payment_events`
  (trigger will fight you; the fight is correct).
- Zeroing
  `order_items`
  snapshots to hide a price (that is destroying books).
- Using erasure to unwind a refund dispute.

---

## 6. Launch notes

Applying 150 and 157 is **human** (
`docs/cursor/LAUNCH-BLOCKERS.md`
does not list them as DNS-day; they are privacy completeness). Until 157, policy line D is a promise without a sweeper. Until 150, deletion still works via fallback and is **not atomic**.

Cron must stay on GitHub Actions. A privacy sweeper that exists only as a route nobody calls is the 2026-09-01 failure mode. The inventory test is what keeps the four lists in sync.
