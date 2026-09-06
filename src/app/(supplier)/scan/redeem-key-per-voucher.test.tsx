import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A DOUBLE TAP AT THE TILL SAID "השובר כבר מומש" ABOUT THE VOUCHER IT HAD JUST
 * REDEEMED.
 *
 * `redeem_voucher` dedupes on `idempotency_key`: a repeat with the same key
 * returns the FIRST answer, success payload and all, marked `replayed`. Read
 * off pg_proc in production on 2026-09-07, together with the atomic
 * single-use UPDATE behind it.
 *
 * This screen minted a fresh UUID inside `redeem()`, so the second tap was a
 * NEW request as far as the database was concerned. The replay guard never
 * matched, the request fell through to the UPDATE, the UPDATE matched nothing
 * because the voucher was already `redeemed`, and the answer was
 * `already_redeemed` with a 409.
 *
 * The money was never at risk. What broke was the sentence the cashier reads,
 * with the customer standing at the counter: "this voucher has already been
 * redeemed", no balance to collect, on a redemption they had just performed
 * themselves. Every retry after a dropped connection did the same.
 *
 * So the key belongs to the SCANNED VOUCHER and not to the tap. This test is
 * the rule: two redeem attempts inside one scan carry one key, and a second
 * scan after a reset carries a different one.
 */

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

import ScanClient from './ScanClient'

const LOOKUP_OK = {
  outcome: 'redeemable',
  message: 'ניתן למימוש',
  voucher: {
    code: 'ABCDE12345',
    status: 'issued',
    product_name: 'ארוחה',
    customer_name: 'לקוח',
    face_value_agorot: 20_000,
    coupon_price_agorot: 5_000,
    remaining_amount_due_agorot: 15_000,
    expires_at: '2027-01-01T00:00:00.000Z',
    redeemed_at: null,
  },
}

function jsonOnce(body: unknown): void {
  fetchMock.mockImplementationOnce(() => Promise.resolve({ json: () => Promise.resolve(body) }))
}

/** Every body this component has POSTed, parsed. */
function bodies(): Record<string, unknown>[] {
  return fetchMock.mock.calls.map(
    (call) => JSON.parse((call[1] as { body: string }).body) as Record<string, unknown>,
  )
}

async function scanAndConfirm(code: string): Promise<void> {
  jsonOnce(LOOKUP_OK)
  fireEvent.change(screen.getByLabelText(/קוד/), { target: { value: code } })
  fireEvent.submit(
    screen.getByRole('button', { name: 'בדוק שובר' }).closest('form') as HTMLFormElement,
  )
  await waitFor(() => expect(screen.getByRole('button', { name: 'אשר ומַמֵש' })).toBeTruthy())
}

describe('the redemption idempotency key', () => {
  it('is the same on a second tap for the same voucher', async () => {
    render(<ScanClient supplierName="ספק" />)
    await scanAndConfirm('ABCDE12345')

    // First tap: the network drops, so the screen stays on confirm and the
    // cashier presses again. This is the real path, not a contrived one.
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('offline')))
    fireEvent.click(screen.getByRole('button', { name: 'אשר ומַמֵש' }))
    await waitFor(() => expect(screen.getByText(/שגיאת רשת/)).toBeTruthy())

    jsonOnce({ outcome: 'success', message: 'השובר מומש בהצלחה', replayed: true })
    fireEvent.click(screen.getByRole('button', { name: 'אשר ומַמֵש' }))
    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(3))

    const redeemBodies = bodies().filter((b) => 'idempotency_key' in b)
    expect(redeemBodies).toHaveLength(2)
    expect(redeemBodies[0]?.idempotency_key).toBe(redeemBodies[1]?.idempotency_key)
    expect(String(redeemBodies[0]?.idempotency_key ?? '').length).toBeGreaterThan(7)
  })

  it('is a different key for the next voucher', async () => {
    // The other direction, and it matters as much: `redeem_voucher` refuses
    // outright (`invalid_request`) when a known key arrives with a different
    // code. A key that survived the reset would turn the next customer's
    // voucher into a refusal.
    render(<ScanClient supplierName="ספק" />)

    await scanAndConfirm('ABCDE12345')
    jsonOnce({ outcome: 'success', message: 'השובר מומש בהצלחה' })
    fireEvent.click(screen.getByRole('button', { name: 'אשר ומַמֵש' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'סריקה נוספת' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'סריקה נוספת' }))
    // Crockford-style alphabet: no I, L, O or U, so the second code stays inside
    // it. `parseScanInput` refuses anything else and the flow never leaves the
    // input stage, which is how the first draft of this test failed.
    await scanAndConfirm('FGHJK67890')
    jsonOnce({ outcome: 'success', message: 'השובר מומש בהצלחה' })
    fireEvent.click(screen.getByRole('button', { name: 'אשר ומַמֵש' }))
    await waitFor(() => expect(bodies().filter((b) => 'idempotency_key' in b)).toHaveLength(2))

    const keys = bodies()
      .filter((b) => 'idempotency_key' in b)
      .map((b) => b.idempotency_key)
    expect(keys[0]).not.toBe(keys[1])
  })
})
