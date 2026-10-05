import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The payout button names the amount the server fixed, posts no amount of its
 * own, and reads the server's answer back to the affiliate.
 */

const requestMock = vi.fn()

vi.mock('@/server/actions/affiliates', () => ({
  requestAffiliatePayout: (...args: unknown[]) => requestMock(...args),
}))

import AffiliatePayoutForm from './AffiliatePayoutForm'

beforeEach(() => {
  requestMock.mockReset()
})

async function submit() {
  fireEvent.submit(screen.getByTestId('affiliate-payout-form'))
  await act(async () => {
    await Promise.resolve()
  })
}

describe('AffiliatePayoutForm', () => {
  it('names the fixed amount on the button and carries no amount field', () => {
    render(<AffiliatePayoutForm requestableAgorot={12_350} />)
    const button = screen.getByRole('button')
    expect(button.textContent).toContain('123.50')
    expect(button.textContent).toContain('₪')
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(document.querySelector('input[name="amount"]')).toBeNull()
    expect(document.querySelector('input[name="note"]')).not.toBeNull()
  })

  it('reads the server refusal back as an alert', async () => {
    requestMock.mockResolvedValue({ ok: false, error: 'כבר יש בקשת משיכה שממתינה לטיפול.' })
    render(<AffiliatePayoutForm requestableAgorot={5_000} />)
    await submit()
    expect(requestMock).toHaveBeenCalledTimes(1)
    expect((await screen.findByRole('alert')).textContent).toBe('כבר יש בקשת משיכה שממתינה לטיפול.')
    expect(screen.getByTestId('affiliate-payout-form')).toBeInTheDocument()
  })

  it('replaces the form with the sent line on success', async () => {
    requestMock.mockResolvedValue({ ok: true, amountAgorot: 5_000 })
    render(<AffiliatePayoutForm requestableAgorot={5_000} />)
    await submit()
    expect(await screen.findByTestId('affiliate-payout-sent')).toBeInTheDocument()
    expect(screen.queryByTestId('affiliate-payout-form')).toBeNull()
  })
})
