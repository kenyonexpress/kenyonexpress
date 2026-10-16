import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PriceRangeSlider from './PriceRangeSlider'

describe('PriceRangeSlider', () => {
  it('renders with category bounds', () => {
    const onApply = vi.fn()
    render(<PriceRangeSlider min={100} max={5000} onApply={onApply} />)

    expect(screen.getByLabelText('מחיר מינימלי')).toBeInTheDocument()
    expect(screen.getByLabelText('מחיר מקסימלי')).toBeInTheDocument()
  })

  it('displays initial values', () => {
    const onApply = vi.fn()
    render(
      <PriceRangeSlider min={100} max={5000} minValue={500} maxValue={2000} onApply={onApply} />,
    )

    expect(screen.getByText('₪500')).toBeInTheDocument()
    expect(screen.getByText('₪2000')).toBeInTheDocument()
  })

  it('updates min value when slider changes', () => {
    const onApply = vi.fn()
    render(
      <PriceRangeSlider min={100} max={5000} minValue={500} maxValue={2000} onApply={onApply} />,
    )

    const minInput = screen.getByLabelText('מחיר מינימלי') as HTMLInputElement
    fireEvent.change(minInput, { target: { value: '800' } })

    expect(screen.getByText('₪800')).toBeInTheDocument()
  })

  it('updates max value when slider changes', () => {
    const onApply = vi.fn()
    render(
      <PriceRangeSlider min={100} max={5000} minValue={500} maxValue={2000} onApply={onApply} />,
    )

    const maxInput = screen.getByLabelText('מחיר מקסימלי') as HTMLInputElement
    fireEvent.change(maxInput, { target: { value: '3500' } })

    expect(screen.getByText('₪3500')).toBeInTheDocument()
  })

  it('calls onApply when apply button is clicked', () => {
    const onApply = vi.fn()
    render(
      <PriceRangeSlider min={100} max={5000} minValue={500} maxValue={2000} onApply={onApply} />,
    )

    const minInput = screen.getByLabelText('מחיר מינימלי') as HTMLInputElement
    fireEvent.change(minInput, { target: { value: '1000' } })

    const applyButton = screen.getByRole('button', { name: 'סינון' })
    fireEvent.click(applyButton)

    expect(onApply).toHaveBeenCalledWith(1000, 2000)
  })

  it('disables apply button when pending', () => {
    const onApply = vi.fn()
    render(
      <PriceRangeSlider
        min={100}
        max={5000}
        minValue={500}
        maxValue={2000}
        onApply={onApply}
        isPending={true}
      />,
    )

    const applyButton = screen.getByRole('button', { name: 'סינון' })
    expect(applyButton).toBeDisabled()
  })

  it('disables apply button when values unchanged', () => {
    const onApply = vi.fn()
    render(
      <PriceRangeSlider min={100} max={5000} minValue={500} maxValue={2000} onApply={onApply} />,
    )

    const applyButton = screen.getByRole('button', { name: 'סינון' })
    expect(applyButton).toBeDisabled()
  })

  it('prevents min from exceeding max', () => {
    const onApply = vi.fn()
    render(
      <PriceRangeSlider min={100} max={5000} minValue={500} maxValue={2000} onApply={onApply} />,
    )

    const minInput = screen.getByLabelText('מחיר מינימלי') as HTMLInputElement
    fireEvent.change(minInput, { target: { value: '3000' } })

    // Should not update beyond maxValue
    expect(screen.getByText('₪500')).toBeInTheDocument()
  })

  it('renders track fill bar', () => {
    const onApply = vi.fn()
    const { container } = render(
      <PriceRangeSlider min={100} max={5000} minValue={500} maxValue={2000} onApply={onApply} />,
    )

    const trackFill = container.querySelector('.price-slider__track-fill')
    expect(trackFill).toBeInTheDocument()
  })
})
