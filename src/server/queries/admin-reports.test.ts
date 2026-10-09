import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The reporting reads have three honest answers: rows, "not installed"
 * (migration 170 pending), and "failed". These tests pin the mapping between
 * PostgREST's answers and those three, because the settlement report already
 * documented what happens when the second and third collapse into an empty
 * chart: a screen that is wrong while looking fine.
 *
 * Also pinned: bigint coercion. PostgREST returns bigint as a string past
 * 2^53; a string that leaks out of this module turns addition into
 * concatenation at the first call site that sums a column.
 */

type RpcResult = { data: unknown; error: { code?: string; message?: string } | null }

let rpcResult: RpcResult = { data: [], error: null }
const rpcCalls: Array<{ fn: string; args: unknown }> = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    rpc: (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args })
      return Promise.resolve({ ...rpcResult })
    },
  }),
}))

const logError = vi.fn()
const logInfo = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: {
    error: (...a: unknown[]) => logError(...a),
    info: (...a: unknown[]) => logInfo(...a),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

const { getCohortRetention, getOrdersDaily, getRevenueDaily, getTopProducts } = await import(
  './admin-reports'
)

beforeEach(() => {
  rpcResult = { data: [], error: null }
  rpcCalls.length = 0
  logError.mockClear()
  logInfo.mockClear()
})

describe('getRevenueDaily', () => {
  it('maps rows and coerces bigint strings to numbers', async () => {
    rpcResult = {
      data: [
        {
          day: '2026-09-03',
          orders_count: 2,
          gross_agorot: '9007199254740995',
          discount_agorot: 500,
          cashback_applied_agorot: 0,
          net_agorot: '11900',
          refreshed_at: '2026-09-04T01:30:00Z',
        },
      ],
      error: null,
    }

    const result = await getRevenueDaily()
    expect(result.available).toBe(true)
    if (!result.available) return
    const row = result.rows[0]
    expect(row).toBeDefined()
    expect(typeof row?.grossAgorot).toBe('number')
    expect(row?.netAgorot).toBe(11_900)
    expect(row?.discountAgorot).toBe(500)
    expect(row?.ordersCount).toBe(2)
  })

  it('passes the date range through as p_from / p_to, null when omitted', async () => {
    await getRevenueDaily('2026-08-01', '2026-08-31')
    await getRevenueDaily()
    expect(rpcCalls[0]).toEqual({
      fn: 'admin_report_revenue_daily',
      args: { p_from: '2026-08-01', p_to: '2026-08-31' },
    })
    expect(rpcCalls[1]?.args).toEqual({ p_from: null, p_to: null })
  })

  it('reports "not installed" for a missing function, and does not log an error', async () => {
    rpcResult = {
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function in the schema cache' },
    }

    const result = await getRevenueDaily()
    expect(result.available).toBe(false)
    if (result.available) return
    expect(result.reason).toContain('170')
    expect(logError).not.toHaveBeenCalled()
    expect(logInfo).toHaveBeenCalled()
  })

  it('reports a real failure as a failure, with the cause in the log', async () => {
    rpcResult = { data: null, error: { code: '57014', message: 'statement timeout' } }

    const result = await getRevenueDaily()
    expect(result.available).toBe(false)
    if (result.available) return
    expect(result.reason).not.toContain('170')
    expect(logError).toHaveBeenCalledWith(
      'admin_reports.read_failed',
      expect.objectContaining({ reason: 'statement timeout' }),
    )
  })
})

describe('getOrdersDaily', () => {
  it('maps status counts', async () => {
    rpcResult = {
      data: [
        {
          day: '2026-09-03',
          total_orders: 5,
          pending_count: 1,
          paid_count: 3,
          cancelled_count: 1,
          refunded_count: 0,
          refreshed_at: '2026-09-04T01:30:00Z',
        },
      ],
      error: null,
    }

    const result = await getOrdersDaily()
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(result.rows[0]).toMatchObject({ totalOrders: 5, paidCount: 3, cancelledCount: 1 })
  })
})

describe('getTopProducts', () => {
  it('sends the window and coerces units and revenue', async () => {
    rpcResult = {
      data: [
        {
          window_days: 7,
          rank: 1,
          product_id: 'p-1',
          product_name_he: 'מוצר',
          supplier_id: null,
          units_sold: '3',
          revenue_agorot: '45000',
          refreshed_at: '2026-09-04T01:30:00Z',
        },
      ],
      error: null,
    }

    const result = await getTopProducts(7)
    expect(rpcCalls[0]).toEqual({ fn: 'admin_report_top_products', args: { p_window_days: 7 } })
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(result.rows[0]).toMatchObject({ rank: 1, unitsSold: 3, revenueAgorot: 45_000 })
  })

  it('defaults the window to 30 days', async () => {
    await getTopProducts()
    expect(rpcCalls[0]?.args).toEqual({ p_window_days: 30 })
  })
})

describe('getCohortRetention', () => {
  it('maps cohort cells', async () => {
    rpcResult = {
      data: [
        {
          cohort_month: '2026-08-01',
          month_offset: 1,
          cohort_size: 10,
          active_users: 4,
          refreshed_at: '2026-09-04T01:30:00Z',
        },
      ],
      error: null,
    }

    const result = await getCohortRetention()
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(result.rows[0]).toMatchObject({
      cohortMonth: '2026-08-01',
      monthOffset: 1,
      cohortSize: 10,
      activeUsers: 4,
    })
  })

  it('treats undefined_table as "not installed" (half-applied migration)', async () => {
    rpcResult = {
      data: null,
      error: { code: '42P01', message: 'relation "report_cohort_retention" does not exist' },
    }

    const result = await getCohortRetention()
    expect(result.available).toBe(false)
    if (result.available) return
    expect(result.reason).toContain('170')
  })
})
