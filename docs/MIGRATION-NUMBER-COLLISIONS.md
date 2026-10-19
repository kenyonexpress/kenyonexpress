# Migration numbers mean two different things, and four of them are already live

Measured 2026-09-08 on `closeout/v1-final`, against `origin/main` and against
production `supabase_migrations.schema_migrations` through the Supabase MCP
tool, read-only.

---

## The one-line version

> **`closeout/v1-final` and `origin/main` have each been numbering migrations
> from the same counter without seeing each other. Seven numbers now name two
> unrelated schema changes, and on the `main` side four of them have already
> been applied to production.**

Nothing here is a corrupt database. Production is fine, and its migration keys
are timestamps, so no key literally collided. What broke is the reference: a
sentence like "apply 170" no longer identifies a migration.

---

## How the branches got here

`origin/main` is **66 commits ahead** of this branch, 234 files and 20,714
insertions. Every one of those commits is authored by an automated agent:
`[autopilot]` commits merged by `[auto-merger]`, running from 2026-09-07 01:53
to 2026-09-08 03:36.

This branch is **128 commits ahead** of `main` on its own side.

`CLAUDE.md` currently says the two branches are identical and that `main`
follows this branch after verification. **That was true on 2026-09-06 and is
not true now.** It is quoted here rather than edited, because which branch is
the mainline is a decision for the owner, not something to settle by rewriting
the document that records it.

---

## The collisions

Same number, unrelated subjects. `main`'s column is the file in
`origin/main:migrations/pending/`.

| # | on this branch | on `origin/main` | state in production |
| --- | --- | --- | --- |
| 148 | `refund_destination` (**applied**) | `orders_monthly_partitioning` | ours applied; theirs not |
| 149 | `audit_log_append_only` (**applied**) | `soft_delete_user_facing_remainder` | ours applied; theirs not |
| 169 | `analytics_server_event_names` | `audit_full_coverage` | **theirs applied** `audit_full_coverage_169` |
| 170 | `composite_indexes_top_queries` | `reporting_tables` | **theirs applied** `reporting_tables_170` |
| 171 | `category_name_shekel_order` | `search_fts` | **theirs applied** `search_fts_171` |
| 172 | `hide_master_product_test_row` | `rls_zero_policy_tables` | **theirs applied** `rls_zero_policy_tables_172` |
| 173 | `products_retired_commission_percent` | `whatsapp_flow` | neither |
| 177 | `set_updated_at_search_path` | `cashback_ledger` | neither |
| 178 | `carts_one_row_per_owner` | `webauthn_credentials` | neither |

The production column is not inferred. It is
`supabase_migrations.schema_migrations`, whose `name` column carries the number
as a suffix:

```
20260907163213  coupon_qr_batches_182
20260904010826  rls_zero_policy_tables_172_report_grants
20260904010757  rls_zero_policy_tables_172
20260904005239  search_fts_171
20260904003703  reporting_tables_170
20260904001341  audit_full_coverage_169
20260903232504  wallet_ledger_client_readonly_168
20260903232455  order_items_money_constraints_167
```

Note `coupon_qr_batches_182`: `main` reached 183 and has already applied 182 to
production. This branch's counter had only reached 177.

---

## What is NOT wrong

Worth stating plainly, because the table above looks worse than the situation
is.

- **This branch's 169-172 are genuinely unapplied.** `migrations/pending/`
  here and the inventory test both say "awaiting approval", and that is
  correct. The applied rows named `..._169` through `..._172` are `main`'s
  files, not these.
- **No production key collided.** Supabase keys migrations by timestamp
  version. Two files numbered 170 would produce two distinct rows.
- **No data is wrong.** Every collision is a documentation and ordering
  problem, not a schema one.

---

## What IS wrong

1. **"Apply 170" is ambiguous**, and the sentence appears in `STATE.md`,
   `migrations/pending/README.md`, `APPLY-ORDER.md` and several commit
   messages on both branches. One of the two 170s is live.
2. **The `APPLY-ORDER.md` on each branch is incomplete**, because each
   describes only its own half.
3. **Both branches will keep colliding** until they share a counter. `main`
   allocates faster - fifteen numbers in about 26 hours.

---

## What was done here, and what was deliberately not

**Done:** the migration written on 2026-09-08 in maintenance pass 6 was
originally numbered 178 and collided with `main`'s `178_webauthn_credentials`.
It was renumbered to **184**, the first number free on both branches, before
anything else was built on it. Its preflight moved with it.

**Not done, on purpose:**

- The other six collisions are **not** renumbered. Four of them name migrations
  that are already applied in production; renumbering a file whose number is
  recorded in `schema_migrations` would make the record harder to read, not
  easier.
- `main` is **not** merged into this branch. Sixty-six commits and 20,714 lines
  of another agent's work, while that agent is still committing, is not a merge
  to perform unattended - this repo has already recorded an autopilot staging a
  conflicted merge in which `git status` reported zero unmerged paths while
  files held raw conflict markers.
- `CLAUDE.md` is **not** edited to say which branch is the mainline.

All three are the same judgement: this is the fourth of the four conditions
`CLAUDE.md` reserves for the owner - *a second code agent running on the same
repo* - and the useful thing an agent can do inside it is measure precisely and
stop, not pick a winner.

---

## The one decision that unblocks the rest

Choose the mainline branch. Everything else follows mechanically:

- if `main`, this branch's ten pending migrations renumber from 184 up;
- if `closeout/v1-final`, it has to absorb 66 commits including four
  migrations already live in production, and the four applied numbers stay
  burned either way.

Until that is chosen, **no migration from either branch should be applied**,
because the apply order across the two is undefined.
