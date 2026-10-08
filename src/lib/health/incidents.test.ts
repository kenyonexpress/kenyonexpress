import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/observability/log', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import type { DependencyReport, HealthReport } from './checks'
import {
  type IncidentsClient,
  diffIncidents,
  formatIncidentDuration,
  incidentMinutes,
  isMissingIncidentsSchema,
  listIncidents,
  reconcileIncidents,
} from './incidents'

/**
 * The rules this file holds (STEP 67):
 *
 *   - an incident opens on `down` and on nothing else: `not_configured` is a
 *     deployment waiting for a key, not an outage;
 *   - it closes on the first report that is not `down`, including one that
 *     says the service was unconfigured, and says so;
 *   - the absent table (migration 269 pending) is a skip, never a throw, and
 *     the reader says `schemaAbsent` rather than "no incidents";
 *   - a racing writer's unique_violation is silence, not a second row.
 */

function dep(name: string, status: DependencyReport['status'], detail = `${name} detail`) {
  return { name, status, latencyMs: null, detail }
}

function report(...dependencies: DependencyReport[]): HealthReport {
  return { ok: dependencies.every((d) => d.status !== 'down'), checkedAt: 'now', dependencies }
}

describe('diffIncidents', () => {
  it('opens for every down dependency with no open row, and nothing else', () => {
    const { toOpen, toResolve } = diffIncidents(
      [],
      report(dep('database', 'ok'), dep('search', 'down'), dep('email', 'not_configured')),
    )
    expect(toOpen.map((d) => d.name)).toEqual(['search'])
    expect(toResolve).toEqual([])
  })

  it('does not reopen a dependency that already has an open row', () => {
    const { toOpen } = diffIncidents(
      [{ id: 'a', dependency: 'search' }],
      report(dep('search', 'down')),
    )
    expect(toOpen).toEqual([])
  })

  it('resolves an open row when the dependency answers, carrying the new detail', () => {
    const { toResolve } = diffIncidents(
      [{ id: 'a', dependency: 'search' }],
      report(dep('search', 'ok', 'Meilisearch')),
    )
    expect(toResolve).toEqual([{ id: 'a', dependency: 'search', detail: 'Meilisearch' }])
  })

  it('resolves when the dependency was unconfigured away, and says so', () => {
    const { toResolve } = diffIncidents(
      [{ id: 'a', dependency: 'email' }],
      report(dep('email', 'not_configured', 'אין מפתח Resend')),
    )
    expect(toResolve[0]?.detail).toBe('הוסר מההגדרות: אין מפתח Resend')
  })

  it('resolves an open row for a check that no longer exists', () => {
    const { toResolve } = diffIncidents(
      [{ id: 'a', dependency: 'legacy' }],
      report(dep('database', 'ok')),
    )
    expect(toResolve[0]?.detail).toBe('הבדיקה הוסרה מהרשימה')
  })
})

/** A PostgREST-shaped fake: records calls, answers from a script. */
function fakeClient(script: {
  open?: { id: string; dependency: string }[]
  openError?: { code?: string; message: string }
  insertError?: { code?: string; message: string }
  updateError?: { code?: string; message: string }
  list?: unknown[]
  listError?: { code?: string; message: string }
}) {
  const inserted: unknown[] = []
  const updated: { id: string; patch: unknown }[] = []
  const client: IncidentsClient = {
    from: () => ({
      select: (_columns: string) => ({
        is: () => Promise.resolve({ data: script.open ?? [], error: script.openError ?? null }),
        order: () => ({
          limit: () =>
            Promise.resolve({ data: script.list ?? [], error: script.listError ?? null }),
        }),
      }),
      insert: (rows: unknown) => {
        inserted.push(rows)
        return Promise.resolve({ error: script.insertError ?? null })
      },
      update: (patch: unknown) => ({
        eq: (_column: string, id: string) => ({
          is: () => {
            updated.push({ id, patch })
            return Promise.resolve({ error: script.updateError ?? null })
          },
        }),
      }),
    }),
  }
  return { client, inserted, updated }
}

describe('reconcileIncidents', () => {
  const now = new Date('2026-10-09T03:00:00.000Z')

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('inserts one row per newly down dependency with the detail and the time', async () => {
    const { client, inserted } = fakeClient({})
    const result = await reconcileIncidents(client, report(dep('search', 'down', 'לא עונה')), now)
    expect(result).toEqual({ opened: ['search'], resolved: [] })
    expect(inserted).toEqual([
      [{ dependency: 'search', detail: 'לא עונה', started_at: now.toISOString() }],
    ])
  })

  it('closes the open row when the dependency is back', async () => {
    const { client, inserted, updated } = fakeClient({
      open: [{ id: 'row-1', dependency: 'search' }],
    })
    const result = await reconcileIncidents(client, report(dep('search', 'ok', 'Meilisearch')), now)
    expect(result).toEqual({ opened: [], resolved: ['search'] })
    expect(inserted).toEqual([])
    expect(updated).toEqual([
      { id: 'row-1', patch: { resolved_at: now.toISOString(), resolved_detail: 'Meilisearch' } },
    ])
  })

  it('writes nothing when nothing changed', async () => {
    const { client, inserted, updated } = fakeClient({
      open: [{ id: 'row-1', dependency: 'search' }],
    })
    const result = await reconcileIncidents(client, report(dep('search', 'down')), now)
    expect(result).toEqual({ opened: [], resolved: [] })
    expect(inserted).toEqual([])
    expect(updated).toEqual([])
  })

  it('skips on the absent table instead of throwing (migration 269 pending)', async () => {
    const { client, inserted } = fakeClient({
      openError: {
        code: 'PGRST205',
        message: "Could not find the table 'public.health_incidents'",
      },
    })
    const result = await reconcileIncidents(client, report(dep('search', 'down')), now)
    expect(result).toEqual({ opened: [], resolved: [], skipped: 'schema_absent' })
    expect(inserted).toEqual([])
  })

  it('treats a racing writer (unique_violation) as already done, not as an error', async () => {
    const { client } = fakeClient({ insertError: { code: '23505', message: 'duplicate key' } })
    const result = await reconcileIncidents(client, report(dep('search', 'down')), now)
    expect(result).toEqual({ opened: [], resolved: [] })
  })

  it('never throws: a client that explodes is a skipped result', async () => {
    const client: IncidentsClient = {
      from: () => {
        throw new Error('no service key')
      },
    }
    const result = await reconcileIncidents(client, report(dep('search', 'down')), now)
    expect(result.skipped).toBe('error')
  })
})

describe('listIncidents', () => {
  it('says the schema is absent rather than reporting no incidents', async () => {
    const { client } = fakeClient({
      listError: { code: '42P01', message: 'relation does not exist' },
    })
    expect(await listIncidents(client)).toEqual({ incidents: [], schemaAbsent: true })
  })

  it('returns the rows, dropping anything that is not an incident', async () => {
    const row = {
      id: 'a',
      dependency: 'search',
      detail: null,
      started_at: '2026-10-09T02:00:00.000Z',
      resolved_at: null,
      resolved_detail: null,
    }
    const { client } = fakeClient({ list: [row, { id: 'b' }] })
    expect(await listIncidents(client)).toEqual({ incidents: [row], schemaAbsent: false })
  })
})

describe('isMissingIncidentsSchema', () => {
  it('matches both the Postgres and the PostgREST codes, and the message', () => {
    expect(isMissingIncidentsSchema({ code: '42P01' })).toBe(true)
    expect(isMissingIncidentsSchema({ code: 'PGRST205' })).toBe(true)
    expect(isMissingIncidentsSchema({ message: 'relation "x" does not exist' })).toBe(true)
    expect(isMissingIncidentsSchema({ code: '23505', message: 'duplicate' })).toBe(false)
    expect(isMissingIncidentsSchema(null)).toBe(false)
  })
})

describe('durations', () => {
  const now = new Date('2026-10-09T03:00:00.000Z')
  const base = { id: 'a', dependency: 'search', detail: null, resolved_detail: null }

  it('measures an open incident up to now and a closed one to its end', () => {
    expect(
      incidentMinutes({ ...base, started_at: '2026-10-09T02:30:00.000Z', resolved_at: null }, now),
    ).toBe(30)
    expect(
      incidentMinutes(
        {
          ...base,
          started_at: '2026-10-09T01:00:00.000Z',
          resolved_at: '2026-10-09T01:05:00.000Z',
        },
        now,
      ),
    ).toBe(5)
    expect(incidentMinutes({ ...base, started_at: 'garbage', resolved_at: null }, now)).toBe(0)
  })

  it('formats in Hebrew units', () => {
    expect(formatIncidentDuration(5)).toBe('5 דקות')
    expect(formatIncidentDuration(60)).toBe('1 שעות')
    expect(formatIncidentDuration(125)).toBe('2 שעות ו-5 דקות')
    expect(formatIncidentDuration(60 * 72)).toBe('3 ימים')
  })
})
