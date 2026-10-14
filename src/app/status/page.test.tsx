import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StatusPage, { metadata } from './page'

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ status: 200, json: async () => ({ ok: true, checks: {} }) })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** UX26: the public status page is a static shell with no server read. */
describe('/status', () => {
  it('is RTL, its own main, with the panel, the brand link and the ways on', () => {
    render(<StatusPage />)
    const main = screen.getByRole('main')
    expect(main).toHaveAttribute('dir', 'rtl')
    expect(main).toHaveAttribute('id', 'main-content')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('מצב המערכת')
    expect(main.querySelector('[data-status-panel]')).not.toBeNull()
    expect(main.querySelector('[data-status-mark]')).toHaveAttribute('href', '/')
    const nav = screen.getByRole('navigation', { name: 'דרכים להמשיך' })
    expect(nav.querySelector('a[href="/"]')).toHaveTextContent('לדף הבית')
    expect(nav.querySelector('a[href="/contact"]')).toHaveTextContent('צרו קשר')
    expect(nav.querySelector('a[href^="https://wa.me/"]')).not.toBeNull()
  })

  it('asks search engines not to index it', () => {
    expect(metadata.robots).toMatchObject({ index: false })
    expect(metadata.title).toBe('מצב המערכת')
  })
})
