import { paymentMethodOptions } from '@/lib/checkout/payment-methods'
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PaymentMethodSelector from './PaymentMethodSelector'

/**
 * The payment method cards (UX17): one radio group under `token_id`, the
 * ticked card marked for the stylesheet, a change reported upwards, and the
 * brand marks under the hosted-page card only.
 */

const CARDS = [
  { id: 'tok-2', last4: '1111', brand: 'mastercard', isDefault: true },
  { id: 'tok-1', last4: '4242', brand: 'visa', isDefault: false },
]

function setup(savedCards = CARDS, choice = 'tok-2') {
  const onChange = vi.fn()
  const utils = render(
    <PaymentMethodSelector
      options={paymentMethodOptions(savedCards)}
      choice={choice}
      onChange={onChange}
    />,
  )
  const radios = () => [...utils.container.querySelectorAll<HTMLInputElement>('[name="token_id"]')]
  const cards = () => [
    ...utils.container.querySelectorAll<HTMLElement>('.checkout-methods__option'),
  ]
  return { ...utils, radios, cards, onChange }
}

describe('the payment method selector', () => {
  it('is one radio group under token_id with a Hebrew legend', () => {
    const { container, radios } = setup()
    expect(container.querySelector('fieldset legend')?.textContent).toBe('אמצעי תשלום')
    expect(radios().map((r) => r.value)).toEqual(['tok-2', 'tok-1', 'new'])
    expect(radios().map((r) => r.checked)).toEqual([true, false, false])
  })

  it('names each card by brand and digits, marks the default, and explains the hosted page', () => {
    const { cards } = setup()
    expect(cards()[0]?.textContent).toContain('מאסטרקארד המסתיים ב-1111')
    expect(cards()[0]?.textContent).toContain('ברירת מחדל')
    expect(cards()[1]?.textContent).not.toContain('ברירת מחדל')
    expect(cards()[2]?.textContent).toContain('כרטיס אחר')
    expect(cards()[2]?.textContent).toContain('Cardcom')
  })

  it('marks the ticked card for the stylesheet and reports a change upwards', () => {
    const { cards, radios, onChange } = setup()
    expect(cards()[0]?.getAttribute('data-selected')).toBe('true')
    expect(cards()[2]?.getAttribute('data-selected')).toBeNull()
    const hosted = radios()[2]
    if (!hosted) throw new Error('hosted radio missing')
    fireEvent.click(hosted)
    expect(onChange).toHaveBeenCalledWith('new')
  })

  it('shows the brand marks under the hosted-page card only, outside its label', () => {
    const { cards } = setup()
    expect(cards()[0]?.querySelector('ul')).toBeNull()
    const marks = cards()[2]?.querySelector('ul')
    expect(marks).toBeTruthy()
    expect(marks?.closest('label')).toBeNull()
    expect(marks?.querySelectorAll('[role="img"]').length).toBeGreaterThanOrEqual(4)
  })

  it('still renders the one radio, ticked, for a shopper with no saved card', () => {
    const { radios, cards } = setup([], 'new')
    expect(radios()).toHaveLength(1)
    expect(radios()[0]?.value).toBe('new')
    expect(radios()[0]?.checked).toBe(true)
    expect(cards()[0]?.textContent).toContain('כרטיס אשראי')
  })
})
