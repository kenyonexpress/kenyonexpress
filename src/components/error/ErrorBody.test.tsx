import { HEALTH_COPY } from '@/lib/health/public-status'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ErrorBody, { ERROR_HEADING, ERROR_PAGE_TITLE, supportMessage } from './ErrorBody'

const { withScope, captureException, setTag } = vi.hoisted(() => {
  const setTag = vi.fn()
  return {
    setTag,
    captureException: vi.fn(),
    withScope: vi.fn((callback: (scope: { setTag: typeof setTag }) => void) =>
      callback({ setTag }),
    ),
  }
})

// Every name sentry-browser-sdk.ts re-exports, because vitest throws on a
// read of a missing export from a mocked module; only two are asserted on.
vi.mock('@sentry/nextjs', () => ({
  withScope,
  captureException,
  captureMessage: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
  init: vi.fn(),
  setTag: vi.fn(),
  setUser: vi.fn(),
}))

function healthResponse(status: number, body: unknown) {
  return { status, json: async () => body } as unknown as Response
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(healthResponse(200, { ok: true, database: 'ok', latency_ms: 5 }))
  vi.stubGlobal('fetch', fetchMock)
  window.history.replaceState({}, '', '/product/broken-slug?x=1')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  window.sessionStorage.clear()
})

function boom(digest?: string) {
  return Object.assign(new Error('boom'), digest ? { digest } : {})
}

/**
 * UX26: the 500 body, held to what was missing before (logs/ux26/before.json):
 * a status check, a way to reach a person, a brand mark, and a body that is
 * not a second <main>.
 */
describe('ErrorBody', () => {
  it('is RTL, not a <main>, and leads with the mark and the heading', () => {
    const { container } = render(<ErrorBody error={boom('d1')} reset={() => {}} segment="store" />)
    const root = container.querySelector('[data-error]')
    expect(root).toHaveAttribute('dir', 'rtl')
    expect(root?.tagName).toBe('DIV')
    expect(container.querySelector('main')).toBeNull()
    expect(container.querySelector('[data-error-mark]')).toHaveTextContent('500')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(ERROR_HEADING)
    expect(ERROR_HEADING).toBe('משהו השתבש אצלנו')
  })

  it('offers retry in place first, then home, each on the 44px floor', () => {
    const reset = vi.fn()
    render(<ErrorBody error={boom()} reset={reset} segment="root" />)
    const nav = screen.getByRole('navigation', { name: 'דרכים להמשיך' })
    const retry = screen.getByRole('button', { name: 'נסו שוב' })
    expect(nav).toContainElement(retry)
    fireEvent.click(retry)
    expect(reset).toHaveBeenCalledTimes(1)
    const home = screen.getByRole('link', { name: 'לדף הבית' })
    expect(home).toHaveAttribute('href', '/')
    expect(retry.className).toContain('min-h-touch-min')
    expect(home.className).toContain('min-h-touch-min')
  })

  it('checks /api/health once after mount and reads the answer into one sentence', async () => {
    const { container } = render(<ErrorBody error={boom('d1')} reset={() => {}} segment="store" />)
    const region = container.querySelector('[data-error-status]') as HTMLElement
    const live = within(region).getByRole('status')
    expect(live.tagName).toBe('OUTPUT')
    expect(live).toHaveAttribute('aria-live', 'polite')
    expect(region).toHaveAttribute('data-state', 'checking')
    expect(region).toHaveTextContent(HEALTH_COPY.checking)
    await waitFor(() => expect(region).toHaveAttribute('data-state', 'ok'))
    expect(region).toHaveTextContent(HEALTH_COPY.ok)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/health',
      expect.objectContaining({ cache: 'no-store' }),
    )
    expect(screen.getByRole('link', { name: 'לדף מצב המערכת' })).toHaveAttribute('href', '/status')
  })

  it('a 503 reads as a general outage, a failed fetch as "could not check", never the other', async () => {
    fetchMock.mockResolvedValueOnce(healthResponse(503, { ok: false, database: 'down' }))
    const first = render(<ErrorBody error={boom('d1')} reset={() => {}} segment="store" />)
    const region = first.container.querySelector('[data-error-status]') as HTMLElement
    await waitFor(() => expect(region).toHaveAttribute('data-state', 'degraded'))
    expect(region).toHaveTextContent(HEALTH_COPY.degraded)
    first.unmount()

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const second = render(<ErrorBody error={boom('d2')} reset={() => {}} segment="store" />)
    const region2 = second.container.querySelector('[data-error-status]') as HTMLElement
    await waitFor(() => expect(region2).toHaveAttribute('data-state', 'unknown'))
    expect(region2).toHaveTextContent(HEALTH_COPY.unknown)
    expect(region2).not.toHaveTextContent('תקלה כללית')
  })

  it('the support button opens WhatsApp with the page and the digest already in the message', async () => {
    render(<ErrorBody error={boom('abc123')} reset={() => {}} segment="store" />)
    const support = await screen.findByRole('link', { name: /פנייה לתמיכה בוואטסאפ/ })
    expect(support).toHaveAttribute('data-error-support')
    expect(support).toHaveAttribute('target', '_blank')
    expect(support).toHaveAttribute('rel', 'noopener noreferrer')
    const href = support.getAttribute('href') ?? ''
    expect(href).toMatch(/^https:\/\/wa\.me\/972524635550\?text=/)
    await waitFor(() =>
      expect(decodeURIComponent(href)).toContain(
        supportMessage('abc123', '/product/broken-slug?x=1'),
      ),
    )
    expect(support.className).toContain('min-h-touch-min')
    expect(screen.getByRole('link', { name: 'טופס יצירת קשר' })).toHaveAttribute('href', '/contact')
  })

  it('supportMessage carries the page and the digest, and nothing when there is neither', () => {
    expect(supportMessage('abc', '/cart')).toBe(
      'שלום, נתקלתי בתקלה באתר קניון אקספרס.\nהדף: /cart\nקוד תקלה: abc',
    )
    expect(supportMessage()).toBe('שלום, נתקלתי בתקלה באתר קניון אקספרס.')
  })

  it('labels the digest for support, LTR, and never prints the error message', () => {
    render(<ErrorBody error={boom('abc123')} reset={() => {}} segment="main" />)
    const digest = screen.getByText('abc123')
    expect(digest.tagName).toBe('CODE')
    expect(digest).toHaveAttribute('dir', 'ltr')
    expect(digest.closest('[data-error-digest]')).toHaveTextContent('קוד תקלה לתמיכה')
    expect(screen.queryByText('boom')).toBeNull()
  })

  it('renders without a digest', () => {
    const { container } = render(<ErrorBody error={boom()} reset={() => {}} segment="legal" />)
    expect(container.querySelector('[data-error-digest]')).toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('reports to Sentry once, tagged with the boundary, the segment and the digest, and flags the session', async () => {
    const error = boom('abc123')
    render(<ErrorBody error={error} reset={() => {}} segment="account" />)
    await waitFor(() => expect(captureException).toHaveBeenCalledWith(error))
    expect(captureException).toHaveBeenCalledTimes(1)
    expect(setTag).toHaveBeenCalledWith('boundary', 'app-error')
    expect(setTag).toHaveBeenCalledWith('segment', 'account')
    expect(setTag).toHaveBeenCalledWith('digest', 'abc123')
    expect(console.error).toHaveBeenCalled()
    expect(window.sessionStorage.getItem('ke_replay_buggy')).toBe('error_boundary')
  })

  it('names the tab while it is up and gives the title back on unmount', () => {
    document.title = 'דף המוצר | קניון אקספרס'
    const { unmount } = render(<ErrorBody error={boom()} reset={() => {}} segment="store" />)
    expect(document.title).toBe(ERROR_PAGE_TITLE)
    unmount()
    expect(document.title).toBe('דף המוצר | קניון אקספרס')
  })
})
