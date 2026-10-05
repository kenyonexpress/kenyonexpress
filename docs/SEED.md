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
| `scripts/seed-demo-catalog.ts` | The demo catalogue (W04, 2026-10-05): 12 suppliers, 60 coupons and 12 physical products with `demo-` slugs across the eleven live categories, each with an 800x800 webp+avif set through `src/lib/images/process.ts`, on the `de30de30-…` namespace. Data in `scripts/seed/demo-catalog-data.ts`, prices in agorot, converted once in `scripts/seed/demo-catalog-rows.ts` | Dry run by default (plan + images to `.image-staging/demo-catalog/`, no database); `--apply` writes through the service-role client and `scripts/seed-target-guard.mjs` refuses production; `--check` is read-only |
| `scripts/remove-demo-catalog.ts` | Deletes products whose slug starts with `demo-`, their `media_assets` rows and storage objects under `demo-catalog/`, and the twelve demo suppliers once unreferenced. Skips any `demo-` product an `order_items` row names | Dry run by default; `--apply` deletes; same production refusal |
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

## 2026-10-05, W04: the demo catalogue, and why it did not run

`scripts/seed-demo-catalog.ts` is the "60 coupons + 12 physical" seed the queue
asked for, built so that it CAN run the day a disposable database exists and
cannot run against the only database there is today.

- **Target.** `SEED_SUPABASE_URL` + `SEED_SUPABASE_SERVICE_KEY`, else
  `NEXT_PUBLIC_SUPABASE_URL` + the service key, from the environment or
  `.env.local`. `scripts/seed-target-guard.mjs` refuses the production ref
  before the first write. Measured on 2026-10-05: there is no local stack
  (Docker is not running), no preview project, and `drizzle.config.ts` wants a
  `SUPABASE_DB_URL` that is configured nowhere, so `--apply` had nowhere to go
  and was not run. The dry run was: 252 image files (84 sets of webp 800,
  webp 400, avif 800) in 14 s, and all 72 rows through the money module and the
  publish gate.
- **Why the service-role client.** The application's own write path is the
  `createProduct` server action, which needs a staff session and a multipart
  request. Drizzle's schema (`src/db/schema/`) has no `products` table. So the
  rows are built by `buildProductMoneyWrite` and `assertPublishable` from
  `src/lib/commerce/product-money.ts`, the same pure module the action uses,
  and written the way `seed-test-data.mjs` writes.
- **Money.** Agorot integers in the dataset; one `agorotToIls` per column at
  the write edge, because the live columns are shekel numerics and the
  `*_agorot` columns beside them are generated. A coupon is written the way the
  card, the cart and the product page read one: `kenyon_price =
  coupon_price_ils` = paid online, `price_ils = full_price` = face value.
- **Images.** Generated 800x800 placeholders carrying the Hebrew title and the
  business name, pushed through `processImage`, stored to R2 when the five
  `R2_*` names are set, else Supabase Storage `product-images`, else the staging
  directory. Not `refs/`: seventy-one percent of the crawl is under 768px and
  the application refuses to upscale.
- **`demo` is a template marker on purpose.** `src/lib/catalogue/safety-rules.ts`
  flags every one of these rows as `template-slug`, and the unit test asserts
  exactly that: the gate is what keeps a demo catalogue out of production's
  snapshot. Production itself already holds 30 legacy `demo-coupon-*` /
  `demo-physical-*` DRAFT rows from 2026-07-23 (read with the service key on
  2026-10-05); `remove-demo-catalog.ts` would remove those too, which is a
  decision for Ofir, not a script.
- **`.env.local` key.** The service key there is valid for the hosted project
  but wrapped in double quotes; `scripts/seed/demo-catalog-env.ts` strips them.
  A reader that keeps the quotes gets `401 Invalid API key`, the exact symptom
  the stale-key note above describes.
