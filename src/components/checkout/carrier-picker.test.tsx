import { agorot } from '@/lib/money'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getShippingQuotes = vi.fn()
vi.mock('@/server/actions/shipping', () => ({
  getShippingQuotes: (...args: unknown[]) => getShippingQuotes(...args),
}))

import CarrierPicker from './CarrierPicker'

const option = (id: string, shopper = 0) => {
  const [carrierId, serviceCode] = id.split(':') as ['chita', string]
  return {
    id,
    carrierId,
    serviceCode,
    carrierLabel: carrierId === 'chita' ? "צ'יטה שליחויות" : 'דואר ישראל',
    serviceLabel: 'שליח עד הבית',
    etaLabel: '2-5 ימי עסקים',
    minDays: 2,
    maxDays: 5,
    shopperAgorot: agorot(shopper),
    carrierCostAgorot: agorot(2990),
    quoteRef: null,
  }
}

describe('CarrierPicker', () => {
  beforeEach(() => getShippingQuotes.mockReset())

  it('quotes the server with city and zip only, and posts an empty pick by default', async () => {
    getShippingQuotes.mockResolvedValue({
      options: [option('chita:standard')],
      degraded: false,
      zone: 'center',
    })
    const { container } = render(<CarrierPicker city="תל אביב" zip="6433222" />)
    await waitFor(() => expect(screen.getByRole('radio')).toBeInTheDocument())
    expect(getShippingQuotes).toHaveBeenCalledWith({ city: 'תל אביב', zip: '6433222' })
    const hidden = container.querySelector('input[name="shipping_option"]') as HTMLInputElement
    expect(hidden.value).toBe('')
    expect(screen.getByText('חינם')).toBeInTheDocument()
  })

  it('posts the picked option and keeps it across a re-quote that still offers it', async () => {
    getShippingQuotes.mockResolvedValue({
      options: [option('chita:standard'), option('israel_post:registered')],
      degraded: false,
      zone: 'center',
    })
    const { container, rerender } = render(<CarrierPicker city="תל אביב" zip={null} />)
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(2))
    fireEvent.click(screen.getAllByRole('radio')[1]!)
    const hidden = () =>
      (container.querySelector('input[name="shipping_option"]') as HTMLInputElement).value
    expect(hidden()).toBe('israel_post:registered')

    getShippingQuotes.mockResolvedValue({
      options: [option('israel_post:registered')],
      degraded: true,
      zone: 'north',
    })
    await act(async () => {
      rerender(<CarrierPicker city="חיפה" zip={null} />)
    })
    await waitFor(() => expect(getShippingQuotes).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(1))
    expect(hidden()).toBe('israel_post:registered')
    expect(screen.getByText('חלק מחברות המשלוחים לא זמינות כרגע.')).toBeInTheDocument()
  })

  it('drops a pick the new quote no longer offers', async () => {
    getShippingQuotes.mockResolvedValue({
      options: [option('chita:express')],
      degraded: false,
      zone: 'center',
    })
    const { container, rerender } = render(<CarrierPicker city="תל אביב" zip={null} />)
    await waitFor(() => expect(screen.getByRole('radio')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('radio'))
    getShippingQuotes.mockResolvedValue({
      options: [option('yamit:standard')],
      degraded: false,
      zone: 'south',
    })
    await act(async () => {
      rerender(<CarrierPicker city="באר שבע" zip={null} />)
    })
    await waitFor(() => expect(screen.getByText(/ימית|דואר|צ'יטה/)).toBeInTheDocument())
    await waitFor(() =>
      expect(
        (container.querySelector('input[name="shipping_option"]') as HTMLInputElement).value,
      ).toBe(''),
    )
  })

  it('explains a degraded empty answer instead of failing', async () => {
    getShippingQuotes.mockResolvedValue({ options: [], degraded: true, zone: null })
    render(<CarrierPicker city="אילת" zip={null} />)
    await waitFor(() =>
      expect(screen.getByText(/חברת המשלוחים תיבחר בעת הכנת החבילה/)).toBeInTheDocument(),
    )
    expect(screen.queryByRole('radio')).toBeNull()
  })

  it('shows a shekel price when a zone carries one', async () => {
    getShippingQuotes.mockResolvedValue({
      options: [option('chita:standard', 3500)],
      degraded: false,
      zone: 'eilat',
    })
    render(<CarrierPicker city="אילת" zip={null} />)
    await waitFor(() => expect(screen.getByRole('radio')).toBeInTheDocument())
    expect(screen.queryByText('חינם')).toBeNull()
    expect(screen.getByText(/35/)).toBeInTheDocument()
  })
})
