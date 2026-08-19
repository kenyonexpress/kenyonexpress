# ARCHITECTURE-GEO-LOCATION.md

Where a deal is, how far it is, and what the data actually supports.

Status: BINDING. Branch `docs/architecture-night`, 2026-08-19.
Scope: **docs only.** No `src/`, no existing migration, no SQL executed. §8 is a
draft under `migrations/pending/`.
Code this describes: `src/lib/geo/cities.ts`, `src/lib/geo/distance.ts`,
`src/lib/search/meili-settings.ts` (the `_geo` field),
`src/components/storefront/SupplierInfo.tsx`, `src/app/coupon/[id]/page.tsx`.
Migrations: `113_products_geo.sql` (applied in reduced form),
`PENDING-110-supplier-coordinates.sql` (not applied).

---

## 0. The measurement this whole document rests on

Measured against production on 2026-08-07, before a line of geo code was
written, and again on 2026-08-10:

```
suppliers, all 11 rows:
  city filled in : 5     (תל אביב, ירושלים, חיפה, באר שבע, הרצליה, one each)
  city null      : 6
  address filled : 0     <- NOT ONE

products, all 80 rows (after 113 applied):
  city set       : 0
  coordinates    : 0

pg_extension: pg_stat_statements, pgcrypto, plpgsql, supabase_vault, uuid-ossp
  -> no postgis, no cube, no earthdistance
```

**There is nothing to geocode.** That single fact decides everything below: the
system computes distance from the **city centre**, which is honest at the
resolution the data has. It can tell Tel Aviv from Haifa, which is what "deals
near me" means to a customer, and it does not pretend to know which street a
business is on.

Coordinate columns are the **upgrade path, not the current mechanism**.
`supplierLocation()` already prefers `latitude`/`longitude` when present and
falls back to the city otherwise, so filling in one supplier's coordinates
improves that supplier immediately and changes nothing for the others.

---

## 1. The location resolution chain

Two overrides and one fallback, in this order:

```
products.latitude / products.longitude        exact,   precision: 'exact'
      else, when the product does not override the city:
suppliers.latitude / suppliers.longitude      exact,   precision: 'exact'
      else:
city centre of (products.city ?? suppliers.city)       precision: 'city'
      else:
nothing                                                precision: 'unknown'
```

`precision` is returned to the UI **so it can say "approximate" honestly**. A
distance from a city centre presented as a distance from the door is a lie the
customer will discover in a car park.

### 1.1 Why a product needs a location when the supplier already has one

The catalogue used to read the city off the join, `suppliers(city)`. That is
**one city per business**, and it is wrong for the deal this site sells:

- A chain with four branches is **one `suppliers` row**.
- A spa weekend is sold by a supplier registered in Tel Aviv and **redeemed in
  Eilat**.

Sorting those by the supplier's registered address puts the deal hundreds of
kilometres from where the customer would go.

So `products.city` is an **override, not a copy**:

```
effective city = COALESCE(products.city, suppliers.city)
```

`NULL` means "wherever the supplier is", which is the current behaviour and
therefore the behaviour every existing row keeps. **Nothing was backfilled.**

### 1.2 The two rules inside `productLocation()`

These are subtle and both are load-bearing.

**A coordinate is taken as a pair from ONE source.** Mixing a product latitude
with a supplier longitude builds a point that exists on neither.

```ts
const hasOwnPoint = item.latitude != null && item.longitude != null
const latitude  = hasOwnPoint ? item.latitude  : supplier?.latitude
const longitude = hasOwnPoint ? item.longitude : supplier?.longitude
```

**When the product names a city of its own, an inherited supplier coordinate
must not answer.** It points at the other city. The product's own coordinate
still does.

```ts
const cityIsOverridden = Boolean(item.city) && item.city !== supplier?.city
const useInheritedPoint = !cityIsOverridden || hasOwnPoint
```

Written as a sentence: **precision does not outrank specificity.** An exact
coordinate for the wrong city is worse than a city centre for the right one.

---

## 2. Distance

### 2.1 Haversine, and why not the cheap approximation

```ts
const EARTH_RADIUS_KM = 6371
distanceKm(from, to) = 2 * R * asin(min(1, sqrt(
  sin²(Δlat/2) + sin²(Δlng/2) · cos(lat1) · cos(lat2)
)))
```

The equirectangular approximation is off by a few percent, which is **invisible
at Israel's scale**. It is refused anyway because it also breaks near the poles
and at the antimeridian, in ways that are hard to notice in a test suite and
easy to hit with a bad coordinate from a browser.

The module is **pure**: no clock, no database, no `navigator`. The browser's
geolocation call lives in the component that needs it and hands a coordinate in.
That is what makes the sort identical on the server and the client, and what
makes the module testable.

### 2.2 Formatting, as a customer reads it

```ts
km < 1   -> `${round(km*10)/10} ק"מ`     // nearest 100 m
km < 10  -> `${km.toFixed(1)} ק"מ`
else     -> `${round(km)} ק"מ`
```

`0.4 ק"מ` is useful. `0.437 ק"מ` is noise, and worse, it is noise that claims a
precision the city-centre fallback does not have.

### 2.3 Unknown is `null`, never `0` and never `Infinity`

```ts
distanceKm: origin && location.coordinates ? distanceKm(...) : null
```

Zero would sort an unlocated deal to the top as the closest thing available,
which is the exact opposite of what "we do not know where this is" should do.
`Infinity` would work for the sort and then leak into a formatter.

### 2.4 The sort is stable

```
nearest first; unknown locations keep their original order, at the end
ties broken by original index
```

Stability matters **because of** the city fallback: every supplier in one city
shares a coordinate. Without a stable sort, two deals in Tel Aviv would swap
places between renders for no reason a customer could see.

---

## 3. "Near me"

### 3.1 Getting the origin

Two sources, and the customer chooses:

1. **`navigator.geolocation`**, on an explicit tap. Never on page load. A
   permission prompt nobody asked for is denied, and a denied permission is hard
   to undo.
2. **A city tag**, which writes `?near=lat,lng` into the URL.

The URL form is what makes a "near me" result **shareable and cacheable**. A
result that only exists in a JavaScript variable cannot be linked, and the city
strip under the hero exists precisely to be linked.

### 3.2 `?near=` is user-controlled and validated as such

```ts
parseNear(raw): Coordinates | null
  not a string          -> null
  not exactly 2 parts   -> null
  not two finite in-range numbers -> null
```

It arrives in a URL anybody can edit. A bad value degrades to **"no origin"**
rather than to a coordinate at `(0, 0)`, which is in the Atlantic and would win
every distance sort made from Israel.

### 3.3 Privacy

- The coordinate is **never stored**. It lives in the URL and in the request.
- It is **not sent to any third party**. Distance is computed in our own code
  from our own city table.
- The precision offered by `navigator.geolocation` is more than the catalogue can
  use; rounding the origin to three decimals (about 110 m) before it enters the
  URL costs nothing at city-centre resolution and stops a shared link from
  carrying somebody's doorstep.

That last point is a recommendation, not current behaviour, and it is listed in
§9.

---

## 4. The city table

`src/lib/geo/cities.ts`. Thirteen cities, each `{slug, name, lat, lng}`.

```
HERO_CITY_SLUGS = ['tel-aviv','jerusalem','haifa','beer-sheva','eilat']
```

Five under the hero, ordered **by population rather than alphabetically**, which
is roughly the order a customer scans for their own city. The remaining eight
exist because suppliers already carry those names, and **a city the database
knows about must not fall off the map just because it has no tag under the
hero**.

Three properties of the table:

- The `slug` is the URL key, so a link survives a label change.
- The `name` is spelled exactly as it appears in `suppliers.city`, and
  `cityByName` matches case- and punctuation-insensitively so a trailing space
  is not a different city.
- The coordinates are **municipal centres, public geographic fact**, rounded to
  four decimals (about 11 m). They are not business data and nothing about them
  is invented.

`products_city_idx` indexes `lower(btrim(city))`, which is what `cityByName`
effectively compares, so the database and the application agree on what one city
is instead of disagreeing about whitespace.

---

## 5. The map and the navigation link on a product page

`SupplierInfo` renders, per `docs/BUSINESS-MODEL.md` §2:

| Element | Behaviour |
|---|---|
| supplier name | always |
| address | when present. Today: **never**, for all 11 suppliers |
| Waze deep link | `https://waze.com/ul?q=<encoded address or name+city>` |
| phone | `tel:` link |
| WhatsApp | `wa.me`, when `whatsapp_enabled` |
| distance | when an origin is known, with the precision label |

### 5.1 Why Waze and not an embedded map

Three reasons, in order of weight:

1. **The data does not support a pin.** With zero addresses and zero
   coordinates, an embedded map would show a city centre with a marker on it,
   which reads as "the business is here" and is false.
2. **An embedded map is a third-party script on the critical path** of the page
   that most needs to be fast, and it carries a tracking surface into a page
   subject to the cookie consent flow.
3. **Waze is what an Israeli customer actually uses to drive somewhere.** A
   deep link hands the query to the app the customer already trusts, which will
   do a better job of resolving a business name than we can.

`waze.com/ul?q=` takes a free-text query, so it works with a business name plus
a city when there is no address, and gets better automatically the day an
address is entered.

### 5.2 When a map does become right

When `suppliers.address` or a real coordinate is filled in for a meaningful
share of suppliers. At that point a **static** map image with a pin, lazily
loaded below the fold, is the version to build: no third-party JavaScript, no
consent surface, and it shows a real location rather than a guess.

---

## 6. Geo in search

Meilisearch's reserved `_geo` field, `{lat, lng}`, appears in **both**
`filterableAttributes` and `sortableAttributes`, because filtering by distance
and sorting by it are separate permissions.

```
filter: _geoRadius(lat, lng, metres)
sort:   _geoPoint(lat, lng):asc
```

**`_geo` is omitted rather than zeroed** for a product with no coordinates. A
document at `{0, 0}` would win every distance sort made from Israel by a wide
margin. A document without `_geo` is never returned by a geo sort, which is
correct.

Consequence, stated plainly: **today, zero products carry `_geo`, so a geo sort
in Meilisearch returns nothing.** The "near me" experience that exists is the
application-side city-centre sort in `src/lib/geo/distance.ts`, not the index.
The index path is wired and waiting for data.

---

## 7. Why not PostGIS

Measured, then decided.

- PostGIS is **not installed**, and installing it for one point column per
  product pulls in a large extension and its own schema.
- It would be the **second** spatial stack: `PENDING-110` already chose
  `earthdistance` + `cube`.
- The application's distance maths is a haversine over plain lat/lng that
  neither stack is required for.

**Two ways to say "where" in one schema is how a query ends up joining metres to
degrees.** So the columns are `numeric(9,6)` latitude and longitude, matching
PENDING-110 exactly, and the index is GiST over the same `ll_to_earth`
expression. `numeric(9,6)` resolves to about 11 cm, far past what a street
address justifies.

### 7.1 What 113 actually applied

`113_products_geo.sql` was applied to production on 2026-08-10 **in reduced
form**, and the difference matters:

| Landed | Did not land |
|---|---|
| the three columns (`city`, `latitude`, `longitude`) | `CREATE EXTENSION cube` |
| `products_latitude_range` | `CREATE EXTENSION earthdistance` |
| `products_longitude_range` | `products_earth_idx` (GiST) |
| `products_coordinates_are_a_pair` | |
| `products_city_idx` | |

Extension creation needs privileges the MCP connection does not have: the same
`42501` class that broke the first `revoke_anon_writes` attempt. What landed is
what the search facet and the catalogue actually query today, since **zero
products carry a coordinate**. Finishing it means running section 3 alone, with
a privileged connection.

### 7.2 The pair constraint

```sql
CHECK (num_nulls(latitude, longitude) <> 1)
```

**Half a coordinate is not partial data, it is wrong data.** Latitude 32 with a
null longitude reads as `{32, 0}`, which is in the Atlantic off Ghana, and it
would sort as the nearest deal to nobody while looking like a real row.

---

## 8. Draft SQL: `supplier_branches`

**DRAFT. NOT APPLIED. NOT RUN.** File: `migrations/pending/123_supplier_branches.sql`.

### 8.1 The problem it solves

`products.city` (113) solves "this deal is redeemed somewhere other than the
supplier's registered address". It does **not** solve the chain: a coffee chain
with eleven branches is one `suppliers` row and one product, and the customer's
question is "which branch is nearest to me", not "where is the company
registered".

Today that is unanswerable, and the workarounds are both bad: one product per
branch multiplies the catalogue and splits the reviews, and a free-text list in
`coupon_terms_he` cannot be sorted by distance.

### 8.2 Why it is a table and not more columns

A branch is a **row-shaped fact**. There is no number of `city_2`, `city_3`
columns that is the right number, and a `jsonb` array of branches cannot be
indexed for a distance sort or joined for a facet.

The table is deliberately **thin**: a branch is a place, not a business. It has
no percentages, no pricing and no settlement, because a coupon is redeemed
against the **supplier**, and the branch is only where the customer walks in.
The scan authorisation stays `supplier_id`, exactly as
`ARCHITECTURE-ORDER-STATE-MACHINE.md` §4.1 requires.

```sql
-- ============================================================================
-- PENDING 123: supplier_branches, so a chain is more than one pin
-- ============================================================================
-- STATUS: DRAFT, NOT APPLIED. Requires Ofir's explicit approval and MCP
-- apply_migration. Never `db push`.
--
-- MEASURED BEFORE WRITING (2026-08-19; the numbers are from 2026-08-07 and
-- 2026-08-10 and nothing has changed them):
--   suppliers  : 11 rows. city set on 5. address set on 0.
--   products   : 80 rows. city set on 0. coordinates on 0.
--   extensions : no postgis, no cube, no earthdistance.
--   There is no table matching %branch% or %location%.
--
-- THIS TABLE CHANGES NO MONEY AND NO AUTHORISATION. A voucher is redeemed
-- against suppliers.id, as it is today. A branch is a place a customer walks
-- into, and nothing else.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.supplier_branches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id  uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,

  name         text NOT NULL,          -- 'סניף דיזנגוף'
  city         text,                   -- matched by cityByName(), same as products.city
  address      text,
  phone        text,

  -- Same shape and same rules as products/suppliers: numeric(9,6), a PAIR or
  -- nothing. Deliberately identical so one distance function serves all three
  -- and nobody has to remember which table stores degrees differently.
  latitude     numeric(9,6),
  longitude    numeric(9,6),

  -- Opening hours as jsonb rather than seven pairs of columns: the shape is
  -- genuinely irregular (split shifts, Friday, holiday eves) and nothing sorts
  -- or filters on it. Display only.
  hours        jsonb NOT NULL DEFAULT '{}'::jsonb,

  is_active    boolean NOT NULL DEFAULT true,
  sort_order   integer NOT NULL DEFAULT 0,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT supplier_branches_latitude_range
    CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  CONSTRAINT supplier_branches_longitude_range
    CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  -- Half a coordinate is wrong data, not partial data. Same name shape as
  -- products_coordinates_are_a_pair and suppliers_coordinates_are_a_pair.
  CONSTRAINT supplier_branches_coordinates_are_a_pair
    CHECK (num_nulls(latitude, longitude) <> 1),
  -- A branch with neither a city nor a coordinate cannot be placed on any map
  -- or sorted by any distance, so it is a name with no location, which is what
  -- coupon_terms_he is for.
  CONSTRAINT supplier_branches_is_somewhere
    CHECK (city IS NOT NULL OR latitude IS NOT NULL)
);

COMMENT ON TABLE public.supplier_branches IS
  'Physical locations of one supplier. A place, not a business: no percentages, no settlement. Redemption authorisation stays on suppliers.id.';

CREATE INDEX IF NOT EXISTS supplier_branches_supplier_idx
  ON public.supplier_branches (supplier_id, sort_order)
  WHERE is_active;

-- Same normalisation as products_city_idx: lower(btrim(city)) is what
-- cityByName() effectively compares.
CREATE INDEX IF NOT EXISTS supplier_branches_city_idx
  ON public.supplier_branches (lower(btrim(city)))
  WHERE city IS NOT NULL AND is_active;

-- The GiST distance index is COMMENTED OUT, not omitted silently.
-- `cube` and `earthdistance` are still not installed: 113 tried and hit 42501,
-- because extension creation needs privileges the MCP connection lacks. Run
-- this pair with a privileged connection first, together with 113 section 3.
--
--   CREATE EXTENSION IF NOT EXISTS cube          WITH SCHEMA extensions;
--   CREATE EXTENSION IF NOT EXISTS earthdistance WITH SCHEMA extensions;
--   CREATE INDEX IF NOT EXISTS supplier_branches_earth_idx
--     ON public.supplier_branches
--     USING gist (extensions.ll_to_earth(latitude::float8, longitude::float8))
--     WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
--
-- Until then the city index answers every query the application makes, because
-- zero rows anywhere carry a coordinate.

DROP TRIGGER IF EXISTS set_updated_at ON public.supplier_branches;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.supplier_branches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS. auth.uid() and role. No tenant_id.
-- ---------------------------------------------------------------------------
ALTER TABLE public.supplier_branches ENABLE ROW LEVEL SECURITY;

-- A branch is public information: it is an address a customer needs in order to
-- walk in. Inactive branches are not, because an inactive branch is a closed
-- shop and sending somebody there is worse than saying nothing.
CREATE POLICY supplier_branches_public_read ON public.supplier_branches
  FOR SELECT TO anon, authenticated
  USING (is_active AND EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE s.id = supplier_branches.supplier_id AND s.deleted_at IS NULL
  ));

-- The supplier's own members manage their branches. (SELECT auth.uid()) rather
-- than auth.uid(): InitPlan once, not once per row -- the same fix commit
-- 0f8359bc applied across the schema.
CREATE POLICY supplier_branches_member_write ON public.supplier_branches
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.supplier_members m
    WHERE m.supplier_id = supplier_branches.supplier_id
      AND m.user_id = (SELECT auth.uid())
      AND m.role IN ('owner','manager')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.supplier_members m
    WHERE m.supplier_id = supplier_branches.supplier_id
      AND m.user_id = (SELECT auth.uid())
      AND m.role IN ('owner','manager')
  ));

CREATE POLICY supplier_branches_admin_all ON public.supplier_branches
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin','super_admin'))
  WITH CHECK (public.current_user_role() IN ('admin','super_admin'));

-- anon reads, anon never writes. 111_revoke_anon_writes is the standing rule.
REVOKE INSERT, UPDATE, DELETE ON public.supplier_branches FROM anon;
GRANT SELECT ON public.supplier_branches TO anon, authenticated;

-- ============================================================================
-- VERIFICATION (after applying, inside rolled-back DO blocks)
-- ============================================================================
-- 1. The pair constraint bites:
--      INSERT INTO public.supplier_branches (supplier_id, name, latitude)
--      VALUES ((SELECT id FROM public.suppliers LIMIT 1), 'test', 32.08);
--    Expect 23514 (both the pair check and is_somewhere would fire).
--
-- 2. A branch with no location is refused:
--      INSERT ... (supplier_id, name) VALUES (..., 'test');
--    Expect 23514 on supplier_branches_is_somewhere.
--
-- 3. anon cannot see an inactive branch:
--      set role anon;
--      SELECT count(*) FROM public.supplier_branches WHERE NOT is_active;
--    Expect 0.
--
-- 4. A scanner cannot write:
--      a supplier_members row with role 'scanner' -> INSERT must fail 42501.
--
-- ROLLBACK
--   DROP TABLE IF EXISTS public.supplier_branches;
-- ============================================================================
```

### 8.3 What it does not do

- **No backfill and no geocoding.** Deriving a coordinate from a business name is
  the invented data this project refuses everywhere else.
- **No change to redemption.** A voucher is still scanned against `supplier_id`.
  Recording *which branch* scanned it is a separate, later column on
  `voucher_redemptions`, and it is not added here because nothing reads it yet.
- **No change to `suppliers.city`**, which stays the fallback.
- **No search index change.** A multi-branch product would need one document per
  branch or a multi-point `_geo`, and Meilisearch supports neither cleanly.
  That is a real design question, listed in §9, and guessing at it inside a
  schema migration would be the wrong place to answer it.

---

## 9. Gaps, in the order they matter

| Gap | Consequence | Note |
|---|---|---|
| Zero addresses, zero coordinates | every distance is a city-centre distance | the data problem, not a code problem. Everything else waits on it |
| `cube` / `earthdistance` not installed | no GiST distance index anywhere | needs a privileged connection; 113 §3 and 123's commented block, together |
| Chains are one pin | "nearest branch" is unanswerable | §8 |
| Meilisearch cannot hold a multi-point product | a branch-aware geo search has no representation | open design question. One document per branch is the obvious answer and it breaks the id-per-product assumption everywhere else |
| `?near=` carries full geolocation precision | a shared link carries a doorstep | round to 3 decimals before it enters the URL |
| No "closed now" signal | a customer can be sent to a shut business | `supplier_branches.hours` is display-only by design; a real open/closed calculation needs holiday data |
| `PENDING-110` unapplied | `suppliers.latitude/longitude` do not exist, so `supplierLocation()`'s exact branch is dead code today | it is written to be a no-op until the columns exist, which is why it costs nothing to leave |
