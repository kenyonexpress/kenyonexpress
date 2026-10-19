import type { MigrationEntry } from '@/lib/admin/migration-manifest'
import { MIGRATION_MANIFEST } from '@/lib/admin/migration-manifest'
import { describe, expect, it } from 'vitest'
import {
  describeMigrationPlan,
  latestMigrationNumber,
  migrationNumber,
  planSchemaMigration,
} from './schema-migration'

const entry = (
  number: string,
  state: MigrationEntry['state'],
  hasPreflight = true,
): MigrationEntry => ({
  number,
  file: `${number}_thing.sql`,
  state,
  hasPreflight,
})

const FIXTURE: MigrationEntry[] = [
  entry('099', 'applied', false),
  entry('100', 'applied', false),
  entry('101', 'applied', false),
  entry('102', 'pending'),
  entry('103', 'pending', false),
  entry('104', 'cancelled'),
]

describe('migrationNumber', () => {
  it('orders 99 before 100, which a string sort would not', () => {
    const sorted = [...FIXTURE].sort((a, b) => migrationNumber(a) - migrationNumber(b))
    expect(sorted.map((e) => e.number)).toEqual(['099', '100', '101', '102', '103', '104'])
    expect(migrationNumber({ number: '099' })).toBe(99)
  })

  it('throws on a non-integer number', () => {
    expect(() => migrationNumber({ number: 'abc' })).toThrow(TypeError)
  })
})

describe('planSchemaMigration', () => {
  it('takes from exclusive to to inclusive', () => {
    const plan = planSchemaMigration(100, 102, FIXTURE)
    expect(plan.steps.map((s) => s.number)).toEqual(['101', '102'])
    expect(plan.from).toBe(100)
    expect(plan.to).toBe(102)
  })

  it('is runnable only when the range holds work and nothing blocks it', () => {
    expect(planSchemaMigration(99, 101, FIXTURE).runnable).toBe(true)
    // Empty range: nothing to run, so not runnable.
    expect(planSchemaMigration(101, 101, FIXTURE).runnable).toBe(false)
    // Holds a pending file, so it needs approval first.
    expect(planSchemaMigration(101, 102, FIXTURE).runnable).toBe(false)
  })

  it('separates awaiting-approval from missing-preflight', () => {
    const plan = planSchemaMigration(101, 104, FIXTURE)
    expect(plan.blockers).toEqual([
      { number: '102', file: '102_thing.sql', reason: 'awaiting-approval' },
      { number: '103', file: '103_thing.sql', reason: 'missing-preflight' },
      { number: '104', file: '104_thing.sql', reason: 'cancelled' },
    ])
  })

  it('throws on a backwards range instead of returning an empty plan', () => {
    expect(() => planSchemaMigration(104, 100, FIXTURE)).toThrow(RangeError)
  })

  it('rejects bounds that are not non-negative integers', () => {
    expect(() => planSchemaMigration(-1, 10, FIXTURE)).toThrow(TypeError)
    expect(() => planSchemaMigration('x', 10, FIXTURE)).toThrow(TypeError)
  })

  it('accepts string bounds, the form the manifest stores', () => {
    expect(planSchemaMigration('100', '101', FIXTURE).steps.map((s) => s.number)).toEqual(['101'])
  })

  it('exposes no way to execute anything', () => {
    // The module is a planner by policy: no apply, no db handle, no exec.
    const plan = planSchemaMigration(99, 104, FIXTURE)
    expect(Object.keys(plan).sort()).toEqual(['blockers', 'from', 'runnable', 'steps', 'to'])
  })
})

describe('against the real manifest', () => {
  it('plans the whole history without throwing', () => {
    const latest = latestMigrationNumber()
    expect(latest).toBeGreaterThan(0)
    const plan = planSchemaMigration(0, latest)
    expect(plan.steps.length).toBe(MIGRATION_MANIFEST.length)
  })

  it('reports the pending files as blockers, never as runnable', () => {
    const plan = planSchemaMigration(0, latestMigrationNumber())
    const pending = MIGRATION_MANIFEST.filter((e) => e.state === 'pending')
    if (pending.length > 0) {
      expect(plan.runnable).toBe(false)
      expect(plan.blockers.length).toBeGreaterThanOrEqual(pending.length)
    }
  })
})

describe('describeMigrationPlan', () => {
  it('names each step and each blocker', () => {
    const text = describeMigrationPlan(planSchemaMigration(101, 103, FIXTURE))
    expect(text).toContain('migration plan 101 -> 103: 2 step(s)')
    expect(text).toContain('apply 102_thing.sql [pending]')
    expect(text).toContain('BLOCKED 103_thing.sql: missing-preflight')
    expect(text).toContain('not runnable')
  })
})
