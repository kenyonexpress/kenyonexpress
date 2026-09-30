import { listDeliverySlots } from '@/lib/checkout/delivery-slots'
import { estimateDelivery } from '@/lib/shipping/estimate'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import DeliverySlotPicker from './DeliverySlotPicker'

const NOW = new Date('2026-10-01T12:00:00Z') // Thursday noon, Israel and UTC agree
const SLOTS = listDeliverySlots({ now: NOW })

function setup(props: Partial<Parameters<typeof DeliverySlotPicker>[0]> = {}) {
  const utils = render(<DeliverySlotPicker id="slot" slots={SLOTS} estimate={null} {...props} />)
  const select = utils.container.querySelector<HTMLSelectElement>('select[name="delivery_slot"]')
  if (!select) throw new Error('slot select missing')
  const options = () => [...select.querySelectorAll<HTMLOptionElement>('option')]
  const groups = () => [...select.querySelectorAll<HTMLOptGroupElement>('optgroup')]
  return { ...utils, select, options, groups }
}

describe('the delivery slot picker', () => {
  it('defaults to no preference, posted as an empty string', () => {
    const { select, options } = setup()
    expect(select.value).toBe('')
    expect(options()[0]?.textContent).toBe('ללא העדפה')
    expect(options()[0]?.value).toBe('')
  })

  it('groups the slots by day with both windows under each', () => {
    const { groups } = setup()
    const first = groups()[0]
    expect(first?.label).toMatch(/^יום /)
    expect(first?.querySelectorAll('option')).toHaveLength(2)
    expect(first?.querySelectorAll('option')[0]?.textContent).toContain('בוקר')
    expect(first?.querySelectorAll('option')[1]?.textContent).toContain('אחר הצהריים')
  })

  it('starts at the registry lower bound when no city is known', () => {
    // 3 business days from Thursday the 1st is Tuesday the 6th.
    const { options } = setup({ estimate: null })
    expect(options()[1]?.value).toBe('2026-10-06|morning')
    expect(options().some((option) => option.value.startsWith('2026-10-04'))).toBe(false)
  })

  it('narrows to the city estimate: a remote city starts later', () => {
    const eilat = estimateDelivery('eilat', 'supplier_delivery')
    expect(eilat?.minDays).toBe(5)
    const { options, container } = setup({ estimate: eilat })
    // 5 business days from Thursday the 1st is Thursday the 8th.
    expect(options()[1]?.value).toBe('2026-10-08|morning')
    expect(container.textContent).toContain('משלוח לאילת מגיע תוך 5-7 ימי עסקים')
  })

  it('keeps a previously chosen slot visible when the city moved the floor past it', () => {
    const eilat = estimateDelivery('eilat', 'supplier_delivery')
    const { select, options } = setup({ estimate: eilat, defaultValue: '2026-10-04|morning' })
    expect(select.value).toBe('2026-10-04|morning')
    expect(options().filter((option) => option.value === '2026-10-04|morning')).toHaveLength(1)
  })

  it('renders nothing but the placeholder when handed no slots', () => {
    const { options } = setup({ slots: [] })
    expect(options()).toHaveLength(1)
  })

  it('describes itself: the hint is wired to the select', () => {
    const { select, container } = setup()
    const hintId = select.getAttribute('aria-describedby')
    expect(hintId).toBeTruthy()
    expect(container.querySelector(`#${hintId}`)?.textContent).toContain('3-7 ימי עסקים')
  })
})
