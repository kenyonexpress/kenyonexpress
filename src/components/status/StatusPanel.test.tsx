import { READY_COPY, readyReportFixture } from '@/lib/health/public-status'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StatusPanel from './StatusPanel'

function readyResponse(status: number, body: unknown) {
  return { status, json: async () => body } as unknown as Response
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(readyResponse(200, readyReportFixture()))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** UX26: the public status panel, read from the browser. */
describe('StatusPanel', () => {
  it('asks /api/ready after mount and lists the five services with their state', async () => {
    const { container } = render(<StatusPanel />)
    const panel = container.querySelector('[data-status-panel]') as HTMLElement
    expect(panel).toHaveAttribute('data-state', 'checking')
    expect(screen.getByRole('status')).toHaveTextContent(READY_COPY.checking)

    await waitFor(() => expect(panel).toHaveAttribute('data-state', 'ok'))
    expect(screen.getByRole('status')).toHaveTextContent(READY_COPY.ok)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ready',
      expect.objectContaining({ cache: 'no-store' }),
    )
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(5)
    expect(items.map((li) => li.getAttribute('data-status-check'))).toEqual([
      'database',
      'redis',
      'meilisearch',
      'r2',
      'cardcom',
    ])
    expect(items[0]).toHaveTextContent('מסד הנתונים')
    expect(items[0]).toHaveTextContent('פעיל')
    expect(container.querySelector('[data-status-checked]')).toHaveTextContent('נבדק לאחרונה')
  })

  it('a down service is degraded and named', async () => {
    fetchMock.mockResolvedValue(readyResponse(503, readyReportFixture({ meilisearch: 'down' })))
    const { container } = render(<StatusPanel />)
    const panel = container.querySelector('[data-status-panel]') as HTMLElement
    await waitFor(() => expect(panel).toHaveAttribute('data-state', 'degraded'))
    const search = container.querySelector('[data-status-check="meilisearch"]')
    expect(search).toHaveAttribute('data-status', 'down')
    expect(search).toHaveTextContent('תקלה')
  })

  it('a failed probe is "could not check" with no list, never an outage', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const { container } = render(<StatusPanel />)
    const panel = container.querySelector('[data-status-panel]') as HTMLElement
    await waitFor(() => expect(panel).toHaveAttribute('data-state', 'unknown'))
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByRole('status')).toHaveTextContent(READY_COPY.unknown)
  })

  it('the button re-probes on demand, and the interval re-probes on its own', async () => {
    vi.useFakeTimers()
    render(<StatusPanel refreshMs={1_000} />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /בדקו שוב|בודקים/ }))
      await Promise.resolve()
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await act(async () => {
      vi.advanceTimersByTime(1_000)
      await Promise.resolve()
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(screen.getByRole('button').className).toContain('min-h-touch-min')
  })
})
