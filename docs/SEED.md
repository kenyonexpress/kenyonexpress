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
| `scripts/seed-lifecycle.mjs` | Emits SQL for **8 orders, 8 order items, 7 payments and 5 vouchers - one in every state the database allows** - on the `…-0e02b2c3e9##` namespace, on top of the fixtures above. Data in `scripts/seed/lifecycle-data.mjs` | `--sql` / `--clean-sql` emit only; the SQL raises rather than inserting when the fixture users are absent |
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

## 2026-09-10, SECTIONS 19: nothing seeded an order

`seed-catalogue.mjs` builds a catalogue and `seed-test-data.mjs` builds the E2E
fixtures. **Neither creates a single order**, so every screen whose whole job is
to show an order in a particular state - the refund queue, the expiry engine, the
supplier redemption list, the wallet credit that follows an expiry - could only be
developed against production data or against nothing.

`scripts/seed-lifecycle.mjs` fills that in, from the enums rather than from
imagination. Read off production with `pg_enum` on 2026-09-10:

| Enum | Labels | Covered by |
| --- | --- | --- |
| `order_status` | pending, paid, partially_fulfilled, fulfilled, cancelled, refunded, platform_settled | 8 orders (paid twice: a voucher can only be `expired` under an order that was paid) |
| `payment_status` | initiated, redirected, succeeded, failed, refunded, platform_settled | 7 payments, including a `refund`-kind row pointing at the charge it reverses |
| `voucher_status` | issued, redeemed, expired, cancelled, refunded | 5 vouchers |

`scripts/seed-lifecycle.test.mjs` fails when a label stops being covered, which is
what makes a new status arrive with fixture data instead of a blank screen.

### What the probe found, and a unit test could not

The generated SQL was proven against production inside a `DO` block that inserted
all 28 rows and then raised to roll itself back:

```
ROLLBACK PROBE OK: orders=8 items=8 payments=7 vouchers=5
```

A re-read confirmed zero rows left behind. The first attempt did not get that far:

```
428C9: cannot insert a non-DEFAULT value into column "subtotal_ils_agorot"
DETAIL: Column "subtotal_ils_agorot" is a generated column.
```

**All twelve `*_agorot` columns on `orders`, `order_items` and `payments` are
GENERATED** - `(round(x * 100))::bigint` off the numeric ILS column beside them -
so the numeric column is the input and the integer is derived. `vouchers` is the
exception: its agorot columns are real, which is what a table written agorot-first
looks like. Anyone writing to these tables in SQL needs that fact, and nothing in
the repository said it.

### Idempotent by DO NOTHING, and that is a decision

Every status guard on these four tables is `BEFORE UPDATE`
(`tg_orders_status_guard`, `tg_payments_status_guard`, `tg_vouchers_status_guard`,
read from `pg_trigger` the same day). So an INSERT may carry any status - which is
why terminal states can be seeded directly rather than transitioned - and a
`DO UPDATE` re-run would be judged by those guards as a status transition and
could be refused. A seed whose second run can fail is not idempotent. Re-running
changes nothing; to change a value, `--clean-sql` first.

### What SECTIONS 19 asked for and did not get, with the reason

- **"20 categories from taxonomy".** Not created, and this predates today:
  `seed-catalogue.mjs` resolves categories BY SLUG against the ones that already
  exist and never invents one, because a seed that created categories would put
  demo entries in the site navigation.
- **"5 test users per role".** One per role, not five. Every fixture user is an
  auth user with a password published in this repository - the reason
  `scripts/seed-target-guard.mjs` exists - and five of each multiplies that hazard
  by five while buying nothing a test can use: a test needs a role, not a
  population.
- **"50 coupon products, 30 physical".** The two existing profiles give 40 deals
  (37 coupon, 3 physical) and 60 demo products (40 physical, 20 coupon). Neither
  is the exact shape asked for, and inventing a third profile to match a count
  would be a third dataset to keep true.
- **Executing anything.** The only database reachable from this checkout is
  production, and this seed writes money rows. It prints; a human decides where
  that goes.
