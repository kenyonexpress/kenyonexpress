# DB-HARDENING-AUDIT.md

AUTOPILOT queue step (10), measured against production rather than assumed.

Date: 2026-08-19. Project `ixvwfbuvfxxsjiywhbbb`, Postgres 17.6.1.111, `eu-north-1`.
Method: `get_advisors` (security + performance) and read-only `execute_sql` over MCP.
**Nothing was applied. No DDL was executed. `migrations/pending/125` is a draft.**

---

## 0. The headline

**The step's EXIT criterion, "0 WARN advisors", is not reachable without
breaking the application.** That is not a reason to skip the step; it is the
finding the step produced. §3 explains it with the number that settles it.

The queue's description of the work is also **stale in five of its six items**.
Most of it was already done by commit `0f8359bc`.

| Queue text | Measured today |
|---|---|
| "40 `auth_rls_initplan`" | **0.** Not one. Already wrapped in `(select auth.uid())` |
| "72 `multiple_permissive_policies`" | **13** |
| "4 duplicate indexes" | **0** |
| "35 missing FK indexes" | **0** |
| "24 SECURITY DEFINER fns" | **26**, and they are the bulk of the remaining WARNs |
| "8 `rls_enabled_no_policy`" | **8**, and all 8 are INFO and deliberate (§4) |

---

## 1. Full advisor state

### Security: 34 lints

| Count | Level | Rule |
|---|---|---|
| 22 | **WARN** | `authenticated_security_definer_function_executable` |
| 4 | **WARN** | `anon_security_definer_function_executable` |
| 8 | INFO | `rls_enabled_no_policy` |

### Performance: 144 lints

| Count | Level | Rule |
|---|---|---|
| 130 | INFO | `unused_index` |
| 13 | **WARN** | `multiple_permissive_policies` |
| 1 | INFO | `auth_db_connections_absolute` |

**Total WARN: 39.**

---

## 2. What the 26 SECURITY DEFINER functions are actually for

The advisor cannot tell a helper that RLS policies call from an endpoint that
strangers can call. That distinction is the entire question, so it was measured:

```sql
select f.fn, count(p.policyname)
  from fns f
  left join pg_policies p on p.schemaname = 'public'
   and (coalesce(p.qual,'') || ' ' || coalesce(p.with_check,'')) like '%' || f.fn || '(%'
 group by f.fn;
```

| Function | Policies referencing it | REST callsites in `src/` |
|---|---|---|
| **`is_admin()`** | **79** | 0 |
| `has_role(text)` | 17 | 0 |
| `is_support()` | 8 | 0 |
| `current_user_role()` | 7 | 0 |
| `is_supplier_member(uuid)` | 6 | 0 |
| `is_supplier_owner(uuid)` | 4 | 0 |
| `is_supplier_order(uuid)` | 1 | 0 |
| `is_supplier_shipping_order(uuid)` | 1 | 0 |
| `check_rate_limit(...)` | 0 | 1 |
| `fn_record_recent_search(text)` | 0 | 1 |
| `redeem_voucher(...)` | 0 | 2 |
| `log_voucher_scan(...)` | 0 | 1 |
| `verify_supplier_staff_pin(text)` | 0 | 1 |
| `voucher_success_payload(vouchers)` | 0 | 0 |
| `fn_ensure_referral_code(uuid)` | 0 | 0 |
| `fn_wallet_cashback_amount(...)` | 0 | 0 |
| `fn_wallet_cashback_percent(...)` | 0 | 0 |
| `supplier_app_context()` | 0 | 0 |
| `current_supplier_id()` | 0 | 0 |

---

## 3. Why "0 WARN" would take the site down

**`is_admin()` is referenced by 79 policies.**

Revoking `EXECUTE` on it from `authenticated`, which is what the advisor's first
suggested remediation says to do, does not quietly reduce a warning count. A
policy expression is evaluated with the privileges of the querying role, so
those 79 policies would begin raising `permission denied for function is_admin`
for every signed-in user on every table they guard.

The same applies, at smaller blast radius, to `has_role` (17), `is_support` (8),
`current_user_role` (7), `is_supplier_member` (6) and `is_supplier_owner` (4):
**123 policy references across six functions.**

And five more are called over REST by the application with a **user-session
client**, not the service key, so `authenticated` genuinely needs `EXECUTE`:

- `redeem_voucher` — `src/app/api/supplier/vouchers/redeem/route.ts:247` and `redeem-batch/route.ts:146`
- `log_voucher_scan` — `src/server/domain/vouchers/scan-context.ts:74`
- `verify_supplier_staff_pin` — `src/app/api/supplier/app/pin/route.ts:52`, through `identityScopedClient`
- `check_rate_limit` — `src/lib/utils/rate-limit.ts:17`, and **`anon` needs this one**, because guest rate limiting runs on the guest's own client
- `fn_record_recent_search` — `src/lib/search/record.ts:52`, deliberately called on the shopper's own client so owner-only RLS enforces ownership rather than application code

**So 20 of the 26 WARNs are the advisor describing the architecture correctly
and disapproving of it.** The functions are `SECURITY DEFINER` on purpose: they
are what makes RLS expressible at all. Clearing those warnings means **moving
them out of the exposed API schema**, into a `private` schema, and rewriting
every one of the 123 policy references to match. That is a real project, it is
worth doing, and it is not a warning sweep.

---

## 4. The 8 `rls_enabled_no_policy` are correct as they stand

```
legacy_percent_archive_112   payment_webhook_events   rate_limits   referral_signals
search_index_dlq             settlement_events        stock_reservations   user_rate_limits
```

Every one is a service-key-only table: a money journal, a queue, a limiter store
or an archive. **RLS enabled with zero policies denies every client role**,
which is exactly the intended configuration, and it is why these are INFO rather
than WARN.

`ARCHITECTURE-SECURITY-HARDENING.md` §4.5 item 2 already states this rule:
a table with no policy is a bug only when the absence is unintended. **Adding
policies here to satisfy a linter would loosen a control, not tighten one.**

---

## 5. The provably safe subset: six functions

Measured to have **zero policy references, zero view references, zero calls from
any other function, and zero REST callsites in `src/`**:

```sql
select c.fn,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname <> c.fn
           and p.prosrc like '%' || c.fn || '(%')  as called_by_other_fns,
       (select count(*) from pg_policies pol ...)  as in_policies,
       (select count(*) from pg_views v ...)       as in_views
  from cand c;
```

| Function | other fns | policies | views | REST |
|---|---|---|---|---|
| `current_supplier_id()` | 0 | 0 | 0 | 0 |
| `fn_ensure_referral_code(uuid)` | 0 | 0 | 0 | 0 |
| `fn_wallet_cashback_amount(...)` | 0 | 0 | 0 | 0 |
| `fn_wallet_cashback_percent(...)` | 0 | 0 | 0 | 0 |
| `supplier_app_context()` | 0 | 0 | 0 | 0 |
| `voucher_success_payload(vouchers)` | **1** | 0 | 0 | 0 |

`voucher_success_payload` is called by one other function. That caller is
`SECURITY DEFINER`, so the inner call runs as the definer and the outer role's
grant is irrelevant, but it is listed rather than hidden because it is the one
row in this table that is not a clean zero.

Revoking `EXECUTE` from `anon` and `authenticated` on these six removes **6 of
39 WARNs with no reachable code path affected**. That is
`migrations/pending/125_revoke_unused_definer_execute.sql`, and it is **a draft,
not applied**.

---

## 6. `multiple_permissive_policies`: 13 WARN

Not addressed in this pass, and deliberately so. Consolidating permissive
policies is a **correctness** change wearing a performance label: two policies
that each look right are OR'd together, so merging them can only be done by
reading both and deciding what the combined rule should be, per table, by hand.
Thirteen of those next to a production launch is the wrong order of work, and
`ARCHITECTURE-SECURITY-HARDENING.md` §4.6 already records why overlap matters.

## 7. `unused_index`: 130 INFO

Left alone. An index unused **today** on a catalogue with 80 products and 4
orders is not evidence that it is unused, it is evidence that the site has not
launched. Dropping indexes before the traffic that would justify them arrives is
optimising against a sample of nearly zero.

---

## 8. Recommendation, in order

| # | Action | Risk | Blocked on |
|---|---|---|---|
| 1 | Apply draft `125` (six unused definer functions) | none measured | Ofir's approval to run DDL on production |
| 2 | Accept the 8 `rls_enabled_no_policy` as intentional; record it | none | nothing |
| 3 | Move the 8 policy-helper functions to a `private` schema and rewrite 123 policy references | **high**, needs a staging rehearsal | a real project, not a sweep |
| 4 | Consolidate the 13 `multiple_permissive_policies`, per table, by hand | medium | post-launch |
| 5 | Revisit `unused_index` | none | real traffic |

**The EXIT criterion should be restated** from "0 WARN advisors" to "0 WARN
advisors that are not a deliberate, documented architectural choice". As written,
the only way to satisfy it is to break the site.
