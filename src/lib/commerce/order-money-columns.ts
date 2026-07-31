/**
 * Which columns an order and its lines are actually written to.
 *
 * WHY THIS EXISTS
 *
 * `beginCheckout` wrote `orders` with six columns the hosted project does not
 * have (`subtotal_agorot`, `discount_agorot`, `wallet_applied_agorot`,
 * `cashback_applied_agorot`, `customer_pays_now_agorot`, `total_agorot`) and
 * omitted the two it declares NOT NULL with no default (`subtotal_ils`,
 * `total_ils`). It wrote `order_items` with fourteen more that do not exist.
 * Postgres answers 42703 and fails the whole INSERT, so **no order could be
 * created at all** and the purchase flow ended at the first write.
 *
 * The literal also wrote several aliases of the same number at once
 * (`commission_agorot` AND `platform_fee_agorot`, `supplier_due_agorot` AND
 * `supplier_immediate_agorot` AND `supplier_payout_agorot`), which reads as an
 * attempt to satisfy every schema this project has ever had by naming all of
 * them. That cannot work: one missing name fails the statement, so naming more
 * spellings makes failure MORE likely, not less.
 *
 * THE SHAPE OF THE FIX
 *
 * One sentinel probe per table decides which generation the database is, and a
 * single explicit column set is written for that generation. The pre-059 set is
 * verified against `information_schema` on the hosted project. The post-059 set
 * is exactly the literal that was there before, so a database that HAS been cut
 * over keeps the behaviour it had; nothing is guessed for a schema that cannot
 * be tested from here.
 *
 * Canonical units in, database units out: money arrives in integer agorot and
 * rates in basis points, matching what `settlement` and `splitOnSiteCharge`
 * already compute. `ils` columns are numeric shekels and `percent` columns are
 * whole percents, so both are divided by 100 on the way out.
 */

/** Which generation of money columns a table carries. */
export type MoneySchemaGeneration = 'agorot' | 'ils'

/** Postgres: undefined_column. */
const UNDEFINED_COLUMN = '42703'

export type ColumnProbe = (column: string) => PromiseLike<{
  error: { code?: string; message?: string } | null
}>

/**
 * The minimum of a Supabase client this needs. Structural rather than the real
 * client type, because the real one resolves the row shape from the select
 * string and cannot do that for one built at runtime.
 */
type ProbeableClient = {
  from(table: string): {
    select(columns: string): {
      limit(count: number): PromiseLike<{ error: { code?: string; message?: string } | null }>
    }
  }
}

/** `select <column> limit 0`: planned, so 42703 is raised without reading a row. */
export function moneyColumnProbe(
  client: ProbeableClient,
  table: 'orders' | 'order_items' = 'orders',
): ColumnProbe {
  return (column: string) =>
    client
      .from(table)
      .select(column)
      .limit(0)
      .then(({ error }) => ({ error }))
}

function toIls(agorot: number): number {
  return Math.round(agorot) / 100
}

function toPercent(basisPoints: number): number {
  return Math.round(basisPoints) / 100
}

// ---------------------------------------------------------------------------
// orders
// ---------------------------------------------------------------------------

export interface OrderMoney {
  /** Sum of the lines at face value, agorot. */
  faceValueAgorot: number
  /** Discount code funded by the platform, agorot. */
  discountAgorot: number
  /** Wallet credit spent, agorot. */
  walletAppliedAgorot: number
  /** What the card is charged now, agorot. */
  paidOnSiteAgorot: number
}

/**
 * `subtotal_ils` and `total_ils` are NOT NULL with no default on the hosted
 * project, so omitting them is as fatal as naming a column that is missing.
 * There is no `customer_pays_now` and no `wallet_applied` column there at all:
 * the total IS what the card is charged, and the wallet spend is carried by
 * `cashback_applied_ils`.
 */
export function buildOrderMoneyRow(
  generation: MoneySchemaGeneration,
  money: OrderMoney,
): Record<string, number> {
  if (generation === 'agorot') {
    return {
      subtotal_agorot: money.faceValueAgorot,
      discount_agorot: money.discountAgorot,
      wallet_applied_agorot: money.walletAppliedAgorot,
      cashback_applied_agorot: money.walletAppliedAgorot,
      customer_pays_now_agorot: money.paidOnSiteAgorot,
      total_agorot: money.paidOnSiteAgorot,
    }
  }
  return {
    subtotal_ils: toIls(money.faceValueAgorot),
    discount_ils: toIls(money.discountAgorot),
    cashback_applied_ils: toIls(money.walletAppliedAgorot),
    total_ils: toIls(money.paidOnSiteAgorot),
  }
}

/** The money columns a read of `orders` must name, for this generation. */
export function orderMoneySelect(generation: MoneySchemaGeneration): string {
  return generation === 'agorot'
    ? 'subtotal_agorot, total_agorot, customer_pays_now_agorot, cashback_applied_agorot'
    : 'subtotal_ils, total_ils, cashback_applied_ils'
}

export interface OrderMoneyRead {
  subtotalAgorot: number
  /** What the customer actually paid on the site. */
  totalAgorot: number
  walletAppliedAgorot: number
}

function fromIls(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0
}

function fromAgorot(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed) : 0
}

/**
 * Normalises an order row's money to agorot, whichever generation it came from.
 *
 * Reading is where this bites the customer rather than the operator: the
 * confirmation page selected `total_agorot` and friends, 42703 failed the whole
 * select, the row came back null and the page called `notFound()`. Someone who
 * had just paid was shown a 404, and `/account/orders` was empty for the same
 * reason.
 *
 * Pre-059 has no `customer_pays_now`: `total_ils` IS what was charged.
 */
export function readOrderMoney(
  generation: MoneySchemaGeneration,
  row: Record<string, unknown> | null | undefined,
): OrderMoneyRead {
  if (!row) return { subtotalAgorot: 0, totalAgorot: 0, walletAppliedAgorot: 0 }
  if (generation === 'agorot') {
    return {
      subtotalAgorot: fromAgorot(row.subtotal_agorot),
      totalAgorot: fromAgorot(row.customer_pays_now_agorot ?? row.total_agorot),
      walletAppliedAgorot: fromAgorot(row.cashback_applied_agorot),
    }
  }
  return {
    subtotalAgorot: fromIls(row.subtotal_ils),
    totalAgorot: fromIls(row.total_ils),
    walletAppliedAgorot: fromIls(row.cashback_applied_ils),
  }
}

// ---------------------------------------------------------------------------
// order_items
// ---------------------------------------------------------------------------

export interface OrderItemMoney {
  /** Sticker price of one unit, agorot. */
  unitPriceAgorot: number
  /** Whole line at face value, agorot. */
  faceValueAgorot: number
  /** Charged on the site for this line, agorot. */
  paidOnSiteAgorot: number
  /** The platform's take out of the on-site charge, agorot. */
  commissionAgorot: number
  /** Owed to the supplier out of the on-site charge, agorot. */
  supplierDueAgorot: number
  /** Collected by the business at its counter, agorot. */
  balanceDueAgorot: number
  /** Wallet credit this line earns, agorot. */
  cashbackAgorot: number
  /** The line's split, basis points. 30% is 3000. */
  platformBasisPoints: number
}

/**
 * The pre-059 set is deliberately one column per number.
 *
 * `order_items` on the hosted project is a hybrid: 070 added the agorot columns
 * (`paid_on_site_agorot`, `commission_agorot`, `face_value_agorot`,
 * `supplier_immediate_agorot`, `balance_due_agorot`, `cashback_amount_agorot`)
 * to a table whose original money columns are still shekels
 * (`unit_price_ils`, `total_price_ils`, `supplier_payout_ils`,
 * `cashback_earned_ils`) and whose rates are still whole percents. So the split
 * is not "all agorot" or "all shekels" and cannot be derived from one rule; it
 * is listed.
 *
 * `escrow_held_agorot` and `escrow_release_agorot` stay at 0. They are the
 * legacy 046/047 shape, the escrow model is abolished, and writing 0 says that
 * plainly rather than leaving NULL to be read as unknown.
 */
export function buildOrderItemMoneyRow(
  generation: MoneySchemaGeneration,
  money: OrderItemMoney,
): Record<string, number> {
  if (generation === 'agorot') {
    return {
      unit_price_agorot: money.unitPriceAgorot,
      total_price_agorot: money.faceValueAgorot,
      face_value_agorot: money.faceValueAgorot,
      customer_pays_now_agorot: money.paidOnSiteAgorot,
      paid_on_site_agorot: money.paidOnSiteAgorot,
      charged_on_site_agorot: money.paidOnSiteAgorot,
      platform_fee_agorot: money.commissionAgorot,
      commission_agorot: money.commissionAgorot,
      supplier_due_agorot: money.supplierDueAgorot,
      supplier_immediate_agorot: money.supplierDueAgorot,
      supplier_payout_agorot: money.supplierDueAgorot,
      balance_due_agorot: money.balanceDueAgorot,
      balance_due_at_business_agorot: money.balanceDueAgorot,
      cashback_amount_agorot: money.cashbackAgorot,
      cashback_earned_agorot: money.cashbackAgorot,
      platform_bp: money.platformBasisPoints,
      commission_bp: money.platformBasisPoints,
      upfront_bp: money.platformBasisPoints,
      commission_snapshot_bp: money.platformBasisPoints,
      cashback_bp: 0,
      escrow_held_agorot: 0,
      escrow_release_agorot: 0,
    }
  }
  return {
    unit_price_ils: toIls(money.unitPriceAgorot),
    total_price_ils: toIls(money.faceValueAgorot),
    face_value_agorot: money.faceValueAgorot,
    paid_on_site_agorot: money.paidOnSiteAgorot,
    commission_agorot: money.commissionAgorot,
    supplier_immediate_agorot: money.supplierDueAgorot,
    supplier_payout_ils: toIls(money.supplierDueAgorot),
    balance_due_agorot: money.balanceDueAgorot,
    cashback_amount_agorot: money.cashbackAgorot,
    cashback_earned_ils: toIls(money.cashbackAgorot),
    platform_percent: toPercent(money.platformBasisPoints),
    commission_percent: toPercent(money.platformBasisPoints),
    upfront_percent: toPercent(money.platformBasisPoints),
    commission_percent_snapshot: toPercent(money.platformBasisPoints),
    cashback_percent: 0,
    escrow_held_agorot: 0,
    escrow_release_agorot: 0,
  }
}

// ---------------------------------------------------------------------------
// resolution
// ---------------------------------------------------------------------------

const generations = new Map<string, MoneySchemaGeneration>()

/**
 * One probe per table per process. `limit 0` still plans the statement, so
 * 42703 is raised without reading a row.
 *
 * An error that is NOT a missing column resolves to `agorot` without caching:
 * a transient failure must not pin a process to the wrong generation for its
 * lifetime, and `agorot` is the pre-existing behaviour.
 */
async function resolveGeneration(
  table: string,
  sentinel: string,
  probe: ColumnProbe,
): Promise<MoneySchemaGeneration> {
  const cached = generations.get(table)
  if (cached) return cached

  let result: { error: { code?: string } | null }
  try {
    result = await probe(sentinel)
  } catch {
    return 'agorot'
  }

  if (!result.error) {
    generations.set(table, 'agorot')
    return 'agorot'
  }
  if (result.error.code !== UNDEFINED_COLUMN) return 'agorot'

  generations.set(table, 'ils')
  return 'ils'
}

/** Sentinel `total_agorot`: added by 042, absent before it. */
export function resolveOrderGeneration(probe: ColumnProbe): Promise<MoneySchemaGeneration> {
  return resolveGeneration('orders', 'total_agorot', probe)
}

/** Sentinel `platform_bp`: 059 moves the rate to basis points under this name. */
export function resolveOrderItemGeneration(probe: ColumnProbe): Promise<MoneySchemaGeneration> {
  return resolveGeneration('order_items', 'platform_bp', probe)
}

/** Test seam. Never called by application code. */
export function __resetMoneyGenerationCache(): void {
  generations.clear()
}
