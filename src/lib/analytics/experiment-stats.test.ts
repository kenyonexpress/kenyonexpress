import { describe, expect, it } from 'vitest'
import {
  MIN_EXPOSURES_PER_VARIANT,
  erf,
  experimentStats,
  normalCdf,
  normalQuantile,
  requiredExposuresPerVariant,
  twoProportionZTest,
  wilsonInterval,
} from './experiment-stats'

describe('normal distribution helpers', () => {
  it('erf matches tabulated values to 1e-6', () => {
    expect(erf(0)).toBeCloseTo(0, 6)
    expect(erf(0.5)).toBeCloseTo(0.5204999, 6)
    expect(erf(1)).toBeCloseTo(0.8427008, 6)
    expect(erf(-1)).toBeCloseTo(-0.8427008, 6)
    expect(erf(2)).toBeCloseTo(0.9953223, 6)
  })

  it('normalCdf hits the textbook quantiles', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6)
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 5)
    expect(normalCdf(-1.644854)).toBeCloseTo(0.05, 5)
  })

  it('normalQuantile inverts normalCdf', () => {
    expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 4)
    expect(normalQuantile(0.8)).toBeCloseTo(0.841621, 4)
    expect(normalQuantile(0.5)).toBeCloseTo(0, 6)
    expect(normalQuantile(0)).toBe(Number.NEGATIVE_INFINITY)
    expect(normalQuantile(1)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('wilsonInterval', () => {
  it('reproduces the known interval for 50 of 1000', () => {
    const [low, high] = wilsonInterval(50, 1000)
    expect(low).toBeCloseTo(0.0381, 3)
    expect(high).toBeCloseTo(0.0653, 3)
  })

  it('never goes negative near zero and never exceeds one', () => {
    const [low] = wilsonInterval(0, 20)
    expect(low).toBe(0)
    const [, high] = wilsonInterval(20, 20)
    expect(high).toBeLessThanOrEqual(1)
  })

  it('is [0, 0] with no trials', () => {
    expect(wilsonInterval(0, 0)).toEqual([0, 0])
  })
})

describe('twoProportionZTest', () => {
  it('reproduces the pooled z for 5% vs 7% on 1000 each', () => {
    const { z, p } = twoProportionZTest(
      { successes: 50, trials: 1000 },
      { successes: 70, trials: 1000 },
    )
    expect(z).toBeCloseTo(1.883, 2)
    expect(p).toBeCloseTo(0.0597, 3)
  })

  it('is signed: a worse treatment gets a negative z', () => {
    const { z } = twoProportionZTest(
      { successes: 70, trials: 1000 },
      { successes: 50, trials: 1000 },
    )
    expect(z).toBeLessThan(0)
  })

  it('refuses to test empty or degenerate samples', () => {
    expect(twoProportionZTest({ successes: 0, trials: 0 }, { successes: 1, trials: 10 })).toEqual({
      z: null,
      p: null,
    })
    expect(twoProportionZTest({ successes: 0, trials: 10 }, { successes: 0, trials: 10 })).toEqual({
      z: null,
      p: null,
    })
  })
})

describe('requiredExposuresPerVariant', () => {
  it('needs roughly 3,800 per arm to see a 50% lift on a 2% baseline', () => {
    const n = requiredExposuresPerVariant(0.02, 0.5)
    expect(n).toBeGreaterThan(3_500)
    expect(n).toBeLessThan(4_100)
  })

  it('is infinite for a zero baseline or a zero effect', () => {
    expect(requiredExposuresPerVariant(0, 0.5)).toBe(Number.POSITIVE_INFINITY)
    expect(requiredExposuresPerVariant(0.02, 0)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('experimentStats', () => {
  it('puts control first and marks it as control with no comparison', () => {
    const stats = experimentStats(
      [
        { variant: 'express_summary', exposures: 500, conversions: 30 },
        { variant: 'control', exposures: 500, conversions: 25 },
      ],
      'control',
    )
    expect(stats.map((row) => row.variant)).toEqual(['control', 'express_summary'])
    expect(stats[0]).toMatchObject({
      isControl: true,
      verdict: 'control',
      liftPct: null,
      pValue: null,
    })
  })

  it('reports lift, p-value and an inconclusive verdict for a small difference', () => {
    const [, treatment] = experimentStats(
      [
        { variant: 'control', exposures: 1000, conversions: 50 },
        { variant: 'express_summary', exposures: 1000, conversions: 70 },
      ],
      'control',
    )
    expect(treatment?.rate).toBeCloseTo(0.07, 6)
    expect(treatment?.liftPct).toBe(40)
    expect(treatment?.pValue).toBeCloseTo(0.0597, 3)
    expect(treatment?.verdict).toBe('inconclusive')
  })

  it('calls a clear winner "better" and a clear loser "worse"', () => {
    const [, winner] = experimentStats(
      [
        { variant: 'control', exposures: 2000, conversions: 100 },
        { variant: 'express_summary', exposures: 2000, conversions: 160 },
      ],
      'control',
    )
    expect(winner?.verdict).toBe('better')
    expect(winner?.pValue).toBeLessThan(0.05)

    const [, loser] = experimentStats(
      [
        { variant: 'control', exposures: 2000, conversions: 160 },
        { variant: 'express_summary', exposures: 2000, conversions: 100 },
      ],
      'control',
    )
    expect(loser?.verdict).toBe('worse')
  })

  it('never issues a verdict below the exposure floor, however large the gap', () => {
    const [, treatment] = experimentStats(
      [
        { variant: 'control', exposures: MIN_EXPOSURES_PER_VARIANT - 1, conversions: 1 },
        { variant: 'express_summary', exposures: 400, conversions: 80 },
      ],
      'control',
    )
    expect(treatment?.verdict).toBe('insufficient')
  })

  it('is insufficient across the board when the control arm is missing', () => {
    const stats = experimentStats(
      [{ variant: 'express_summary', exposures: 5000, conversions: 500 }],
      'control',
    )
    expect(stats).toHaveLength(1)
    expect(stats[0]?.verdict).toBe('insufficient')
    expect(stats[0]?.isControl).toBe(false)
  })

  it('handles a zero-exposure arm without NaN anywhere', () => {
    const stats = experimentStats(
      [
        { variant: 'control', exposures: 0, conversions: 0 },
        { variant: 'express_summary', exposures: 0, conversions: 0 },
      ],
      'control',
    )
    for (const row of stats) {
      expect(Number.isNaN(row.rate)).toBe(false)
      expect(row.ci95).toEqual([0, 0])
    }
    expect(stats[1]?.verdict).toBe('insufficient')
  })
})
