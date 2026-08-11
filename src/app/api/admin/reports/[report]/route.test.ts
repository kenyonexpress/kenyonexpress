import type { ReportEvent } from '@/server/domain/reports/settlement-report'
import type { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The export route: the guard, and the file.
 *
 * The guard is what these tests are mostly about. This is a plain GET at a
 * guessable URL that returns every shekel the platform has taken, and nothing
 * about having rendered /admin/reports is carried into the request.
 */

const getSessionWithRole = vi.fn()
const loadReportEvents = vi.fn()

vi.mock('@/lib/admin/rbac', () => ({ getSessionWithRole: () => getSessionWithRole() }))
vi.mock('@/server/queries/reports', () => ({
  loadReportEvents: (from: string, to: string) => loadReportEvents(from, to),
}))

const { GET } = await import('./route')

function event(overrides: Partial<ReportEvent> = {}): ReportEvent {
  return {
    kind: 'charge_settled',
    occurredAt: '2026-08-06T09:00:00Z',
    supplierId: 'sup-1',
    supplierName: 'מסעדת הים',
    paidOnSiteAgorot: 100_000,
    commissionAgorot: 30_000,
    supplierDueAgorot: 70_000,
    discountAgorot: 0,
    ...overrides,
  }
}

function request(report: string, query = 'from=2026-08-01&to=2026-08-07') {
  return {
    request: new Request(`http://localhost/api/admin/reports/${report}?${query}`) as NextRequest,
    ctx: { params: Promise.resolve({ report }) },
  }
}

const call = (report: string, query?: string) => {
  const { request: req, ctx } = request(report, query)
  return GET(req, ctx)
}

beforeEach(() => {
  vi.clearAllMocks()
  getSessionWithRole.mockResolvedValue({ userId: 'u1', role: 'admin' })
  loadReportEvents.mockResolvedValue({ available: true, truncated: false, events: [event()] })
})

describe('the guard', () => {
  it('answers 403 to a signed-out request, not a redirect', async () => {
    // A 307 to /login in answer to a download reaches the user as a file called
    // `login` containing an HTML page.
    getSessionWithRole.mockResolvedValue(null)

    const res = await call('sales')

    expect(res.status).toBe(403)
    expect(loadReportEvents).not.toHaveBeenCalled()
  })

  it('answers 403 to a role without the payments section', async () => {
    // support reads orders and users; it does not read money.
    getSessionWithRole.mockResolvedValue({ userId: 'u1', role: 'support' })

    expect((await call('sales')).status).toBe(403)
    expect(loadReportEvents).not.toHaveBeenCalled()
  })

  it('answers 404 for a report name that does not exist', async () => {
    const res = await call('../../secrets')

    expect(res.status).toBe(404)
    expect(loadReportEvents).not.toHaveBeenCalled()
  })
})

describe('the file', () => {
  it('sends a Hebrew filename carrying the range, in both forms', async () => {
    const res = await call('sales')

    expect(res.status).toBe(200)
    const disposition = res.headers.get('content-disposition') ?? ''
    expect(disposition).toContain('attachment;')
    expect(disposition).toContain(encodeURIComponent('דוח-מכירות-2026-08-01-עד-2026-08-07.csv'))
  })

  it('is never cached, because it is a snapshot of live money', async () => {
    expect((await call('sales')).headers.get('cache-control')).toBe('private, no-store')
  })

  it('starts with the three BOM BYTES Excel needs to read the Hebrew headings', async () => {
    // Read as bytes, and that is the whole point of this test. `Response.text()`
    // decodes to UTF-16 and the WHATWG decode step STRIPS a leading BOM, so the
    // obvious `(await res.text()).codePointAt(0) === 0xfeff` fails on a correct
    // file and passes on nothing — it measures the decoder, not the download.
    // Excel reads bytes.
    const bytes = new Uint8Array(await (await call('sales')).arrayBuffer())

    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
  })

  it('fills the days with no events at zero rather than skipping them', async () => {
    // Seven days requested, one day of events: the export has to carry seven
    // rows, or a reconciliation reads the gaps as missing data rather than as
    // days with no sales.
    const body = await (await call('sales')).text()

    expect(body.trimEnd().split('\r\n')).toHaveLength(8) // header + 7 days
    expect(body).toContain('2026-08-06,1000.00,300.00,700.00,0.00,0.00,1')
    expect(body).toContain('2026-08-01,0.00,0.00,0.00,0.00,0.00,0')
  })

  it('exports the supplier report from the same events', async () => {
    const body = await (await call('suppliers')).text()

    expect(body).toContain('מסעדת הים,sup-1,700.00,0.00,0.00,700.00')
  })

  it('asks for the range the caller asked for, not a default', async () => {
    await call('sales', 'from=2026-01-01&to=2026-01-31')

    expect(loadReportEvents).toHaveBeenCalledWith('2026-01-01', '2026-01-31')
  })
})

describe('when the journal is not installed', () => {
  it('answers 503 with the reason, and NOT an empty file', async () => {
    // A CSV of headers with no rows is indistinguishable from a genuinely quiet
    // month, and this one would be filed as evidence that there were no sales.
    loadReportEvents.mockResolvedValue({ available: false, reason: 'מיגרציה 094 לא הוחלה' })

    const res = await call('sales')

    expect(res.status).toBe(503)
    await expect(res.text()).resolves.toContain('094')
  })
})
