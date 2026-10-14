import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The three pages a customer sees when something is wrong, held to the two
 * things that made them worth writing: they are Hebrew and right-to-left,
 * and they are not dead ends.
 *
 * Next's defaults are English, LTR, and (in production) a bare "Application
 * error" with no route back. Nothing else in the test suite renders these
 * files, so a refactor that dropped `dir="rtl"` or the home link would ship.
 *
 * UX25 and UX26 turned the 404 and the 500 into one shared body each plus a
 * file per route group, so this file also holds the COMPOSITION, which no
 * render can see: Next inherits the nearest file into every nested layout, so
 * a root file wrapped in the shell and a group without its own file is a
 * header painted twice (404) or an error with no chrome at all (500).
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

import ErrorBody, { ERROR_HEADING } from '@/components/error/ErrorBody'
import NotFoundBody, { notFoundMetadata } from '@/components/not-found/NotFoundBody'
import StoreShell from '@/components/store/StoreShell'
import { BUGGY_SESSION_STORAGE_KEY } from '@/lib/analytics/replay-trigger'
import AppError from './error'
import GlobalError from './global-error'
import NotFound, { metadata } from './not-found'

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  window.sessionStorage.removeItem(BUGGY_SESSION_STORAGE_KEY)
})

/** The route groups that carry a layout.tsx, and so must carry both error files. */
function layoutGroups(): string[] {
  const appDir = resolve(process.cwd(), 'src/app')
  return readdirSync(appDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\(.*\)$/.test(d.name))
    .filter((d) => existsSync(join(appDir, d.name, 'layout.tsx')))
    .map((d) => d.name)
}

describe('not-found.tsx', () => {
  /**
   * UX25: the root file is the shell around the shared body, and every route
   * group that paints its own chrome has a not-found.tsx of its own that
   * renders the body bare. The body's own shape (RTL, the heading, the search
   * field, the tiles, the home link) is components/not-found/NotFoundBody.test;
   * here is the composition, which no render can see: Next inherits the root
   * file into every nested layout, so a root file wrapped in StoreShell and a
   * group without its own file is a header painted twice.
   */
  it('wraps the shared body in the storefront shell, for the URL no layout matches', () => {
    const tree = NotFound()
    expect(tree.type).toBe(StoreShell)
    expect(tree.props.children.type).toBe(NotFoundBody)
    expect(metadata).toBe(notFoundMetadata)
  })

  it('asks search engines not to index it', () => {
    expect(metadata.robots).toMatchObject({ index: false })
  })

  it('every route group with a layout renders the bare body, never the shell', () => {
    const appDir = resolve(process.cwd(), 'src/app')
    const groups = layoutGroups()
    expect(groups.length).toBeGreaterThan(0)
    for (const group of groups) {
      const file = join(appDir, group, 'not-found.tsx')
      expect(existsSync(file), `${group}/not-found.tsx exists`).toBe(true)
      const source = readFileSync(file, 'utf8')
      expect(source, `${group}/not-found.tsx renders the body`).toContain('<NotFoundBody')
      expect(source, `${group}/not-found.tsx does not wrap it in StoreShell`).not.toMatch(
        /import .*StoreShell|<StoreShell/,
      )
      expect(source, `${group}/not-found.tsx carries the metadata`).toContain(
        'export const metadata = notFoundMetadata',
      )
    }
    // The storefront groups offer the search and the tiles; the back offices do not.
    for (const group of ['(store)', '(main)', '(account)', '(legal)']) {
      expect(readFileSync(join(appDir, group, 'not-found.tsx'), 'utf8')).toContain(
        '<NotFoundBody />',
      )
    }
    for (const group of ['(admin)', '(supplier)', '(auth)']) {
      expect(readFileSync(join(appDir, group, 'not-found.tsx'), 'utf8')).toContain(
        '<NotFoundBody compact />',
      )
    }
  })
})

describe('error.tsx', () => {
  /**
   * UX26: the root file is a <main> around the shared body (a layout crash
   * has no other main), and every route group with a layout has an error.tsx
   * that renders the body bare inside the group's own chrome. The body's own
   * shape (the status check, the support button, the digest, the Sentry
   * report) is components/error/ErrorBody.test.
   */
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ status: 200, json: async () => ({ ok: true }) })),
    )
  })

  it('wraps the shared body in its own <main>, for the layout crash no group can catch', () => {
    const tree = AppError({ error: new Error('boom'), reset: () => {} })
    expect(tree.type).toBe('main')
    expect(tree.props.dir).toBe('rtl')
    expect(tree.props.children.type).toBe(ErrorBody)
    expect(tree.props.children.props.segment).toBe('root')
  })

  it('renders Hebrew RTL with retry, home, the status check and the support button', async () => {
    const reset = vi.fn()
    const error = Object.assign(new Error('boom'), { digest: 'abc123' })
    render(<AppError error={error} reset={reset} />)

    expect(screen.getByRole('main')).toHaveAttribute('dir', 'rtl')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(ERROR_HEADING)
    fireEvent.click(screen.getByRole('button', { name: 'נסו שוב' }))
    expect(reset).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('link', { name: 'לדף הבית' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'לדף מצב המערכת' })).toHaveAttribute('href', '/status')
    expect(screen.getByRole('link', { name: /פנייה לתמיכה/ }).getAttribute('href')).toContain(
      'wa.me',
    )
    expect(screen.getByText('abc123')).toHaveAttribute('dir', 'ltr')
    // The digest is a handle, not a message: the error text itself never renders.
    expect(screen.queryByText('boom')).toBeNull()
    await waitFor(() => expect(captureException).toHaveBeenCalledWith(error))
    expect(setTag).toHaveBeenCalledWith('boundary', 'app-error')
    expect(setTag).toHaveBeenCalledWith('segment', 'root')
    expect(window.sessionStorage.getItem(BUGGY_SESSION_STORAGE_KEY)).toBe('error_boundary')
  })

  it('every route group with a layout renders the bare body with its own segment', () => {
    const appDir = resolve(process.cwd(), 'src/app')
    const groups = layoutGroups()
    expect(groups.length).toBeGreaterThan(0)
    for (const group of groups) {
      const file = join(appDir, group, 'error.tsx')
      expect(existsSync(file), `${group}/error.tsx exists`).toBe(true)
      const source = readFileSync(file, 'utf8')
      expect(source, `${group}/error.tsx is a client file`).toMatch(/^'use client'/)
      expect(source, `${group}/error.tsx renders the body`).toContain('<ErrorBody')
      expect(source, `${group}/error.tsx names its segment`).toContain(
        `segment="${group.slice(1, -1)}"`,
      )
      expect(source, `${group}/error.tsx supplies no main of its own`).not.toContain('<main')
    }
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

  it('offers home, the status page and WhatsApp as plain links that need no script', () => {
    const html = renderToStaticMarkup(
      <GlobalError error={Object.assign(new Error('boom'), { digest: 'd1' })} />,
    )
    expect(html).toMatch(/<a href="\/"[^>]*>לדף הבית<\/a>/)
    expect(html).toMatch(/<a href="\/status"[^>]*>מצב המערכת<\/a>/)
    expect(html).toMatch(/href="https:\/\/wa\.me\/972524635550\?text=[^"]*d1[^"]*"/)
    expect(html).not.toContain('<button')
  })
})
