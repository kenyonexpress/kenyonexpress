/**
 * Pure decisions behind scripts/dr/pitr.mjs: what the Supabase management API
 * says about point-in-time recovery, and what it would take to turn it on.
 *
 * Measured on 2026-10-08 against project ixvwfbuvfxxsjiywhbbb:
 *   GET /v1/projects/{ref}/database/backups  -> pitr_enabled: false,
 *     walg_enabled: true, seven COMPLETED physical backups (Pro daily)
 *   GET /v1/projects/{ref}/billing/addons    -> selected_addons: [] (so the
 *     project runs on the free Nano compute), pitr variants pitr_7 $100/mo,
 *     pitr_14 $200/mo, pitr_28 $400/mo; Small compute $15/mo.
 *
 * PITR is a paid add-on and Supabase requires at least the Small compute
 * add-on underneath it. planPitrEnable turns that rule into an ordered list of
 * PATCH bodies so the enable path is one reviewed command rather than two
 * dashboard clicks that are easy to half-finish. It never performs them.
 */

export const PITR_VARIANTS = ['pitr_7', 'pitr_14', 'pitr_28']
export const DEFAULT_PITR_VARIANT = 'pitr_7'

/** Supabase refuses PITR below Small compute; Nano (no add-on) and Micro are below it. */
export const MIN_COMPUTE_FOR_PITR = 'ci_small'

/** Compute variants, cheapest first, as the API lists them. Nano is the implicit no-add-on tier. */
export const COMPUTE_ORDER = [
  'ci_nano',
  'ci_micro',
  'ci_small',
  'ci_medium',
  'ci_large',
  'ci_xlarge',
  'ci_2xlarge',
  'ci_4xlarge',
  'ci_8xlarge',
  'ci_12xlarge',
  'ci_16xlarge',
  'ci_24xlarge',
  'ci_48xlarge',
]

// An id the list does not know ranks as infinitely large: the planner must
// never downgrade a compute tier it cannot place, and the API rejects PITR
// on its own if the tier is really too small.
const rank = (variantId) => {
  const base = String(variantId ?? 'ci_nano').replace(
    /_(optimized_cpu|optimized_memory|high_memory)$/,
    '',
  )
  const i = COMPUTE_ORDER.indexOf(base)
  return i === -1 ? Number.POSITIVE_INFINITY : i
}

/** The selected variant id for an add-on type, or null when none is selected. */
export function selectedVariant(addons, type) {
  for (const a of addons?.selected_addons ?? []) {
    if (a?.type === type) return a.variant?.id ?? null
  }
  return null
}

/** Price (USD/month, as the API describes it) of a variant, or null when unknown. */
export function variantMonthlyUsd(addons, type, variantId) {
  for (const a of addons?.available_addons ?? []) {
    if (a?.type !== type) continue
    for (const v of a.variants ?? []) {
      if (v?.id !== variantId) continue
      const m = /\$([\d,.]+)\/month/.exec(v.price?.description ?? '')
      if (m) return Number(m[1].replace(/,/g, ''))
      if (v.price?.interval === 'monthly' && typeof v.price.amount === 'number')
        return v.price.amount
      return null
    }
  }
  return null
}

/** True when the selected compute variant satisfies Supabase's PITR floor. */
export function computeMeetsPitrFloor(addons) {
  return rank(selectedVariant(addons, 'compute_instance')) >= rank(MIN_COMPUTE_FOR_PITR)
}

/**
 * Snapshot of the PITR situation from the two management-API documents.
 * `backups` is GET .../database/backups, `addons` is GET .../billing/addons.
 */
export function pitrStatus({ backups, addons, now = new Date() }) {
  let newestPlatformBackupAt = null
  let completedBackups = 0
  for (const b of backups?.backups ?? []) {
    if (b?.status !== 'COMPLETED') continue
    completedBackups += 1
    const t = Date.parse(b.inserted_at ?? '')
    if (!Number.isNaN(t) && (newestPlatformBackupAt === null || t > newestPlatformBackupAt)) {
      newestPlatformBackupAt = t
    }
  }
  const pitrVariant = selectedVariant(addons, 'pitr')
  const computeVariant = selectedVariant(addons, 'compute_instance') ?? 'ci_nano'
  return {
    pitrEnabled: backups?.pitr_enabled === true,
    walgEnabled: backups?.walg_enabled === true,
    region: backups?.region ?? null,
    completedBackups,
    newestPlatformBackupAgeHours:
      newestPlatformBackupAt === null
        ? null
        : Math.round((now.getTime() - newestPlatformBackupAt) / 3_600_000),
    pitrVariant,
    computeVariant,
    computeMeetsFloor: computeMeetsPitrFloor(addons),
    pitrVariantsAvailable: (addons?.available_addons ?? [])
      .filter((a) => a?.type === 'pitr')
      .flatMap((a) =>
        (a.variants ?? []).map((v) => ({ id: v.id, price: v.price?.description ?? '' })),
      ),
  }
}

/**
 * Ordered PATCH bodies for /v1/projects/{ref}/billing/addons that would enable
 * PITR at `variant`, upgrading compute to the floor first when needed. Empty
 * when PITR at that variant is already selected. Throws on an unknown variant
 * so a typo cannot buy the wrong thing.
 */
export function planPitrEnable({ addons, variant = DEFAULT_PITR_VARIANT }) {
  if (!PITR_VARIANTS.includes(variant)) {
    throw new Error(`unknown PITR variant "${variant}" (one of ${PITR_VARIANTS.join(', ')})`)
  }
  const steps = []
  let monthlyUsd = 0
  if (!computeMeetsPitrFloor(addons)) {
    const price = variantMonthlyUsd(addons, 'compute_instance', MIN_COMPUTE_FOR_PITR)
    steps.push({
      addon_type: 'compute_instance',
      addon_variant: MIN_COMPUTE_FOR_PITR,
      reason: `PITR requires at least ${MIN_COMPUTE_FOR_PITR}; current compute is ${selectedVariant(addons, 'compute_instance') ?? 'ci_nano'}`,
      monthlyUsd: price,
    })
    if (price !== null) monthlyUsd += price
  }
  if (selectedVariant(addons, 'pitr') !== variant) {
    const price = variantMonthlyUsd(addons, 'pitr', variant)
    steps.push({
      addon_type: 'pitr',
      addon_variant: variant,
      reason:
        selectedVariant(addons, 'pitr') === null
          ? 'PITR is not enabled'
          : `PITR is at ${selectedVariant(addons, 'pitr')}, requested ${variant}`,
      monthlyUsd: price,
    })
    if (price !== null) monthlyUsd += price
  }
  return { steps, monthlyUsd }
}
