import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The nightly slow-statement sample: one knob shared with the per-request
 * warn, one warn line per row, a quiet skip while migration 255 is pending,
 * and never a throw into the cron route.
 */

const logged: Array<{ level: string; event: string; fields: Record<string, unknown> }> = []
vi.mock('@/lib/observability/log', () => {
  const record = (level: string) => (event: string, fields: Record<string, unknown>) =>
    logged.push({ level, event, fields })
  return {
    log: {
      debug: record('debug'),
      info: record('info'),
      warn: record('warn'),
      error: record('error'),
    },
  }
})

import {
  DEFAULT_LIMIT,
  normalizeSlowStatements,
  reportSlowStatements,
} from '@/lib/observability/slow-statements'

type Admin = Parameters<typeof reportSlowStatements>[0]

const NO_ENV = {} as unknown as NodeJS.ProcessEnv

const ROW = {
  queryid: '8712843651027584301',
  role: 'authenticator',
  calls: '566',
  mean_exec_ms: 571,
  max_exec_ms: 2557,
  total_exec_ms: '323186',
  rows_per_call: 1195,
  query: 'SELECT name FROM pg_timezone_names',
}

function adminReturning(result: { data?: unknown; error?: unknown }): {
  admin: Admin
  rpc: ReturnType<typeof vi.fn>
} {
  const rpc = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null })
  return { admin: { rpc } as unknown as Admin, rpc }
}

describe('normalizeSlowStatements', () => {
  it('accepts bigint-as-string and drops rows with a missing field', () => {
    const rows = normalizeSlowStatements([ROW, { queryid: 1, query: 'half a row' }, 'junk'])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      queryid: '8712843651027584301',
      calls: 566,
      total_exec_ms: 323186,
    })
  })

  it('returns nothing for a non-array', () => {
    expect(normalizeSlowStatements(null)).toEqual([])
    expect(normalizeSlowStatements({ rows: [ROW] })).toEqual([])
  })
})

describe('reportSlowStatements', () => {
  beforeEach(() => {
    logged.length = 0
  })

  it('samples at the shared threshold, 300 by default, and warns once per row', async () => {
    const { admin, rpc } = adminReturning({ data: [ROW] })
    const report = await reportSlowStatements(admin, NO_ENV)

    expect(rpc).toHaveBeenCalledWith('fn_slow_statements', {
      p_threshold_ms: 300,
      p_limit: DEFAULT_LIMIT,
    })
    expect(report).toMatchObject({ status: 'reported', thresholdMs: 300, count: 1 })

    const warns = logged.filter((entry) => entry.event === 'db.slow_statement')
    expect(warns).toHaveLength(1)
    expect(warns[0]).toMatchObject({
      level: 'warn',
      fields: {
        role: 'authenticator',
        calls: 566,
        mean_exec_ms: 571,
        threshold_ms: 300,
        query: 'SELECT name FROM pg_timezone_names',
      },
    })
    expect(logged.at(-1)).toMatchObject({
      level: 'info',
      event: 'db.slow_statements_sampled',
      fields: { threshold_ms: 300, count: 1 },
    })
  })

  it('follows SUPABASE_SLOW_QUERY_MS, so the warn and the sample cannot drift apart', async () => {
    const { admin, rpc } = adminReturning({ data: [] })
    const report = await reportSlowStatements(
      admin,
      { SUPABASE_SLOW_QUERY_MS: '450' } as unknown as NodeJS.ProcessEnv,
      { limit: 5 },
    )
    expect(rpc).toHaveBeenCalledWith('fn_slow_statements', { p_threshold_ms: 450, p_limit: 5 })
    expect(report).toEqual({ status: 'reported', thresholdMs: 450, count: 0, statements: [] })
    expect(logged.filter((entry) => entry.level === 'warn')).toHaveLength(0)
  })

  it('skips quietly while migration 255 is pending (PGRST202), at info not error', async () => {
    const { admin } = adminReturning({
      error: { code: 'PGRST202', message: 'Could not find the function in the schema cache' },
    })
    const report = await reportSlowStatements(admin, NO_ENV)
    expect(report).toEqual({ status: 'skipped', reason: 'rpc_missing' })
    expect(logged).toHaveLength(1)
    expect(logged[0]).toMatchObject({ level: 'info', event: 'db.slow_statements_unavailable' })
  })

  it('reports any other database error as failed, logged at error, without throwing', async () => {
    const { admin } = adminReturning({ error: { code: '42501', message: 'permission denied' } })
    const report = await reportSlowStatements(admin, NO_ENV)
    expect(report).toEqual({ status: 'failed', reason: 'permission denied' })
    expect(logged[0]).toMatchObject({
      level: 'error',
      event: 'db.slow_statements_read_failed',
      fields: { code: '42501' },
    })
  })

  it('turns a thrown transport error into failed as well', async () => {
    const rpc = vi.fn().mockRejectedValue(new Error('ECONNRESET'))
    const report = await reportSlowStatements({ rpc } as unknown as Admin, NO_ENV)
    expect(report).toEqual({ status: 'failed', reason: 'ECONNRESET' })
  })
})
