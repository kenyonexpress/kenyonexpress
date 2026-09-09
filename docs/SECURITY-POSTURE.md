# Security Posture

Threat model, what is enforced where, and the gaps that are real.

Measured against production (`ixvwfbuvfxxsjiywhbbb`) on **2026-09-01**,
including a live Supabase advisor run.

Companion documents: `docs/ROLES-AND-PERMISSIONS.md`,
`docs/DB-SECURITY-MODEL.md`, `docs/INCIDENT-PLAYBOOKS.md`.

---

## 1. What is worth stealing

Ranked by what an attacker would actually want, which is not the same as what a
checklist would rank first.

| Asset | Where | Worst case |
|---|---|---|
| **Voucher value** | `vouchers` | Redeem someone else's voucher, or redeem one twice. Direct theft of goods from a supplier. |
| **Card charges** | Cardcom, `payments` | Cause a charge, or suppress the record of one. |
| **Wallet balance** | `wallet_accounts`, `wallet_entries` | Mint store credit. |
| **Customer PII** | `profiles`, `user_addresses`, `orders` | Names, phones, addresses, purchase history. Israeli privacy law applies. |
| **Supplier commercial data** | `order_items`, `settlement_events` | What a competitor pays in commission. |
| **Admin access** | `profiles.role` | Everything above. |

The first is the one this system is shaped around, because a voucher is a
bearer instrument that gets read aloud across a counter.

---

## 2. Trust boundaries

```
   internet
      │
      ├─ anon ─────────► RLS ────────► Postgres
      │   read catalogue only; write only `carts`
      │
      ├─ authenticated ► RLS ────────► Postgres
      │   ⚠ still holds INSERT/UPDATE/DELETE on 56 relations
      │
      ├─ Cardcom ──────► URL secret + GetLpResult re-fetch
      │   the POST body is NEVER trusted for money
      │
      ├─ QStash ───────► JWS, two rotating HMAC keys
      │
      └─ scheduler ────► Bearer CRON_SECRET
                             │
   Next.js server ───────────┴─► service_role (bypasses RLS)
```

**The service-role client never reaches a browser.** It lives in
`src/lib/supabase/admin.ts` and is used server-side only.

---

## 3. Threats and what stops them

### T-1. Redeem someone else's voucher

**Stopped by:** `redeem_voucher` derives the supplier from `auth.uid()`'s active
`supplier_members` rows and **never takes it from the request**. A scanner at
the wrong business gets `wrong_supplier`, and that answer reveals nothing else
about the voucher: not its status, not its value, not its real supplier.

**Residual:** a supplier employee can redeem any voucher issued against *their
own* supplier without the customer present, if they know the code. Mitigated by
the audit trail rather than prevented: every scan writes
`voucher_redemptions` with IP, user agent, scan method and `staff_id`.

### T-2. Redeem the same voucher twice

**Stopped by:** one conditional UPDATE.

```sql
UPDATE vouchers SET status = 'redeemed', ...
WHERE code = ? AND status = 'issued' AND expires_at > now() AND supplier_id IN (...)
```

There is no window between check and write. Two concurrent scans cannot both
match. **This single statement is the entire single-use guarantee** — neither
grants nor RLS enforce it — and it is sufficient.

### T-3. Forge a QR

**Stopped by:** HMAC-SHA256 over the full `KEV1.<payload>` prefix, so the
version byte cannot be swapped. But more importantly: **the QR is not an
authorization token.** Possession of a valid payload achieves nothing, because
the database decides. A screenshotted QR presented twice gets
`already_redeemed`.

### T-4. Brute-force the voucher code space

**Stopped by:** 32^10 ≈ 1.1e15 codes, plus 30 scans per user per minute via
`check_user_rate_limit`, plus a `voucher_redemptions` row for every failed
attempt. Generation rejects bytes at or above 256 so no symbol is favoured; a
bare `byte % 32` would bias `0`–`7` and shrink the effective space.

### T-5. Forge a payment callback

**Stopped by:** Cardcom **does not sign its callbacks**, so the POST body is an
unauthenticated assertion from the internet and is never trusted for money.
Authenticity rests on an unguessable `?s=` secret compared in constant time
against both the current and retiring value **with no short circuit**, plus a
mandatory server-to-server `GetLpResult` re-fetch whose response is the only
trusted source of amount, status and token.

**Residual:** an attacker who learns the URL secret can cause `payment_events`
rows and a `GetLpResult` call, but cannot cause a finalize for a payment Cardcom
does not confirm.

### T-6. Replay a payment callback

**Stopped by:** dedup on `(provider, external_event_id)`; `23505` means replay,
answered 200 with no action. `finalizeOrder` is separately idempotent on
`orders.status` and `payments.status`.

### T-7. Escalate to admin

**Stopped by:** `enforce_profile_privilege_columns` raises `42501` if `role` or
`supplier_id` changes and the caller is not an admin. This is what makes the
`profiles_update_unified` policy ("you may update your own row") safe.

**Residual:** the trigger returns early when `auth.uid()` is NULL, so
**service-role writes pass unchecked**. Any server code assigning a role carries
the whole responsibility itself.

### T-8. Read another customer's data

**Stopped by:** RLS on all 61 tables, owner predicates written as
`user_id = (SELECT auth.uid())`.

⚠️ **This is the only database-level defence on the money tables.** See §4.

### T-9. Rate-limit-key poisoning

**Was possible, now closed.** `check_rate_limit` was `SECURITY DEFINER`
executable by `anon`, its body inserts `p_key` as given, and it increments the
counter **before** comparing to the maximum. An anonymous caller therefore chose
both the key and the threshold: five calls with `phone-otp-number:<victim>`
locked a known number out of OTP sign-in for an hour, and every call was an
unbounded write of attacker-chosen rows into `rate_limits`.

**Closed by** `127_revoke_check_rate_limit_execute`: `service_role` only.

### T-10. Search-path hijack of a definer function

**Stopped by:** all 61 `SECURITY DEFINER` functions pin `search_path`. **Zero
unpinned.** This closes the class outright.

### T-11. Read past RLS through a view

**Stopped by:** all 12 views are `security_invoker`.

### T-12. Enumerate a supplier's outstanding liability

**Stopped by:** the `vouchers` read policy is gated on
`redeemed_by_supplier_id`, which is NULL until redemption. A supplier sees a
voucher only *after* redeeming it, so they cannot learn how much unredeemed
value is walking around or correlate it to individual customers.

### T-13. Brute-force a staff PIN

**Stopped by:** 15 attempts per hour per staff member at the route, bcrypt cost
on each attempt, and a per-staff lockout (`failed_attempts`, `locked_until`).
The RPC is deliberately callable directly so the portal can use it; the route
exists **purely for the rate limit**, because a four-digit PIN against an
unlimited endpoint is ten thousand tries.

---

## 4. The one structural gap

**`authenticated` still holds INSERT, UPDATE and DELETE on 56 relations**,
including `orders`, `order_items`, `payments`, `vouchers`, `refunds` and every
wallet table. Migration `126_revoke_authenticated_dml` is in the applied ledger.
The grant is still there.

```sql
select grantee, privilege_type, count(distinct table_name)
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon','authenticated')
  and privilege_type in ('INSERT','UPDATE','DELETE')
group by grantee, privilege_type;
-- authenticated | DELETE | 56
-- authenticated | INSERT | 56
-- authenticated | UPDATE | 56
```

**Consequence: RLS is the only database-level defence on the money tables, not
RLS plus a grant.** Every write policy has to be correct on its own; there is no
second layer underneath it.

In practice the policies do hold: writes to `orders`, `order_items` and the
wallet tables are gated on `is_admin()`. But this changes how a change should be
reviewed. A policy that is merely *permissive by accident* is a live
vulnerability here, where in a defence-in-depth setup it would be a hardening
item.

The revoke **did** land on the nine server-only tables, which carry no client
grants at all.

**Recommendation:** re-apply the DML revoke on the money tables. It is additive,
reversible, and the application does not depend on the grant because all
server-side writes go through the service-role client.

---

## 5. Advisor findings, all 21 triaged

A live run on 2026-09-01 returns **21 findings: 4 INFO and 17 WARN.** Every one
is understood; none is unexplained.

### 4 × INFO `rls_enabled_no_policy`

`payment_webhook_events`, `rate_limits`, `search_index_outbox`,
`user_rate_limits`.

**Correct as they stand.** RLS enabled with zero policies **denies every client
role**; only `service_role` and `SECURITY DEFINER` functions pass. A future
audit reading "0 policies" as "unprotected" and adding one would be the mistake.

Five further server-only tables reach the same place through a `RESTRICTIVE`
policy with `USING (false)` and so are not flagged:
`legacy_percent_archive_112`, `referral_signals`, `search_index_dlq`,
`settlement_events`, `stock_reservations`. Nine tables total.

### 4 × WARN `anon_security_definer_function_executable`

| Function | Verdict |
|---|---|
| `is_admin()` | **keep.** Called by RLS policies under the anon role. |
| `is_supplier_member(uuid)` | **keep.** Same. |
| `fn_record_recent_search(text)` | **keep.** Deliberate, so a guest's recent searches work. Takes only a term. |
| `enqueue_search_index()` | **inert.** A trigger function: no arguments, returns `trigger`. Calling it over PostgREST achieves nothing. |

### 13 × WARN `authenticated_security_definer_function_executable`

`current_user_role`, `has_role`, `is_support`, `is_supplier_order`,
`is_supplier_owner`, `is_supplier_shipping_order`, `is_admin`,
`is_supplier_member`, `redeem_voucher`, `supplier_app_context`,
`verify_supplier_staff_pin`, `enqueue_search_index`, `fn_record_recent_search`.

**All intentional.** Six are policy helpers, three are the supplier app's RPC
surface, and `redeem_voucher` is the product.

> **Do not "fix" these to reach zero WARN.** `is_admin()` is referenced by **81
> of the 133 policies**, and a policy expression is evaluated with the
> privileges of the querying role. Revoking `EXECUTE` on it from
> `authenticated` makes those 81 policies raise `permission denied for function
> is_admin` for every signed-in user on every table they guard. The advisor's
> first suggested remediation would take the site down.

The count was 23 before `127_revoke_check_rate_limit_execute` and is 21 now:
the two that disappeared are exactly `check_rate_limit` in both lists.

---

## 6. Application-layer controls

| Control | Where |
|---|---|
| Route guards | `src/proxy.ts`: `/account/*`, `/coupon/*`, `/supplier/*`, `/admin/*` |
| Per-page re-gate | every admin section |
| Per-action guards | behind `withActionContext`, plus `requireSection` |
| Env validation at boot | `src/lib/env.ts` from `instrumentation.ts` |
| Rate limiting | Upstash Redis, else Postgres |
| Audit log | `audit_log`, written by every admin action |
| Error reporting | Sentry, EU region |

**Route guarding is optimistic.** The proxy check is a redirect for humans, not
a security boundary; every page and every action re-checks. Two exclusions are
deliberate and keep getting re-broken:

- **`/checkout` is not gated.** It takes guests; sign-in happens at the pay
  press.
- **`/checkout/frame-return` must not be gated.** Cardcom navigates the payment
  iframe there, cross-site, and browsers withhold `SameSite=Lax` cookies on that
  navigation. Gating it shows a login form inside the payment box of a shopper
  who has just paid.

`/api/health` is deliberately coarse: `ok` plus a reason, no version, no commit,
no env names, no error strings. It is unauthenticated by necessity, so a
detailed health endpoint would be a free inventory of what runs and what is
broken. The full report lives behind `CRON_SECRET` at `/api/cron/health`.

`/api/debug/sentry` answers **404 when off, not 403**, because a 403 confirms
the route exists.

---

## 7. Known gaps

| # | Gap | Severity | Note |
|---|---|---|---|
| 1 | `authenticated` DML on 56 relations | **High** | §4. RLS is the only layer. |
| 2 | No RLS test suite | **High** | Policies are asserted by reading them, never by attempting a forbidden read as `authenticated`. Given gap 1, this is the largest untested surface in the system. `docs/TESTING.md` §7. |
| 3 | No sign constraint on `order_items` money columns | Medium | Eight columns; the tables around them are all constrained. `docs/MONEY-MODEL.md` §3.2. |
| 4 | No conservation constraint on `order_items` | Medium | `face = paid_on_site + balance_due` holds in code and tests, not in the schema. |
| 5 | ~~Migration 137 unapplied~~ | **Closed 2026-09-01** | Applied. `tg_orders_status_guard`, `tg_order_items_settlement_status_guard` and `tg_payments_status_guard` are live; an illegal move raises `23514`. Tables in `docs/PAYMENT-FLOW.md` §2.1. |
| 5a | No transition guard on `vouchers` | Medium | 137 covered three tables and not this one. Double redemption is held off by the atomic `UPDATE ... WHERE status = 'issued'` in the application, which stops a race but not a `service_role` statement. |
| 5b | `audit_log` accepts UPDATE and DELETE | Medium | Zero triggers on the table (`pg_trigger`, 2026-09-01). An editable log is a statement, not evidence. 137 did not cover this either, despite an older doc saying it would. |
| 6 | `super_admin` confers nothing `admin` does not | Low | Not a separation boundary today. |
| 7 | Service-role writes bypass the profile privilege trigger | Low | By design; responsibility moves to server code. |
| 8 | No scheduler | **Operational** | Nothing expires, nothing reconciles, no emails. `docs/OPERATIONS-CALENDAR.md`. |

Gap 2 deserves the emphasis. The security of this system rests almost entirely
on 133 RLS policies, and **not one of them is verified by a test that tries the
attack.** A policy regression would be invisible to CI.

---

## 8. Secret handling

| Secret | Rotation |
|---|---|
| `CARDCOM_WEBHOOK_SECRET` | `_PREVIOUS` accepted during the window |
| `VOUCHER_QR_SECRET` | `_PREVIOUS` plus a `k` key-id inside the QR payload |
| `SUPABASE_SERVICE_ROLE_KEY` | no dual-accept; rotate in a maintenance window |
| `CRON_SECRET` | no dual-accept |
| `QSTASH_CURRENT_SIGNING_KEY` / `_NEXT` | Upstash provides two |

**Rotation order:** set `_PREVIOUS` to the current value first, then set the
primary. The other order rejects every in-flight callback.

Secrets live in Vercel environment variables and `.env.local`, never in the
repository. `.env.example` carries names and shapes only.

> A recurring hazard in this repo: night branches have repeatedly smuggled
> `bypassPermissions` into `.claude/settings.json`. Revert on sight.

---

## 9. Verification

```sql
-- the grant gap in §4
select grantee, privilege_type, count(distinct table_name)
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon','authenticated')
  and privilege_type in ('INSERT','UPDATE','DELETE')
group by grantee, privilege_type;

-- unpinned search_path: expect 0
select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c
                  where c like 'search_path=%');

-- views must all be security_invoker
select c.relname, c.reloptions from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v';

-- policies depending on is_admin: 81 of 133
select count(*) from pg_policies where schemaname = 'public'
  and coalesce(qual,'') || coalesce(with_check,'') like '%is_admin%';
```

Plus the Supabase advisor: `get_advisors(type: 'security')`. Expect 21 findings,
4 INFO and 17 WARN, all accounted for in §5.
