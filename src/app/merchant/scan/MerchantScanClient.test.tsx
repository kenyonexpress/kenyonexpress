import { MERCHANT_SCAN_QUEUE_KEY, readQueue } from '@/lib/vouchers/merchant-scan-queue'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MerchantScanClient from './MerchantScanClient'

/**
 * The till end to end in jsdom: online it looks up, confirms and burns;
 * offline it confirms WITHOUT a lookup, queues under the key it sent, shows no
 * green tick, and drains the queue the moment the browser says it is back.
 */

const CODE = 'ABCDE12345'

type Route = (init: RequestInit) => Promise<Response> | Response

function jsonResponse(body: unknown, status = 200): Response {
  return { status, ok: status < 300, json: async () => body } as unknown as Response
}

let routes: Record<string, Route>
let onLine: boolean

beforeEach(() => {
  window.localStorage.clear()
  routes = {}
  onLine = true
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => onLine })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const route = routes[url]
      if (!route) throw new TypeError('Failed to fetch')
      return route(init)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function typeCode(code = CODE) {
  fireEvent.change(screen.getByLabelText('הקלדת קוד ידנית'), { target: { value: code } })
  fireEvent.submit(screen.getByLabelText('הקלדת קוד ידנית').closest('form') as HTMLFormElement)
}

describe('MerchantScanClient online', () => {
  it('looks the voucher up before anything is spent, then redeems with an idempotency key', async () => {
    routes['/api/supplier/vouchers/lookup'] = () =>
      jsonResponse({
        outcome: 'success',
        message: 'תקין',
        voucher: {
          code: CODE,
          status: 'issued',
          product_name: 'עיסוי שוודי',
          customer_name: 'דנה',
          face_value_agorot: 40000,
          coupon_price_agorot: 10000,
          remaining_amount_due_agorot: 30000,
          expires_at: '2026-12-31T00:00:00Z',
          redeemed_at: null,
        },
      })
    const redeem = vi.fn(() =>
      jsonResponse({
        outcome: 'success',
        message: 'השובר מומש בהצלחה',
        voucher: {
          code: CODE,
          product_name: 'עיסוי שוודי',
          customer_name: 'דנה',
          face_value_agorot: 40000,
          coupon_price_agorot: 10000,
          remaining_amount_due_agorot: 30000,
          redeemed_at: '2026-10-01T09:00:00Z',
        },
      }),
    )
    routes['/api/supplier/vouchers/redeem'] = redeem

    render(<MerchantScanClient supplierName="הספא של דנה" />)
    expect(screen.getByTestId('connection-state').textContent).toContain('מחובר')
    typeCode()

    await screen.findByText('עיסוי שוודי')
    expect(redeem).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'אשר ומַמֵש' }))
    await screen.findByText('השובר מומש בהצלחה')
    expect(screen.getByText('לגבייה מהלקוח עכשיו')).toBeTruthy()

    const body = JSON.parse((redeem.mock.calls[0] as unknown as [RequestInit])[0].body as string)
    expect(body.code).toBe(CODE)
    expect(body.idempotency_key).toMatch(/^scan-/)
    expect(body.scan_method).toBe('manual')
    expect(readQueue(window.localStorage)).toEqual([])
  })

  it('shows a refusal from the lookup and offers no redeem button', async () => {
    routes['/api/supplier/vouchers/lookup'] = () =>
      jsonResponse({ outcome: 'already_redeemed', message: 'השובר כבר מומש' }, 409)
    render(<MerchantScanClient supplierName="x" />)
    typeCode()
    await screen.findByText('השובר כבר מומש')
    expect(screen.queryByRole('button', { name: 'אשר ומַמֵש' })).toBeNull()
  })

  it('rejects a malformed code before any request', async () => {
    render(<MerchantScanClient supplierName="x" />)
    typeCode('12')
    await screen.findByText(/הקוד אינו תקין/)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('MerchantScanClient offline', () => {
  it('confirms without a lookup, queues under the key it sent, and drains when back online', async () => {
    onLine = false
    render(<MerchantScanClient supplierName="x" />)
    expect(screen.getByTestId('connection-state').textContent).toContain('אין חיבור')

    typeCode()
    await screen.findByText('שובר שנקרא בלי חיבור')
    expect(screen.getByText(/עדיין לא בדקה את השובר/)).toBeTruthy()
    // No lookup was attempted.
    expect(fetch).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'שמור לסנכרון' }))
    await screen.findByText('נשמר בתור, ממתין לסנכרון')
    expect(screen.queryByText('לגבייה מהלקוח עכשיו')).toBeNull()

    const queued = readQueue(window.localStorage)
    expect(queued).toHaveLength(1)
    expect(queued[0]?.code).toBe(CODE)
    const sent = JSON.parse(
      (vi.mocked(fetch).mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    )
    expect(sent.idempotency_key).toBe(queued[0]?.idempotencyKey)
    expect(screen.getByText('1 ממתינות')).toBeTruthy()

    // The connection returns: the queue drains on the event, unprompted.
    const batch = vi.fn((init: RequestInit) => {
      const items = JSON.parse(init.body as string).items as { idempotency_key: string }[]
      return jsonResponse({
        ok: true,
        results: items.map((i) => ({
          idempotency_key: i.idempotency_key,
          outcome: 'success',
          replayed: false,
          code: CODE,
          message: 'מומש',
        })),
        settled: items.map((i) => i.idempotency_key),
      })
    })
    routes['/api/supplier/vouchers/redeem-batch'] = batch
    onLine = true
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })

    await waitFor(() => expect(batch).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByText('1 ממתינות')).toBeNull())
    expect(readQueue(window.localStorage)).toEqual([])
    expect(screen.getByText('מומש')).toBeTruthy()
  })

  it('keeps the queue and says so when the drain comes back 401', async () => {
    window.localStorage.setItem(
      MERCHANT_SCAN_QUEUE_KEY,
      JSON.stringify([
        {
          idempotencyKey: 'scan-existing-1',
          code: CODE,
          scanMethod: 'manual',
          scannedAt: '2026-10-01T09:00:00.000Z',
          label: 'ABCDE-12345',
        },
      ]),
    )
    routes['/api/supplier/vouchers/redeem-batch'] = () =>
      jsonResponse({ ok: false, error: 'unauthorized' }, 401)
    render(<MerchantScanClient supplierName="x" />)
    await screen.findByText(/ההתחברות פגה/)
    expect(readQueue(window.localStorage)).toHaveLength(1)
    expect(screen.getByText('1 ממתינות')).toBeTruthy()
  })
})
