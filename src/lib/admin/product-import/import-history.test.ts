import { describe, expect, it } from 'vitest'
import {
  type ImportRunEvent,
  groupImportRuns,
  mergeRunJournal,
  parseJournal,
  rollbackRefusal,
  summariseImportRun,
} from './import-history'

const RUN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const RUN_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ACTOR = '11111111-1111-4111-8111-111111111111'

function event(partial: Partial<ImportRunEvent> & { action: string }): ImportRunEvent {
  return {
    entity_id: RUN_A,
    actor_id: ACTOR,
    created_at: '2026-10-01T10:00:00.000Z',
    changes: {},
    before: null,
    ...partial,
  }
}

const started = event({
  action: 'created',
  created_at: '2026-10-01T10:00:00.000Z',
  changes: { file_name: 'products.xlsx', mode: 'upsert', total: 12, valid: 10, invalid: 2 },
})
const batch1 = event({
  action: 'updated',
  created_at: '2026-10-01T10:00:05.000Z',
  changes: { batch: 1, inserted: 3, updated: 2 },
  before: {
    inserts: ['p1', 'p2', 'p3'],
    updates: [{ id: 'u1', prior: { name_he: 'ישן' } }],
  },
})
const batch2 = event({
  action: 'updated',
  created_at: '2026-10-01T10:00:09.000Z',
  changes: { batch: 2, inserted: 1, updated: 0 },
  before: { inserts: ['p4'], updates: [{ id: 'u2', prior: { kenyon_price: 80 } }] },
})
const finished = event({
  action: 'status_change',
  created_at: '2026-10-01T10:00:12.000Z',
  changes: {
    status: 'partial',
    inserted: 4,
    updated: 2,
    failed: 4,
    error: 'שורה 9: boom',
    row_errors: [{ line: 9, slug: 'x', name: 'y', errors: ['boom'] }, { line: 'bad' }, 'junk'],
  },
})

describe('summariseImportRun', () => {
  it('returns null without a start event', () => {
    expect(summariseImportRun([batch1, finished])).toBeNull()
  })

  it('folds start, batches and finish into one summary regardless of input order', () => {
    const run = summariseImportRun([finished, batch2, started, batch1])
    expect(run).toMatchObject({
      id: RUN_A,
      startedAt: started.created_at,
      finishedAt: finished.created_at,
      lastEventAt: finished.created_at,
      actorId: ACTOR,
      fileName: 'products.xlsx',
      mode: 'upsert',
      totalRows: 12,
      validRows: 10,
      invalidRows: 2,
      batches: 2,
      inserted: 4,
      updated: 2,
      failed: 4,
      status: 'partial',
      error: 'שורה 9: boom',
      rollback: null,
    })
    // Malformed row errors are dropped, not rendered as garbage.
    expect(run?.rowErrors).toEqual([
      { line: 9, slug: 'x', name: 'y', errors: ['boom'] },
      { line: 0, slug: null, name: null, errors: [] },
    ])
  })

  it('a run with batches but no finish event stays running with the batch sums', () => {
    const run = summariseImportRun([started, batch1, batch2])
    expect(run).toMatchObject({
      status: 'running',
      finishedAt: null,
      lastEventAt: batch2.created_at,
      inserted: 4,
      updated: 2,
      batches: 2,
    })
  })

  it('a restored event marks the run rolled back and keeps the rollback counts', () => {
    const restored = event({
      action: 'restored',
      created_at: '2026-10-01T11:00:00.000Z',
      changes: { reverted_inserts: 4, reverted_updates: 1, skipped: 1, failures: 0 },
    })
    const run = summariseImportRun([started, batch1, batch2, finished, restored])
    expect(run?.status).toBe('rolled_back')
    expect(run?.rollback).toEqual({
      revertedInserts: 4,
      revertedUpdates: 1,
      skipped: 1,
      failures: 0,
      at: restored.created_at,
    })
  })

  it('unknown modes and statuses fall back to insert and done', () => {
    const run = summariseImportRun([
      event({ action: 'created', changes: { mode: 'weird' } }),
      event({ action: 'status_change', changes: { status: 'weird' } }),
    ])
    expect(run).toMatchObject({ mode: 'insert', status: 'done', fileName: '' })
  })
})

describe('groupImportRuns', () => {
  it('groups by run id, newest first, dropping runs without a start row', () => {
    const later = event({
      action: 'created',
      entity_id: RUN_B,
      created_at: '2026-10-02T08:00:00.000Z',
      changes: { file_name: 'b.csv', mode: 'insert' },
    })
    const orphan = event({ action: 'updated', entity_id: 'orphan' })
    const runs = groupImportRuns([batch1, later, started, finished, orphan])
    expect(runs.map((r) => r.id)).toEqual([RUN_B, RUN_A])
    expect(runs[1]?.batches).toBe(1)
  })
})

describe('journals', () => {
  it('parseJournal tolerates malformed input', () => {
    expect(parseJournal(null)).toEqual({ inserts: [], updates: [] })
    expect(
      parseJournal({ inserts: ['a', 1], updates: [{ id: 'x' }, { id: 'y', prior: {} }] }),
    ).toEqual({
      inserts: ['a'],
      updates: [{ id: 'y', prior: {} }],
    })
  })

  it('mergeRunJournal concatenates batches in time order', () => {
    expect(mergeRunJournal([finished, batch2, started, batch1])).toEqual({
      inserts: ['p1', 'p2', 'p3', 'p4'],
      updates: [
        { id: 'u1', prior: { name_he: 'ישן' } },
        { id: 'u2', prior: { kenyon_price: 80 } },
      ],
    })
  })
})

describe('rollbackRefusal', () => {
  const finishedRun = summariseImportRun([started, batch1, finished])
  const runningRun = summariseImportRun([started, batch1])
  const emptyRun = summariseImportRun([started])
  const rolledBack = summariseImportRun([
    started,
    batch1,
    finished,
    event({ action: 'restored', created_at: '2026-10-01T12:00:00.000Z' }),
  ])
  const at = (iso: string) => Date.parse(iso)

  it('allows a finished run with applied batches', () => {
    expect(finishedRun && rollbackRefusal(finishedRun, at('2026-10-01T10:01:00Z'))).toBeNull()
  })

  it('refuses a run still inside its grace window, allows it afterwards', () => {
    expect(runningRun && rollbackRefusal(runningRun, at('2026-10-01T10:05:00Z'))).toBe(
      'maybe_running',
    )
    expect(runningRun && rollbackRefusal(runningRun, at('2026-10-01T10:20:00Z'))).toBeNull()
  })

  it('refuses when nothing was applied or it was already rolled back', () => {
    expect(emptyRun && rollbackRefusal(emptyRun, at('2026-10-02T00:00:00Z'))).toBe(
      'nothing_applied',
    )
    expect(rolledBack && rollbackRefusal(rolledBack, at('2026-10-02T00:00:00Z'))).toBe(
      'already_rolled_back',
    )
  })
})
