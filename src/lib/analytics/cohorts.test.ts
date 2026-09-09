import {
  MAX_COHORT_OFFSET,
  buildCohortGrid,
  cohortMonthLabel,
  currentIsraelMonth,
} from '@/lib/analytics/cohorts'
import { describe, expect, it } from 'vitest'

const REFRESHED = '2026-09-09T01:30:00.000Z'

function cell(cohortMonth: string, monthOffset: number, cohortSize: number, activeUsers: number) {
  return { cohortMonth, monthOffset, cohortSize, activeUsers, refreshedAt: REFRESHED }
}

/** 2026-09-15 12:00 UTC: mid-month, so no timezone edge is in play. */
const SEPTEMBER = new Date('2026-09-15T12:00:00.000Z')

describe('currentIsraelMonth', () => {
  it('is the first of the month', () => {
    expect(currentIsraelMonth(SEPTEMBER)).toBe('2026-09-01')
  })

  it('reads the Israel month, not the UTC one, on the boundary', () => {
    // 2026-08-31 22:00 UTC is 2026-09-01 01:00 in Israel (UTC+3 in summer).
    // A UTC-based grid would still be in August and would mark September's
    // whole column as unknowable for another two hours.
    expect(currentIsraelMonth(new Date('2026-08-31T22:00:00.000Z'))).toBe('2026-09-01')
  })
})

describe('buildCohortGrid', () => {
  it('returns an empty grid for no rows', () => {
    expect(buildCohortGrid([], SEPTEMBER)).toEqual({ rows: [], maxOffset: 0, refreshedAt: null })
  })

  it('puts the newest cohort first', () => {
    const grid = buildCohortGrid(
      [cell('2026-07-01', 0, 4, 4), cell('2026-09-01', 0, 2, 2), cell('2026-08-01', 0, 3, 3)],
      SEPTEMBER,
    )
    expect(grid.rows.map((r) => r.cohortMonth)).toEqual(['2026-09-01', '2026-08-01', '2026-07-01'])
  })

  it('computes the retention rate against the cohort size', () => {
    const grid = buildCohortGrid(
      [cell('2026-07-01', 0, 4, 4), cell('2026-07-01', 1, 4, 1)],
      SEPTEMBER,
    )
    expect(grid.rows[0]?.cells[0]).toEqual({ kind: 'value', activeUsers: 4, rate: 100 })
    expect(grid.rows[0]?.cells[1]).toEqual({ kind: 'value', activeUsers: 1, rate: 25 })
  })

  it('reads a missing ELAPSED month as a real zero', () => {
    // July cohort, nothing stored for August. August has been and gone, so
    // nobody came back: 0% is the measurement, not a gap.
    const grid = buildCohortGrid([cell('2026-07-01', 0, 4, 4)], SEPTEMBER)
    expect(grid.rows[0]?.cells[1]).toEqual({ kind: 'value', activeUsers: 0, rate: 0 })
  })

  it('reads a missing FUTURE month as unknowable, not as churn', () => {
    // The September cohort has offsets 1 and 2 in the header because July has
    // them, but October has not happened. Rendering 0% there would say this
    // month's new customers all churned.
    const grid = buildCohortGrid(
      [cell('2026-07-01', 0, 4, 4), cell('2026-09-01', 0, 2, 2)],
      SEPTEMBER,
    )
    const september = grid.rows[0]
    expect(september?.cohortMonth).toBe('2026-09-01')
    expect(september?.cells[0]).toEqual({ kind: 'value', activeUsers: 2, rate: 100 })
    expect(september?.cells[1]).toEqual({ kind: 'future' })
    expect(september?.cells[2]).toEqual({ kind: 'future' })
  })

  it('sizes the grid by elapsed time, not by the widest populated offset', () => {
    // The only stored row is offset 0. Sizing to the data would give a
    // one-column grid and hide the two months in which nobody returned.
    const grid = buildCohortGrid([cell('2026-07-01', 0, 4, 4)], SEPTEMBER)
    expect(grid.maxOffset).toBe(2)
    expect(grid.rows[0]?.cells).toHaveLength(3)
  })

  it('caps the width at a year', () => {
    const grid = buildCohortGrid([cell('2020-01-01', 0, 9, 9)], SEPTEMBER)
    expect(grid.maxOffset).toBe(MAX_COHORT_OFFSET)
    expect(grid.rows[0]?.cells).toHaveLength(MAX_COHORT_OFFSET + 1)
  })

  it('carries the refresh timestamp through', () => {
    expect(buildCohortGrid([cell('2026-07-01', 0, 1, 1)], SEPTEMBER).refreshedAt).toBe(REFRESHED)
  })

  it('survives a cohort size of zero without dividing by it', () => {
    const grid = buildCohortGrid([cell('2026-09-01', 0, 0, 0)], SEPTEMBER)
    expect(grid.rows[0]?.cells[0]).toEqual({ kind: 'value', activeUsers: 0, rate: 0 })
  })
})

describe('cohortMonthLabel', () => {
  it('formats in Hebrew', () => {
    expect(cohortMonthLabel('2026-07-01')).toContain('2026')
  })
})
