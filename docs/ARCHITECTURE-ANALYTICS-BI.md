# Architecture: Analytics and BI

> **גובר עליו `docs/CONTRADICTIONS.md` (2026-07-24).** כל מספר עמלה, ברירת מחדל
> (10%/5%) או נוסח Escrow במסמך הזה הוא שריד. ההכרעה: `platform_percent`
> פר-מוצר, חובה, בלי ברירת מחדל בשום מקום; ה-held הוא רישום פנימי ב-ledger בלבד.

Status: authoritative spec. Scope: event taxonomy, Supabase event storage, BI dashboard queries, and privacy controls for the KenyonExpress marketplace.

## 0. Ground truth and core principle

The marketplace runs on Supabase Postgres. Products have a `product_type` of `coupon` or `physical`. Commission works by the platform keeping `platform_percent` per product, which is snapshotted into `order_items` at purchase time (so `order_items` carries `supplier_id`, `platform_percent`, and money columns in agorot). Suppliers (table `suppliers`) are the merchant entity.

Money model by product type:

- `coupon`: the customer pays 10 percent on-site at checkout, and the remaining 90 percent in-store when the coupon is scanned. There is no escrow. In-store collection is recorded in `coupon_redemptions.amount_collected`.
- `physical`: the customer pays 100 percent on-site.

All money is stored as integer agorot (1 shekel = 100 agorot). Never use floats for money.

### The one principle that governs this whole document

Money numbers come ONLY from ledger tables: `orders`, `order_items`, `payments`, `coupon_codes`, `coupon_redemptions`. Money is NEVER summed from analytics events.

Behavioral events measure intent and funnel behavior (views, adds to cart, checkout starts). They are lossy by nature: ad blockers, bots, consent opt-outs, and network failures all drop events. Ledger rows are transactional and complete. If GMV or commission were summed from `purchase` events, the totals would silently drift from what suppliers are actually owed. So the split is strict:

- Funnel, conversion rates, and behavior: from `analytics_events`.
- GMV, commission, payouts, redemption revenue: from ledger tables only.

The `purchase` and `coupon_redeemed` events still exist, but they are derived FROM the ledger (emitted by server-side triggers after the money row is written) and are used only to place transactions on the behavioral timeline and to compute funnel conversion. Their money fields are a denormalized convenience copy, and are authoritative-by-reference to `order_id`, never a source of truth.

## 1. Event taxonomy

### 1.1 Conventions

- Event names: `snake_case`, verb-object where natural.
- Property keys: `snake_case`.
- Every event carries a `schema_version` integer. Breaking changes bump the version; the registry (section 2.3) records the current version and validates against it.
- Money in any event payload is agorot integers, and is a denormalized copy only.
- No PII in any payload (see section 4). No email, phone, name, or full IP.

### 1.2 Envelope (common to all events)

Every event, regardless of name, is wrapped in a common envelope. The `props` jsonb holds the event-specific payload from the tables below.

```json
{
  "event_id": "b2f1c9de-3a44-4e0b-9b71-2f0a8c1d55aa",
  "event_name": "view_product",
  "schema_version": 1,
  "occurred_at": "2026-07-23T09:41:12.482Z",
  "session_id": "s_3f9a2c7e10b84d6e",
  "user_id": null,
  "consent": true,
  "context": {
    "app": "web",
    "app_version": "2026.07.21",
    "locale": "he-IL",
    "page_path": "/product/271",
    "referrer_host": "google.com"
  },
  "props": {}
}
```

Envelope field notes:

- `event_id`: client-generated UUID v4, used as the idempotency and dedup key.
- `session_id`: opaque rotating id (see section 4.5), not tied to identity.
- `user_id`: nullable. Present only for authenticated sessions, and only as the Supabase auth uuid, never an email.
- `consent`: boolean snapshot of the `ke_consent` cookie at emit time. Events with `consent=false` are still accepted for strictly necessary or security purposes but are stored with reduced fields (see section 4.2).
- `context.page_path`: path only, query string stripped (query strings can carry PII and tokens).
- `context.referrer_host`: hostname only, never the full referrer URL.

### 1.3 The five primary events

#### view_product (behavioral)

Source: client. Fired when a product detail page is meaningfully viewed (rendered and visible past a debounce).

```json
{
  "product_id": 271,
  "product_type": "coupon",
  "supplier_id": 44,
  "list_price_agorot": 12000,
  "category_id": 8,
  "position": null,
  "source": "search"
}
```

- `list_price_agorot`: display price at view time, denormalized copy, not authoritative.
- `source`: how the user reached the product (`search`, `category`, `home`, `deep_link`, `cart`).

#### add_to_cart (behavioral)

Source: client. Fired on successful add-to-cart.

```json
{
  "product_id": 271,
  "product_type": "coupon",
  "supplier_id": 44,
  "quantity": 1,
  "unit_price_agorot": 12000,
  "cart_id": "c_9a71f0",
  "source": "product_page"
}
```

#### begin_checkout (behavioral)

Source: client. Fired when the checkout flow is entered.

```json
{
  "cart_id": "c_9a71f0",
  "item_count": 2,
  "distinct_suppliers": 2,
  "cart_value_agorot": 21000,
  "has_coupon_item": true,
  "has_physical_item": true
}
```

- `cart_value_agorot`: sum of cart line items at checkout start, denormalized copy for funnel value estimation only. The authoritative order total is written later to `orders`.

#### purchase (derived from ledger)

Source: server-side, emitted by a trigger AFTER an `orders` row reaches a paid state and `order_items` are written. This is a projection of the money tables onto the event timeline, NOT a client event.

```json
{
  "order_id": 90183,
  "session_id_ref": "s_3f9a2c7e10b84d6e",
  "item_count": 2,
  "distinct_suppliers": 2,
  "order_gross_agorot": 21000,
  "onsite_charged_agorot": 3000,
  "platform_commission_agorot": 2100,
  "contains_coupon": true,
  "contains_physical": true
}
```

- Every money field here is a read-through copy of the corresponding ledger value at emit time. For any reporting, join back to `orders` and `order_items` by `order_id`. The event money fields exist so a single query can annotate the funnel without a join, and must never be summed for financial reporting.
- `onsite_charged_agorot`: what `payments` actually captured on-site (for a coupon order this is the 10 percent portion; for physical it is the full amount).

#### coupon_redeemed (derived from ledger)

Source: server-side, emitted by a trigger AFTER a `coupon_redemptions` row is inserted (the in-store scan). Not a client event.

```json
{
  "redemption_id": 5521,
  "coupon_code_id": 30877,
  "order_id": 90183,
  "supplier_id": 44,
  "product_id": 271,
  "amount_collected_agorot": 10800,
  "days_since_issue": 6
}
```

- `amount_collected_agorot`: read-through copy of `coupon_redemptions.amount_collected`. Authoritative value stays in the ledger.
- `days_since_issue`: convenience integer, recomputable from `coupon_codes.issued_at` and the redemption time.

### 1.4 Secondary events (behavioral)

#### search

```json
{
  "query_hash": "sha256:9f2b...",
  "query_len": 14,
  "result_count": 23,
  "category_id": null,
  "has_results": true
}
```

- The raw query string is NOT stored (free-text search terms can contain PII). Store a salted hash for dedup and popularity, plus the length for quality analysis.

#### remove_from_cart

```json
{
  "product_id": 271,
  "product_type": "coupon",
  "supplier_id": 44,
  "quantity": 1,
  "unit_price_agorot": 12000,
  "cart_id": "c_9a71f0"
}
```

### 1.5 Taxonomy summary

| Event | Source | Money source of truth | Primary |
| --- | --- | --- | --- |
| view_product | client | n/a | yes |
| add_to_cart | client | n/a | yes |
| begin_checkout | client | n/a | yes |
| purchase | server (ledger trigger) | orders / order_items / payments | yes |
| coupon_redeemed | server (ledger trigger) | coupon_redemptions | yes |
| search | client | n/a | no |
| remove_from_cart | client | n/a | no |

## 2. Supabase event storage

### 2.1 Extensions and schema

```sql
create schema if not exists analytics;

create extension if not exists pgcrypto;   -- gen_random_uuid, digest
```

### 2.2 analytics_events (monthly partitioned)

The raw event table is range-partitioned by `occurred_at` (monthly). Partitioning keeps hot months small, makes retention a partition DROP (instant, no bloat), and keeps rollup scans bounded.

```sql
create table if not exists analytics.analytics_events (
  event_id       uuid        not null,
  event_name     text        not null,
  schema_version smallint    not null default 1,
  occurred_at    timestamptz not null,
  received_at    timestamptz not null default now(),
  session_id     text        not null,
  user_id        uuid        null,
  consent        boolean     not null default false,
  props          jsonb       not null default '{}'::jsonb,
  context        jsonb       not null default '{}'::jsonb,
  ip_trunc       inet        null,   -- IPv4 truncated to /24, IPv6 to /48 (section 4.3)
  is_bot         boolean     not null default false,
  primary key (event_id, occurred_at)
) partition by range (occurred_at);
```

Notes:

- Primary key includes `occurred_at` because Postgres requires the partition key inside any unique constraint. `event_id` still provides the dedup guarantee within a partition, and event ids are globally unique in practice, so the composite key is safe for idempotency.
- `ip_trunc` is `inet` and is always already truncated before insert (the raw IP never reaches this table).
- `user_id` is the auth uuid only.

Partition creation (one per month; automate via a scheduled job or `pg_partman`). Example for the current and next month:

```sql
create table if not exists analytics.analytics_events_2026_07
  partition of analytics.analytics_events
  for values from ('2026-07-01 00:00:00+00') to ('2026-08-01 00:00:00+00');

create table if not exists analytics.analytics_events_2026_08
  partition of analytics.analytics_events
  for values from ('2026-08-01 00:00:00+00') to ('2026-09-01 00:00:00+00');
```

Indexes (created per partition, or as partitioned indexes on the parent):

```sql
create index if not exists ix_ae_name_time
  on analytics.analytics_events (event_name, occurred_at);

create index if not exists ix_ae_session
  on analytics.analytics_events (session_id, occurred_at);

create index if not exists ix_ae_props_gin
  on analytics.analytics_events using gin (props jsonb_path_ops);
```

A helper to create a month partition on demand, callable from a nightly job:

```sql
create or replace function analytics.fn_ensure_month_partition(p_month date)
returns void
language plpgsql
security definer
set search_path = analytics, public
as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_name  text := format('analytics_events_%s', to_char(v_start, 'YYYY_MM'));
begin
  execute format(
    'create table if not exists analytics.%I partition of analytics.analytics_events
       for values from (%L) to (%L)',
    v_name, v_start::timestamptz, v_end::timestamptz
  );
end;
$$;
```

### 2.3 Event definition registry

The registry is the contract. The ingestion function validates every incoming event against it: the event name must be active, and the schema version must match the current registered version. Required prop keys are enforced as a lightweight presence check.

```sql
create table if not exists analytics.event_definitions (
  event_name     text        not null,
  schema_version smallint    not null,
  is_active      boolean     not null default true,
  is_derived     boolean     not null default false,  -- true = server/ledger sourced
  required_props text[]      not null default '{}',
  description    text        null,
  created_at     timestamptz not null default now(),
  primary key (event_name, schema_version)
);

insert into analytics.event_definitions
  (event_name, schema_version, is_derived, required_props, description)
values
  ('view_product',     1, false, array['product_id','product_type','supplier_id'], 'Product detail viewed'),
  ('add_to_cart',      1, false, array['product_id','supplier_id','quantity','unit_price_agorot'], 'Item added to cart'),
  ('begin_checkout',   1, false, array['cart_id','item_count','cart_value_agorot'], 'Checkout started'),
  ('purchase',         1, true,  array['order_id','order_gross_agorot','platform_commission_agorot'], 'Ledger-derived paid order'),
  ('coupon_redeemed',  1, true,  array['redemption_id','coupon_code_id','amount_collected_agorot'], 'Ledger-derived in-store scan'),
  ('search',           1, false, array['query_hash','result_count'], 'Search performed'),
  ('remove_from_cart', 1, false, array['product_id','supplier_id','quantity'], 'Item removed from cart')
on conflict (event_name, schema_version) do update
  set is_active      = excluded.is_active,
      is_derived     = excluded.is_derived,
      required_props = excluded.required_props,
      description    = excluded.description;
```

### 2.4 Ingestion function fn_ingest_analytics_events

Service-only (revoked from `anon` and `authenticated`, so only the service role or an edge function with the service key can call it). Accepts a jsonb array of enveloped events, validates each against the registry, dedups on the primary key, and returns a per-event result. Bad events are rejected individually, so one malformed row does not poison the batch.

```sql
create or replace function analytics.fn_ingest_analytics_events(p_events jsonb)
returns table (event_id uuid, status text, reason text)
language plpgsql
security definer
set search_path = analytics, public
as $$
declare
  e          jsonb;
  v_event_id uuid;
  v_name     text;
  v_version  smallint;
  v_occurred timestamptz;
  v_def      analytics.event_definitions%rowtype;
  v_missing  text;
  v_ip_trunc inet;
begin
  if jsonb_typeof(p_events) <> 'array' then
    raise exception 'p_events must be a jsonb array';
  end if;

  for e in select * from jsonb_array_elements(p_events)
  loop
    -- reset per-row outputs
    v_event_id := null; v_name := null; reason := null; status := 'rejected';

    begin
      v_event_id := (e->>'event_id')::uuid;
      v_name     := e->>'event_name';
      v_version  := coalesce((e->>'schema_version')::smallint, 1);
      v_occurred := (e->>'occurred_at')::timestamptz;

      -- 1) required envelope fields
      if v_event_id is null or v_name is null or v_occurred is null then
        event_id := v_event_id; status := 'rejected';
        reason := 'missing envelope fields'; return next; continue;
      end if;

      -- 2) registry lookup, active check, version match
      select * into v_def
      from analytics.event_definitions d
      where d.event_name = v_name and d.schema_version = v_version;

      if not found then
        event_id := v_event_id; status := 'rejected';
        reason := 'unknown event or version'; return next; continue;
      end if;

      if not v_def.is_active then
        event_id := v_event_id; status := 'rejected';
        reason := 'event inactive'; return next; continue;
      end if;

      -- 3) required props presence check
      v_missing := null;
      select k into v_missing
      from unnest(v_def.required_props) as k
      where not (coalesce(e->'props','{}'::jsonb) ? k)
      limit 1;

      if v_missing is not null then
        event_id := v_event_id; status := 'rejected';
        reason := 'missing prop: ' || v_missing; return next; continue;
      end if;

      -- 4) IP is expected pre-truncated by caller; store as-is (inet) or null
      v_ip_trunc := nullif(e->>'ip_trunc','')::inet;

      -- 5) ensure the target partition exists
      perform analytics.fn_ensure_month_partition(v_occurred::date);

      -- 6) insert with dedup on PK (event_id, occurred_at)
      insert into analytics.analytics_events (
        event_id, event_name, schema_version, occurred_at,
        session_id, user_id, consent, props, context, ip_trunc, is_bot
      )
      values (
        v_event_id, v_name, v_version, v_occurred,
        coalesce(e->>'session_id',''),
        nullif(e->>'user_id','')::uuid,
        coalesce((e->>'consent')::boolean, false),
        coalesce(e->'props','{}'::jsonb),
        coalesce(e->'context','{}'::jsonb),
        v_ip_trunc,
        coalesce((e->>'is_bot')::boolean, false)
      )
      on conflict (event_id, occurred_at) do nothing;

      if found then
        event_id := v_event_id; status := 'inserted'; reason := null;
      else
        event_id := v_event_id; status := 'duplicate'; reason := null;
      end if;
      return next;

    exception when others then
      event_id := v_event_id; status := 'rejected';
      reason := 'error: ' || sqlerrm; return next; continue;
    end;
  end loop;
end;
$$;

revoke all on function analytics.fn_ingest_analytics_events(jsonb) from public, anon, authenticated;
grant execute on function analytics.fn_ingest_analytics_events(jsonb) to service_role;
```

Ingestion path: browser posts events to a Supabase edge function, the edge function does bot detection and IP truncation (section 4.3), then calls `fn_ingest_analytics_events` with the service key. The browser never touches this function directly, and the raw IP never enters the database.

### 2.5 Retention: 13 months raw plus daily rollup

Policy:

- Raw `analytics_events`: keep 13 months (current month plus 12). 13 months gives a full year plus one, so year-over-year comparisons always have both endpoints.
- Rollups: keep indefinitely (they are tiny and PII-free).

Daily rollup table (aggregate counts by day, event, and a few low-cardinality dimensions). No money is stored here; money rollups live in the ledger-side marts.

```sql
create table if not exists analytics.rollup_daily (
  day           date    not null,
  event_name    text    not null,
  product_type  text    null,
  supplier_id   bigint  null,
  event_count   bigint  not null,
  session_count bigint  not null,
  primary key (day, event_name, product_type, supplier_id)
);
```

Nightly rollup for the previous business day (Asia/Jerusalem, section 4.6):

```sql
create or replace function analytics.fn_rollup_daily(p_day date)
returns void
language sql
security definer
set search_path = analytics, public
as $$
  insert into analytics.rollup_daily
    (day, event_name, product_type, supplier_id, event_count, session_count)
  select
    (ae.occurred_at at time zone 'Asia/Jerusalem')::date as day,
    ae.event_name,
    ae.props->>'product_type',
    nullif(ae.props->>'supplier_id','')::bigint,
    count(*),
    count(distinct ae.session_id)
  from analytics.analytics_events ae
  where ae.is_bot = false
    and (ae.occurred_at at time zone 'Asia/Jerusalem')::date = p_day
  group by 1,2,3,4
  on conflict (day, event_name, product_type, supplier_id) do update
    set event_count   = excluded.event_count,
        session_count = excluded.session_count;
$$;
```

Retention drop (run monthly, after the rollup for that month is confirmed complete):

```sql
-- drops the partition older than 13 months in one metadata operation
drop table if exists analytics.analytics_events_2025_06;
```

Automate rollup and drop via `pg_cron` or a scheduled edge function. Never DELETE from the raw table for retention; always DROP the partition.

## 3. BI dashboard queries (ledger only)

Every query in this section reads the money tables. None sums an analytics event. Assumed ledger shape (from ground truth): `orders(id, status, created_at, ...)`, `order_items(order_id, supplier_id, product_id, product_type, platform_percent, face_value_agorot, ...)`, `payments(order_id, amount_captured_agorot, ...)`, `coupon_codes(id, order_item_id, supplier_id, issued_at, status, ...)`, `coupon_redemptions(coupon_code_id, amount_collected, redeemed_at, ...)`. Column names below match this shape; adjust to the live column names where they differ, keeping the logic identical.

### 3.1 GMV (sum of face value)

GMV is the total face value transacted, independent of who collected the money and when. For coupons, face value includes the 90 percent collected in-store, so GMV uses `order_items.face_value_agorot`, not what was captured on-site.

```sql
-- GMV per day, last 30 days, Asia/Jerusalem business day
select
  (o.created_at at time zone 'Asia/Jerusalem')::date as biz_day,
  sum(oi.face_value_agorot)                           as gmv_agorot,
  round(sum(oi.face_value_agorot) / 100.0, 2)         as gmv_ils
from order_items oi
join orders o on o.id = oi.order_id
where o.status in ('paid','completed','fulfilled')
  and o.created_at >= (now() at time zone 'Asia/Jerusalem')::date - interval '30 days'
group by 1
order by 1;
```

### 3.2 Commission revenue (platform cut in agorot)

Commission is the platform percent applied to face value, using the percent snapshotted on the order item (never the current product percent, which may have changed since purchase).

```sql
-- platform commission earned, last 30 days
select
  (o.created_at at time zone 'Asia/Jerusalem')::date as biz_day,
  sum( (oi.face_value_agorot * oi.platform_percent) / 100 )::bigint as commission_agorot,
  round(sum( (oi.face_value_agorot * oi.platform_percent) / 100 ) / 100.0, 2) as commission_ils
from order_items oi
join orders o on o.id = oi.order_id
where o.status in ('paid','completed','fulfilled')
  and o.created_at >= (now() at time zone 'Asia/Jerusalem')::date - interval '30 days'
group by 1
order by 1;
```

Note on integer math: `(face_value_agorot * platform_percent) / 100` stays in integer agorot. Define and apply the rounding rule (floor here) consistently everywhere commission is computed, so BI matches payouts to the agora.

### 3.3 Redemption rate and time-to-scan (coupons)

Redemption rate is redeemed coupon codes over issued coupon codes. Both come from the ledger: issuance from `coupon_codes`, redemption from `coupon_redemptions`. Median days-to-scan uses the interval between issuance and redemption.

```sql
-- redemption rate + median days to scan, coupons issued in the last 90 days
with issued as (
  select cc.id as coupon_code_id, cc.supplier_id, cc.issued_at
  from coupon_codes cc
  where cc.issued_at >= (now() at time zone 'Asia/Jerusalem')::date - interval '90 days'
),
redeemed as (
  select r.coupon_code_id, min(r.redeemed_at) as first_redeemed_at
  from coupon_redemptions r
  group by r.coupon_code_id
)
select
  count(*)                                as issued_count,
  count(rd.coupon_code_id)                as redeemed_count,
  round(
    100.0 * count(rd.coupon_code_id) / nullif(count(*),0)
  , 2)                                    as redemption_rate_pct,
  percentile_cont(0.5) within group (
    order by extract(epoch from (rd.first_redeemed_at - i.issued_at)) / 86400.0
  )                                       as median_days_to_scan
from issued i
left join redeemed rd on rd.coupon_code_id = i.coupon_code_id;
```

Per-supplier variant: add `i.supplier_id` to the select and `group by i.supplier_id`.

### 3.4 Supplier leaderboard (top suppliers by GMV and commission, 30d)

```sql
-- top 20 suppliers by GMV over the last 30 days, with commission and in-store collection
with sales as (
  select
    oi.supplier_id,
    sum(oi.face_value_agorot)                                         as gmv_agorot,
    sum( (oi.face_value_agorot * oi.platform_percent) / 100 )::bigint as commission_agorot,
    count(distinct o.id)                                              as order_count
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.status in ('paid','completed','fulfilled')
    and o.created_at >= (now() at time zone 'Asia/Jerusalem')::date - interval '30 days'
  group by oi.supplier_id
),
instore as (
  -- 90 percent collected in-store on coupon scans, from the ledger
  select cc.supplier_id, sum(r.amount_collected) as instore_collected_agorot
  from coupon_redemptions r
  join coupon_codes cc on cc.id = r.coupon_code_id
  where r.redeemed_at >= (now() at time zone 'Asia/Jerusalem')::date - interval '30 days'
  group by cc.supplier_id
)
select
  s.name                                    as supplier,
  sa.order_count,
  sa.gmv_agorot,
  round(sa.gmv_agorot / 100.0, 2)           as gmv_ils,
  sa.commission_agorot,
  round(sa.commission_agorot / 100.0, 2)    as commission_ils,
  coalesce(ins.instore_collected_agorot, 0) as instore_collected_agorot
from sales sa
join suppliers s on s.id = sa.supplier_id
left join instore ins on ins.supplier_id = sa.supplier_id
order by sa.gmv_agorot desc
limit 20;
```

### 3.5 Funnel conversion (events for the funnel, ledger for the value)

The one place events and ledger meet: conversion counts come from events, but any value or revenue shown alongside is pulled from the ledger by `order_id`. Example, 30-day funnel counts:

```sql
select
  count(*) filter (where event_name = 'view_product')   as views,
  count(*) filter (where event_name = 'add_to_cart')    as adds,
  count(*) filter (where event_name = 'begin_checkout') as checkouts,
  count(*) filter (where event_name = 'purchase')       as purchases
from analytics.analytics_events
where is_bot = false
  and consent = true
  and occurred_at >= now() - interval '30 days';
```

The `purchases` count here is the count of purchase events for funnel-rate purposes only. Purchase revenue for the same window still comes from section 3.1 and 3.2, never from summing this table.

## 4. Privacy (Israeli law, Amendment 13 to the Protection of Privacy Law)

### 4.1 No PII in events

Behavioral events carry no directly identifying data: no email, no phone, no full name, no national id, no full IP, no free-text that could embed PII (search terms are hashed, section 1.4). The only identity link permitted in an event is `user_id` as the opaque auth uuid, and only for authenticated sessions. The mapping from `user_id` to a real person lives exclusively in the auth and customer tables (section 4.4), never in `analytics_events`.

### 4.2 Consent gating (ke_consent cookie)

Marketing and non-essential analytics are opt-in. A first-party cookie `ke_consent` records the choice:

- `ke_consent=granted`: full behavioral events flow with `consent=true`.
- `ke_consent=denied` or absent: the client suppresses behavioral events. Only strictly necessary or security signals are recorded, stored with `consent=false` and with `session_id` and `user_id` nulled or coarsened, so they cannot build a behavioral profile.

Reporting queries filter `where consent = true` for behavioral and marketing analysis (as in section 3.5). Consent state is captured per event in the envelope, so a later withdrawal does not retroactively legitimize earlier data, and the audit trail stays honest.

Cookie shape:

```
ke_consent=granted; Max-Age=15552000; Path=/; SameSite=Lax; Secure
```

### 4.3 IP truncation

The raw IP is used only transiently at the edge for bot detection and geo-coarsening, then truncated before storage. It is never written in full.

- IPv4: keep the /24 network, zero the host octet (e.g. 203.0.113.57 becomes 203.0.113.0).
- IPv6: keep the /48 prefix.

Done at the edge function before the DB call:

```sql
-- reference truncation (edge does this; shown for parity)
select set_masklen(inet '203.0.113.57', 24) & inet '255.255.255.0';
-- -> 203.0.113.0/24
```

Store the truncated value in `analytics_events.ip_trunc`. This supports coarse geo and abuse detection while preventing per-user IP identification.

### 4.4 PII separation

Strict separation of stores:

- Identity and PII (email, phone, name, payment identifiers): auth and customer/order tables under RLS, access limited to the roles that need it for fulfilment and support.
- Behavioral (`analytics.*`): no PII, joined to identity ONLY through `user_id` and ONLY inside secured server-side reporting, never exposed to the client or to broad analyst roles.

The `analytics` schema is not granted to `anon` or `authenticated` for select. BI users read from views and marts that already exclude any path back to raw PII. A join from `analytics_events.user_id` to a customer email is possible in principle but is gated behind a privileged role and audited, so casual analytics cannot re-identify.

### 4.5 Session id and team-traffic filtering

- `session_id` is an opaque, rotating identifier (rotates on a timeout and is not stored against identity). It groups events within a visit for funnel analysis without being a stable cross-session fingerprint.
- Internal and team traffic is flagged and excluded from BI. Team devices set a first-party marker (a `ke_internal=1` cookie or a known truncated IP block), the edge function sets `is_bot=true` (or a dedicated `is_internal` flag can be added) for those sessions, and every reporting query filters `where is_bot = false`. Bots are filtered the same way via user-agent and behavioral heuristics at the edge.

### 4.6 Business time in Asia/Jerusalem

All timestamps are stored as `timestamptz` in UTC. All business-day bucketing, retention day boundaries, and dashboard grouping convert to `Asia/Jerusalem` at query time via `at time zone 'Asia/Jerusalem'` (used throughout section 2.5 and section 3). This keeps a single UTC source of truth on disk while making every reported day match the Israeli business day, including DST shifts, which Postgres handles automatically for a named zone.

## 5. Summary of guarantees

- Money (GMV, commission, redemption revenue, payouts) is computed only from `orders`, `order_items`, `payments`, `coupon_codes`, `coupon_redemptions`, using the `platform_percent` snapshotted on `order_items`.
- Behavioral events are lossy and are used only for funnel and behavior, never for financial totals.
- `purchase` and `coupon_redeemed` events are ledger-derived projections; their money fields are convenience copies, authoritative by reference to `order_id`.
- Raw events are PII-free, consent-gated, IP-truncated, partitioned monthly, retained 13 months, and rolled up daily.
- All business reporting is bucketed in Asia/Jerusalem over a UTC store.
