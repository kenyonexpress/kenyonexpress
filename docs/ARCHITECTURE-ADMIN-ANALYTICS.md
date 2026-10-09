# ARCHITECTURE-ADMIN-ANALYTICS.md

<!-- v1-final-banner:2026-09-01 -->
> ⚠️ **Partly stale 2026-09-01. Money model: `docs/ARCHITECTURE-OVERVIEW.md` §3.**
>
> The dashboard designs here are still useful, but three data claims are wrong
> against production:
>
> 1. **`supplier_payouts` does not exist.** Every query that reads it, and the
>    payout KPI tiles built on it, have no table to run against.
> 2. **Escrow columns are not a live signal.** `escrow_held` and
>    `escrow_released` are dead `settlement_status` values that no code can
>    write; `escrow_holds` holds 2 legacy rows. An analytics panel keyed on them
>    reports zero forever.
> 3. **`upfront_percent` is not the preferred percentage.** The snapshot the
>    settlement actually uses is `order_items.platform_percent`. Reading
>    `upfront_percent ?? platform_percent` prefers a legacy column.
>
> The `_agorot` columns this document reads are real. 26 of them are
> `GENERATED ALWAYS ... STORED` twins of a legacy `numeric` column; read the
> twin, never recompute it.

KenyonExpress Admin analytics expansion (binding).

Status: BINDING for `arch/admin-analytics` (2026-07-30)
Worktree: `/Users/ofir/kenyonexpress-web/ke-arch-admin2` only. **Documentation only.**
Stack: Next.js App Router `src/app/(admin)`, service-role reads after `requireAdminPage` / `requireSection('analytics'|'payments')`, integer **agorot**, Hebrew RTL admin shell, **recharts** for charts, CSV exports via Route Handlers.
Companions: live `src/app/(admin)/admin/analytics/page.tsx`, `src/lib/analytics/aggregate.ts`, `src/server/analytics/queries.ts`, `docs/ADMIN-ARCHITECTURE.md`, `docs/ARCHITECTURE-ANALYTICS-BI.md`, `ke-arch/docs/ARCHITECTURE-ADMIN-DASHBOARD.md`.

This document **extends** the existing Admin analytics surface. It does not invent a second money ledger. Revenue always comes from `order_items` snapshot columns frozen at purchase. Behavioral events never invent ₪.

---

## 0. Money invariants (analytics must obey)

| Rule | Detail |
|---|---|
| Unit | Internal math = **integer agorot**. UI formats ₪ with 2 decimals via `agorotToIls`. Never sum `_ils` floats for reports. |
| Snapshot | `platform_percent` / `commission_agorot` / `paid_on_site_agorot` on `order_items` are frozen. Changing product commission today must not move past charts. |
| Coupon | Customer pays full on-site `coupon_price` (agorot). That money stays with the platform. Till remainder is cash at merchant on QR. **No Escrow** payout of coupon prepaid money. |
| Physical | On-site charge splits by snapshotted `platform_percent`. Supplier residual feeds settlement / `payout_statements`. |
| Timezone | Business day = `Asia/Jerusalem` (`israelDayKey`, same as live `aggregate.ts`). |
| Auth | Analytics + CSV + settlement = **admin only**. Staff (`content_uploader`) never sees money panels. |
| Escrow columns | May still exist on rows (`escrow_*`). For coupon economics treat held as 0. Physical settlement uses `supplier_immediate_agorot` (+ any release that actually applies to physical). |

Display labels (Hebrew):

| Concept | Hebrew |
|---|---|
| GMV (face / list) | מחזור פנים |
| Charged on site | נגבה באתר |
| Platform revenue | הכנסת פלטפורמה |
| Supplier due | מגיע לספק |
| Redeemed / scanned | מומש / נסרק |
| Issued not redeemed | הונפק ולא מומש |

---

## 1. Grounding: existing Admin surface

### 1.1 Core Admin sections this expansion sits on

Live allowlist (`src/lib/admin/nav.ts` → `ADMIN_SECTIONS`):

| # | Route | Role in this doc |
|---|---|---|
| 1 | `/admin/dashboard` | Today cards; links into analytics periods |
| 2 | `/admin/analytics` | **Primary expansion target** (sales + coupons + take-rate + charts) |
| 3 | `/admin/products` | Deep-link from top products |
| 4 | `/admin/categories` | Optional category revenue later |
| 5 | `/admin/suppliers` | Deep-link from supplier revenue / settlement |
| 6 | `/admin/orders` | Drill from order counts |
| 7 | `/admin/coupons` | Drill from coupon inventory |
| 8 | `/admin/users` | Not money; out of chart scope |
| (+)| `/admin/payouts` | Settlement actions already exist; analytics **reads** the same ledger |
| (+)| `/admin/audit-log` | Export / settlement approve events |

Sidebar may show more links (`payments`, `affiliates`, `approvals`, `vendors`). Money analytics still only for `isAdminRole`.

### 1.2 What already ships (do not rewrite blindly)

| Piece | Path | Keep |
|---|---|---|
| Period toggle day/week/month | `analytics/page.tsx` | Same UX; extend with more panels |
| Aggregation pure functions | `src/lib/analytics/aggregate.ts` | Extend types; keep Jerusalem bucketing |
| Sales loader | `src/server/analytics/queries.ts` | Switch display math to stay in **agorot** end-to-end in new panels |
| CSS `BarSeries` / `FunnelBars` | `src/components/admin/analytics/*` | Replace **sales** charts with recharts; funnel may stay CSS or move |
| Payouts list | `admin/payouts/page.tsx` | Settlement report exports from same `payout_statements` + lines |
| RBAC | `requireAdminPage`, `requireSection` | Reuse |

Binding change vs live loader: new analytics modules prefer **agorot integers** in `SaleLine` (`gmvAgorot`, …) and format only in the UI. Live `SaleLine` with `gmvIls` remains until a migration PR ports callers; this doc’s code is the target shape.

---

## 2. Information architecture (expanded analytics)

### 2.1 Routes

| Route | Purpose |
|---|---|
| `/admin/analytics` | Hub: KPIs + period + recharts + tabs |
| `/admin/analytics?period=day\|week\|month` | Existing period query |
| `/admin/analytics?tab=sales` | Sales (default) |
| `/admin/analytics?tab=coupons` | Issued vs redeemed |
| `/admin/analytics?tab=suppliers` | Platform revenue by supplier (`platform_percent` snapshot) |
| `/admin/analytics?tab=settlement` | Physical settlement report (preview + CSV) |
| `/admin/analytics/export/sales.csv` | CSV Route Handler |
| `/admin/analytics/export/coupons.csv` | CSV |
| `/admin/analytics/export/suppliers.csv` | CSV |
| `/admin/analytics/export/settlement.csv` | CSV (physical lines in range) |

All export routes: `dynamic = 'force-dynamic'`, admin cookie session, `Cache-Control: private, no-store`.

### 2.2 Page composition

```
AnalyticsPage (RSC)
├── header: title + period nav + tab nav + ExportCsvMenu
├── StatsRow (4-6 StatsCard)
├── tab=sales
│   ├── SalesAreaChart (recharts) GMV + platform revenue
│   ├── TypeSplitTable coupon vs physical
│   ├── TakeRateTable by platform_percent
│   └── TopProductsTable
├── tab=coupons
│   ├── CouponKpis issued / redeemed / not-redeemed / rate
│   ├── CouponStatusPie (recharts)
│   └── CouponTrendChart issued vs redeemed by period
├── tab=suppliers
│   ├── SupplierRevenueBarChart
│   └── SupplierRevenueTable (platform cut + supplier due)
└── tab=settlement
    ├── SettlementFilters (supplier, from, to)
    ├── SettlementSummaryCards
    └── SettlementLinesTable + link to /admin/payouts
```

---

## 3. Domain model (agorot)

### 3.1 Canonical line (target)

```ts
// src/lib/analytics/types.ts
export type Period = 'day' | 'week' | 'month'

export type ProductType = 'coupon' | 'physical'

/** One paid order_items row, money in agorot only. */
export type SaleLineAgorot = {
  paidAt: string
  orderId: string
  orderItemId: string
  productId: string | null
  productName: string | null
  productType: ProductType
  supplierId: string | null
  supplierName: string | null
  /** Snapshotted platform take % (prefer upfront_percent, else platform_percent). */
  platformPercent: number | null
  faceValueAgorot: number
  paidOnSiteAgorot: number
  commissionAgorot: number
  supplierImmediateAgorot: number
  /** Physical residual owed toward payout; coupon → 0 in platform model. */
  supplierDueAgorot: number
}

export type PeriodBucketAgorot = {
  key: string
  orders: number
  items: number
  gmvAgorot: number
  chargedOnSiteAgorot: number
  platformRevenueAgorot: number
  supplierDueAgorot: number
  aovAgorot: number
}
```

### 3.2 Coupon redemption inventory

Canonical table for scan state: **`vouchers`**.

| Status | Meaning in analytics |
|---|---|
| `issued` | Paid, not scanned |
| `redeemed` | Scanned at merchant (`redeemed_at`) |
| `expired` | Past `expires_at`, never redeemed |
| `cancelled` / `refunded` | Out of “active outstanding” |

Legacy `coupon_codes.status = 'used'` maps to redeemed for old rows only. New panels read `vouchers` first; optionally union legacy if still populated.

```ts
export type CouponInventoryRow = {
  voucherId: string
  code: string
  productId: string | null
  productName: string | null
  supplierId: string | null
  status: 'issued' | 'redeemed' | 'expired' | 'cancelled' | 'refunded'
  issuedAt: string
  redeemedAt: string | null
  expiresAt: string | null
  paidOnSiteAgorot: number
  faceValueAgorot: number
}
```

KPIs:

| KPI | Formula |
|---|---|
| Issued in window | count where `issued_at` in window |
| Redeemed in window | count where `redeemed_at` in window |
| Outstanding | status = `issued` and not expired |
| Redemption rate | redeemed / issued (window), × 100 |

### 3.3 Supplier platform revenue

Group `SaleLineAgorot` by `supplierId`:

| Column | Formula |
|---|---|
| GMV | sum `faceValueAgorot` |
| Charged on site | sum `paidOnSiteAgorot` |
| Platform revenue | sum `commissionAgorot` |
| Supplier due | sum `supplierDueAgorot` (physical; coupons 0) |
| Effective take % | platform / charged_on_site × 100 (null if 0) |
| Distinct `platform_percent` | set of snapshot percents seen |

### 3.4 Physical settlement report

Scope: `product_type = 'physical'` lines with `orders.paid_at` in range, optionally filtered by `supplier_id`.

Each line:

| Field | Source |
|---|---|
| order / item ids | `orders.id`, `order_items.id` |
| paid_at | `orders.paid_at` |
| supplier | snapshot name + id |
| gross (paid on site) | `paid_on_site_agorot` |
| platform fee | `commission_agorot` |
| supplier payout | `supplier_immediate_agorot` (+ release if used for physical) |
| platform_percent | snapshot |
| settlement_status | `order_items.settlement_status` |
| payout statement | join `payout_statement_lines.order_item_id` if exists |

This report is **read-only analytics**. Creating / approving statements stays on `/admin/payouts`.

---

## 4. Data loaders (full)

```ts
// src/server/analytics/sales-queries.ts
import 'server-only'

import type { SaleLineAgorot } from '@/lib/analytics/types'
import { agorot } from '@/lib/commerce/money'
import { createAdminClient } from '@/lib/supabase/admin'

const MAX_LINES = 50_000

export function windowStart(days: number, now = new Date()): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

export type SalesLoadAgorot = {
  lines: SaleLineAgorot[]
  truncated: boolean
}

type OrderItemRow = {
  id: string
  order_id: string
  product_id: string | null
  product_type: string
  supplier_id: string | null
  upfront_percent: number | null
  platform_percent: number | null
  face_value_agorot: number | null
  paid_on_site_agorot: number | null
  commission_agorot: number | null
  supplier_immediate_agorot: number | null
  escrow_release_agorot: number | null
  products: { name_he: string } | { name_he: string }[] | null
  suppliers: { name: string } | { name: string }[] | null
  orders: { paid_at: string } | { paid_at: string }[] | null
}

function firstOf<T>(value: T | T[] | null): T | null {
  if (value === null) return null
  return Array.isArray(value) ? (value[0] ?? null): value
}

export async function loadSalesLinesAgorot(days: number): Promise<SalesLoadAgorot> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('order_items')
    .select(
      `
      id, order_id, product_id, product_type, supplier_id,
      upfront_percent, platform_percent,
      face_value_agorot, paid_on_site_agorot, commission_agorot,
      supplier_immediate_agorot, escrow_release_agorot,
      products(name_he),
      suppliers(name),
      orders!inner(paid_at)
    `,
    )
    .is('deleted_at', null)
    .is('orders.deleted_at', null)
    .not('orders.paid_at', 'is', null)
    .gte('orders.paid_at', windowStart(days))
    .limit(MAX_LINES)

  if (error || !data) {
    console.error('loadSalesLinesAgorot failed:', error?.message)
    return { lines: [], truncated: false }
  }

  const lines: SaleLineAgorot[] = []
  for (const row of data as unknown as OrderItemRow[]) {
    const order = firstOf(row.orders)
    if (!order?.paid_at) continue

    const productType = row.product_type === 'physical' ? 'physical' : 'coupon'
    const immediate = agorot(row.supplier_immediate_agorot ?? 0)
    const release = agorot(row.escrow_release_agorot ?? 0)
    // Coupon platform model: supplier due from prepaid site charge is 0.
    const supplierDue = productType === 'physical' ? immediate + release : 0

    lines.push({
      paidAt: order.paid_at,
      orderId: row.order_id,
      orderItemId: row.id,
      productId: row.product_id,
      productName: firstOf(row.products)?.name_he ?? null,
      productType,
      supplierId: row.supplier_id,
      supplierName: firstOf(row.suppliers)?.name ?? null,
      platformPercent: row.upfront_percent ?? row.platform_percent,
      faceValueAgorot: agorot(row.face_value_agorot ?? 0),
      paidOnSiteAgorot: agorot(row.paid_on_site_agorot ?? 0),
      commissionAgorot: agorot(row.commission_agorot ?? 0),
      supplierImmediateAgorot: immediate,
      supplierDueAgorot: supplierDue,
    })
  }

  return { lines, truncated: data.length >= MAX_LINES }
}
```

```ts
// src/server/analytics/coupon-queries.ts
import 'server-only'

import type { CouponInventoryRow } from '@/lib/analytics/types'
import { agorot } from '@/lib/commerce/money'
import { createAdminClient } from '@/lib/supabase/admin'
import { windowStart } from './sales-queries'

const MAX = 50_000

export type CouponInventoryLoad = {
  rows: CouponInventoryRow[]
  truncated: boolean
}

export async function loadCouponInventory(days: number): Promise<CouponInventoryLoad> {
  const admin = createAdminClient()
  const since = windowStart(days)

  const { data, error } = await admin
    .from('vouchers')
    .select(
      `
      id, code, status, issued_at, redeemed_at, expires_at,
      product_id, supplier_id,
      paid_on_site_agorot, face_value_agorot,
      products(name_he)
    `,
    )
    .gte('issued_at', since)
    .is('deleted_at', null)
    .limit(MAX)

  if (error || !data) {
    console.error('loadCouponInventory failed:', error?.message)
    return { rows: [], truncated: false }
  }

  type Row = {
    id: string
    code: string
    status: CouponInventoryRow['status']
    issued_at: string
    redeemed_at: string | null
    expires_at: string | null
    product_id: string | null
    supplier_id: string | null
    paid_on_site_agorot: number | null
    face_value_agorot: number | null
    products: { name_he: string } | { name_he: string }[] | null
  }

  const first = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] ?? null : v)

  const rows: CouponInventoryRow[] = (data as unknown as Row[]).map((r) => ({
    voucherId: r.id,
    code: r.code,
    productId: r.product_id,
    productName: first(r.products)?.name_he ?? null,
    supplierId: r.supplier_id,
    status: r.status,
    issuedAt: r.issued_at,
    redeemedAt: r.redeemed_at,
    expiresAt: r.expires_at,
    paidOnSiteAgorot: agorot(r.paid_on_site_agorot ?? 0),
    faceValueAgorot: agorot(r.face_value_agorot ?? 0),
  }))

  return { rows, truncated: data.length >= MAX }
}

/** Redemptions whose redeemed_at is in window (issued_at may be older). */
export async function loadRedemptionsInWindow(days: number): Promise<CouponInventoryRow[]> {
  const admin = createAdminClient()
  const since = windowStart(days)

  const { data, error } = await admin
    .from('vouchers')
    .select(
      `
      id, code, status, issued_at, redeemed_at, expires_at,
      product_id, supplier_id,
      paid_on_site_agorot, face_value_agorot,
      products(name_he)
    `,
    )
    .eq('status', 'redeemed')
    .gte('redeemed_at', since)
    .is('deleted_at', null)
    .limit(MAX)

  if (error || !data) return []
  return (data as Parameters<typeof mapVoucherRow>[0][]).map(mapVoucherRow)
}
```

Import `mapVoucherRow` from `./map-voucher` at the top of this module in the implementation PR.


Fix the stub: implementation must use a shared mapper, not the empty return. Binding mapper:

```ts
// src/server/analytics/map-voucher.ts
import type { CouponInventoryRow } from '@/lib/analytics/types'
import { agorot } from '@/lib/commerce/money'

export function mapVoucherRow(r: {
  id: string
  code: string
  status: CouponInventoryRow['status']
  issued_at: string
  redeemed_at: string | null
  expires_at: string | null
  product_id: string | null
  supplier_id: string | null
  paid_on_site_agorot: number | null
  face_value_agorot: number | null
  products: { name_he: string } | { name_he: string }[] | null
}): CouponInventoryRow {
  const first = Array.isArray(r.products) ? r.products[0] : r.products
  return {
    voucherId: r.id,
    code: r.code,
    productId: r.product_id,
    productName: first?.name_he ?? null,
    supplierId: r.supplier_id,
    status: r.status,
    issuedAt: r.issued_at,
    redeemedAt: r.redeemed_at,
    expiresAt: r.expires_at,
    paidOnSiteAgorot: agorot(r.paid_on_site_agorot ?? 0),
    faceValueAgorot: agorot(r.face_value_agorot ?? 0),
  }
}
```

```ts
// src/server/analytics/settlement-queries.ts
import 'server-only'

import { agorot } from '@/lib/commerce/money'
import { createAdminClient } from '@/lib/supabase/admin'

export type SettlementLine = {
  orderItemId: string
  orderId: string
  paidAt: string
  supplierId: string | null
  supplierName: string | null
  productName: string | null
  platformPercent: number | null
  paidOnSiteAgorot: number
  commissionAgorot: number
  supplierPayoutAgorot: number
  settlementStatus: string | null
  payoutStatementNumber: string | null
}

export type SettlementFilter = {
  fromIso: string
  toIso: string
  supplierId?: string
}

export async function loadPhysicalSettlementLines(
  filter: SettlementFilter,
): Promise<SettlementLine[]> {
  const admin = createAdminClient()

  let q = admin
    .from('order_items')
    .select(
      `
      id, order_id, supplier_id, settlement_status,
      upfront_percent, platform_percent,
      paid_on_site_agorot, commission_agorot, supplier_immediate_agorot,
      products(name_he),
      suppliers(name),
      orders!inner(paid_at),
      payout_statement_lines( payout_statements(statement_number) )
    `,
    )
    .eq('product_type', 'physical')
    .is('deleted_at', null)
    .is('orders.deleted_at', null)
    .not('orders.paid_at', 'is', null)
    .gte('orders.paid_at', filter.fromIso)
    .lte('orders.paid_at', filter.toIso)
    .limit(50_000)

  if (filter.supplierId) q = q.eq('supplier_id', filter.supplierId)

  const { data, error } = await q
  if (error || !data) {
    console.error('loadPhysicalSettlementLines failed:', error?.message)
    return []
  }

  type Row = {
    id: string
    order_id: string
    supplier_id: string | null
    settlement_status: string | null
    upfront_percent: number | null
    platform_percent: number | null
    paid_on_site_agorot: number | null
    commission_agorot: number | null
    supplier_immediate_agorot: number | null
    products: { name_he: string } | { name_he: string }[] | null
    suppliers: { name: string } | { name: string }[] | null
    orders: { paid_at: string } | { paid_at: string }[] | null
    payout_statement_lines:
      | { payout_statements: { statement_number: string } | { statement_number: string }[] | null }
      | Array<{
          payout_statements: { statement_number: string } | { statement_number: string }[] | null
        }>
      | null
  }

  const first = <T,>(v: T | T[] | null | undefined) =>
    v == null ? null : Array.isArray(v) ? (v[0] ?? null): v

  return (data as unknown as Row[]).flatMap((row) => {
    const paidAt = first(row.orders)?.paid_at
    if (!paidAt) return []
    const lineJoin = first(row.payout_statement_lines)
    const stmt = first(lineJoin?.payout_statements ?? null)
    return [
      {
        orderItemId: row.id,
        orderId: row.order_id,
        paidAt,
        supplierId: row.supplier_id,
        supplierName: first(row.suppliers)?.name ?? null,
        productName: first(row.products)?.name_he ?? null,
        platformPercent: row.upfront_percent ?? row.platform_percent,
        paidOnSiteAgorot: agorot(row.paid_on_site_agorot ?? 0),
        commissionAgorot: agorot(row.commission_agorot ?? 0),
        supplierPayoutAgorot: agorot(row.supplier_immediate_agorot ?? 0),
        settlementStatus: row.settlement_status,
        payoutStatementNumber: stmt?.statement_number ?? null,
      },
    ]
  })
}
```

---

## 5. Aggregation (full, agorot)

```ts
// src/lib/analytics/aggregate-agorot.ts
import type {
  Period,
  PeriodBucketAgorot,
  SaleLineAgorot,
} from './types'
import { israelDayKey, periodKey } from './aggregate' // reuse Jerusalem helpers

export function bucketSalesAgorot(
  lines: SaleLineAgorot[],
  period: Period,
): PeriodBucketAgorot[] {
  const map = new Map<string, PeriodBucketAgorot & { orderIds: Set<string> }>()

  for (const line of lines) {
    const key = periodKey(line.paidAt, period)
    let bucket = map.get(key)
    if (!bucket) {
      bucket = {
        key,
        orders: 0,
        items: 0,
        gmvAgorot: 0,
        chargedOnSiteAgorot: 0,
        platformRevenueAgorot: 0,
        supplierDueAgorot: 0,
        aovAgorot: 0,
        orderIds: new Set(),
      }
      map.set(key, bucket)
    }
    bucket.items += 1
    bucket.gmvAgorot += line.faceValueAgorot
    bucket.chargedOnSiteAgorot += line.paidOnSiteAgorot
    bucket.platformRevenueAgorot += line.commissionAgorot
    bucket.supplierDueAgorot += line.supplierDueAgorot
    bucket.orderIds.add(line.orderId)
  }

  return [...map.values()]
    .map(({ orderIds, ...rest }) => {
      const orders = orderIds.size
      return {
        ...rest,
        orders,
        aovAgorot: orders === 0 ? 0 : Math.round(rest.chargedOnSiteAgorot / orders),
      }
    })
    .sort((a, b) => (a.key < b.key ? -1 : 1))
}

export function totalsOfAgorot(buckets: PeriodBucketAgorot[]) {
  const sum = buckets.reduce(
    (acc, b) => {
      acc.gmvAgorot += b.gmvAgorot
      acc.chargedOnSiteAgorot += b.chargedOnSiteAgorot
      acc.platformRevenueAgorot += b.platformRevenueAgorot
      acc.supplierDueAgorot += b.supplierDueAgorot
      acc.orders += b.orders
      acc.items += b.items
      return acc
    },
    {
      gmvAgorot: 0,
      chargedOnSiteAgorot: 0,
      platformRevenueAgorot: 0,
      supplierDueAgorot: 0,
      orders: 0,
      items: 0,
    },
  )
  return {
    ...sum,
    aovAgorot: sum.orders === 0 ? 0 : Math.round(sum.chargedOnSiteAgorot / sum.orders),
  }
}

export type SupplierRevenueRow = {
  supplierId: string | null
  supplierName: string
  items: number
  orders: number
  gmvAgorot: number
  chargedOnSiteAgorot: number
  platformRevenueAgorot: number
  supplierDueAgorot: number
  platformPercents: number[]
  effectiveTakeRatePct: number | null
}

export function revenueBySupplier(lines: SaleLineAgorot[]): SupplierRevenueRow[] {
  const map = new Map<
    string,
    SupplierRevenueRow & { orderIds: Set<string>; percentSet: Set<number> }
  >()

  for (const line of lines) {
    const id = line.supplierId ?? 'unknown'
    let row = map.get(id)
    if (!row) {
      row = {
        supplierId: line.supplierId,
        supplierName: line.supplierName ?? 'ללא ספק',
        items: 0,
        orders: 0,
        gmvAgorot: 0,
        chargedOnSiteAgorot: 0,
        platformRevenueAgorot: 0,
        supplierDueAgorot: 0,
        platformPercents: [],
        effectiveTakeRatePct: null,
        orderIds: new Set(),
        percentSet: new Set(),
      }
      map.set(id, row)
    }
    row.items += 1
    row.gmvAgorot += line.faceValueAgorot
    row.chargedOnSiteAgorot += line.paidOnSiteAgorot
    row.platformRevenueAgorot += line.commissionAgorot
    row.supplierDueAgorot += line.supplierDueAgorot
    row.orderIds.add(line.orderId)
    if (line.platformPercent != null) row.percentSet.add(line.platformPercent)
  }

  return [...map.values()]
    .map(({ orderIds, percentSet, ...rest }) => {
      const orders = orderIds.size
      const take =
        rest.chargedOnSiteAgorot === 0
          ? null
          : Math.round((rest.platformRevenueAgorot / rest.chargedOnSiteAgorot) * 1000) / 10
      return {
        ...rest,
        orders,
        platformPercents: [...percentSet].sort((a, b) => a - b),
        effectiveTakeRatePct: take,
      }
    })
    .sort((a, b) => b.platformRevenueAgorot - a.platformRevenueAgorot)
}

export type CouponKpis = {
  issued: number
  redeemed: number
  outstanding: number
  expired: number
  cancelledOrRefunded: number
  redemptionRatePct: number | null
  outstandingPaidOnSiteAgorot: number
  redeemedPaidOnSiteAgorot: number
}

export function couponKpis(
  issuedWindow: import('./types').CouponInventoryRow[],
  redeemedWindow: import('./types').CouponInventoryRow[],
  now = new Date(),
): CouponKpis {
  const issued = issuedWindow.length
  const redeemed = redeemedWindow.length
  let outstanding = 0
  let expired = 0
  let cancelledOrRefunded = 0
  let outstandingPaid = 0
  let redeemedPaid = 0

  for (const row of issuedWindow) {
    if (row.status === 'redeemed') {
      redeemedPaid += row.paidOnSiteAgorot
      continue
    }
    if (row.status === 'expired') {
      expired += 1
      continue
    }
    if (row.status === 'cancelled' || row.status === 'refunded') {
      cancelledOrRefunded += 1
      continue
    }
    if (row.status === 'issued') {
      const pastExpiry = row.expiresAt != null && new Date(row.expiresAt) < now
      if (pastExpiry) expired += 1
      else {
        outstanding += 1
        outstandingPaid += row.paidOnSiteAgorot
      }
    }
  }

  for (const row of redeemedWindow) {
    redeemedPaid += row.paidOnSiteAgorot
  }

  return {
    issued,
    redeemed,
    outstanding,
    expired,
    cancelledOrRefunded,
    redemptionRatePct: issued === 0 ? null : Math.round((redeemed / issued) * 1000) / 10,
    outstandingPaidOnSiteAgorot: outstandingPaid,
    redeemedPaidOnSiteAgorot: redeemedPaid,
  }
}

export function couponTrend(
  issued: import('./types').CouponInventoryRow[],
  redeemed: import('./types').CouponInventoryRow[],
  period: Period,
): Array<{ key: string; issued: number; redeemed: number }> {
  const map = new Map<string, { key: string; issued: number; redeemed: number }>()
  const touch = (key: string) => {
    let b = map.get(key)
    if (!b) {
      b = { key, issued: 0, redeemed: 0 }
      map.set(key, b)
    }
    return b
  }
  for (const row of issued) touch(periodKey(row.issuedAt, period)).issued += 1
  for (const row of redeemed) {
    if (row.redeemedAt) touch(periodKey(row.redeemedAt, period)).redeemed += 1
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? -1 : 1))
}
```

Keep exporting `israelDayKey` / `periodKey` from live `aggregate.ts` (already correct).

---

## 6. Money formatting helpers

```ts
// src/lib/analytics/format-money.ts
import { agorotToIls } from '@/lib/commerce/money'

export function shekelsFromAgorot(agorotValue: number): string {
  const ils = agorotToIls(agorotValue)
  return `₪${ils.toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function shortShekelsFromAgorot(agorotValue: number): string {
  return `₪${Math.round(agorotToIls(agorotValue)).toLocaleString('he-IL')}`
}

export function integerHe(value: number): string {
  return value.toLocaleString('he-IL')
}
```

---

## 7. recharts (dependency + components)

### 7.1 Install

```bash
pnpm add recharts
```

Admin-only import path. Do not import recharts from storefront layouts (bundle budget).

### 7.2 Shared chart theme (RTL-aware)

```tsx
// src/components/admin/analytics/charts/chart-theme.ts
export const CHART = {
  gmv: '#1A1A1A',
  platform: '#E4002B',
  supplier: '#5CB85C',
  issued: '#FFD200',
  redeemed: '#2563eb',
  grid: 'rgba(0,0,0,0.08)',
  tick: 'rgba(0,0,0,0.55)',
} as const
```

### 7.3 Sales area / dual line

```tsx
// src/components/admin/analytics/charts/SalesTrendChart.tsx
'use client'

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { agorotToIls } from '@/lib/commerce/money'
import { CHART } from './chart-theme'

export type SalesChartPoint = {
  label: string
  gmvAgorot: number
  platformAgorot: number
}

export function SalesTrendChart({ data }: { data: SalesChartPoint[] }) {
  const rows = data.map((d) => ({
    label: d.label,
    gmv: agorotToIls(d.gmvAgorot),
    platform: agorotToIls(d.platformAgorot),
  }))

  return (
    <div className="h-72 w-full rounded-xl border border-gray-200 bg-white p-3" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fill: CHART.tick, fontSize: 11 }} />
          <YAxis
            tick={{ fill: CHART.tick, fontSize: 11 }}
            tickFormatter={(v: number) => `₪${Math.round(v).toLocaleString('he-IL')}`}
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              `₪${Number(value).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`,
              name === 'gmv' ? 'מחזור פנים' : 'הכנסת פלטפורמה',
            ]}
          />
          <Legend
            formatter={(value) => (value === 'gmv' ? 'מחזור פנים' : 'הכנסת פלטפורמה')}
          />
          <Line type="monotone" dataKey="gmv" stroke={CHART.gmv} strokeWidth={2} dot={false} />
          <Line
            type="monotone"
            dataKey="platform"
            stroke={CHART.platform}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

Note: chart SVG container uses `dir="ltr"` for axis math; Hebrew labels stay in Tooltip/Legend.

### 7.4 Coupon status pie

```tsx
// src/components/admin/analytics/charts/CouponStatusPie.tsx
'use client'

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { CHART } from './chart-theme'

const COLORS = [CHART.issued, CHART.redeemed, '#9ca3af', '#f97316']

export function CouponStatusPie({
  outstanding,
  redeemed,
  expired,
  other,
}: {
  outstanding: number
  redeemed: number
  expired: number
  other: number
}) {
  const data = [
    { name: 'הונפק ולא מומש', value: outstanding },
    { name: 'מומש', value: redeemed },
    { name: 'פג', value: expired },
    { name: 'בוטל/זוכה', value: other },
  ].filter((d) => d.value > 0)

  return (
    <div className="h-64 w-full rounded-xl border border-gray-200 bg-white p-3" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
            {data.map((_, i) => (
              <Cell key={data[i]!.name} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
```

### 7.5 Coupon trend + supplier bars

```tsx
// src/components/admin/analytics/charts/CouponTrendChart.tsx
'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CHART } from './chart-theme'

export function CouponTrendChart({
  data,
}: {
  data: Array<{ label: string; issued: number; redeemed: number }>
}) {
  return (
    <div className="h-72 w-full rounded-xl border border-gray-200 bg-white p-3" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART.tick }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: CHART.tick }} />
          <Tooltip />
          <Legend
            formatter={(v) => (v === 'issued' ? 'הונפקו' : 'מומשו')}
          />
          <Bar dataKey="issued" fill={CHART.issued} name="issued" />
          <Bar dataKey="redeemed" fill={CHART.redeemed} name="redeemed" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

```tsx
// src/components/admin/analytics/charts/SupplierRevenueChart.tsx
'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { agorotToIls } from '@/lib/commerce/money'
import { CHART } from './chart-theme'

export function SupplierRevenueChart({
  data,
}: {
  data: Array<{ name: string; platformAgorot: number }>
}) {
  const rows = data.slice(0, 12).map((d) => ({
    name: d.name.length > 14 ? `${d.name.slice(0, 14)}…` : d.name,
    platform: agorotToIls(d.platformAgorot),
  }))

  return (
    <div className="h-80 w-full rounded-xl border border-gray-200 bg-white p-3" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
          <XAxis
            type="number"
            tickFormatter={(v: number) => `₪${Math.round(v).toLocaleString('he-IL')}`}
          />
          <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(v: number) => [
              `₪${Number(v).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`,
              'הכנסת פלטפורמה',
            ]}
          />
          <Bar dataKey="platform" fill={CHART.platform} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

---

## 8. CSV export

### 8.1 CSV utility

```ts
// src/lib/analytics/csv.ts
export function toCsv(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
): string {
  const esc = (cell: string | number | null | undefined) => {
    const s = cell == null ? '' : String(cell)
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))]
  // BOM so Excel on Windows opens Hebrew correctly
  return `\uFEFF${lines.join('\n')}`
}

export function csvResponse(filename: string, body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
```

### 8.2 Auth guard for exports

```ts
// src/server/analytics/require-analytics-export.ts
import 'server-only'

import { requireAdminPage } from '@/lib/admin/rbac'

export async function requireAnalyticsExport() {
  await requireAdminPage()
}
```

### 8.3 Sales CSV route

```ts
// src/app/(admin)/admin/analytics/export/sales/route.ts
import { bucketSalesAgorot, totalsOfAgorot } from '@/lib/analytics/aggregate-agorot'
import { toCsv, csvResponse } from '@/lib/analytics/csv'
import type { Period } from '@/lib/analytics/types'
import { agorotToIls } from '@/lib/commerce/money'
import { loadSalesLinesAgorot } from '@/server/analytics/sales-queries'
import { requireAnalyticsExport } from '@/server/analytics/require-analytics-export'

export const dynamic = 'force-dynamic'

const DAYS: Record<Period, number> = { day: 30, week: 90, month: 365 }

export async function GET(req: Request) {
  await requireAnalyticsExport()
  const url = new URL(req.url)
  const period = (url.searchParams.get('period') as Period) || 'day'
  const days = DAYS[period] ?? 30

  const { lines, truncated } = await loadSalesLinesAgorot(days)
  const buckets = bucketSalesAgorot(lines, period)
  const totals = totalsOfAgorot(buckets)

  const body = toCsv(
    [
      'bucket',
      'orders',
      'items',
      'gmv_agorot',
      'gmv_ils',
      'charged_on_site_agorot',
      'platform_revenue_agorot',
      'supplier_due_agorot',
      'truncated',
    ],
    [
      ...buckets.map((b) => [
        b.key,
        b.orders,
        b.items,
        b.gmvAgorot,
        agorotToIls(b.gmvAgorot),
        b.chargedOnSiteAgorot,
        b.platformRevenueAgorot,
        b.supplierDueAgorot,
        truncated ? 'yes' : 'no',
      ]),
      [
        'TOTAL',
        totals.orders,
        totals.items,
        totals.gmvAgorot,
        agorotToIls(totals.gmvAgorot),
        totals.chargedOnSiteAgorot,
        totals.platformRevenueAgorot,
        totals.supplierDueAgorot,
        truncated ? 'yes' : 'no',
      ],
    ],
  )

  return csvResponse(`sales-${period}.csv`, body)
}
```

### 8.4 Coupons CSV

```ts
// src/app/(admin)/admin/analytics/export/coupons/route.ts
import { toCsv, csvResponse } from '@/lib/analytics/csv'
import { loadCouponInventory } from '@/server/analytics/coupon-queries'
import { requireAnalyticsExport } from '@/server/analytics/require-analytics-export'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  await requireAnalyticsExport()
  const days = Number(new URL(req.url).searchParams.get('days') ?? 90)

  const { rows } = await loadCouponInventory(days)

  const body = toCsv(
    [
      'voucher_id',
      'code',
      'status',
      'issued_at',
      'redeemed_at',
      'expires_at',
      'product_name',
      'supplier_id',
      'paid_on_site_agorot',
      'face_value_agorot',
    ],
    rows.map((r) => [
      r.voucherId,
      r.code,
      r.status,
      r.issuedAt,
      r.redeemedAt,
      r.expiresAt,
      r.productName,
      r.supplierId,
      r.paidOnSiteAgorot,
      r.faceValueAgorot,
    ]),
  )

  return csvResponse(`coupons-${days}d.csv`, body)
}
```

### 8.5 Suppliers CSV

```ts
// src/app/(admin)/admin/analytics/export/suppliers/route.ts
import { revenueBySupplier } from '@/lib/analytics/aggregate-agorot'
import { toCsv, csvResponse } from '@/lib/analytics/csv'
import { agorotToIls } from '@/lib/commerce/money'
import { loadSalesLinesAgorot } from '@/server/analytics/sales-queries'
import { requireAnalyticsExport } from '@/server/analytics/require-analytics-export'
import type { Period } from '@/lib/analytics/types'

export const dynamic = 'force-dynamic'

const DAYS: Record<Period, number> = { day: 30, week: 90, month: 365 }

export async function GET(req: Request) {
  await requireAnalyticsExport()
  const period = (new URL(req.url).searchParams.get('period') as Period) || 'month'
  const { lines } = await loadSalesLinesAgorot(DAYS[period] ?? 365)
  const rows = revenueBySupplier(lines)

  const body = toCsv(
    [
      'supplier_id',
      'supplier_name',
      'orders',
      'items',
      'gmv_agorot',
      'charged_on_site_agorot',
      'platform_revenue_agorot',
      'platform_revenue_ils',
      'supplier_due_agorot',
      'platform_percents',
      'effective_take_rate_pct',
    ],
    rows.map((r) => [
      r.supplierId,
      r.supplierName,
      r.orders,
      r.items,
      r.gmvAgorot,
      r.chargedOnSiteAgorot,
      r.platformRevenueAgorot,
      agorotToIls(r.platformRevenueAgorot),
      r.supplierDueAgorot,
      r.platformPercents.join('|'),
      r.effectiveTakeRatePct,
    ]),
  )

  return csvResponse(`suppliers-${period}.csv`, body)
}
```

### 8.6 Settlement CSV (physical)

```ts
// src/app/(admin)/admin/analytics/export/settlement/route.ts
import { toCsv, csvResponse } from '@/lib/analytics/csv'
import { agorotToIls } from '@/lib/commerce/money'
import { loadPhysicalSettlementLines } from '@/server/analytics/settlement-queries'
import { requireAnalyticsExport } from '@/server/analytics/require-analytics-export'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  await requireAnalyticsExport()
  const url = new URL(req.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const supplierId = url.searchParams.get('supplierId') ?? undefined

  if (!from || !to) {
    return new Response('from and to required (ISO dates)', { status: 400 })
  }

  const lines = await loadPhysicalSettlementLines({
    fromIso: new Date(`${from}T00:00:00+03:00`).toISOString(),
    toIso: new Date(`${to}T23:59:59+03:00`).toISOString(),
    supplierId,
  })

  const body = toCsv(
    [
      'order_item_id',
      'order_id',
      'paid_at',
      'supplier_id',
      'supplier_name',
      'product_name',
      'platform_percent',
      'paid_on_site_agorot',
      'paid_on_site_ils',
      'commission_agorot',
      'supplier_payout_agorot',
      'supplier_payout_ils',
      'settlement_status',
      'payout_statement_number',
    ],
    lines.map((l) => [
      l.orderItemId,
      l.orderId,
      l.paidAt,
      l.supplierId,
      l.supplierName,
      l.productName,
      l.platformPercent,
      l.paidOnSiteAgorot,
      agorotToIls(l.paidOnSiteAgorot),
      l.commissionAgorot,
      l.supplierPayoutAgorot,
      agorotToIls(l.supplierPayoutAgorot),
      l.settlementStatus,
      l.payoutStatementNumber,
    ]),
  )

  return csvResponse(`settlement-${from}_${to}.csv`, body)
}
```

### 8.7 Export menu UI

```tsx
// src/components/admin/analytics/ExportCsvMenu.tsx
import Link from 'next/link'
import type { Period } from '@/lib/analytics/types'

export function ExportCsvMenu({
  period,
  settlementFrom,
  settlementTo,
  supplierId,
}: {
  period: Period
  settlementFrom?: string
  settlementTo?: string
  supplierId?: string
}) {
  const settlementQs = new URLSearchParams()
  if (settlementFrom) settlementQs.set('from', settlementFrom)
  if (settlementTo) settlementQs.set('to', settlementTo)
  if (supplierId) settlementQs.set('supplierId', supplierId)

  return (
    <div className="flex flex-wrap gap-2 text-sm">
      <Link
        className="rounded-md border px-3 py-1.5 hover:bg-black/[0.04]"
        href={`/admin/analytics/export/sales?period=${period}`}
      >
        CSV מכירות
      </Link>
      <Link
        className="rounded-md border px-3 py-1.5 hover:bg-black/[0.04]"
        href={`/admin/analytics/export/coupons?days=90`}
      >
        CSV קופונים
      </Link>
      <Link
        className="rounded-md border px-3 py-1.5 hover:bg-black/[0.04]"
        href={`/admin/analytics/export/suppliers?period=${period}`}
      >
        CSV ספקים
      </Link>
      <Link
        className="rounded-md border px-3 py-1.5 hover:bg-black/[0.04]"
        href={`/admin/analytics/export/settlement?${settlementQs.toString()}`}
      >
        CSV התחשבנות פיזית
      </Link>
    </div>
  )
}
```

---

## 9. Analytics page (full RSC target)

```tsx
// src/app/(admin)/admin/analytics/page.tsx
import StatsCard from '@/components/admin/StatsCard'
import { CouponStatusPie } from '@/components/admin/analytics/charts/CouponStatusPie'
import { CouponTrendChart } from '@/components/admin/analytics/charts/CouponTrendChart'
import { SalesTrendChart } from '@/components/admin/analytics/charts/SalesTrendChart'
import { SupplierRevenueChart } from '@/components/admin/analytics/charts/SupplierRevenueChart'
import { ExportCsvMenu } from '@/components/admin/analytics/ExportCsvMenu'
import {
  bucketSalesAgorot,
  couponKpis,
  couponTrend,
  revenueBySupplier,
  totalsOfAgorot,
} from '@/lib/analytics/aggregate-agorot'
import { integerHe, shekelsFromAgorot } from '@/lib/analytics/format-money'
import type { Period } from '@/lib/analytics/types'
import { requireAdminPage } from '@/lib/admin/rbac'
import { loadCouponInventory } from '@/server/analytics/coupon-queries'
import { loadSalesLinesAgorot } from '@/server/analytics/sales-queries'
import { loadPhysicalSettlementLines } from '@/server/analytics/settlement-queries'
import { Coins, Receipt, ShoppingCart, Ticket, TrendingUp } from 'lucide-react'
import Link from 'next/link'

export const metadata = { title: 'אנליטיקה' }
export const dynamic = 'force-dynamic'

const PERIODS = [
  { value: 'day' as const, label: 'יומי', days: 30 },
  { value: 'week' as const, label: 'שבועי', days: 90 },
  { value: 'month' as const, label: 'חודשי', days: 365 },
]

const TABS = [
  { id: 'sales', label: 'מכירות' },
  { id: 'coupons', label: 'קופונים' },
  { id: 'suppliers', label: 'הכנסות לפי ספק' },
  { id: 'settlement', label: 'התחשבנות פיזית' },
] as const

type TabId = (typeof TABS)[number]['id']

function resolvePeriod(raw: string | undefined) {
  return PERIODS.find((p) => p.value === raw) ?? PERIODS[0]!
}

function resolveTab(raw: string | undefined): TabId {
  return TABS.some((t) => t.id === raw) ? (raw as TabId): 'sales'
}

const dayLabelFormatter = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric' })
const monthLabelFormatter = new Intl.DateTimeFormat('he-IL', {
  month: 'long',
  year: 'numeric',
})

function bucketLabel(key: string, period: Period): string {
  const [year, month, day] = key.split('-')
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12))
  if (period === 'month') return monthLabelFormatter.format(date)
  if (period === 'week') return `שבוע ${dayLabelFormatter.format(date)}`
  return dayLabelFormatter.format(date)
}

function lastMonthRange() {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { from: iso(start), to: iso(end) }
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; tab?: string; supplierId?: string }>
}) {
  await requireAdminPage()

  const sp = await searchParams
  const period = resolvePeriod(sp.period)
  const tab = resolveTab(sp.tab)
  const range = lastMonthRange()

  const [{ lines, truncated }, couponLoad, settlementLines] = await Promise.all([
    loadSalesLinesAgorot(period.days),
    loadCouponInventory(period.days),
    tab === 'settlement'
      ? loadPhysicalSettlementLines({
          fromIso: `${range.from}T00:00:00+03:00`,
          toIso: `${range.to}T23:59:59+03:00`,
          supplierId: sp.supplierId,
        })
      : Promise.resolve([]),
  ])

  const buckets = bucketSalesAgorot(lines, period.value)
  const totals = totalsOfAgorot(buckets)
  const suppliers = revenueBySupplier(lines)
  const redeemed = couponLoad.rows.filter((r) => r.status === 'redeemed')
  const kpis = couponKpis(couponLoad.rows, redeemed)
  const trend = couponTrend(couponLoad.rows, redeemed, period.value)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-heading">אנליטיקה</h1>
        <ExportCsvMenu
          period={period.value}
          settlementFrom={range.from}
          settlementTo={range.to}
          supplierId={sp.supplierId}
        />
      </div>

      <nav aria-label="טווח דיווח" className="flex gap-1 rounded-lg border border-gray-200 p-1 w-fit">
        {PERIODS.map((option) => (
          <Link
            key={option.value}
            href={`/admin/analytics?period=${option.value}&tab=${tab}`}
            aria-current={option.value === period.value ? 'page' : undefined}
            className={
              option.value === period.value
                ? 'rounded-md bg-brand-primary px-3 py-1.5 text-sm font-bold text-heading'
                : 'rounded-md px-3 py-1.5 text-sm text-black/60 hover:bg-black/[0.04]'
            }
          >
            {option.label}
          </Link>
        ))}
      </nav>

      <nav aria-label="סוג דוח" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/admin/analytics?period=${period.value}&tab=${t.id}`}
            className={
              t.id === tab
                ? 'rounded-full bg-heading px-3 py-1 text-sm text-white'
                : 'rounded-full border px-3 py-1 text-sm text-black/70'
            }
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {truncated ? (
        <p className="text-sm text-price">
          הדוח חתוך בגלל מגבלת שורות. צמצם טווח או העבר אגרגציה ל-SQL.
        </p>
      ): null}

      <p className="text-sm text-black/50">
        {period.days} הימים האחרונים. סכומים מצילום המצב ברכישה, ימי עסקים בישראל, יחידה פנימית
        אגורות.
      </p>

      {tab === 'sales' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatsCard
              label="מחזור פנים"
              value={shekelsFromAgorot(totals.gmvAgorot)}
              icon={TrendingUp}
            />
            <StatsCard
              label="הכנסת פלטפורמה"
              value={shekelsFromAgorot(totals.platformRevenueAgorot)}
              icon={Coins}
            />
            <StatsCard label="הזמנות" value={integerHe(totals.orders)} icon={ShoppingCart} />
            <StatsCard
              label="ממוצע להזמנה (נגבה)"
              value={shekelsFromAgorot(totals.aovAgorot)}
              icon={Receipt}
            />
          </div>

          <SalesTrendChart
            data={buckets.map((b) => ({
              label: bucketLabel(b.key, period.value),
              gmvAgorot: b.gmvAgorot,
              platformAgorot: b.platformRevenueAgorot,
            }))}
          />
        </>
      ): null}

      {tab === 'coupons' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatsCard label="הונפקו" value={integerHe(kpis.issued)} icon={Ticket} />
            <StatsCard label="מומשו (נסרקו)" value={integerHe(kpis.redeemed)} icon={Ticket} />
            <StatsCard label="הונפקו ולא מומשו" value={integerHe(kpis.outstanding)} icon={Ticket} />
            <StatsCard
              label="שיעור מימוש"
              value={kpis.redemptionRatePct == null ? ':' : `${kpis.redemptionRatePct}%`}
              icon={TrendingUp}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <CouponStatusPie
              outstanding={kpis.outstanding}
              redeemed={kpis.redeemed}
              expired={kpis.expired}
              other={kpis.cancelledOrRefunded}
            />
            <CouponTrendChart
              data={trend.map((t) => ({
                label: bucketLabel(t.key, period.value),
                issued: t.issued,
                redeemed: t.redeemed,
              }))}
            />
          </div>
          <p className="text-sm text-black/50">
            כסף קופון שנגבה באתר נשאר בפלטפורמה. המימוש הוא סריקת QR אצל הספק, לא תשלום נוסף
            דרך KE.
          </p>
        </>
      ): null}

      {tab === 'suppliers' ? (
        <>
          <SupplierRevenueChart
            data={suppliers.map((s) => ({
              name: s.supplierName,
              platformAgorot: s.platformRevenueAgorot,
            }))}
          />
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-black/[0.03] text-right">
                <tr>
                  <th className="px-3 py-2">ספק</th>
                  <th className="px-3 py-2">הזמנות</th>
                  <th className="px-3 py-2">נגבה באתר</th>
                  <th className="px-3 py-2">הכנסת פלטפורמה</th>
                  <th className="px-3 py-2">מגיע לספק (פיזי)</th>
                  <th className="px-3 py-2">% צילום</th>
                  <th className="px-3 py-2">Take אפקטיבי</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.supplierId ?? s.supplierName} className="border-t">
                    <td className="px-3 py-2">
                      {s.supplierId ? (
                        <Link className="underline" href={`/admin/suppliers/${s.supplierId}`}>
                          {s.supplierName}
                        </Link>
                      ): (
                        s.supplierName
                      )}
                    </td>
                    <td className="px-3 py-2">{integerHe(s.orders)}</td>
                    <td className="px-3 py-2">{shekelsFromAgorot(s.chargedOnSiteAgorot)}</td>
                    <td className="px-3 py-2">{shekelsFromAgorot(s.platformRevenueAgorot)}</td>
                    <td className="px-3 py-2">{shekelsFromAgorot(s.supplierDueAgorot)}</td>
                    <td className="px-3 py-2">
                      {s.platformPercents.map((p) => `${p}%`).join(', ') || ':'}
                    </td>
                    <td className="px-3 py-2">
                      {s.effectiveTakeRatePct == null ? ':' : `${s.effectiveTakeRatePct}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ): null}

      {tab === 'settlement' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatsCard
              label="נגבה באתר (פיזי)"
              value={shekelsFromAgorot(
                settlementLines.reduce((a, l) => a + l.paidOnSiteAgorot, 0),
              )}
              icon={Coins}
            />
            <StatsCard
              label="עמלת פלטפורמה"
              value={shekelsFromAgorot(
                settlementLines.reduce((a, l) => a + l.commissionAgorot, 0),
              )}
              icon={TrendingUp}
            />
            <StatsCard
              label="לתשלום לספקים"
              value={shekelsFromAgorot(
                settlementLines.reduce((a, l) => a + l.supplierPayoutAgorot, 0),
              )}
              icon={Receipt}
            />
          </div>
          <p className="text-sm">
            טווח ברירת מחדל: חודש קלנדרי קודם ({range.from} → {range.to}). יצירת / אישור דוחות
            ב-
            <Link className="underline" href="/admin/payouts">
              תשלומים לספקים
            </Link>
            .
          </p>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-black/[0.03] text-right">
                <tr>
                  <th className="px-3 py-2">הזמנה</th>
                  <th className="px-3 py-2">ספק</th>
                  <th className="px-3 py-2">מוצר</th>
                  <th className="px-3 py-2">%</th>
                  <th className="px-3 py-2">נגבה</th>
                  <th className="px-3 py-2">עמלה</th>
                  <th className="px-3 py-2">לספק</th>
                  <th className="px-3 py-2">סטטוס</th>
                  <th className="px-3 py-2">דוח</th>
                </tr>
              </thead>
              <tbody>
                {settlementLines.map((l) => (
                  <tr key={l.orderItemId} className="border-t">
                    <td className="px-3 py-2">
                      <Link className="underline" href={`/admin/orders/${l.orderId}`}>
                        {l.orderId.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{l.supplierName ?? ':'}</td>
                    <td className="px-3 py-2">{l.productName ?? ':'}</td>
                    <td className="px-3 py-2">
                      {l.platformPercent == null ? ':' : `${l.platformPercent}%`}
                    </td>
                    <td className="px-3 py-2">{shekelsFromAgorot(l.paidOnSiteAgorot)}</td>
                    <td className="px-3 py-2">{shekelsFromAgorot(l.commissionAgorot)}</td>
                    <td className="px-3 py-2">{shekelsFromAgorot(l.supplierPayoutAgorot)}</td>
                    <td className="px-3 py-2">{l.settlementStatus ?? ':'}</td>
                    <td className="px-3 py-2">{l.payoutStatementNumber ?? ':'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ): null}
    </div>
  )
}
```

---

## 10. Dashboard bridge (existing `/admin/dashboard`)

Keep today’s cards. Add links only (no second ledger):

| Card | Link |
|---|---|
| נגבה באתר היום | `/admin/analytics?period=day&tab=sales` |
| מימושים היום | `/admin/analytics?period=day&tab=coupons` |
| (new optional) מגיע לספקים החודש | `/admin/analytics?tab=settlement` |

Prefer vouchers `status='redeemed'` + `redeemed_at` for “מימושים היום” over legacy `coupon_codes.status='used'` when both exist.

---

## 11. Indexes (SQL)

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_admin_analytics_indexes.sql

CREATE INDEX IF NOT EXISTS order_items_paid_analytics_idx
  ON public.order_items (product_type, supplier_id)
  WHERE deleted_at IS NULL;

-- paid_at filter goes through orders!inner; ensure:
CREATE INDEX IF NOT EXISTS orders_paid_at_not_deleted_idx
  ON public.orders (paid_at DESC)
  WHERE deleted_at IS NULL AND paid_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS vouchers_issued_at_idx
  ON public.vouchers (issued_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS vouchers_redeemed_at_idx
  ON public.vouchers (redeemed_at DESC)
  WHERE deleted_at IS NULL AND status = 'redeemed';

CREATE INDEX IF NOT EXISTS payout_statement_lines_order_item_idx
  ON public.payout_statement_lines (order_item_id);
```

When `MAX_LINES` truncates in production, replace TS aggregation with SQL views:

- `v_admin_sales_daily_agorot`
- `v_admin_supplier_revenue_agorot`
- `v_admin_coupon_funnel_daily`

Same column semantics as this doc.

---

## 12. RBAC + audit

| Action | Guard | Audit |
|---|---|---|
| View analytics tabs | `requireAdminPage()` | optional `analytics.view` |
| CSV download | same | `analytics.export` with `{ type, period, rowCount }` |
| Settlement CSV | same | `analytics.export` `type=settlement` |
| Create payout | existing `/admin/payouts` + `requireSection('payments')` | existing |

Staff must not reach `/admin/analytics/**` (already false in `ADMIN_SECTIONS`).

---

## 13. Tests (binding)

```ts
// src/lib/analytics/aggregate-agorot.test.ts
import { describe, expect, it } from 'vitest'
import {
  bucketSalesAgorot,
  couponKpis,
  revenueBySupplier,
  totalsOfAgorot,
} from './aggregate-agorot'
import type { SaleLineAgorot } from './types'

const line = (partial: Partial<SaleLineAgorot>): SaleLineAgorot => ({
  paidAt: '2026-07-15T10:00:00+03:00',
  orderId: 'o1',
  orderItemId: 'i1',
  productId: 'p1',
  productName: 'בדיקה',
  productType: 'physical',
  supplierId: 's1',
  supplierName: 'ספק א',
  platformPercent: 20,
  faceValueAgorot: 10000,
  paidOnSiteAgorot: 10000,
  commissionAgorot: 2000,
  supplierImmediateAgorot: 8000,
  supplierDueAgorot: 8000,
  ...partial,
})

describe('bucketSalesAgorot', () => {
  it('sums agorot without floating drift', () => {
    const buckets = bucketSalesAgorot(
      [line({}), line({ orderItemId: 'i2', orderId: 'o2', commissionAgorot: 500 })],
      'day',
    )
    const totals = totalsOfAgorot(buckets)
    expect(totals.platformRevenueAgorot).toBe(2500)
    expect(totals.orders).toBe(2)
  })
})

describe('revenueBySupplier', () => {
  it('groups platform cut by supplier snapshot', () => {
    const rows = revenueBySupplier([
      line({}),
      line({
        orderItemId: 'i2',
        supplierId: 's2',
        supplierName: 'ספק ב',
        commissionAgorot: 1000,
        supplierDueAgorot: 9000,
      }),
    ])
    expect(rows[0]?.supplierId).toBe('s1')
    expect(rows[0]?.platformRevenueAgorot).toBe(2000)
  })
})

describe('couponKpis', () => {
  it('counts outstanding issued vs redeemed', () => {
    const k = couponKpis(
      [
        {
          voucherId: '1',
          code: 'A',
          productId: null,
          productName: null,
          supplierId: null,
          status: 'issued',
          issuedAt: '2026-07-01T00:00:00Z',
          redeemedAt: null,
          expiresAt: '2099-01-01T00:00:00Z',
          paidOnSiteAgorot: 5000,
          faceValueAgorot: 10000,
        },
        {
          voucherId: '2',
          code: 'B',
          productId: null,
          productName: null,
          supplierId: null,
          status: 'redeemed',
          issuedAt: '2026-07-01T00:00:00Z',
          redeemedAt: '2026-07-10T00:00:00Z',
          expiresAt: null,
          paidOnSiteAgorot: 5000,
          faceValueAgorot: 10000,
        },
      ],
      [
        {
          voucherId: '2',
          code: 'B',
          productId: null,
          productName: null,
          supplierId: null,
          status: 'redeemed',
          issuedAt: '2026-07-01T00:00:00Z',
          redeemedAt: '2026-07-10T00:00:00Z',
          expiresAt: null,
          paidOnSiteAgorot: 5000,
          faceValueAgorot: 10000,
        },
      ],
    )
    expect(k.outstanding).toBe(1)
    expect(k.redeemed).toBe(1)
  })
})
```

---

## 14. Implementation checklist

1. `pnpm add recharts`
2. Add `types.ts`, `aggregate-agorot.ts`, `format-money.ts`, `csv.ts`
3. Add sales / coupon / settlement query modules (agorot)
4. Replace CSS sales chart with `SalesTrendChart`; keep funnel CSS or migrate later
5. Tabs on `/admin/analytics`
6. Four CSV route handlers under `export/`
7. Indexes migration
8. Vitest for aggregations
9. Wire dashboard deep-links
10. Confirm coupon panel copy: scanned ≠ payout of prepaid coupon money

---

## 15. Out of scope

- Affiliate BI (separate `/admin/affiliates`)
- Customer PII exports (legal JSON export path)
- Recalculating historical commission from live `products.platform_percent`
- Escrow release workflows for coupons (removed from money model)
- Rebuilding `/admin/payouts` generate/approve UI (already exists)

---

## 16. Revision

| Date | Change |
|---|---|
| 2026-07-30 | Initial binding Admin analytics expansion on `arch/admin-analytics` |
