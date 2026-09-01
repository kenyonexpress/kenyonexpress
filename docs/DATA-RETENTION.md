# Data Retention

What is kept, for how long, why, how deletion works, and where each line maps to
the published Privacy Policy.

The Privacy Policy is `src/app/(legal)/_content/privacy.ts`, served at
`/legal/privacy`. Its retention section has the id `retention` and the heading
**"תקופות שמירה ומחיקת חשבון"**.

Read against production `ixvwfbuvfxxsjiywhbbb` and `main` on **2026-09-01**.

> **The headline, stated before the tables so it is not buried.** The Privacy
> Policy promises that an account-deletion request is honoured by
> **anonymising the profile** while keeping the financial records the law
> requires. **No code implements that.** There is no deletion endpoint, no
> anonymisation function, and no scheduled erasure of anything except carts and
> rate-limit rows. A request today is fulfilled by hand or not at all. §6.

---

## 1. The four categories the policy declares

The policy commits to four retention classes. Everything in §3 is mapped to one
of them.

| # | Policy wording (translated) | Period as published |
|---|---|---|
| **A** | Account and contact details | while the account is active, plus a reasonable period afterwards for handling enquiries |
| **B** | Financial records — invoices, transaction confirmations, refund records | the period fixed by tax and bookkeeping law, **even if the account is deleted** |
| **C** | Coupons and redemption records | as long as needed to resolve a dispute with a customer or a business, and for the relevant limitation period |
| **D** | Security logs and technical data | a short period, as needed to investigate incidents and prevent abuse |

**Note what B does and does not say.** It defers to Israeli tax and bookkeeping
law rather than naming a number. That is a defensible drafting choice and it
means this document cannot state "seven years" as a system fact — it is not
configured anywhere in code or schema.

---

## 2. What is enforced automatically

Two things, and only two.

| What | Mechanism | Period | Actually running? |
|---|---|---|---|
| Abandoned carts | `fn_reap_expired_carts(p_limit)` via `/api/cron/reap-carts` | `carts.expires_at`, **default 30 days**, pushed forward on every cart write | **No.** Nothing calls the route. |
| Rate-limit rows | `cleanup_rate_limits()`, `cleanup_user_rate_limits()` | short | Only if invoked. |

**Both depend on the scheduler, and the scheduler does not exist.** Ten cron
routes are defined and `vercel.json` declares none of them
(`docs/FAILURE-MODES.md` §2.1). So in practice **nothing is being deleted
automatically today**.

The cart reaper is worth reading for one design decision it makes explicitly.
`abandoned_cart_nudges.cart_id` was originally `NOT NULL ... ON DELETE CASCADE`,
which would have made the reaper a second, silent deleter of the recovery
history that `v_abandoned_cart_recovery` reports on. Migration 101 changed it to
`SET NULL`:

> The nudge is a fact about a person and an order; the cart is only where it
> happened, and it is the cart that expires.

---

## 3. What is stored, table by table

61 base tables. These are the ones holding personal data.

### 3.1 Identity and contact — category A

| Table | Personal data | Retention as implemented |
|---|---|---|
| `profiles` | `email`, `full_name`, `phone`, `role`, wallet balance | **Indefinite.** No expiry column, no deletion path. |
| `user_addresses` | `full_name`, `phone`, address | **Indefinite.** Has `deleted_at`; soft delete only. |
| `push_tokens` | `user_id`, device token | **Indefinite.** No expiry. |
| `payment_tokens` | Cardcom card token | Cardcom's expiry is tracked (`src/lib/payments/token-expiry.ts`); the row is not removed. |

`auth.users` is Supabase's own table and is outside this schema. Deleting a
profile without deleting the auth user leaves an account that can still sign in.

### 3.2 Orders and money — category B

| Table | Personal data | Retention |
|---|---|---|
| `orders` | `user_id`, `gift_recipient_email`, `gift_recipient_name`, gift message, `address_id` | **Indefinite by design.** `deleted_at` exists and is a soft delete. |
| `order_items` | supplier contact snapshot | Indefinite; `deleted_at` present. |
| `payments` | Cardcom ids, amounts | Indefinite. |
| `payment_events` | full provider payload in `detail` | **Indefinite and append-only by trigger.** It cannot be edited or deleted by any writer. |
| `payment_webhook_events` | raw callback bodies | Indefinite. |
| `invoices` | document numbers and URLs | Indefinite. |
| `refunds` | `reason_he`, `internal_note`, requester and decider | Indefinite. |
| `wallet_*` | `user_id`, balances, entries | Indefinite; ledger. |

**This is the category where indefinite retention is correct**, and where it
must be reconciled against a deletion request rather than obeyed blindly. Policy
line B says these survive account deletion.

> **`payment_events` is the sharpest case in the system.** It is append-only by
> a database trigger, so it is the one table where "delete my data" is not
> merely unimplemented but actively refused by the schema. That is the right
> design for a payment journal and it needs to be a known, deliberate exception
> rather than a surprise during a subject-access request.

### 3.3 Vouchers and redemption — category C

| Table | Personal data | Retention |
|---|---|---|
| `vouchers` | `user_id`, gift recipient name/email/message, `gift_claim_token_hash` | **Indefinite.** `expires_at` governs redeemability, **not** deletion. |
| `voucher_redemptions` | **`ip_address`, `user_agent`**, scanner id, staff id, every attempt including failures | **Indefinite.** |
| `settlement_events`, `split_executions` | money movements | Indefinite. |

**`voucher_redemptions` is the most sensitive table under category C and it is
also the most useful.** It records every scan — successes, `not_found`,
`wrong_supplier`, `rate_limited` — with IP and user agent, because a log that
records only successes cannot answer who tried. Policy line D covers it as
security data; policy line C covers it as dispute evidence. **It is being kept
under C's long clock while its contents are D-shaped.** That tension is real and
is not resolved anywhere today.

### 3.4 Security and technical — category D

| Table | Personal data | Retention |
|---|---|---|
| `audit_log` | `ip_address`, `user_agent`, actor, before/after `changes` | **Indefinite.** 568 rows on 2026-09-01. |
| `rate_limits`, `user_rate_limits` | key, `user_id` | Short — **if** the cleanup functions are invoked. |
| `search_events`, `user_recent_searches` | `user_id`, query text | **Indefinite.** |
| `search_index_dlq`, `search_index_outbox` | product ids, errors | Indefinite. |

**Category D promises "a short period". Nothing implements a short period for
`audit_log`, `search_events` or `user_recent_searches`.** They grow without
bound. This is a gap between the policy and the system, and it is listed in §7.

A second problem in `audit_log`, recorded here because it is a retention
question as much as a security one: the table carries **zero triggers**, so it
accepts `UPDATE` and `DELETE`. Data that can be quietly removed has no retention
period in any meaningful sense.

### 3.5 Marketing and consent

| Table | Personal data | Retention |
|---|---|---|
| `newsletter_subscribers` | `email`, `user_id`, **`consent_user_agent`**, consent timestamps | Indefinite. |
| `email_suppressions` | `email` | **Must be indefinite.** A suppression list works only by remembering; deleting it re-enables mail to someone who opted out. |
| `abandoned_cart_nudges` | `email`, `user_id` | Indefinite; survives cart deletion by design (§2). |
| `notification_outbox` | `recipient_email`, payload | Indefinite. |
| `referral_signals`, `referrals`, `affiliates` | `user_id` | Indefinite. |

`email_suppressions` is the standard privacy paradox and is called out so nobody
"fixes" it: **honouring an erasure request by deleting a suppression row makes
the outcome worse for the person who asked.**

### 3.6 Supplier and business data

`suppliers`, `vendors`, `supplier_branches`, `supplier_leads`, `supplier_staff`,
`supplier_members`. These carry business contact details rather than consumer
data — `contact_email`, `contact_phone`, `address` — and a named individual's
details often sit in them anyway. `supplier_leads` is inbound enquiry data from
people who are not customers. All indefinite.

---

## 4. Cookies and browser storage

Declared in the Privacy Policy's cookie table. **None of this is server-side
retention**; it lives in the visitor's browser.

| Name | Class | Purpose |
|---|---|---|
| `ke_consent` | strictly necessary | remembers the cookie decision, so it is not asked again |
| `ke_cart_mirror_v1` | strictly necessary | keeps cart contents across visits |
| Supabase auth cookies | strictly necessary | keeps the session across pages and visits |

**Consent is versioned.** `src/lib/analytics/consent.ts` treats consent given
against superseded wording as not consent, so changing the policy text re-asks
rather than inheriting. GA4 and the Meta Pixel are behind that consent and are
inert without it — and both are unconfigured today, so nothing is sent
regardless.

### `CONSENT_IP_SALT`

`src/server/actions/newsletter.ts:39` reads it to salt a stored consent IP hash,
and **falls back to the empty string**.

An unsalted SHA of an IPv4 address is a lookup table, not a hash: the whole
address space is 2³², enumerable in seconds. **Unset, the stored "hashed" IP is
reversible by anyone who obtains the database.** Generate with
`openssl rand -hex 16`. It is the cheapest privacy fix available in this system.

---

## 5. What the Privacy Policy promises about rights

From the `rights` section, under Israel's Protection of Privacy Law:

| Right | Promise | Implemented? |
|---|---|---|
| Access | inspect the data held | **No endpoint.** By hand. |
| Correction | correction or deletion under §14, **with an answer within 30 days** | Profile edit exists; correction-on-request has no mechanism. |
| Deletion | account deletion, subject to what the law requires be kept | **Not implemented.** §6. |
| Marketing opt-out | unsubscribe | Implemented — `email_suppressions`. |

Contact for all of them: **info@kenyonexpress.co.il**, or the contact page. The
policy asks the requester to state the account email so the data can be
identified.

**The 30-day answer window is a commitment with no timer behind it.** Nothing
tracks a privacy request, so nothing can report one as overdue.

---

## 6. How deletion works today

### What the policy says

> A request to delete an account will be carried out by **making the profile
> details anonymous**, so that they cannot be attributed to you, while retaining
> the financial records we are legally required to keep. After such deletion we
> will not be able to restore your order history.

That is a good design. Anonymise the identity, keep the money.

### What exists

**Nothing.** Searched across `src/` on 2026-09-01: no `deleteAccount`, no
`delete_account`, no anonymisation routine, no `gdpr`-named helper, and no
database function that scrubs a profile. The only deletion machinery in the
system is the cart reaper and the rate-limit cleanups (§2), neither of which is
running.

### What a request costs right now

A manual sequence, by hand, against production, with no tooling and no audit of
its own:

1. Identify the subject: `profiles.id`, and their `auth.users` row.
2. Anonymise `profiles`: `email`, `full_name`, `phone`.
3. Anonymise `user_addresses`: `full_name`, `phone`, address lines.
4. Anonymise gift fields on `orders` and `vouchers`
   (`gift_recipient_email`, `gift_recipient_name`, gift message).
5. Remove `push_tokens` and `payment_tokens`.
6. Clear `user_recent_searches`; decide on `search_events`.
7. **Keep** `orders`, `order_items`, `payments`, `invoices`, `refunds`,
   `settlement_events`, `split_executions`, wallet rows — policy line B.
8. **Keep** `email_suppressions` — §3.5.
9. **`payment_events` cannot be touched.** Append-only by trigger, and it holds
   the full provider payload.
10. Delete or disable the `auth.users` row, or the account can still sign in.
11. Record what was done. Not in `audit_log` alone, which is editable.

**Eleven steps, no script, no test, and step 9 is a hard limit rather than a
choice.** That is the honest state.

### What would close it

A `SECURITY DEFINER` function that performs steps 2 through 6 in one
transaction, called by an admin action that writes its own audit row. It is
bounded work. It is not written.

---

## 7. Gaps between the policy and the system

Ordered by how exposed they leave the business.

| # | Gap | Policy line | Severity |
|---|---|---|---|
| 1 | **No deletion or anonymisation implementation at all** | deletion right, retention §2 | **High.** A published commitment with no mechanism. |
| 2 | **No retention limit on category D data** | D — "a short period" | **High.** `audit_log`, `search_events`, `user_recent_searches` grow without bound. |
| 3 | **Nothing is deleted automatically**, because nothing is scheduled | A, D | **High.** Even the two implemented reapers do not run. |
| 4 | `CONSENT_IP_SALT` unset makes the stored IP hash reversible | security | **Medium.** One environment variable. |
| 5 | `audit_log` accepts `UPDATE` and `DELETE` | D | **Medium.** No trigger. |
| 6 | No timer behind the 30-day answer window | rights | Medium. |
| 7 | `voucher_redemptions` keeps IP and user agent under category C's long clock | C vs D | Medium. Unresolved by design, not by oversight. |
| 8 | No point-in-time restore configured | — | Medium. Deletion is irreversible; so is an accidental one. |
| 9 | Category B has no configured number anywhere | B | Low. The policy defers to statute, which is defensible. |

**None of these is a code change this branch may make.** They are recorded so
that the first person who has to answer a privacy request finds the map already
drawn.

---

## 8. If a request arrives tomorrow

1. Acknowledge in writing. The policy commits to **30 days**.
2. Identify the subject by the account email, as the policy asks.
3. Access request → `docs/QUERY-COOKBOOK.md` Q4 and Q5 give the order history;
   `profiles`, `user_addresses` and `vouchers` give the rest.
4. Deletion request → §6, by hand, and **write down what you did**.
5. Marketing opt-out → the unsubscribe path already works. Do **not** delete the
   `email_suppressions` row.
6. Tell them what was kept and why: the financial records, under tax and
   bookkeeping law, exactly as the policy says.

---

## Related

| You want | Read |
|---|---|
| The published policy | `/legal/privacy`, `src/app/(legal)/_content/privacy.ts` |
| What the tables are | `docs/DATA-MODEL.md` |
| Who can read what | `docs/ROLES-AND-PERMISSIONS.md`, `docs/DB-SECURITY-MODEL.md` |
| Threats and gaps | `docs/SECURITY-POSTURE.md` |
| A leaked key | `docs/INCIDENT-PLAYBOOKS.md` Playbook 6 |
| `CONSENT_IP_SALT` and friends | `docs/ENV-REFERENCE.md` §3.5 |
