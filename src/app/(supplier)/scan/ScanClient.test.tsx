import { readQueue } from '@/lib/vouchers/offline-queue'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ScanClient from './ScanClient'

/**
 * The till when the shop's connection is down. The rule under test is the one
 * the queue's header states: a scan is kept with the key it was minted with,
 * nothing is called approved until the server has answered, and only a verdict
 * about the voucher removes a scan from the queue.
 */

const CODE = 'ABCDE12345'
const fetchMock = vi.fn()
const offline = () => Promise.reject(new TypeError('Failed to fetch'))
const json = (body: unknown, ok = true) => Promise.resolve({ ok, json: async () => body })

function typeCodeAndSubmit() {
  fireEvent.change(screen.getByPlaceholderText('XXXXX-XXXXX'), { target: { value: CODE } })
  fireEvent.submit(screen.getByPlaceholderText('XXXXX-XXXXX').closest('form') as HTMLFormElement)
}

beforeEach(() => {
  window.localStorage.clear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ScanClient, offline', () => {
  it('keeps a scan whose lookup could not reach the server, and says it is unchecked', async () => {
    fetchMock.mockImplementation(offline)
    render(<ScanClient supplierName="ספק" />)
    typeCodeAndSubmit()

    await waitFor(() => expect(readQueue()).toHaveLength(1))
    expect(readQueue()[0]).toMatchObject({ code: CODE, qrPayload: null, scanMethod: 'manual' })
    expect(screen.getByText(/עדיין לא בדקנו את השובר/)).toBeTruthy()
    expect(screen.getByText(/סריקות ממתינות לשליחה/)).toBeTruthy()
  })

  it('drains on reconnect with the key minted at scan time, and clears what was settled', async () => {
    fetchMock.mockImplementation(offline)
    render(<ScanClient supplierName="ספק" />)
    typeCodeAndSubmit()
    await waitFor(() => expect(readQueue()).toHaveLength(1))
    const key = readQueue()[0]?.idempotencyKey

    fetchMock.mockImplementation((url: string, init?: { body?: string }) => {
      expect(url).toBe('/api/supplier/vouchers/redeem-batch')
      const sent = JSON.parse(init?.body ?? '{}')
      expect(sent.items).toEqual([{ code: CODE, scan_method: 'manual', idempotency_key: key }])
      return json({ results: [{ idempotency_key: key, outcome: 'success' }] })
    })
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })

    await waitFor(() => expect(readQueue()).toHaveLength(0))
    expect(screen.getByText('סונכרנו 1 מימושים.')).toBeTruthy()
    expect(screen.queryByText(/סריקות ממתינות לשליחה/)).toBeNull()
  })

  it('keeps the scan when the server did not answer the batch', async () => {
    fetchMock.mockImplementation(offline)
    render(<ScanClient supplierName="ספק" />)
    typeCodeAndSubmit()
    await waitFor(() => expect(readQueue()).toHaveLength(1))

    fetchMock.mockImplementation(() => json({}, false))
    fireEvent.click(screen.getByRole('button', { name: 'סנכרון עכשיו' }))

    await waitFor(() => expect(screen.getByText(/הסנכרון נכשל/)).toBeTruthy())
    expect(readQueue()).toHaveLength(1)
  })

  it('removes a refused scan and tells the cashier to check it', async () => {
    fetchMock.mockImplementation(offline)
    render(<ScanClient supplierName="ספק" />)
    typeCodeAndSubmit()
    await waitFor(() => expect(readQueue()).toHaveLength(1))
    const key = readQueue()[0]?.idempotencyKey

    fetchMock.mockImplementation(() =>
      json({ results: [{ idempotency_key: key, outcome: 'expired' }] }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'סנכרון עכשיו' }))

    await waitFor(() => expect(readQueue()).toHaveLength(0))
    expect(screen.getByText(/1 סריקות נדחו/)).toBeTruthy()
  })

  it('queues a redeem that lost the connection after the lookup, under the same key it sent', async () => {
    let sentKey: string | undefined
    fetchMock.mockImplementation((url: string, init?: { body?: string }) => {
      if (url === '/api/supplier/vouchers/lookup') {
        return json({ outcome: 'redeemable', message: 'ניתן למימוש' })
      }
      sentKey = JSON.parse(init?.body ?? '{}').idempotency_key
      return offline()
    })
    render(<ScanClient supplierName="ספק" />)
    typeCodeAndSubmit()
    const confirm = await screen.findByRole('button', { name: /^אשר/ })
    fireEvent.click(confirm)

    await waitFor(() => expect(readQueue()).toHaveLength(1))
    expect(sentKey).toBeTruthy()
    expect(readQueue()[0]?.idempotencyKey).toBe(sentKey)
  })
})
