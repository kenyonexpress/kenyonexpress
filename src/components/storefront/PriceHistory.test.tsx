import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The product page's price history band (STEP 59). Pinned: nothing below two
 * observed days, the verdict follows the same rule as the tiles ("lowest
 * ever" over "dropped" over the plain floor), the chart is one step polyline
 * with an accessible label, and the end marker turns green at the floor.
 */

const mock = vi.hoisted(() => ({
  view: null as null | {
    points: { day: string; agorot: number }[]
    series: { day: string; agorot: number }[]
    summary: {
      previousAgorot: number | null
      lowestBeforeTodayAgorot: number | null
      observedDays: number
    }
    lowestEverAgorot: number
    today: string
  },
}))

vi.mock('@/lib/pricing/price-history-read', () => ({
  loadPriceHistoryView: async () => mock.view,
}))

const { default: PriceHistory } = await import('./PriceHistory')

const P = '11111111-1111-4111-8111-111111111111'

// Eight earlier sale days with a floor of 9000 on 02.10, then 10000 held
// into yesterday; today's row is whatever the page renders now.
const points = [
  { day: '2026-09-30', agorot: 12000 },
  { day: '2026-10-01', agorot: 12000 },
  { day: '2026-10-02', agorot: 9000 },
  { day: '2026-10-03', agorot: 11000 },
  { day: '2026-10-04', agorot: 11000 },
  { day: '2026-10-05', agorot: 10000 },
  { day: '2026-10-06', agorot: 10000 },
  { day: '2026-10-07', agorot: 10000 },
  { day: '2026-10-08', agorot: 9000 },
]

beforeEach(() => {
  mock.view = {
    points,
    series: points,
    summary: { previousAgorot: 10000, lowestBeforeTodayAgorot: 9000, observedDays: 8 },
    lowestEverAgorot: 9000,
    today: '2026-10-08',
  }
})

async function renderBand(currentAgorot: number | null) {
  const ui = await PriceHistory({ productId: P, currentAgorot })
  return render(ui as never)
}

describe('PriceHistory', () => {
  it('renders nothing without a view', async () => {
    mock.view = null
    const { container } = await renderBand(9000)
    expect(container).toBeEmptyDOMElement()
  })

  it('calls the floor an all-time low and marks the chart end green', async () => {
    await renderBand(9000)
    expect(screen.getByRole('heading', { name: 'היסטוריית מחיר' })).toBeInTheDocument()
    const verdict = screen.getByText('המחיר הנמוך ביותר שנמדד למוצר הזה')
    expect(verdict).toHaveAttribute('data-signal', 'all-time-low')
    const chart = screen.getByTestId('price-history-chart')
    expect(chart.querySelector('polyline')?.getAttribute('points')).toMatch(/^\d/)
    expect(chart.querySelector('[data-at-low="true"]')).not.toBeNull()
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('30.09')
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('08.10')
  })

  it('reports a drop that is not the floor, with the previous price', async () => {
    await renderBand(9500)
    const verdict = screen.getByText(/ירד ב-5% לעומת המחיר הקודם/)
    expect(verdict).toHaveAttribute('data-signal', 'drop')
    expect(verdict.textContent).toContain('100')
    expect(
      screen.getByTestId('price-history-chart').querySelector('[data-at-low="false"]'),
    ).not.toBeNull()
  })

  it('falls back to the lowest price measured when nothing moved', async () => {
    await renderBand(10000)
    const verdict = screen.getByText(/המחיר הנמוך ביותר שנמדד:/)
    expect(verdict).toHaveAttribute('data-signal', 'none')
    expect(verdict.textContent).toContain('90')
  })

  it('explains an empty window instead of drawing nothing', async () => {
    mock.view = { ...(mock.view as NonNullable<typeof mock.view>), series: [] }
    await renderBand(9000)
    expect(screen.queryByTestId('price-history-chart')).toBeNull()
    expect(screen.getByText(/נמדדו 9 ימים/)).toBeInTheDocument()
  })
})
