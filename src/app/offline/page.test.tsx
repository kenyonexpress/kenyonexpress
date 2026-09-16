import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import OfflinePage, { metadata } from './page'

/**
 * The one page that has to work with NO server and possibly NO JavaScript.
 *
 * public/sw.js precaches this document on install and serves it when a
 * navigation fails, on a device that by definition cannot reach the server.
 * Anything that reads data here is the same failure one level deeper, and a
 * retry wired to an onClick handler needs the chunk that may be the very thing
 * that failed to load. So the page is static, the retry is a link, and both
 * are locked here rather than remembered.
 */

const source = readFileSync('src/app/offline/page.tsx', 'utf8')

describe('/offline', () => {
  it('is a server component with no client hooks and no data access', () => {
    expect(source).not.toMatch(/^\s*'use client'/m)
    expect(source).not.toMatch(/\buse(State|Effect|Router|SearchParams)\b/)
    expect(source).not.toMatch(/supabase|fetch\(|cookies\(|headers\(/)
  })

  it('says so in Hebrew, and offers a retry that works before hydration', () => {
    render(<OfflinePage />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('אין חיבור לאינטרנט')
    const retry = screen.getByRole('link', { name: 'נסו שוב' })
    // A link to the start URL, not a button with a handler.
    expect(retry.getAttribute('href')).toBe('/')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('is the URL the service worker precaches and falls back to', () => {
    const sw = readFileSync('public/sw.js', 'utf8')
    expect(sw).toContain("const OFFLINE_URL = '/offline'")
    expect(sw).toMatch(/const PRECACHE = \[OFFLINE_URL/)
  })

  it('is kept out of search results', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })
})
