import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import TrustBar from './TrustBar'

afterEach(cleanup)

describe('TrustBar', () => {
  it('names the payment provider the checkout names', () => {
    render(<TrustBar />)
    expect(screen.getByText('תשלום מאובטח')).toBeTruthy()
    expect(screen.getByText('באשראי, באמצעות Cardcom')).toBeTruthy()
  })

  it('links the cancellation policy and the contact page, and nothing else', () => {
    render(<TrustBar />)
    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'))
    expect(hrefs).toEqual(['/refund_returns', '/contact'])
  })

  /**
   * The rule the component's header states, as a test: no hours, no
   * percentages, no counts. A digit in this bar is a quantified promise, and
   * none is recorded anywhere for it to come from.
   */
  it('makes no quantified claim', () => {
    const { container } = render(<TrustBar />)
    expect(container.textContent).not.toMatch(/\d/)
    expect(container.textContent).not.toContain('%')
  })
})
