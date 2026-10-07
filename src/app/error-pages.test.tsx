import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The three pages a customer sees when something is wrong, held to the two
 * things that made them worth writing: they are Hebrew and right-to-left,
 * and they are not dead ends.
 *
 * Next's defaults are English, LTR, and (in production) a bare "Application
 * error" with no route back. Nothing else in the test suite renders these
 * files, so a refactor that dropped `dir="rtl"` or the home link would ship.
 */

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

import { BUGGY_SESSION_STORAGE_KEY } from '@/lib/analytics/replay-trigger'
import AppError from './error'
import GlobalError from './global-error'
import NotFound, { metadata } from './not-found'

afterEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.removeItem(BUGGY_SESSION_STORAGE_KEY)
})

describe('not-found.tsx', () => {
  it('is Hebrew, right-to-left, and offers the catalogue and the homepage', () => {
    render(<NotFound />)
    expect(screen.getByRole('main')).toHaveAttribute('dir', 'rtl')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('הדף שחיפשתם לא נמצא')
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/')
    expect(hrefs).toContain('/products')
  })

  it('asks search engines not to index it', () => {
    expect(metadata.robots).toMatchObject({ index: false })
  })
})

describe('error.tsx', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

  it('reports the error to Sentry tagged with the digest, once', async () => {
    const error = Object.assign(new Error('boom'), { digest: 'abc123' })
    render(<AppError error={error} reset={() => {}} />)

    // The SDK is loaded on demand (lib/observability/sentry-browser.ts), so the
    // report lands a microtask after render rather than inside it.
    await waitFor(() => expect(captureException).toHaveBeenCalledWith(error))
    expect(captureException).toHaveBeenCalledTimes(1)
    expect(setTag).toHaveBeenCalledWith('boundary', 'app-error')
    expect(setTag).toHaveBeenCalledWith('digest', 'abc123')
    // The bare console line stays: it is what still works when the DSN is unset.
    expect(consoleError).toHaveBeenCalled()
    // And the session is flagged for replay: a boundary is the one error the
    // recorder's window listeners never see.
    expect(window.sessionStorage.getItem(BUGGY_SESSION_STORAGE_KEY)).toBe('error_boundary')
  })

  it('offers retry in place before the homepage, and shows the digest for support', () => {
    const reset = vi.fn()
    const error = Object.assign(new Error('boom'), { digest: 'abc123' })
    render(<AppError error={error} reset={reset} />)

    expect(screen.getByRole('main')).toHaveAttribute('dir', 'rtl')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('משהו השתבש אצלנו')
    fireEvent.click(screen.getByRole('button', { name: 'נסו שוב' }))
    expect(reset).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('link', { name: 'לדף הבית' })).toHaveAttribute('href', '/')
    expect(screen.getByText('abc123')).toHaveAttribute('dir', 'ltr')
    // The digest is a handle, not a message: the error text itself never renders.
    expect(screen.queryByText('boom')).toBeNull()
  })

  it('renders without a digest', () => {
    render(<AppError error={new Error('boom')} reset={() => {}} />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })
})

describe('global-error.tsx', () => {
  it('supplies its own Hebrew RTL document, since the layout that would have is gone', () => {
    // Static markup rather than a DOM render: this component owns <html>, and
    // jsdom cannot mount a second document inside a container.
    const html = renderToStaticMarkup(
      <GlobalError error={Object.assign(new Error('boom'), { digest: 'd1' })} />,
    )
    expect(html).toMatch(/<html[^>]*lang="he"[^>]*dir="rtl"/)
    expect(html).toContain('משהו השתבש אצלנו')
    expect(html).toContain('d1')
    expect(html).not.toContain('boom')
    // No stylesheet dependency: a failure this deep may be the stylesheet.
    expect(html).not.toContain('class=')
  })
})
