import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * The bundle composer (STEP 60). Pinned: the member rows are serialised into
 * one hidden `items_json` field exactly as the action parses them, picking
 * a product adds a row and removes it from the picker, the worth line adds
 * the members' prices and subtracts the saving, an over-large saving is
 * warned about, and the submit stays disabled with no members.
 */

const mock = vi.hoisted(() => ({
  state: { ok: false } as { ok: boolean; error?: string; fieldErrors?: Record<string, string[]> },
}))

vi.mock('@/server/actions/admin/bundles', () => ({ saveBundle: vi.fn() }))
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useActionState: () => [mock.state, vi.fn(), false],
  }
})

import BundleForm from './BundleForm'

const MUG = '33333333-3333-4333-8333-333333333333'
const PLATE = '44444444-4444-4444-8444-444444444444'
const BOWL = '55555555-5555-4555-8555-555555555555'

const PRODUCTS = [
  { id: MUG, name_he: 'ספל', kenyon_price: 40, status: 'active' },
  { id: PLATE, name_he: 'צלחת', kenyon_price: 60, status: 'active' },
  { id: BOWL, name_he: 'קערה', kenyon_price: 50, status: 'active' },
]

function itemsJson(container: HTMLElement): unknown {
  const input = container.querySelector('input[name="items_json"]') as HTMLInputElement
  return JSON.parse(input.value)
}

describe('BundleForm', () => {
  it('starts empty with the submit disabled and the picker offering every product', () => {
    const { container } = render(<BundleForm products={PRODUCTS} />)
    expect(itemsJson(container)).toEqual([])
    expect((screen.getByRole('button', { name: 'שמירה' }) as HTMLButtonElement).disabled).toBe(true)
    const select = screen.getByLabelText('הוספת מוצר') as HTMLSelectElement
    expect(select.options.length).toBe(4)
  })

  it('adds a row from the picker, drops it from the picker, and serialises the rows', () => {
    const { container } = render(<BundleForm products={PRODUCTS} />)
    const select = screen.getByLabelText('הוספת מוצר') as HTMLSelectElement
    fireEvent.change(select, { target: { value: MUG } })
    fireEvent.change(select, { target: { value: PLATE } })

    expect(itemsJson(container)).toEqual([
      { product_id: MUG, quantity: 1 },
      { product_id: PLATE, quantity: 1 },
    ])
    expect([...select.options].map((o) => o.value)).toEqual(['', BOWL])
    expect((screen.getByRole('button', { name: 'שמירה' }) as HTMLButtonElement).disabled).toBe(
      false,
    )

    fireEvent.change(screen.getByLabelText('כמות', { selector: `#qty-${PLATE}` }), {
      target: { value: '3' },
    })
    expect(itemsJson(container)).toEqual([
      { product_id: MUG, quantity: 1 },
      { product_id: PLATE, quantity: 3 },
    ])

    fireEvent.click(screen.getByRole('button', { name: 'הסרת ספל מהחבילה' }))
    expect(itemsJson(container)).toEqual([{ product_id: PLATE, quantity: 3 }])
  })

  it('adds up the worth, subtracts the saving, and warns when the saving exceeds the set', () => {
    render(<BundleForm products={PRODUCTS} />)
    const select = screen.getByLabelText('הוספת מוצר') as HTMLSelectElement
    fireEvent.change(select, { target: { value: MUG } })
    fireEvent.change(select, { target: { value: PLATE } })
    fireEvent.change(screen.getByLabelText('חיסכון לחבילה (₪)'), { target: { value: '25' } })

    const worth = screen.getByTestId('bundle-worth').textContent ?? ''
    expect(worth).toContain('2 יחידות')
    expect(worth).toMatch(/100/)
    expect(worth).toMatch(/75/)
    expect(worth).not.toContain('גדול משווי')

    fireEvent.change(screen.getByLabelText('חיסכון לחבילה (₪)'), { target: { value: '250' } })
    expect(screen.getByTestId('bundle-worth').textContent).toContain('גדול משווי')
  })

  it('seeds the rows and the fields from an existing bundle, in shekels', () => {
    const { container } = render(
      <BundleForm
        products={PRODUCTS}
        initial={{
          id: '22222222-2222-4222-8222-222222222222',
          name_he: 'ספל וצלחת',
          description_he: null,
          discount_agorot: 2990,
          is_active: false,
          starts_at: null,
          expires_at: null,
          created_at: '2026-10-08T00:00:00Z',
          updated_at: '2026-10-08T00:00:00Z',
          items: [
            { product_id: MUG, quantity: 2, name_he: 'ספל', kenyon_price: 40, status: 'active' },
          ],
        }}
      />,
    )
    expect(itemsJson(container)).toEqual([{ product_id: MUG, quantity: 2 }])
    expect((screen.getByLabelText('חיסכון לחבילה (₪)') as HTMLInputElement).value).toBe('29.9')
    expect((screen.getByLabelText('פעילה') as HTMLInputElement).checked).toBe(false)
    expect((container.querySelector('input[name="id"]') as HTMLInputElement).value).toBe(
      '22222222-2222-4222-8222-222222222222',
    )
  })

  it('announces a field error from the action beside the members', () => {
    mock.state = { ok: false, fieldErrors: { items: ['חבילה צריכה לפחות מוצר אחד'] } }
    render(<BundleForm products={PRODUCTS} />)
    expect(screen.getByRole('alert').textContent).toContain('לפחות מוצר אחד')
    mock.state = { ok: false }
  })
})
