# Seeding

There is **one database** — the hosted Supabase project. `supabase start`
does not run on this machine (Docker wedges; see memory + STATE 2026-08),
and the migration files describe a different lineage than production anyway,
so "seed a fresh local DB" is not a thing this repo can do. Every seed below
therefore writes to the hosted project, is idempotent, and cleans up after
itself.

## The scripts

| Script | What it writes | Guard |
| --- | --- | --- |
| `scripts/seed-test-data.mjs` | The deterministic E2E fixtures: 1 supplier, 1 category, 1 coupon + 1 physical product, a customer and a supplier-member user, all on fixed UUIDs in the `…-0e02b2c3d###` namespace | Upserts only; `--check` reports, `--clean` removes exactly what it created |
| `scripts/seed-catalogue.mjs` | Emits SQL for the catalogue seed rather than executing it (the local service key is not this project's — `docs/CONTRADICTIONS.md` + memory) | Output is reviewed and applied by a human via MCP |
| `scripts/seed-catalogue.mjs --demo` | The demo-production profile (CLOSEOUT step 16): 3 suppliers, 40 physical, 20 coupons on the `d3e30000-…` namespace, through the same emitter. Data in `scripts/seed/demo-data.mjs` | Same as above: `--sql` / `--clean-sql` emit only; never executed by a script |
| `scripts/wp-import/` | The full WordPress migration pipeline. **Already ran to completion 07.08** (61→80 products, idempotent on `products.wp_id`) | Dry-run by default; writes need `WP_IMPORT_ALLOW_WRITES=1` **and** `--apply` |

## Environment

`seed-test-data.mjs` reads, from the environment or `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`)

Note the standing trap: the `SUPABASE_SECRET_KEY` in the checked-out
`.env.local` is the stock demo key and the hosted project rejects it.
Scripts fail with "Invalid API key" while MCP keeps working — that is the
key, not the script.

## Why there is no `seed-dev.mjs` with 20 fake products

The mega-block spec (STEP 21) asked for one. With production as the only
reachable database, 20 invented products, 3 invented suppliers and 4 role
users would land **in the live catalogue** next to the 80 real imported
products — visible on the storefront, indexed by the sitemap, and counted by
every report. The E2E fixtures above already give tests something stable to
hold, in a namespace `--clean` can remove. A wider dev seed becomes safe the
day a disposable database exists, and not before.
