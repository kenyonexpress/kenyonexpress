/**
 * A/B test arithmetic for the admin experiments page. Pure, dependency-free,
 * and deliberately conservative: every number here is a two-sided test at
 * alpha 0.05 with a Wilson interval, and a variant is only ever called a
 * winner or a loser when BOTH arms cleared the minimum exposure floor and the
 * p-value cleared alpha. Everything else reads "inconclusive", never "trending".
 *
 * Rates are ratios, not money, so plain floats are fine here. Nothing in this
 * file may ever be handed an agorot amount.
 */

export type VariantCounts = {
  variant: string
  /** Distinct identities that saw this variant. */
  exposures: number
  /** Distinct exposed identities that reached the goal event. */
  conversions: number
}

export type Verdict = 'control' | 'insufficient' | 'inconclusive' | 'better' | 'worse'

export type VariantStat = VariantCounts & {
  isControl: boolean
  /** conversions / exposures, 0 when nothing was exposed. */
  rate: number
  /** Wilson 95% interval on the rate. [0, 0] when nothing was exposed. */
  ci95: readonly [number, number]
  /** Relative lift over control in percent; null for control or when control has no rate. */
  liftPct: number | null
  /** Two-proportion pooled z against control; null for control. */
  zScore: number | null
  /** Two-sided p-value against control; null for control. */
  pValue: number | null
  verdict: Verdict
}

/**
 * Below this many exposures in EITHER arm no verdict is issued. 100 is not a
 * power calculation, it is the floor under which a single bot session moves
 * the rate by a whole percentage point; requiredExposuresPerVariant below is
 * the real number for a given effect.
 */
export const MIN_EXPOSURES_PER_VARIANT = 100

export const SIGNIFICANCE_ALPHA = 0.05

/** z for a two-sided 95% interval. */
const Z_95 = 1.959963984540054

/** Abramowitz and Stegun 7.1.26: max error 1.5e-7, more than a dashboard needs. */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1
  const abs = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * abs)
  const poly =
    t *
    (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))))
  return sign * (1 - poly * Math.exp(-abs * abs))
}

/** Standard normal CDF. */
export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2))
}

/**
 * Wilson score interval. Preferred over the Wald interval because conversion
 * rates here sit near zero, where Wald produces negative lower bounds and
 * intervals that miss the true rate far more often than 5% of the time.
 */
export function wilsonInterval(
  successes: number,
  trials: number,
  z: number = Z_95,
): readonly [number, number] {
  if (trials <= 0) return [0, 0]
  const p = successes / trials
  const z2 = z * z
  const denominator = 1 + z2 / trials
  const centre = (p + z2 / (2 * trials)) / denominator
  const half = (z * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials))) / denominator
  return [Math.max(0, centre - half), Math.min(1, centre + half)]
}

export type ProportionSample = { successes: number; trials: number }

/**
 * Pooled two-proportion z-test, two-sided. Returns null z and p when either
 * sample is empty or the pooled variance is zero (both arms at 0% or 100%),
 * because a division by zero there is not "no difference", it is "no test".
 */
export function twoProportionZTest(
  a: ProportionSample,
  b: ProportionSample,
): { z: number | null; p: number | null } {
  if (a.trials <= 0 || b.trials <= 0) return { z: null, p: null }
  const pooled = (a.successes + b.successes) / (a.trials + b.trials)
  const variance = pooled * (1 - pooled) * (1 / a.trials + 1 / b.trials)
  if (variance <= 0) return { z: null, p: null }
  const z = (b.successes / b.trials - a.successes / a.trials) / Math.sqrt(variance)
  const p = 2 * (1 - normalCdf(Math.abs(z)))
  return { z, p: Math.min(1, Math.max(0, p)) }
}

/**
 * Exposures per arm needed to detect a relative change of `relativeMde` from
 * `baselineRate` at two-sided alpha 0.05 and 80% power. The standard
 * two-sample formula with pooled variance under H0 and separate variances
 * under H1. Returns Infinity when the baseline is 0 or the effect is 0, so a
 * page never prints "0 more exposures needed".
 */
export function requiredExposuresPerVariant(
  baselineRate: number,
  relativeMde: number,
  alpha: number = SIGNIFICANCE_ALPHA,
  power = 0.8,
): number {
  if (baselineRate <= 0 || baselineRate >= 1 || relativeMde <= 0) return Number.POSITIVE_INFINITY
  const p1 = baselineRate
  const p2 = Math.min(0.999999, p1 * (1 + relativeMde))
  const delta = p2 - p1
  if (delta <= 0) return Number.POSITIVE_INFINITY
  const pBar = (p1 + p2) / 2
  const zAlpha = normalQuantile(1 - alpha / 2)
  const zBeta = normalQuantile(power)
  const numerator =
    zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) + zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))
  return Math.ceil((numerator * numerator) / (delta * delta))
}

/**
 * Inverse normal CDF by bisection on normalCdf. Twelve decimal places in a
 * few dozen iterations; called once or twice per page render, never per row.
 */
export function normalQuantile(probability: number): number {
  if (probability <= 0) return Number.NEGATIVE_INFINITY
  if (probability >= 1) return Number.POSITIVE_INFINITY
  let low = -10
  let high = 10
  for (let i = 0; i < 100; i += 1) {
    const mid = (low + high) / 2
    if (normalCdf(mid) < probability) low = mid
    else high = mid
  }
  return (low + high) / 2
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * The per-variant table. Control is always first, then the others in the
 * order given. Unknown control name: every row is "insufficient", because a
 * comparison against nothing is not a comparison.
 */
export function experimentStats(rows: readonly VariantCounts[], control: string): VariantStat[] {
  const controlRow = rows.find((row) => row.variant === control)
  const ordered = controlRow
    ? [controlRow, ...rows.filter((row) => row.variant !== control)]
    : [...rows]

  return ordered.map((row) => {
    const rate = row.exposures > 0 ? row.conversions / row.exposures : 0
    const ci95 = wilsonInterval(row.conversions, row.exposures)
    const base = {
      ...row,
      isControl: row.variant === control,
      rate,
      ci95,
    }

    if (row.variant === control) {
      return { ...base, liftPct: null, zScore: null, pValue: null, verdict: 'control' as const }
    }
    if (!controlRow) {
      return {
        ...base,
        liftPct: null,
        zScore: null,
        pValue: null,
        verdict: 'insufficient' as const,
      }
    }

    const controlRate = controlRow.exposures > 0 ? controlRow.conversions / controlRow.exposures : 0
    const liftPct = controlRate > 0 ? round1(((rate - controlRate) / controlRate) * 100) : null
    const { z, p } = twoProportionZTest(
      { successes: controlRow.conversions, trials: controlRow.exposures },
      { successes: row.conversions, trials: row.exposures },
    )

    let verdict: Verdict
    if (
      row.exposures < MIN_EXPOSURES_PER_VARIANT ||
      controlRow.exposures < MIN_EXPOSURES_PER_VARIANT
    ) {
      verdict = 'insufficient'
    } else if (p === null || z === null || p >= SIGNIFICANCE_ALPHA) {
      verdict = 'inconclusive'
    } else {
      verdict = z > 0 ? 'better' : 'worse'
    }

    return { ...base, liftPct, zScore: z, pValue: p, verdict }
  })
}
