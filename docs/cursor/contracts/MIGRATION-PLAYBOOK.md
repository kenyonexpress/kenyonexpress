# Migration playbook (pending/)

Nothing here is applied by an agent. MCP `apply_migration` after a human yes. No `db push`. Duplicate `\d{3}_` prefixes: **full filename**. `APPLY-ORDER.md` has contradictory history paragraphs; the **directory listing** plus each file header win.

---

## `default_split_percent` (rule violation)

Column on `suppliers` (and archive `legacy_percent_archive_112`). Form leftover. Checkout must **ignore** it. `supplier-form.test.ts` already strips it from parse output. **Removal plan:** (1) grep readers (`product-detail.ts` comment, form) (2) stop prefilling product `platform_percent` from it (3) human migration DROP COLUMN after a deploy that does not name it (4) until drop, treat as unused. Using it as a global rate is C1 violation.

---

## Files on disk (this worktree)

| File | Does | Depends | Breaks if | Preflight | Post-apply check | Rollback |
|---|---|---|---|---|---|---|
| `162_cron_schedule.sql` | pg_cron twelve jobs via vault `cron_secret` + `app_url` | 161 extensions; **vault seeded** | Double-fire with Actions; jobs 401 if secret wrong | `preflight_162.sql` blocks 1–5 | `select jobname from cron.job`; one GET cron 200 | unsched ke-% jobs |
| `preflight_162.sql` | not a migration | | | run first | | n/a |
| `169_analytics_server_event_names.sql` | whitelist 4 server events | 151 ingest | none (additive names) | `preflight_169.sql` | `purchase` row after staging pay | restore 151 function |
| `169_audit_full_coverage.sql` | **different 169** audit columns/triggers | 137 | trigger noise / lock | header in file | `information_schema` columns | header ROLLBACK |
| `170_reporting_tables.sql` | report tables + RPCs | none | wrong GMV if join live products | `preflight_170.sql` | admin report integer | drop tables |
| `170_composite_indexes_top_queries.sql` | **different 170** CREATE INDEX IF NOT EXISTS | none | bloat if duplicate indexes | preflight_170 if shared | `pg_indexes` | DROP INDEX |
| `171_search_fts.sql` | INVOKER `search_products` | products RLS | 42501 if DEFINER dump | file header | anon search equals catalogue | drop fn |
| `171_category_name_shekel_order.sql` | one category name bidi | none | wrong name if WHERE misses | WHERE is the check | `name_he` for under-99 | restore string |
| `172_hide_master_product_test_row.sql` | stock 0 on ₪1 master | none | hides only that id | id in file | stock_quantity = 0 | restore 10 |
| `172_rls_zero_policy_tables.sql` | **different 172** explicit deny | none | loosening if mis-copied | file | policy names | drop policy |
| `148_orders_monthly_partitioning.sql` | partition orders | 137 | FK rewrite risk | **do not casual-apply** | header | expensive |
| `149_soft_delete_user_facing_remainder.sql` | deleted_at + RLS | none | hide rows | header | categories filter | drop column |
| `preflight_169.sql` / `preflight_170.sql` | probes | | | | | n/a |

162: approved, blocked on vault. Do not enable pg_cron **and** GitHub Actions **and** cron-job.org.

148: high risk. Human only with DBA. Prefer skip for v7.

---

## Open questions

| Q | Best answer |
|---|---|
| 166–168 applied? | README says yes 2026-09-04; still verify `schema_migrations`. |

---

## Second pass

Read with `waves/WAVE-INDEX.md` and `business/LAUNCH-BLOCKERS.md`. Tree on this branch wins over older briefs. Do not apply SQL from this worktree.
