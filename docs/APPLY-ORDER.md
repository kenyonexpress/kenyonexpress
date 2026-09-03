# Production migration apply order

This is the sequence that hits production. It is derived from the files in
`migrations/pending/` and from what was already measured as applied on
`ixvwfbuvfxxsjiywhbbb` on 2026-09-01. Invented numbers (148, 149, ...) do not
exist yet. When they are written they append here, never in the middle.

**Do not `db push`.** Apply one file at a time through the approved migration
path after a human has read it. Rollback of *code* is `git revert` of the
deploy SHA (see the bottom of this file). Rollback of *schema* is the SQL in
the Rollback column of `migrations/pending/README.md`, not a second deploy.

Highest applied number in `supabase/migrations/` is 129. Pending files skip
128 and 129 on purpose. 142 is parked (the in-place money rewrite). It is
mutually exclusive with 138-141 and must never be applied.

## Remaining (apply in this order)

```
122 → 125 → 126 → 127 → 131 → 132 → 133 → 137 → 147
```

| Order | File | Why it is still pending | Rollback (short) |
| --- | --- | --- | --- |
| 1 | `122_deny_all_on_server_only_tables.sql` | Explicit deny-all policies on server-only tables. No effective permission change. | Drop the `deny_all_client_roles` policies |
| 2 | `125_expire_vouchers_drop_escrow.sql` | Finishes the escrow removal in `expire_vouchers()` | Restore the body from `085_voucher_scan_audit_and_no_escrow.sql` |
| 3 | `126_percent_range_checks.sql` | `CHECK (0..100)` on unconstrained percent columns | Drop the twelve `*_range` constraints |
| 4 | `127_homepage_cms.sql` | `banners` + `homepage_sections` | `DROP TABLE` both |
| 5 | `131_refunds.sql` | `refunds` table. Holds no money truth | `DROP TABLE public.refunds` and the two enums |
| 6 | `132_search_index_outbox.sql` | Outbox + trigger on `products` | Drop trigger, functions, table |
| 7 | `133_supplier_branches.sql` | `supplier_branches` | `DROP TABLE public.supplier_branches` |
| 8 | `137_order_transition_guard.sql` | Status-transition guards. Constrains the service role | Drop the three status triggers + audit_log guards |
| 9 | `147_money_agorot_remaining_twins.sql` | Generated `_agorot` twins for the four money columns 138-141 missed | `DROP COLUMN` the four generated twins |

122 is first because it is the only remaining file below 125. After 147 the
next file, when written, is 148.

## Already applied (do not apply again)

Verified 2026-09-01 against the live database (the effect, not only
`schema_migrations`). Re-running any of these is at best a no-op and at worst
a collision.

| File | Production version / note |
| --- | --- |
| `123_products_whatsapp_enabled.sql` | `20260901013104` |
| `124_categories_sort_order.sql` | Effect present. No `schema_migrations` row. Do not re-run |
| `130_payment_events.sql` | `20260901013413` |
| `134_order_items_delivered_at.sql` | `20260901013122` |
| `135a_product_type_recurring.sql` | `135a_product_type_recurring` |
| `135b_recurring_subscriptions.sql` | `135b_recurring_subscriptions` |
| `136_supplier_coordinates.sql` | `20260901013134` |
| `138_money_agorot_money_path.sql` | Collapsed apply. Two columns landed in 147 instead |
| `139_money_agorot_wallet.sql` | Collapsed apply with 138-141 |
| `140_money_agorot_catalog.sql` | Collapsed apply with 138-141 |
| `141_money_agorot_growth.sql` | Collapsed apply with 138-141 |
| `143_revoke_unused_definer_execute.sql` | `20260821041759` |
| `144_revoke_authenticated_dml.sql` | `20260831140841` |
| `145_revoke_check_rate_limit_execute.sql` | `20260831184356` |
| `146_wallet_balance_floor.sql` | `20260901013143` |

## Parked (never apply)

142, the in-place money rewrite, was deleted from `migrations/pending/` on
2026-09-01. It collides with 138-141 on nine column names. The additive path
won. See `docs/DECISIONS.md`.

## One-command code rollback

Vercel deploys this repository through its GitHub integration. There is no
second `vercel deploy` in Actions (see `.github/workflows/README.md`). The
production alias follows `main`. Reverting the commit that is live, and
pushing that revert to `main`, is the deploy rollback.

Terminal, from the repo root, after reading the SHA off the Vercel
deployment:

```bash
git fetch origin main
git checkout main
git pull origin main
git revert --no-edit <production-sha>
git push origin main
```

That is the whole code rollback. Vercel builds the revert. Do not run
`vercel rollback` and `git revert` of the same SHA. They race.

If that SHA also applied a file from the Remaining table, git revert does
**not** undo SQL. Apply the Rollback column for that file before or with the
revert, never after a second deploy has written new rows into the new shape.

The GitHub Action `Production rollback (print only)` on
`workflow_dispatch` prints these commands. It does not push, and it does not
talk to Vercel. A workflow that mutated production from Actions would need a
token this repository must not hold.

## Gated production deploy

Production is gated by the required checks on `main` (see
`docs/GITHUB-SETTINGS.md` and `docs/CI-AND-BRANCH-PROTECTION.md`), then by
the Vercel GitHub integration building `main`. Preview deployments are
created per pull request by the same integration. An ephemeral Supabase
branch is created by `.github/workflows/preview-supabase.yml` only when
`SUPABASE_ACCESS_TOKEN` and `SUPABASE_PREVIEW_PROJECT_REF` are set, and never
against the production ref `ixvwfbuvfxxsjiywhbbb`.
