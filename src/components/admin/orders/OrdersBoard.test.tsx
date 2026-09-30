import type { BoardOrder } from '@/server/queries/fulfillment-board'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The board's client half: lanes render from the derived lane, the toolbar
 * follows the selection, the ship panel collects one tracking number per
 * order and sends them to the action, and the outcome names every skip.
 * The actions themselves are tested next to them; here they are stubs.
 */

const shipOrders = vi.hoisted(() => vi.fn())
const deliverOrders = vi.hoisted(() => vi.fn())
const cancelOrders = vi.hoisted(() => vi.fn())
const refresh = vi.hoisted(() => vi.fn())

vi.mock('@/server/actions/admin/fulfillment', () => ({ shipOrders, deliverOrders, cancelOrders }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import OrdersBoard from './OrdersBoard'

function order(overrides: Partial<BoardOrder>): BoardOrder {
  return {
    id: '3b6e6f1e-9c2a-4b7e-8d3f-1a2b3c4d5e6f',
    ref: 'KE-1',
    invoice_number: 'KE-1',
    status: 'paid',
    lane: 'paid',
    total_agorot: 12_000,
    created_at: '2026-10-01T06:00:00.000Z',
    customer: 'דנה',
    email: 'dana@example.com',
    phone: '',
    city: 'חיפה',
    couponLines: 0,
    physicalLines: 1,
    lines: [
      {
        id: 'l',
        product_type: 'physical',
        item_status: 'pending',
        carrier: null,
        tracking_number: null,
      },
    ],
    ...overrides,
  }
}

const PAID = order({})
const SHIPPED = order({
  id: '4c7f7a2f-0d3b-4c8f-9e4a-2b3c4d5e6f70',
  ref: 'KE-2',
  lane: 'shipped',
  customer: 'רון',
  lines: [
    {
      id: 'l2',
      product_type: 'physical',
      item_status: 'shipped',
      carrier: 'חבילה פלוס',
      tracking_number: 'IL77',
    },
  ],
})
const NEW = order({
  id: '5d8a8b30-1e4c-4d9a-af5b-3c4d5e6f7081',
  ref: 'KE-3',
  status: 'pending',
  lane: 'new',
  customer: 'נועה',
})

beforeEach(() => {
  vi.clearAllMocks()
  shipOrders.mockResolvedValue({ done: [PAID.id], skipped: [], notified: 1 })
  deliverOrders.mockResolvedValue({ done: [SHIPPED.id], skipped: [] })
  cancelOrders.mockResolvedValue({ done: [NEW.id], skipped: [] })
})

describe('OrdersBoard', () => {
  it('renders the five lanes in Hebrew with a count, and each card in its lane', () => {
    render(<OrdersBoard orders={[PAID, SHIPPED, NEW]} exportHref="/api/admin/orders/export" />)
    for (const label of ['חדשות', 'שולמו', 'נשלחו', 'נמסרו', 'בוטלו']) {
      expect(screen.getByRole('region', { name: label })).toBeTruthy()
    }
    const shipped = screen.getByRole('region', { name: 'נשלחו' })
    expect(shipped.textContent).toContain('KE-2')
    expect(shipped.textContent).toContain('IL77')
    expect(screen.getByRole('region', { name: 'נמסרו' }).textContent).toContain('אין הזמנות')
  })

  it('the toolbar offers only the moves the selection can make', () => {
    render(<OrdersBoard orders={[PAID, SHIPPED, NEW]} exportHref="/api/admin/orders/export" />)
    expect(screen.queryByRole('button', { name: /סימון כנשלח/ })).toBeNull()

    fireEvent.click(screen.getByRole('checkbox', { name: 'בחירת הזמנה KE-3' }))
    expect(screen.getByRole('button', { name: /ביטול הזמנה/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /סימון כנשלח/ })).toBeNull()

    fireEvent.click(screen.getByRole('checkbox', { name: 'בחירת הזמנה KE-2' }))
    expect(screen.getByRole('button', { name: /סימון כנשלח/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /סימון כנמסר/ })).toBeTruthy()
    expect(screen.getByText('נבחרו 2 הזמנות')).toBeTruthy()

    // The selection export carries the ids; the board export does not.
    const links = screen.getAllByRole('link', { name: /CSV/ })
    const hrefs = links.map((l) => l.getAttribute('href'))
    expect(hrefs).toContain('/api/admin/orders/export')
    expect(hrefs.some((h) => h?.includes(`ids=${NEW.id}%2C${SHIPPED.id}`))).toBe(true)
  })

  it('ships with one tracking number per order and a shared carrier, then clears the selection', async () => {
    render(<OrdersBoard orders={[PAID, SHIPPED]} exportHref="/api/admin/orders/export" />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'בחירת כל ההזמנות בשלב שולמו' }))
    fireEvent.click(screen.getByRole('button', { name: /סימון כנשלח/ }))

    fireEvent.change(screen.getByPlaceholderText('למשל: חבילה פלוס'), {
      target: { value: 'דואר ישראל' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'מספר מעקב להזמנה KE-1' }), {
      target: { value: 'RR123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /סימון 1 הזמנות כנשלחו/ }))

    await waitFor(() =>
      expect(shipOrders).toHaveBeenCalledWith([
        { orderId: PAID.id, carrier: 'דואר ישראל', trackingNumber: 'RR123' },
      ]),
    )
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(screen.getByText(/בוצע על 1 הזמנות, נשלחו הודעות ל-1 לקוחות/)).toBeTruthy()
    expect(screen.getByText('לא נבחרו הזמנות')).toBeTruthy()
  })

  it('prints every skip with its reason and keeps the refused order selected', async () => {
    deliverOrders.mockResolvedValue({
      done: [],
      skipped: [{ orderId: SHIPPED.id, reason: 'השורות השתנו בינתיים' }],
    })
    render(<OrdersBoard orders={[SHIPPED]} exportHref="/api/admin/orders/export" />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'בחירת הזמנה KE-2' }))
    fireEvent.click(screen.getByRole('button', { name: /סימון כנמסר/ }))
    fireEvent.click(screen.getByRole('button', { name: /סימון 1 הזמנות כנמסרו/ }))

    await waitFor(() => expect(deliverOrders).toHaveBeenCalledWith([SHIPPED.id]))
    await waitFor(() => expect(screen.getByText(/השורות השתנו בינתיים/)).toBeTruthy())
    expect(screen.getByText('נבחרו 1 הזמנות')).toBeTruthy()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('cancel demands a reason before the button enables', async () => {
    render(<OrdersBoard orders={[NEW]} exportHref="/api/admin/orders/export" />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'בחירת הזמנה KE-3' }))
    fireEvent.click(screen.getByRole('button', { name: /ביטול הזמנה/ }))
    const submit = screen.getByRole('button', { name: /ביטול 1 הזמנות/ })
    expect((submit as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByRole('textbox', { name: 'סיבת הביטול' }), {
      target: { value: 'הלקוח ביקש' },
    })
    expect((submit as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(submit)
    await waitFor(() => expect(cancelOrders).toHaveBeenCalledWith([NEW.id], 'הלקוח ביקש'))
  })

  it('a drop into a legal lane opens the panel for that card; an illegal drop does nothing', () => {
    render(<OrdersBoard orders={[PAID, NEW]} exportHref="/api/admin/orders/export" />)
    const data = new Map<string, string>()
    const dataTransfer = {
      setData: (k: string, v: string) => data.set(k, v),
      getData: (k: string) => data.get(k) ?? '',
      effectAllowed: 'move',
    }
    const card = screen
      .getByRole('checkbox', { name: 'בחירת הזמנה KE-1' })
      .closest('li') as HTMLElement
    fireEvent.dragStart(card, { dataTransfer })

    // paid -> delivered is not a move the board offers.
    fireEvent.drop(screen.getByRole('region', { name: 'נמסרו' }), { dataTransfer })
    expect(screen.queryByRole('region', { name: 'סימון כנשלח' })).toBeNull()

    fireEvent.drop(screen.getByRole('region', { name: 'נשלחו' }), { dataTransfer })
    expect(screen.getByRole('region', { name: 'סימון כנשלח' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'מספר מעקב להזמנה KE-1' })).toBeTruthy()
  })
})
